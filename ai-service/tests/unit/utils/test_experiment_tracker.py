"""Unit test cho ``utils/experiment_tracker.py``.

``ExperimentTracker`` chỉ ghi file local (``config.json``, ``metrics.json``,
``model_artifacts/``) — không tích hợp MLflow hay backend tracking từ xa, nên
toàn bộ test chạy trong ``tmp_path`` (chdir để ``logs/`` và ``experiments/``
không rơi vào repo).
"""

import json
import re
from pathlib import Path

import pytest

from src.utils.experiment_tracker import ExperimentTracker


@pytest.fixture
def workspace(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    return tmp_path


def make_tracker(workspace: Path, model_name: str = "als") -> ExperimentTracker:
    return ExperimentTracker(
        base_dir=str(workspace / "experiments"), model_name=model_name
    )


class TestExperimentTrackerInit:
    def test_creates_run_dir_under_model_folder(self, workspace):
        tracker = make_tracker(workspace, "als")

        assert tracker.model_name == "als"
        assert tracker.base_dir == workspace / "experiments"
        assert tracker.run_dir.parent == workspace / "experiments" / "als"
        assert tracker.run_dir.is_dir()

    def test_run_dir_name_follows_timestamp_pattern(self, workspace):
        tracker = make_tracker(workspace)

        assert re.fullmatch(r"run_\d{8}_\d{6}", tracker.run_dir.name)

    def test_default_base_dir_is_relative_to_cwd(self, workspace):
        tracker = ExperimentTracker(model_name="bm25")

        assert tracker.base_dir == Path("experiments")
        assert (workspace / "experiments" / "bm25").is_dir()
        assert tracker.run_dir.is_dir()

    def test_creates_missing_nested_base_dirs(self, workspace):
        tracker = ExperimentTracker(
            base_dir=str(workspace / "a" / "b" / "c"), model_name="main"
        )

        assert tracker.run_dir.is_dir()

    def test_two_models_get_separate_run_dirs(self, workspace):
        als = make_tracker(workspace, "als")
        bm25 = make_tracker(workspace, "bm25")

        assert als.run_dir != bm25.run_dir
        assert als.run_dir.parent.name == "als"
        assert bm25.run_dir.parent.name == "bm25"

    def test_base_dir_pointing_to_file_raises(self, workspace):
        blocked = workspace / "blocked"
        blocked.write_text("not a directory", encoding="utf-8")

        with pytest.raises((FileExistsError, NotADirectoryError)):
            ExperimentTracker(base_dir=str(blocked), model_name="als")


class TestLogConfig:
    def test_writes_utf8_json_with_vietnamese(self, workspace):
        tracker = make_tracker(workspace)

        tracker.log_config({"model": "als", "mô_tả": "gợi ý phim"})

        path = tracker.run_dir / "config.json"
        raw = path.read_text(encoding="utf-8")
        assert json.loads(raw) == {"model": "als", "mô_tả": "gợi ý phim"}
        assert "gợi ý phim" in raw

    def test_second_call_overwrites_previous_config(self, workspace):
        tracker = make_tracker(workspace)
        tracker.log_config({"factors": 32})

        tracker.log_config({"factors": 64})

        data = json.loads((tracker.run_dir / "config.json").read_text(encoding="utf-8"))
        assert data == {"factors": 64}

    def test_config_with_unserializable_value_raises(self, workspace):
        tracker = make_tracker(workspace)

        with pytest.raises(TypeError):
            tracker.log_config({"model": object()})


class TestLogMetrics:
    def test_writes_metrics_json(self, workspace):
        tracker = make_tracker(workspace)

        tracker.log_metrics({"loss": 0.5, "ndcg@10": 0.72})

        path = tracker.run_dir / "metrics.json"
        assert json.loads(path.read_text(encoding="utf-8")) == {
            "loss": 0.5,
            "ndcg@10": 0.72,
        }

    def test_second_call_overwrites_previous_metrics(self, workspace):
        tracker = make_tracker(workspace)
        tracker.log_metrics({"loss": 1.0})

        tracker.log_metrics({"loss": 0.25})

        data = json.loads((tracker.run_dir / "metrics.json").read_text(encoding="utf-8"))
        assert data == {"loss": 0.25}


class TestGetModelSaveDir:
    def test_returns_existing_artifacts_dir_under_run_dir(self, workspace):
        tracker = make_tracker(workspace)

        directory = tracker.get_model_save_dir()

        assert isinstance(directory, str)
        assert Path(directory).is_dir()
        assert Path(directory) == tracker.run_dir / "model_artifacts"

    def test_repeated_calls_return_same_dir(self, workspace):
        tracker = make_tracker(workspace)

        assert tracker.get_model_save_dir() == tracker.get_model_save_dir()
