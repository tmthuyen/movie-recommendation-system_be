"""Unit test cho ``services/model_training_service.py``.

Chiến lược: dữ liệu interaction rất nhỏ ghi vào JSONL trong ``tmp_path``
(chdir để mọi thư mục ``data/training`` rơi vào tmp), mock ALS, storage và Redis:

- ALS thật (``implicit``) không được train — ``ALS_Implicit`` được thay bằng
  ``FakeALSImplicit`` chỉ ghi nhận tham số và tạo file model giả.
- R2/S3 được thay bằng ``FakeStorage`` ghi nhận upload/download, không mở kết
  nối mạng.
- Redis được thay bằng ``FakeRedis`` chỉ ghi nhận publish ``model.updated``.
"""

import asyncio
import json
from pathlib import Path

import pandas as pd
import pytest

import src.services.model_training_service as training_module
from src.infra.messaging.event_schemas import InteractionAction
from src.services.model_training_service import ModelTrainingService


def run(coro):
    return asyncio.run(coro)


class FakeStorage:
    """Stub ``storage_service`` — không gọi boto3/R2."""

    def __init__(self, listed: list[str] | None = None) -> None:
        self.listed = list(listed or [])
        self.uploaded: list[tuple[str, str | None]] = []
        self.downloaded: list[tuple[str, str]] = []
        self.deleted: list[str] = []

    def list_files(self, prefix: str = "") -> list[str]:
        return list(self.listed)

    def upload_file(self, file_path: str, object_name: str | None = None) -> bool:
        self.uploaded.append((file_path, object_name))
        return True

    def download_file(self, object_name: str, file_path: str) -> bool:
        self.downloaded.append((object_name, file_path))
        return True

    def delete_file(self, object_name: str) -> bool:
        self.deleted.append(object_name)
        return True


class FakeRedis:
    """Stub ``RedisStore`` chỉ cần ``publish`` cho pipeline."""

    def __init__(self) -> None:
        self.published: list[tuple[str, dict]] = []

    async def publish(self, channel: str, payload: dict) -> int:
        self.published.append((channel, payload))
        return 1


class FakeALSImplicit:
    """Stub ``ALS_Implicit`` — không train implicit thật."""

    def __init__(
        self,
        train_frame: pd.DataFrame,
        num_users: int,
        num_items: int,
        factors=64,
        alpha=60,
        regularization=0.1,
        iterations=15,
        random_state=42,
    ) -> None:
        self.train_frame = train_frame
        self.num_users = num_users
        self.num_items = num_items
        self.kwargs = {
            "factors": factors,
            "alpha": alpha,
            "regularization": regularization,
            "iterations": iterations,
            "random_state": random_state,
        }
        self.saved_paths: list[str] = []

    def save(self, path: str) -> None:
        self.saved_paths.append(path)
        Path(path).write_bytes(b"fake-als-model")


@pytest.fixture
def training(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    return ModelTrainingService(FakeRedis())


def write_jsonl(
    training: ModelTrainingService, rows: list[dict], name: str = "batch.jsonl"
) -> Path:
    path = training.interaction_dir / name
    pd.DataFrame(rows).to_json(path, orient="records", lines=True)
    return path


SMALL_ROWS = [
    {
        "userId": "u1",
        "movieId": 10,
        "action": "click",
        "score": 1.0,
        "createdAt": "2024-01-01T00:00:00",
    },
    {
        "userId": "u1",
        "movieId": 20,
        "action": "rating",
        "score": 3.0,
        "createdAt": "2024-01-02T00:00:00",
    },
    {
        "userId": "u2",
        "movieId": 30,
        "action": "like",
        "score": None,
        "createdAt": "2024-01-03T00:00:00",
    },
]


# ─────────────────────────────────────────────────────────────────────────────
# _get_action_score / _preprocess_data
# ─────────────────────────────────────────────────────────────────────────────


class TestActionScore:
    def test_rating_uses_explicit_rating(self, training):
        assert training._get_action_score(InteractionAction.RATING, 4.5) == 4.5

    @pytest.mark.parametrize(
        ("action", "expected"),
        [
            (InteractionAction.CLICK, 1.0),
            (InteractionAction.LIKE, 5.0),
            (InteractionAction.COMMENT, 2.0),
            ("unknown-action", 1.0),
        ],
    )
    def test_action_defaults(self, training, action, expected):
        assert training._get_action_score(action) == expected


class TestPreprocessData:
    def test_builds_mappings_and_scores(self, training):
        write_jsonl(training, SMALL_ROWS)

        user_mapping, movie_mapping, full_df = training._preprocess_data()

        assert user_mapping == {"u1": 0, "u2": 1}
        assert movie_mapping == {"10": 0, "20": 1, "30": 2}
        assert full_df["user_idx"].tolist() == [0, 0, 1]
        assert full_df["item_idx"].tolist() == [0, 1, 2]
        assert full_df["score"].tolist() == [1.0, 3.0, 5.0]

    def test_keeps_latest_duplicate_interaction(self, training):
        write_jsonl(
            training,
            [
                {
                    "userId": "u1",
                    "movieId": 10,
                    "action": "click",
                    "score": 1.0,
                    "createdAt": "2024-01-01T00:00:00",
                },
                {
                    "userId": "u1",
                    "movieId": 10,
                    "action": "click",
                    "score": 1.0,
                    "createdAt": "2024-01-02T00:00:00",
                },
            ],
        )

        _, _, full_df = training._preprocess_data()

        assert len(full_df) == 1
        assert full_df.iloc[0]["createdAt"] == pd.Timestamp("2024-01-02")

    def test_no_jsonl_files_returns_empty_triplet(self, training, caplog):
        with caplog.at_level("WARNING"):
            user_mapping, movie_mapping, full_df = training._preprocess_data()

        assert user_mapping is None
        assert movie_mapping == {}
        assert full_df == {}
        assert "No local jsonl files" in caplog.text

    def test_corrupt_jsonl_file_is_skipped(self, training, caplog):
        (training.interaction_dir / "broken.jsonl").write_text(
            "{not-json", encoding="utf-8"
        )

        with caplog.at_level("ERROR"):
            user_mapping, movie_mapping, full_df = training._preprocess_data()

        assert user_mapping is None
        assert movie_mapping == {}
        assert full_df == {}
        assert "Failed to read jsonl file" in caplog.text

    def test_missing_action_is_dropped(self, training):
        write_jsonl(
            training,
            [
                {
                    "userId": "u1",
                    "movieId": 10,
                    "action": None,
                    "score": 1.0,
                    "createdAt": "2024-01-01T00:00:00",
                },
                {
                    "userId": "u2",
                    "movieId": 20,
                    "action": "click",
                    "score": 1.0,
                    "createdAt": "2024-01-02T00:00:00",
                },
            ],
        )

        user_mapping, movie_mapping, full_df = training._preprocess_data()

        assert user_mapping == {"u2": 0}
        assert movie_mapping == {"20": 0}
        assert len(full_df) == 1


# ─────────────────────────────────────────────────────────────────────────────
# _train_model / _download_training_data / _upload_artifacts
# ─────────────────────────────────────────────────────────────────────────────


class TestTrainModel:
    def test_builds_als_from_settings_and_dataframe(self, training, monkeypatch):
        monkeypatch.setattr(training_module, "ALS_Implicit", FakeALSImplicit)
        frame = pd.DataFrame(SMALL_ROWS)

        model = training._train_model(frame, num_users=2, num_items=3)

        assert isinstance(model, FakeALSImplicit)
        assert model.train_frame is frame
        assert model.num_users == 2
        assert model.num_items == 3
        assert model.kwargs == {
            "factors": training.settings.cf_num_factors,
            "alpha": training.settings.cf_alpha,
            "regularization": training.settings.cf_regularization,
            "iterations": training.settings.cf_iterations,
            "random_state": training.settings.cf_random_state,
        }


class TestDownloadTrainingData:
    def test_downloads_only_jsonl_files(self, training, monkeypatch):
        storage = FakeStorage(
            listed=["interactions/a.jsonl", "interactions/readme.txt"]
        )
        monkeypatch.setattr(training_module, "storage_service", storage)

        run(training._download_training_data())

        assert training.storage_interaction_files == ["interactions/a.jsonl"]
        assert storage.downloaded == [
            ("interactions/a.jsonl", str(training.interaction_dir / "a.jsonl"))
        ]

    def test_empty_bucket_keeps_empty_list_and_warns(
        self, training, monkeypatch, caplog
    ):
        monkeypatch.setattr(training_module, "storage_service", FakeStorage())

        with caplog.at_level("WARNING"):
            run(training._download_training_data())

        assert training.storage_interaction_files == []
        assert "No files found" in caplog.text


class TestUploadArtifacts:
    def test_saves_model_and_mappings_then_uploads(self, training, monkeypatch):
        storage = FakeStorage()
        monkeypatch.setattr(training_module, "storage_service", storage)
        model = FakeALSImplicit(pd.DataFrame(), 1, 1)

        training._upload_artifacts(model, {"u1": 0}, {"10": 0})

        model_path = training.models_dir / "als_model.npz"
        mapping_path = training.models_dir / "mappings.json"
        assert Path(model_path) in [Path(path) for path in model.saved_paths]
        assert mapping_path.exists()
        assert json.loads(mapping_path.read_text(encoding="utf-8")) == {
            "users": {"u1": 0},
            "movies": {"10": 0},
        }
        assert storage.uploaded == [
            (str(model_path), "models/als_model.npz"),
            (str(mapping_path), "models/mappings.json"),
        ]


# ─────────────────────────────────────────────────────────────────────────────
# _cleanup_local_data / run_training_pipeline
# ─────────────────────────────────────────────────────────────────────────────


class TestCleanupLocalData:
    def test_removes_parquet_and_model_files(self, training):
        parquet = training.interaction_dir / "batch.parquet"
        parquet.write_bytes(b"parquet")
        model_file = training.models_dir / "als_model.npz"
        model_file.write_bytes(b"model")

        training._cleanup_local_data()

        assert not parquet.exists()
        assert not model_file.exists()

    def test_undeletable_entry_is_skipped_without_raising(self, training, caplog):
        subdir = training.models_dir / "not_a_file"
        subdir.mkdir()

        with caplog.at_level("WARNING"):
            training._cleanup_local_data()

        assert subdir.exists()
        assert "Could not remove file" in caplog.text


class TestRunTrainingPipeline:
    def test_happy_path_trains_uploads_and_publishes(
        self, training, monkeypatch
    ):
        write_jsonl(training, SMALL_ROWS)
        storage = FakeStorage()
        monkeypatch.setattr(training_module, "storage_service", storage)
        monkeypatch.setattr(training_module, "ALS_Implicit", FakeALSImplicit)

        assert run(training.run_training_pipeline()) is None

        uploaded_objects = [object_name for _, object_name in storage.uploaded]
        assert "models/als_model.npz" in uploaded_objects
        assert "models/mappings.json" in uploaded_objects
        assert (training.models_dir / "als_model.npz").exists()
        assert (training.models_dir / "mappings.json").exists()
        assert training.redis_store.published == [
            (
                "model.updated",
                {
                    "modelKey": "models/als_model.npz",
                    "mappingKey": "models/mappings.json",
                },
            )
        ]

    def test_download_error_reraises(self, training, monkeypatch):
        class BrokenStorage(FakeStorage):
            def list_files(self, prefix=""):
                raise RuntimeError("R2 down")

        monkeypatch.setattr(training_module, "storage_service", BrokenStorage())

        with pytest.raises(RuntimeError, match="R2 down"):
            run(training.run_training_pipeline())

    def test_training_error_reraises(self, training, monkeypatch):
        write_jsonl(training, SMALL_ROWS)
        monkeypatch.setattr(training_module, "storage_service", FakeStorage())

        class BrokenALS(FakeALSImplicit):
            def __init__(self, *args, **kwargs):
                raise RuntimeError("ALS crashed")

        monkeypatch.setattr(training_module, "ALS_Implicit", BrokenALS)

        with pytest.raises(RuntimeError, match="ALS crashed"):
            run(training.run_training_pipeline())
