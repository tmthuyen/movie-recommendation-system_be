"""Unit test cho ``src/core/telemetry.py``.

Không tạo exporter/tracer provider thật và không gửi span:
- ``TracerProvider``, ``Resource``, ``BatchSpanProcessor``, ``OTLPSpanExporter``,
  ``FastAPIInstrumentor``, ``RequestsInstrumentor`` và module ``trace`` đều bị
  ``monkeypatch.setattr`` trên chính module ``src.core.telemetry``.
- ``Settings`` được thay bằng ``SimpleNamespace`` chỉ chứa 3 field mà
  ``configure_tracing`` dùng (``otel_enabled``, ``otel_exporter_url``,
  ``service_name``).

Lưu ý: module import các package OpenTelemetry ở module level và **không** có
``try/except ImportError`` — thiếu package sẽ lỗi ngay khi import (xem báo cáo).
"""

from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from opentelemetry.sdk.trace import TracerProvider as RealTracerProvider

import src.core.telemetry as telemetry


def _settings(enabled=True, url="http://localhost:4318", service_name="ai-service"):
    return SimpleNamespace(
        otel_enabled=enabled,
        otel_exporter_url=url,
        service_name=service_name,
    )


@pytest.fixture
def otel(monkeypatch):
    """Mock toàn bộ đối tượng OTEL mà ``configure_tracing`` sử dụng."""
    provider = MagicMock(name="provider")
    tracer_provider_cls = MagicMock(name="TracerProvider", return_value=provider)
    exporter_cls = MagicMock(name="OTLPSpanExporter")
    processor_cls = MagicMock(name="BatchSpanProcessor")
    resource_cls = MagicMock(name="Resource")
    trace_mock = MagicMock(name="trace")
    fastapi_instrumentor_cls = MagicMock(name="FastAPIInstrumentor")
    requests_instrumentor_cls = MagicMock(name="RequestsInstrumentor")
    logger_mock = MagicMock(name="logger")

    monkeypatch.setattr(telemetry, "TracerProvider", tracer_provider_cls)
    monkeypatch.setattr(telemetry, "OTLPSpanExporter", exporter_cls)
    monkeypatch.setattr(telemetry, "BatchSpanProcessor", processor_cls)
    monkeypatch.setattr(telemetry, "Resource", resource_cls)
    monkeypatch.setattr(telemetry, "trace", trace_mock)
    monkeypatch.setattr(telemetry, "FastAPIInstrumentor", fastapi_instrumentor_cls)
    monkeypatch.setattr(telemetry, "RequestsInstrumentor", requests_instrumentor_cls)
    monkeypatch.setattr(telemetry, "logger", logger_mock)

    return SimpleNamespace(
        provider=provider,
        tracer_provider_cls=tracer_provider_cls,
        exporter_cls=exporter_cls,
        processor_cls=processor_cls,
        resource_cls=resource_cls,
        trace=trace_mock,
        fastapi_instrumentor_cls=fastapi_instrumentor_cls,
        requests_instrumentor_cls=requests_instrumentor_cls,
        logger=logger_mock,
    )


class TestConfigureTracingDisabled:
    """``OTEL_ENABLED=false`` → no-op, không tạo exporter/provider."""

    def test_does_not_create_exporter_or_provider(self, otel):
        app = MagicMock()

        telemetry.configure_tracing(app, _settings(enabled=False))

        otel.tracer_provider_cls.assert_not_called()
        otel.exporter_cls.assert_not_called()
        otel.processor_cls.assert_not_called()
        otel.resource_cls.create.assert_not_called()
        otel.trace.set_tracer_provider.assert_not_called()

    def test_does_not_instrument_app(self, otel):
        telemetry.configure_tracing(MagicMock(), _settings(enabled=False))

        otel.fastapi_instrumentor_cls.assert_not_called()
        otel.requests_instrumentor_cls.assert_not_called()

    def test_logs_warning(self, otel):
        telemetry.configure_tracing(MagicMock(), _settings(enabled=False))

        otel.logger.warning.assert_called_once()
        otel.logger.info.assert_not_called()

    def test_returns_none(self, otel):
        assert telemetry.configure_tracing(MagicMock(), _settings(enabled=False)) is None


class TestConfigureTracingEnabled:
    """``OTEL_ENABLED=true`` → tạo exporter/provider + instrument app."""

    def test_creates_exporter_with_traces_endpoint(self, otel):
        telemetry.configure_tracing(MagicMock(), _settings())

        otel.exporter_cls.assert_called_once_with(
            endpoint="http://localhost:4318/v1/traces"
        )

    def test_creates_provider_with_service_name_resource(self, otel):
        telemetry.configure_tracing(MagicMock(), _settings(service_name="ai-service"))

        otel.resource_cls.create.assert_called_once_with({"service.name": "ai-service"})
        otel.tracer_provider_cls.assert_called_once_with(
            resource=otel.resource_cls.create.return_value
        )

    def test_adds_batch_span_processor_to_provider(self, otel):
        telemetry.configure_tracing(MagicMock(), _settings())

        otel.processor_cls.assert_called_once_with(otel.exporter_cls.return_value)
        otel.provider.add_span_processor.assert_called_once_with(
            otel.processor_cls.return_value
        )

    def test_registers_global_tracer_provider(self, otel):
        telemetry.configure_tracing(MagicMock(), _settings())

        otel.trace.set_tracer_provider.assert_called_once_with(otel.provider)

    def test_instruments_fastapi_app(self, otel):
        app = MagicMock()

        telemetry.configure_tracing(app, _settings())

        otel.fastapi_instrumentor_cls.return_value.instrument_app.assert_called_once_with(
            app
        )

    def test_instruments_requests_library(self, otel):
        telemetry.configure_tracing(MagicMock(), _settings())

        otel.requests_instrumentor_cls.return_value.instrument.assert_called_once_with()

    def test_uses_custom_endpoint_and_service_name(self, otel):
        telemetry.configure_tracing(
            MagicMock(),
            _settings(url="http://collector:4318", service_name="custom-service"),
        )

        otel.exporter_cls.assert_called_once_with(
            endpoint="http://collector:4318/v1/traces"
        )
        otel.resource_cls.create.assert_called_once_with(
            {"service.name": "custom-service"}
        )

    def test_logs_enabled_endpoint(self, otel):
        telemetry.configure_tracing(MagicMock(), _settings(url="http://collector:4318"))

        otel.logger.info.assert_called_once()
        assert "http://collector:4318" in otel.logger.info.call_args.args[0]

    def test_propagates_instrumentation_failure_after_provider_setup(self, otel):
        otel.fastapi_instrumentor_cls.return_value.instrument_app.side_effect = (
            RuntimeError("instrument lỗi")
        )

        with pytest.raises(RuntimeError, match="instrument lỗi"):
            telemetry.configure_tracing(MagicMock(), _settings())

        otel.trace.set_tracer_provider.assert_called_once_with(otel.provider)

    def test_propagates_exporter_failure_before_provider_registration(self, otel):
        otel.exporter_cls.side_effect = RuntimeError("exporter lỗi")

        with pytest.raises(RuntimeError, match="exporter lỗi"):
            telemetry.configure_tracing(MagicMock(), _settings())

        # Provider đã tạo nhưng chưa kịp add processor / set global provider.
        otel.provider.add_span_processor.assert_not_called()
        otel.trace.set_tracer_provider.assert_not_called()


class TestTelemetryWiring:
    """Kiểm tra module wiring thật (không mock) — code không có import guard."""

    def test_configure_tracing_is_callable(self):
        assert callable(telemetry.configure_tracing)

    def test_module_uses_real_opentelemetry_sdk_imports(self):
        # Import ở module level, không bọc try/except ImportError.
        assert telemetry.TracerProvider is RealTracerProvider

    def test_module_exports_otlp_exporter(self):
        from opentelemetry.exporter.otlp.proto.http.trace_exporter import (
            OTLPSpanExporter,
        )

        assert telemetry.OTLPSpanExporter is OTLPSpanExporter
