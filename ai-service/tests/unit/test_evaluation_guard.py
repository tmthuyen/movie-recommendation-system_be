"""Unit tests cho cơ chế kiểm tra và chặn (guard) trong quá trình benchmark IR.

Kiểm tra:
1. Benchmark phải dừng ngay lập tức (ném VectorDBVerificationError) khi ChromaDB không hợp lệ.
2. verify_vector_db phát hiện chính xác các sai lệch: số lượng, model name, corpus fingerprint, document text.
3. Báo cáo kiểm chứng không khẳng định sai 100% embeddings nếu chỉ kiểm tra mẫu đại diện.
"""

import json
from unittest.mock import MagicMock, patch

import pytest

from scripts.build_vector_db import verify_vector_db
from scripts.evaluate_models import (
    VectorDBVerificationError,
    check_vector_db_guard,
)
from src.data.data_loader import compute_corpus_fingerprint


class TestEvaluationGuard:
    def test_guard_raises_exception_when_db_invalid(self, tmp_path):
        """Kiểm chứng benchmark bắt buộc phải dừng và ném VectorDBVerificationError nếu ChromaDB không hợp lệ."""
        mock_collection = MagicMock()
        manifest_file = tmp_path / "movies_manifest.json"

        with patch(
            "scripts.evaluate_models.verify_vector_db",
            return_value=(False, "Corpus fingerprint không khớp"),
        ):
            with pytest.raises(VectorDBVerificationError) as exc_info:
                check_vector_db_guard(
                    collection=mock_collection,
                    corpus=["test text"],
                    movie_ids=[1],
                    model_name="test-model",
                    manifest_path=manifest_file,
                )

            assert "LỖI XÁC MINH VECTOR DB" in str(exc_info.value)
            assert "Corpus fingerprint không khớp" in str(exc_info.value)
            assert "DỪNG ĐÁNH GIÁ (ABORT BENCHMARK)" in str(exc_info.value)

    def test_guard_passes_when_db_valid(self, tmp_path):
        """Khi ChromaDB hợp lệ, guard hoàn tất thành công mà không ném ngoại lệ."""
        mock_collection = MagicMock()
        manifest_file = tmp_path / "movies_manifest.json"

        with patch(
            "scripts.evaluate_models.verify_vector_db",
            return_value=(True, "ChromaDB hợp lệ"),
        ):
            # Không được ném exception
            check_vector_db_guard(
                collection=mock_collection,
                corpus=["test text"],
                movie_ids=[1],
                model_name="test-model",
                manifest_path=manifest_file,
            )


class TestVerifyVectorDB:
    def test_detects_count_mismatch(self, tmp_path):
        """Phát hiện sai lệch số lượng vector trong DB và corpus."""
        mock_collection = MagicMock()
        mock_collection.count.return_value = 10
        manifest_file = tmp_path / "movies_manifest.json"

        corpus = ["text 1", "text 2"]
        movie_ids = [101, 102]

        is_valid, msg = verify_vector_db(
            collection=mock_collection,
            corpus=corpus,
            movie_ids=movie_ids,
            model_name="test-model",
            manifest_path=manifest_file,
        )

        assert is_valid is False
        assert "Số lượng vector không khớp" in msg

    def test_detects_manifest_model_mismatch(self, tmp_path):
        """Phát hiện sai lệch mô hình embedding giữa manifest và cấu hình hiện tại."""
        corpus = ["phim hanh dong", "phim hai huoc"]
        movie_ids = [1, 2]
        expected_fp = compute_corpus_fingerprint(corpus, movie_ids)

        mock_collection = MagicMock()
        mock_collection.count.return_value = 2

        manifest_file = tmp_path / "movies_manifest.json"
        manifest_file.write_text(
            json.dumps(
                {
                    "model_name": "old-embedding-model",
                    "corpus_fingerprint": expected_fp,
                    "num_records": 2,
                }
            ),
            encoding="utf-8",
        )

        is_valid, msg = verify_vector_db(
            collection=mock_collection,
            corpus=corpus,
            movie_ids=movie_ids,
            model_name="new-embedding-model",
            manifest_path=manifest_file,
        )

        assert is_valid is False
        assert "Embedding model không khớp" in msg

    def test_detects_manifest_fingerprint_mismatch(self, tmp_path):
        """Phát hiện sai lệch khi nội dung corpus bị thay đổi so với manifest."""
        corpus = ["noi dung moi cap nhat"]
        movie_ids = [1]

        mock_collection = MagicMock()
        mock_collection.count.return_value = 1

        manifest_file = tmp_path / "movies_manifest.json"
        manifest_file.write_text(
            json.dumps(
                {
                    "model_name": "test-model",
                    "corpus_fingerprint": "hash_khong_trung_khop",
                    "num_records": 1,
                }
            ),
            encoding="utf-8",
        )

        is_valid, msg = verify_vector_db(
            collection=mock_collection,
            corpus=corpus,
            movie_ids=movie_ids,
            model_name="test-model",
            manifest_path=manifest_file,
        )

        assert is_valid is False
        assert "Corpus fingerprint không khớp" in msg

    def test_detects_document_content_mismatch(self, tmp_path):
        """Phát hiện sai lệch nội dung document lưu thực tế trong ChromaDB với corpus."""
        corpus = ["nội dung chuẩn từ dataframe"]
        movie_ids = [10]
        expected_fp = compute_corpus_fingerprint(corpus, movie_ids)

        mock_collection = MagicMock()
        mock_collection.count.return_value = 1
        mock_collection.get.return_value = {
            "ids": ["10"],
            "metadatas": [{"movie_id": 10}],
            "documents": ["nội dung cũ sai lệch trong ChromaDB"],
            "embeddings": None,
        }

        manifest_file = tmp_path / "movies_manifest.json"
        manifest_file.write_text(
            json.dumps(
                {
                    "model_name": "test-model",
                    "corpus_fingerprint": expected_fp,
                    "num_records": 1,
                }
            ),
            encoding="utf-8",
        )

        is_valid, msg = verify_vector_db(
            collection=mock_collection,
            corpus=corpus,
            movie_ids=movie_ids,
            model_name="test-model",
            manifest_path=manifest_file,
        )

        assert is_valid is False
        assert "Nội dung document lưu trong ChromaDB không khớp" in msg

    def test_verification_report_does_not_overclaim_100_percent_embeddings(
        self, tmp_path
    ):
        """Xác nhận thông báo thành công phản ánh đúng việc kiểm chứng mẫu đại diện, không khẳng định sai 100% embeddings."""
        corpus = ["phim hay 1", "phim hay 2", "phim hay 3"]
        movie_ids = [1, 2, 3]
        expected_fp = compute_corpus_fingerprint(corpus, movie_ids)

        mock_collection = MagicMock()
        mock_collection.count.return_value = 3
        mock_collection.get.return_value = {
            "ids": ["1", "2", "3"],
            "metadatas": [{"movie_id": 1}, {"movie_id": 2}, {"movie_id": 3}],
            "documents": corpus,
            "embeddings": None,
        }

        manifest_file = tmp_path / "movies_manifest.json"
        manifest_file.write_text(
            json.dumps(
                {
                    "model_name": "test-model",
                    "corpus_fingerprint": expected_fp,
                    "num_records": 3,
                }
            ),
            encoding="utf-8",
        )

        is_valid, msg = verify_vector_db(
            collection=mock_collection,
            corpus=corpus,
            movie_ids=movie_ids,
            model_name="test-model",
            manifest_path=manifest_file,
        )

        assert is_valid is True
        # Không được khẳng định kiểm tra 100% embeddings
        assert "khớp 100% vectors" not in msg
        assert "mẫu đại diện" in msg
