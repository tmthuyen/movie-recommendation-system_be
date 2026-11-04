"""Unit test cho ``services/interaction_event_handler.py``.

Không kết nối RabbitMQ/ChromaDB/model thật:
- vector store dùng ``FakeChroma`` (fixture trong ``tests/conftest.py``),
- mapping service, storage service và training scheduler được monkeypatch.

Bao phủ: band điểm 1..5, ưu tiên ``score`` backend, normalize/clamp [-1, 1],
payload thiếu field, movie/user cold-start, EMA semantic/CF, ``removed``,
event type lạ và batch training (mock upload R2).
"""

import asyncio
import math
from unittest.mock import AsyncMock, MagicMock

import pytest

import src.services.interaction_event_handler as handler_module
from src.services.interaction_event_handler import InteractionEventHandler


def make_handler(store, scheduler=None) -> InteractionEventHandler:
    return InteractionEventHandler(
        vector_store=store,
        training_scheduler=scheduler or MagicMock(),
    )


def run(coro):
    return asyncio.run(coro)


def upserts_for(store, collection_name):
    return [row for row in store.upserts if row["collection_name"] == collection_name]


class TestActionScoreBand:
    @pytest.mark.parametrize(
        ("action", "expected"),
        [
            ("click", 1.0),
            ("LIKE", 5.0),
            ("like", 5.0),
            ("comment", 4.0),
            ("rating", 0.0),
            ("share", 1.0),  # event lạ → mặc định 1.0
        ],
    )
    def test_action_score_band(self, fake_chroma, action, expected):
        handler = make_handler(fake_chroma)
        assert handler._get_action_score({}, action, None) == expected

    def test_backend_score_takes_priority(self, fake_chroma):
        handler = make_handler(fake_chroma)
        assert handler._get_action_score({"score": 2.5}, "like", 5) == 2.5

    def test_backend_score_zero_is_not_treated_as_missing(self, fake_chroma):
        handler = make_handler(fake_chroma)
        assert handler._get_action_score({"score": 0}, "like", 5) == 0.0

    def test_backend_score_accepts_numeric_string(self, fake_chroma):
        handler = make_handler(fake_chroma)
        assert handler._get_action_score({"score": "3.5"}, "click", None) == 3.5

    @pytest.mark.parametrize("bad_score", ["abc", [], {}])
    def test_invalid_backend_score_falls_back_to_action_band(
        self, fake_chroma, bad_score
    ):
        handler = make_handler(fake_chroma)
        assert handler._get_action_score({"score": bad_score}, "like", None) == 5.0

    def test_rating_value_is_used_when_no_backend_score(self, fake_chroma):
        handler = make_handler(fake_chroma)
        assert handler._get_action_score({}, "rating", 4) == 4.0
        assert handler._get_action_score({}, "rating", None) == 0.0


class TestNormalizeScore:
    @pytest.mark.parametrize(
        ("raw", "expected"),
        [
            (5.0, 1.0),
            (2.5, 0.5),
            (1.0, 0.2),
            (0.0, 0.0),
            (-2.5, -0.5),
            (-5.0, -1.0),
            (10.0, 1.0),  # clamp trên
            (-10.0, -1.0),  # clamp dưới
        ],
    )
    def test_normalize_score_clamps_to_unit_range(self, raw, expected):
        assert InteractionEventHandler._normalize_score(raw) == pytest.approx(expected)


class TestHandleInteractionCreatedValidation:
    @pytest.mark.parametrize(
        "payload",
        [
            {"movieId": 1},
            {"userId": "u-1"},
            {},
        ],
    )
    def test_missing_user_or_movie_raises_value_error(self, fake_chroma, payload):
        handler = make_handler(fake_chroma)
        with pytest.raises(ValueError, match="userId and movieId"):
            run(handler._handle_interaction_created(payload))

    def test_string_movie_id_is_coerced_to_int(self, fake_chroma, monkeypatch):
        handler = make_handler(fake_chroma)
        fake_chroma.seed(
            10, [1.0, 0.0], collection_name=handler.settings.vector_collection
        )
        monkeypatch.setattr(handler_module.mapping_service, "get_user_idx", lambda _: 5)

        run(
            handler._handle_interaction_created(
                {"userId": "u-1", "movieId": "10", "action": "like", "score": 5}
            )
        )

        semantic = upserts_for(
            fake_chroma, handler.settings.vector_user_profile_collection
        )
        assert semantic[0]["movie_id"] == 5  # user index, không phải movie id
        assert semantic[0]["payload"]["user_uuid"] == "u-1"


class TestSemanticProfileUpdate:
    def test_new_user_vector_is_normalized_movie_vector(
        self, fake_chroma, monkeypatch
    ):
        handler = make_handler(fake_chroma)
        fake_chroma.seed(
            10, [3.0, 4.0, 0.0], collection_name=handler.settings.vector_collection
        )
        monkeypatch.setattr(handler_module.mapping_service, "get_user_idx", lambda _: 7)

        run(
            handler._handle_interaction_created(
                {"userId": "u-1", "movieId": 10, "action": "like", "score": 5}
            )
        )

        rows = upserts_for(fake_chroma, handler.settings.vector_user_profile_collection)
        assert len(rows) == 1
        assert rows[0]["movie_id"] == 7
        assert rows[0]["vector"] == pytest.approx([0.6, 0.8, 0.0])
        assert rows[0]["payload"]["updated_from"] == "semantic_realtime"

    def test_existing_user_vector_uses_ema(self, fake_chroma, monkeypatch):
        handler = make_handler(fake_chroma)
        fake_chroma.seed(
            10, [1.0, 0.0, 0.0], collection_name=handler.settings.vector_collection
        )
        fake_chroma.seed(
            7,
            [0.0, 1.0, 0.0],
            collection_name=handler.settings.vector_user_profile_collection,
        )
        monkeypatch.setattr(handler_module.mapping_service, "get_user_idx", lambda _: 7)

        run(handler._handle_interaction_created({"userId": "u-1", "movieId": 10, "score": 2.5}))

        vector = upserts_for(
            fake_chroma, handler.settings.vector_user_profile_collection
        )[0]["vector"]
        # alpha=0.2, normalized_score=0.5 → [0.1, 0.8, 0], sau đó normalize.
        norm = math.sqrt(0.1**2 + 0.8**2)
        assert vector == pytest.approx([0.1 / norm, 0.8 / norm, 0.0])

    def test_missing_movie_skips_semantic_update(self, fake_chroma, monkeypatch):
        handler = make_handler(fake_chroma)
        monkeypatch.setattr(handler_module.mapping_service, "get_user_idx", lambda _: 7)

        run(handler._handle_interaction_created({"userId": "u-1", "movieId": 10}))

        assert upserts_for(
            fake_chroma, handler.settings.vector_user_profile_collection
        ) == []

    def test_empty_movie_vector_skips_semantic_update(self, fake_chroma, monkeypatch):
        handler = make_handler(fake_chroma)
        fake_chroma.seed(
            10, [], collection_name=handler.settings.vector_collection
        )
        monkeypatch.setattr(handler_module.mapping_service, "get_user_idx", lambda _: 7)

        run(handler._handle_interaction_created({"userId": "u-1", "movieId": 10}))

        assert upserts_for(
            fake_chroma, handler.settings.vector_user_profile_collection
        ) == []

    def test_unmapped_user_falls_back_to_hash_index(self, fake_chroma, monkeypatch):
        handler = make_handler(fake_chroma)
        fake_chroma.seed(
            10, [1.0, 0.0], collection_name=handler.settings.vector_collection
        )
        monkeypatch.setattr(handler_module.mapping_service, "get_user_idx", lambda _: None)

        run(handler._handle_interaction_created({"userId": "new-user", "movieId": 10}))

        rows = upserts_for(fake_chroma, handler.settings.vector_user_profile_collection)
        assert len(rows) == 1
        assert isinstance(rows[0]["movie_id"], int)
        assert rows[0]["movie_id"] >= 0
        assert rows[0]["payload"]["user_uuid"] == "new-user"

    def test_zero_score_produces_zero_vector_without_nan(self, fake_chroma, monkeypatch):
        handler = make_handler(fake_chroma)
        fake_chroma.seed(
            10, [1.0, 0.0], collection_name=handler.settings.vector_collection
        )
        monkeypatch.setattr(handler_module.mapping_service, "get_user_idx", lambda _: 7)

        run(
            handler._handle_interaction_created(
                {"userId": "u-1", "movieId": 10, "action": "rating", "rating": 0}
            )
        )

        vector = upserts_for(
            fake_chroma, handler.settings.vector_user_profile_collection
        )[0]["vector"]
        assert vector == [0.0, 0.0]
        assert not any(math.isnan(value) for value in vector)


class TestCfProfileUpdate:
    def test_cf_update_uses_smaller_alpha(self, fake_chroma, monkeypatch):
        handler = make_handler(fake_chroma)
        fake_chroma.seed(
            10,
            [0.0, 1.0],
            collection_name=handler.settings.vector_movie_cf_collection,
        )
        fake_chroma.seed(
            7,
            [1.0, 0.0],
            collection_name=handler.settings.vector_user_cf_collection,
        )
        monkeypatch.setattr(handler_module.mapping_service, "get_user_idx", lambda _: 7)

        run(handler._update_cf_profile("u-1", 10, 2.5))

        rows = upserts_for(fake_chroma, handler.settings.vector_user_cf_collection)
        assert len(rows) == 1
        # CF không normalize lại: new = 0.9*[1,0] + 0.1*0.5*[0,1].
        assert rows[0]["vector"] == pytest.approx([0.9, 0.05])
        assert rows[0]["payload"]["updated_from"] == "cf_realtime"

    def test_cf_update_skips_cold_start_user(self, fake_chroma, monkeypatch):
        handler = make_handler(fake_chroma)
        monkeypatch.setattr(handler_module.mapping_service, "get_user_idx", lambda _: None)
        run(handler._update_cf_profile("u-1", 10, 5.0))
        assert upserts_for(fake_chroma, handler.settings.vector_user_cf_collection) == []

    def test_cf_update_skips_missing_movie(self, fake_chroma, monkeypatch):
        handler = make_handler(fake_chroma)
        fake_chroma.seed(
            7,
            [1.0, 0.0],
            collection_name=handler.settings.vector_user_cf_collection,
        )
        monkeypatch.setattr(handler_module.mapping_service, "get_user_idx", lambda _: 7)
        run(handler._update_cf_profile("u-1", 10, 5.0))
        assert upserts_for(fake_chroma, handler.settings.vector_user_cf_collection) == []

    def test_cf_update_skips_missing_user_vector(self, fake_chroma, monkeypatch):
        handler = make_handler(fake_chroma)
        fake_chroma.seed(
            10,
            [0.0, 1.0],
            collection_name=handler.settings.vector_movie_cf_collection,
        )
        monkeypatch.setattr(handler_module.mapping_service, "get_user_idx", lambda _: 7)
        run(handler._update_cf_profile("u-1", 10, 5.0))
        assert upserts_for(fake_chroma, handler.settings.vector_user_cf_collection) == []


class TestRemovedFlagAndDispatch:
    def test_removed_flag_is_accepted_without_crash(self, fake_chroma, monkeypatch):
        """``removed=True`` hiện chỉ được log (xem báo cáo gap), không làm crash."""
        handler = make_handler(fake_chroma)
        fake_chroma.seed(
            10, [1.0, 0.0], collection_name=handler.settings.vector_collection
        )
        monkeypatch.setattr(handler_module.mapping_service, "get_user_idx", lambda _: 7)

        run(
            handler.handle(
                "interaction.event",
                {
                    "userId": "u-1",
                    "movieId": 10,
                    "action": "like",
                    "removed": True,
                    "score": 5,
                },
            )
        )

        rows = upserts_for(fake_chroma, handler.settings.vector_user_profile_collection)
        assert len(rows) == 1
        assert rows[0]["vector"][0] > 0

    @pytest.mark.parametrize("event_type", ["interaction.created", "interaction.event"])
    def test_interaction_events_dispatch_to_handler(
        self, fake_chroma, event_type, monkeypatch
    ):
        handler = make_handler(fake_chroma)
        mocked = AsyncMock()
        monkeypatch.setattr(handler, "_handle_interaction_created", mocked)
        run(handler.handle(event_type, {"userId": "u", "movieId": 1}))
        mocked.assert_awaited_once_with({"userId": "u", "movieId": 1})

    def test_training_batch_event_dispatches(self, fake_chroma, monkeypatch):
        handler = make_handler(fake_chroma)
        mocked = AsyncMock()
        monkeypatch.setattr(handler, "_handle_training_batch", mocked)
        run(handler.handle("training.batch", {"interactions": []}))
        mocked.assert_awaited_once_with({"interactions": []})

    def test_unknown_event_only_logs_warning(self, fake_chroma, monkeypatch):
        handler = make_handler(fake_chroma)
        created = AsyncMock()
        batch = AsyncMock()
        monkeypatch.setattr(handler, "_handle_interaction_created", created)
        monkeypatch.setattr(handler, "_handle_training_batch", batch)

        run(handler.handle("something.else", {"x": 1}))

        created.assert_not_awaited()
        batch.assert_not_awaited()


class TestTrainingBatch:
    def test_empty_batch_is_skipped(self, fake_chroma, tmp_path, monkeypatch):
        monkeypatch.chdir(tmp_path)
        scheduler = MagicMock()
        scheduler.train_main_model = AsyncMock()
        handler = make_handler(fake_chroma, scheduler)

        run(handler._handle_training_batch({"interactions": []}))

        scheduler.train_main_model.assert_not_awaited()
        assert not (tmp_path / "data" / "temp_batches").exists()

    def test_successful_batch_uploads_and_schedules_training(
        self, fake_chroma, tmp_path, monkeypatch
    ):
        monkeypatch.chdir(tmp_path)
        scheduler = MagicMock()
        scheduler.train_main_model = AsyncMock()
        handler = make_handler(fake_chroma, scheduler)

        uploaded = {}
        monkeypatch.setattr(
            handler_module.storage_service,
            "upload_file",
            lambda path, key: uploaded.update(path=path, key=key) or True,
        )
        created_tasks = []

        def fake_create_task(coro):
            created_tasks.append(coro)
            coro.close()
            return MagicMock()

        monkeypatch.setattr(asyncio, "create_task", fake_create_task)

        run(
            handler._handle_training_batch(
                {"interactions": [{"userId": 1, "movieId": 2, "rating": 5}]}
            )
        )

        assert len(created_tasks) == 1
        scheduler.train_main_model.assert_called_once()
        assert uploaded["key"].startswith("interactions/batch_")
        assert uploaded["key"].endswith(".parquet")
        # File tạm phải bị xoá sau khi upload thành công.
        assert list((tmp_path / "data" / "temp_batches").glob("*.parquet")) == []

    def test_upload_failure_raises_and_keeps_temp_file(
        self, fake_chroma, tmp_path, monkeypatch
    ):
        monkeypatch.chdir(tmp_path)
        handler = make_handler(fake_chroma)
        monkeypatch.setattr(
            handler_module.storage_service, "upload_file", lambda path, key: False
        )

        with pytest.raises(RuntimeError, match="Failed to upload batch"):
            run(
                handler._handle_training_batch(
                    {"interactions": [{"userId": 1, "movieId": 2}]}
                )
            )

        assert len(list((tmp_path / "data" / "temp_batches").glob("*.parquet"))) == 1
