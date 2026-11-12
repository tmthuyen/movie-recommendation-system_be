"""Unit test cho ``services/user_vector_service.py``.

Vector store được thay bằng ``fake_chroma`` in-memory; không kết nối ChromaDB.
"""

import asyncio

import pytest

from core.custom_exception import CustomException
from src.services.user_vector_service import UserVectorService


def run(coro):
    return asyncio.run(coro)


@pytest.fixture
def service(fake_chroma):
    return UserVectorService(fake_chroma)


class TestFindUserProfileVector:
    def test_returns_vector_and_payload(self, service, fake_chroma, settings):
        fake_chroma.seed(
            "u-1",
            [1.0, 0.0, 0.0],
            {"user_id": "u-1"},
            settings.vector_user_profile_collection,
        )

        result = run(service.find_user_profile_vector("u-1"))

        assert result["id"] == "u-1"
        assert result["vector"] == [1.0, 0.0, 0.0]
        assert result["payload"] == {"user_id": "u-1"}

    def test_missing_user_raises_not_found(self, service):
        with pytest.raises(CustomException) as exc_info:
            run(service.find_user_profile_vector("missing"))

        assert exc_info.value.status_code == 404
        assert exc_info.value.error_code == "NOT_FOUND"

    def test_empty_vector_raises_not_found(self, service, fake_chroma, settings):
        fake_chroma.seed(
            "u-empty",
            [],
            {"user_id": "u-empty"},
            settings.vector_user_profile_collection,
        )

        with pytest.raises(CustomException) as exc_info:
            run(service.find_user_profile_vector("u-empty"))

        assert exc_info.value.error_code == "NOT_FOUND"


class TestUpsertUserProfileVector:
    def test_upserts_vector_and_payload(self, service, fake_chroma, settings):
        run(service.upsert_user_profile_vector("u-2", [0.25, 0.75]))

        assert fake_chroma.upserts == [
            {
                "movie_id": "u-2",
                "vector": [0.25, 0.75],
                "payload": {
                    "user_id": "u-2",
                    "updated_from": "manual_update",
                },
                "collection_name": settings.vector_user_profile_collection,
            }
        ]

    def test_upsert_overwrites_existing_vector(self, service, fake_chroma, settings):
        fake_chroma.seed(
            "u-3",
            [1.0, 0.0],
            {"user_id": "u-3"},
            settings.vector_user_profile_collection,
        )

        run(service.upsert_user_profile_vector("u-3", [0.0, 1.0]))

        result = run(service.find_user_profile_vector("u-3"))
        assert result["vector"] == [0.0, 1.0]
