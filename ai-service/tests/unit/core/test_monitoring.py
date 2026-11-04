"""Unit test cho ``src/core/monitoring.py``.

Không chạy vòng lặp thật, không đọc số liệu hệ thống thật:
- ``Instrumentator`` bị mock hoàn toàn;
- ``psutil`` bị thay bằng fake;
- ``threading.Event`` bị thay bằng ``FakeStopEvent`` điều khiển số vòng lặp;
- các ``Gauge`` module-level được thay bằng ``MagicMock`` để assert ``set()``.

Riêng ``_create_gauge`` được test với registry Prometheus thật (tên gauge sinh
ngẫu nhiên) vì đây chính là cơ chế chống crash khi module bị import 2 lần dưới
2 tên package (``core.monitoring`` và ``src.core.monitoring``).
"""

import importlib
import uuid
from types import SimpleNamespace
from unittest.mock import MagicMock, call

import pytest
from prometheus_client import REGISTRY, Gauge

import src.core.monitoring as monitoring

GAUGE_ATTRS = (
    "cpu_usage",
    "memory_usage",
    "memory_total",
    "memory_available",
    "app_memory",
    "disk_usage",
)


@pytest.fixture
def fake_gauges(monkeypatch):
    """Thay 6 gauge module-level bằng mock, trả về mapping tên → mock."""
    gauges = {}
    for attr in GAUGE_ATTRS:
        gauge = MagicMock(name=attr)
        monkeypatch.setattr(monitoring, attr, gauge)
        gauges[attr] = gauge
    return gauges


class FakeMemory:
    percent = 42.5
    total = 16 * 1024**3
    available = 8 * 1024**3


class FakeProcess:
    """psutil.Process giả."""

    def memory_info(self):
        return SimpleNamespace(rss=512 * 1024**2)


def _fake_psutil(cpu_percent=12.5, disk_percent=55.5):
    fake = MagicMock()
    fake.virtual_memory.return_value = FakeMemory()
    fake.cpu_percent.return_value = cpu_percent
    fake.disk_usage.return_value = SimpleNamespace(percent=disk_percent)
    fake.Process.return_value = FakeProcess()
    return fake


class FakeStopEvent:
    """``threading.Event`` giả: sau ``stop_after`` vòng lặp thì ``is_set()`` True."""

    def __init__(self, stop_after: int = 1):
        self.remaining = stop_after
        self.wait_calls = []
        self.is_set_calls = 0

    def is_set(self) -> bool:
        self.is_set_calls += 1
        if self.remaining <= 0:
            return True
        self.remaining -= 1
        return False

    def wait(self, timeout=None) -> bool:
        self.wait_calls.append(timeout)
        return False


class TestCreateGauge:
    """``_create_gauge`` chống ``Duplicated timeseries`` khi import lặp."""

    def test_creates_new_gauge(self):
        name = f"pytest_gauge_{uuid.uuid4().hex}"

        gauge = monitoring._create_gauge(name, "gauge cho test")

        assert isinstance(gauge, Gauge)
        assert gauge._name == name

    def test_duplicate_name_returns_existing_collector(self):
        name = f"pytest_gauge_{uuid.uuid4().hex}"

        first = monitoring._create_gauge(name, "doc 1")
        second = monitoring._create_gauge(name, "doc 2")

        assert second is first

    def test_duplicate_name_without_registry_entry_reraises(self, monkeypatch):
        """Nếu Gauge ném ValueError mà registry không có tên → phải re-raise."""

        def boom(*args, **kwargs):
            raise ValueError("Duplicated timeseries in CollectorRegistry")

        monkeypatch.setattr(monitoring, "Gauge", boom)

        with pytest.raises(ValueError, match="Duplicated"):
            monitoring._create_gauge("pytest_gauge_not_registered", "doc")

    def test_gauge_is_registered_in_global_registry(self):
        name = f"pytest_gauge_{uuid.uuid4().hex}"

        gauge = monitoring._create_gauge(name, "doc")

        assert REGISTRY._names_to_collectors.get(name) is gauge


class TestModuleLevelGauges:
    """Các gauge được tạo ngay khi import module."""

    @pytest.mark.parametrize("attr", GAUGE_ATTRS)
    def test_gauge_exists_and_is_registered(self, attr):
        gauge = getattr(monitoring, attr)

        assert isinstance(gauge, Gauge)
        assert REGISTRY._names_to_collectors.get(gauge._name) is gauge

    def test_import_under_second_package_name_reuses_collectors(self):
        """``core.monitoring`` (entrypoint cũ) và ``src.core.monitoring`` trùng gauge."""
        before = {attr: getattr(monitoring, attr) for attr in GAUGE_ATTRS}

        alias = importlib.import_module("core.monitoring")

        assert alias is not monitoring
        for attr in GAUGE_ATTRS:
            assert getattr(alias, attr) is before[attr]

    def test_reload_does_not_crash_on_duplicate_metrics(self):
        """Reload module = import lần 2 → ``_create_gauge`` trả collector cũ."""
        before = {attr: getattr(monitoring, attr) for attr in GAUGE_ATTRS}

        reloaded = importlib.reload(monitoring)

        for attr in GAUGE_ATTRS:
            assert getattr(reloaded, attr) is before[attr]


class TestConfigureMonitoring:
    """``configure_monitoring`` cấu hình Instrumentator và expose endpoint."""

    def test_instruments_app_and_exposes_metrics_endpoint(self, monkeypatch):
        instrumentator_cls = MagicMock()
        monkeypatch.setattr(monitoring, "Instrumentator", instrumentator_cls)
        app = MagicMock()

        monitoring.configure_monitoring(app)

        instance = instrumentator_cls.return_value
        instrumentator_cls.assert_called_once_with(
            should_group_status_codes=False,
            should_ignore_untemplated=True,
            should_instrument_requests_inprogress=True,
            should_respect_env_var=False,
            env_var_name="ENABLE_METRICS",
        )
        instance.instrument.assert_called_once_with(app)
        instance.expose.assert_called_once_with(app, endpoint="/api/metrics")

    def test_logs_metrics_endpoint(self, monkeypatch):
        monkeypatch.setattr(monitoring, "Instrumentator", MagicMock())
        fake_logger = MagicMock()
        monkeypatch.setattr(monitoring, "logger", fake_logger)

        monitoring.configure_monitoring(MagicMock())

        assert "/api/metrics" in fake_logger.info.call_args.args[0]

    def test_propagates_instrument_failure_and_skips_expose(self, monkeypatch):
        instrumentator_cls = MagicMock()
        instrumentator_cls.return_value.instrument.side_effect = RuntimeError(
            "instrument lỗi"
        )
        monkeypatch.setattr(monitoring, "Instrumentator", instrumentator_cls)

        with pytest.raises(RuntimeError, match="instrument lỗi"):
            monitoring.configure_monitoring(MagicMock())

        instrumentator_cls.return_value.expose.assert_not_called()


class TestUpdateMetrics:
    """``update_metrics`` — mỗi vòng lặp set đủ 6 gauge rồi ``wait(5)``."""

    def test_one_iteration_sets_every_gauge(self, monkeypatch, fake_gauges):
        fake_psutil = _fake_psutil()
        monkeypatch.setattr(monitoring, "psutil", fake_psutil)
        monkeypatch.setattr(monitoring, "process", FakeProcess())
        event = FakeStopEvent(stop_after=1)

        monitoring.update_metrics(event)

        fake_gauges["cpu_usage"].set.assert_called_once_with(12.5)
        fake_gauges["memory_usage"].set.assert_called_once_with(42.5)
        fake_gauges["memory_total"].set.assert_called_once_with(16 * 1024**3)
        fake_gauges["memory_available"].set.assert_called_once_with(8 * 1024**3)
        fake_gauges["app_memory"].set.assert_called_once_with(512 * 1024**2)
        fake_gauges["disk_usage"].set.assert_called_once_with(55.5)

    def test_primes_cpu_percent_without_blocking(self, monkeypatch, fake_gauges):
        fake_psutil = _fake_psutil()
        monkeypatch.setattr(monitoring, "psutil", fake_psutil)
        monkeypatch.setattr(monitoring, "process", FakeProcess())

        monitoring.update_metrics(FakeStopEvent(stop_after=1))

        assert call(interval=None) in fake_psutil.cpu_percent.call_args_list
        assert call(interval=0.1) in fake_psutil.cpu_percent.call_args_list

    def test_waits_five_seconds_between_iterations(self, monkeypatch, fake_gauges):
        monkeypatch.setattr(monitoring, "psutil", _fake_psutil())
        monkeypatch.setattr(monitoring, "process", FakeProcess())
        event = FakeStopEvent(stop_after=1)

        monitoring.update_metrics(event)

        assert event.wait_calls == [5]

    def test_multiple_iterations_before_stop(self, monkeypatch, fake_gauges):
        monkeypatch.setattr(monitoring, "psutil", _fake_psutil())
        monkeypatch.setattr(monitoring, "process", FakeProcess())
        event = FakeStopEvent(stop_after=2)

        monitoring.update_metrics(event)

        assert fake_gauges["cpu_usage"].set.call_count == 2
        assert event.wait_calls == [5, 5]

    def test_already_set_event_skips_gauge_updates(self, monkeypatch, fake_gauges):
        fake_psutil = _fake_psutil()
        monkeypatch.setattr(monitoring, "psutil", fake_psutil)
        monkeypatch.setattr(monitoring, "process", FakeProcess())
        event = FakeStopEvent(stop_after=0)

        monitoring.update_metrics(event)

        for gauge in fake_gauges.values():
            gauge.set.assert_not_called()
        assert event.wait_calls == []
        # Vẫn prime cpu_percent 1 lần trước khi vào vòng lặp.
        assert fake_psutil.cpu_percent.call_args_list == [call(interval=None)]

    def test_disk_usage_uses_root_path(self, monkeypatch, fake_gauges):
        fake_psutil = _fake_psutil()
        monkeypatch.setattr(monitoring, "psutil", fake_psutil)
        monkeypatch.setattr(monitoring, "process", FakeProcess())

        monitoring.update_metrics(FakeStopEvent(stop_after=1))

        fake_psutil.disk_usage.assert_called_once_with("/")


class TestCheckInfra:
    """``check_infra`` trả dict số liệu RAM/CPU và in báo cáo ra stdout."""

    def test_returns_expected_keys_and_rounded_values(self, monkeypatch):
        monkeypatch.setattr(monitoring, "psutil", _fake_psutil())
        monkeypatch.setattr(monitoring, "os", SimpleNamespace(getpid=lambda: 4242))

        result = monitoring.check_infra()

        assert result == {
            "pid": 4242,
            "total_ram_gb": 16.0,
            "available_ram_gb": 8.0,
            "used_percent": 42.5,
            "app_rss_gb": 0.5,
        }

    def test_creates_psutil_process(self, monkeypatch):
        fake_psutil = _fake_psutil()
        monkeypatch.setattr(monitoring, "psutil", fake_psutil)
        monkeypatch.setattr(monitoring, "os", SimpleNamespace(getpid=lambda: 1))

        monitoring.check_infra()

        fake_psutil.Process.assert_called_once_with()

    def test_prints_report(self, monkeypatch, capsys):
        monkeypatch.setattr(monitoring, "psutil", _fake_psutil())
        monkeypatch.setattr(monitoring, "os", SimpleNamespace(getpid=lambda: 4242))

        monitoring.check_infra()

        out = capsys.readouterr().out
        assert "PID: 4242" in out
        assert "Total RAM: 16.0 GiB" in out
        assert "Used Percent: 42.5 %" in out
