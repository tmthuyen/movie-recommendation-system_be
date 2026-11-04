"""Unit test cho ``services/model_training_service.py``.

Chiến lược: dữ liệu rating rất nhỏ ghi vào parquet trong ``tmp_path`` (chdir để
mọi thư mục ``data/training`` rơi vào tmp), mock ALS và storage:

- ALS thật (``implicit``) không được train — ``AlternatingLeastSquares`` được
  thay bằng ``FakeALS`` chỉ ghi nhận tham số, ``fit`` và tạo factor giả.
- R2/S3 được thay bằng ``FakeStorage`` ghi nhận upload/download/delete, không
  mở kết nối mạng.
- Vector store dùng ``fake_chroma`` từ ``tests/conftest.py``.
"""

import asyncio
from pathlib import Path

import numpy as np
import pandas as pd
import pytest
import scipy.sparse as sparse

import src.services.model_training_service as training_module
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


class FakeALS:
    """Stub ``implicit.als.AlternatingLeastSquares``."""

    def __init__(self, **kwargs) -> None:
        self.kwargs = kwargs
        self.user_factors = None
        self.item_factors = None
        self.fit_matrices: list = []
        self.saved_paths: list[str] = []

    def fit(self, user_item_matrix):
        self.fit_matrices.append(user_item_matrix)
        self.user_factors = np.full((user_item_matrix.shape[0], 4), 0.25)
        self.item_factors = np.full((user_item_matrix.shape[1], 4), 0.5)
        return self

    def save(self, path: str) -> None:
        self.saved_paths.append(path)
        Path(path).write_bytes(b"fake-als-model")


@pytest.fixture
def training(tmp_path, monkeypatch, fake_chroma, settings):
    monkeypatch.chdir(tmp_path)
    return ModelTrainingService(fake_chroma)


def write_parquet(training: ModelTrainingService, rows: list[dict], name="batch.parquet"):
    path = training.parquet_dir / name
    pd.DataFrame(rows).to_parquet(path, index=False)
    return path


SMALL_ROWS = [
    {"userId": "u1", "movieId": 10, "rating": 5.0},
    {"userId": "u1", "movieId": 20, "rating": 3.0},
    {"userId": "u2", "movieId": 30, "rating": 4.0},
]


# ─────────────────────────────────────────────────────────────────────────────
# _preprocess_data
# ─────────────────────────────────────────────────────────────────────────────


class TestPreprocessData:
    def test_builds_sparse_matrix_and_mappings(self, training):
        write_parquet(training, SMALL_ROWS)

        matrix, user_mapping, movie_mapping, full_df = training._preprocess_data()

        assert matrix.shape == (2, 3)
        assert matrix.toarray().tolist() == [[5.0, 3.0, 0.0], [0.0, 0.0, 4.0]]
        assert user_mapping == {"u1": 0, "u2": 1}
        assert movie_mapping == {"10": 0, "20": 1, "30": 2}
        assert full_df["user_idx"].tolist() == [0, 0, 1]
        assert full_df["movie_idx"].tolist() == [0, 1, 2]

    def test_score_column_is_clipped_like_rating(self, training):
        write_parquet(
            training,
            [
                {"userId": "u1", "movieId": 10, "score": 0.0},
                {"userId": "u1", "movieId": 20, "score": 6.0},
            ],
        )

        matrix, *_ = training._preprocess_data()

        assert matrix.toarray().tolist() == [[0.1, 5.0]]

    def test_missing_rating_and_score_defaults_to_one(self, training):
        write_parquet(
            training,
            [
                {"userId": "u1", "movieId": 10},
                {"userId": "u2", "movieId": 20},
            ],
        )

        matrix, *_ = training._preprocess_data()

        assert matrix.toarray().tolist() == [[1.0, 0.0], [0.0, 1.0]]

    def test_no_parquet_files_returns_empty_triplet(self, training, caplog):
        with caplog.at_level("WARNING"):
            matrix, user_mapping, movie_mapping = training._preprocess_data()

        assert matrix is None
        assert user_mapping == {}
        assert movie_mapping == {}
        assert "No local parquet files" in caplog.text

    def test_missing_user_or_movie_column_returns_empty_triplet(self, training):
        write_parquet(training, [{"movieId": 10, "rating": 5.0}])

        matrix, user_mapping, movie_mapping = training._preprocess_data()

        assert matrix is None
        assert user_mapping == {}
        assert movie_mapping == {}

    def test_corrupt_parquet_file_is_skipped(self, training, caplog):
        (training.parquet_dir / "broken.parquet").write_bytes(b"not a parquet file")

        with caplog.at_level("ERROR"):
            matrix, user_mapping, movie_mapping = training._preprocess_data()

        assert matrix is None
        assert user_mapping == {}
        assert movie_mapping == {}
        assert "Failed to read parquet file" in caplog.text


# ─────────────────────────────────────────────────────────────────────────────
# _train_model / _update_chroma_vectors
# ─────────────────────────────────────────────────────────────────────────────


class TestTrainModel:
    def test_builds_als_from_settings_and_fits_matrix(self, training, monkeypatch):
        matrix = sparse.csr_matrix(np.eye(2))
        monkeypatch.setattr(training_module, "AlternatingLeastSquares", FakeALS)

        model = training._train_model(matrix)

        assert isinstance(model, FakeALS)
        assert model.kwargs == {
            "factors": training.settings.cf_vector_size,
            "regularization": 0.1,
            "iterations": 20,
            "use_gpu": False,
        }
        assert model.fit_matrices[0] is matrix


class TestUpdateChromaVectors:
    def test_upserts_user_and_movie_factors_to_separate_collections(
        self, training, fake_chroma, settings
    ):
        model = FakeALS()
        model.user_factors = np.array([[1.0, 0.0], [0.0, 1.0]])
        model.item_factors = np.array([[2.0, 0.0], [0.0, 3.0]])

        run(
            training._update_chroma_vectors(
                model, {"uuid-a": 0, "uuid-b": 1}, {"100": 0, "200.0": 1}
            )
        )

        assert len(fake_chroma.upserts) == 4
        user_upserts = [
            row
            for row in fake_chroma.upserts
            if row["collection_name"] == settings.vector_user_cf_collection
        ]
        movie_upserts = [
            row
            for row in fake_chroma.upserts
            if row["collection_name"] == settings.vector_movie_cf_collection
        ]
        assert [row["movie_id"] for row in user_upserts] == [0, 1]
        assert all(row["payload"]["updated_from"] == "batch_train" for row in user_upserts)
        assert [row["payload"]["user_uuid"] for row in user_upserts] == [
            "uuid-a",
            "uuid-b",
        ]
        assert [row["movie_id"] for row in movie_upserts] == [100, 200]
        assert [row["payload"]["movieId"] for row in movie_upserts] == [100, 200]
        assert movie_upserts[0]["vector"] == [2.0, 0.0]


# ─────────────────────────────────────────────────────────────────────────────
# _download_training_data / _upload_artifacts / _manage_r2_data / cleanup
# ─────────────────────────────────────────────────────────────────────────────


class TestDownloadTrainingData:
    def test_downloads_only_parquet_files(self, training, monkeypatch):
        storage = FakeStorage(
            listed=["interactions/a.parquet", "interactions/readme.txt"]
        )
        monkeypatch.setattr(training_module, "storage_service", storage)

        run(training._download_training_data())

        assert training.r2_parquet_files == ["interactions/a.parquet"]
        assert storage.downloaded == [
            ("interactions/a.parquet", str(training.parquet_dir / "a.parquet"))
        ]

    def test_empty_bucket_keeps_empty_list_and_warns(
        self, training, monkeypatch, caplog
    ):
        monkeypatch.setattr(training_module, "storage_service", FakeStorage())

        with caplog.at_level("WARNING"):
            run(training._download_training_data())

        assert training.r2_parquet_files == []
        assert "No parquet files found" in caplog.text


class TestUploadArtifacts:
    def test_saves_model_and_mappings_then_uploads(self, training, monkeypatch):
        storage = FakeStorage()
        monkeypatch.setattr(training_module, "storage_service", storage)
        model = FakeALS()

        training._upload_artifacts(model, {"u1": 0}, {"10": 0})

        model_path = training.models_dir / "als_model.npz"
        mapping_path = training.models_dir / "mappings.json"
        assert Path(model_path) in [Path(path) for path in model.saved_paths]
        assert mapping_path.exists()
        assert mapping_path.read_text(encoding="utf-8") == (
            '{"users": {"u1": 0}, "movies": {"10": 0}}'
        )
        assert storage.uploaded == [
            (str(model_path), "models/als_model.npz"),
            (str(mapping_path), "models/mappings.json"),
        ]


class TestManageR2Data:
    def test_merges_master_file_and_deletes_old_batches(self, training, monkeypatch):
        storage = FakeStorage()
        monkeypatch.setattr(training_module, "storage_service", storage)
        training.r2_parquet_files = [
            "interactions/batch.parquet",
            "interactions/master_interactions.parquet",
        ]
        frame = pd.DataFrame(SMALL_ROWS)

        training._manage_r2_data(frame)

        master_path = training.parquet_dir / "master_interactions.parquet"
        assert master_path.exists()
        assert pd.read_parquet(master_path).equals(frame)
        assert storage.uploaded == [
            (str(master_path), "interactions/master_interactions.parquet")
        ]
        assert storage.deleted == ["interactions/batch.parquet"]


class TestCleanupLocalData:
    def test_removes_parquet_and_model_files(self, training):
        parquet = write_parquet(training, SMALL_ROWS)
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


# ─────────────────────────────────────────────────────────────────────────────
# run_training_pipeline
# ─────────────────────────────────────────────────────────────────────────────


class TestRunTrainingPipeline:
    def test_happy_path_trains_syncs_and_cleans_up(
        self, training, monkeypatch, fake_chroma, settings
    ):
        write_parquet(training, SMALL_ROWS)
        storage = FakeStorage(listed=["interactions/batch.parquet"])
        monkeypatch.setattr(training_module, "storage_service", storage)
        monkeypatch.setattr(training_module, "AlternatingLeastSquares", FakeALS)

        assert run(training.run_training_pipeline()) is True

        assert [row["movie_id"] for row in fake_chroma.upserts] == [0, 1, 10, 20, 30]
        uploaded_objects = [object_name for _, object_name in storage.uploaded]
        assert "models/als_model.npz" in uploaded_objects
        assert "models/mappings.json" in uploaded_objects
        assert "interactions/master_interactions.parquet" in uploaded_objects
        assert storage.deleted == ["interactions/batch.parquet"]
        assert list(training.parquet_dir.glob("*.parquet")) == []
        assert list(training.models_dir.iterdir()) == []

    def test_no_training_data_returns_false(self, training, monkeypatch):
        monkeypatch.setattr(training_module, "storage_service", FakeStorage())

        assert run(training.run_training_pipeline()) is False

    def test_download_error_returns_false(self, training, monkeypatch):
        class BrokenStorage(FakeStorage):
            def list_files(self, prefix=""):
                raise RuntimeError("R2 down")

        monkeypatch.setattr(training_module, "storage_service", BrokenStorage())

        assert run(training.run_training_pipeline()) is False

    def test_training_error_returns_false(self, training, monkeypatch):
        write_parquet(training, SMALL_ROWS)
        storage = FakeStorage(listed=["interactions/batch.parquet"])
        monkeypatch.setattr(training_module, "storage_service", storage)
        monkeypatch.setattr(training_module, "AlternatingLeastSquares", FakeALS)

        def explode(self, user_item_matrix):
            raise RuntimeError("ALS crashed")

        monkeypatch.setattr(FakeALS, "fit", explode)

        assert run(training.run_training_pipeline()) is False
