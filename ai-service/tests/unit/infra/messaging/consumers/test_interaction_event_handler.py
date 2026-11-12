"""Unit test cho ``infra/messaging/consumers/interaction_event_handler.py``.

Không kết nối RabbitMQ/ChromaDB/model thật:
- ``MovieVectorService`` và ``UserVectorService`` được thay bằng mock,
- ``TrainingScheduler`` được thay bằng mock,
- batch training ghi parquet vào ``tmp_path``.

Bao phủ: action score hiện tại, normalize/clamp [-1, 1], validate payload,
dispatch event, EMA semantic profile, ``removed``, training batch và
training request.
"""

import asyncio
import logging
import math
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

import pandas as pd
import pytest
from pydantic import ValidationError

import infra.messaging.consumers.interaction_event_handler as handler_module
from core.custom_exception import CustomException
from infra.messaging.consumers.interaction_event_handler import InteractionEventHandler
from infra.messaging.event_schemas import (
    InteractionCreatedPayload,
    InteractionListPayload,
)


def run(coro):
    return asyncio.run(coro)


def make_handler(
    movie_service=None,
    user_service=None,
    scheduler=None,
) -> InteractionEventHandler:
    return InteractionEventHandler(
        training_scheduler=scheduler if scheduler is not None else MagicMock(),
        user_vector_service=(
            user_service if user_service is not None else MagicMock()
        ),
        movie_vector_service=(
            movie_service if movie_service is not None else MagicMock()
        ),
    )


def make_event(event_type: str, payload: dict, **overrides) -> dict:
    event = {
        "eventId": "evt-1",
        "eventType": event_type,
        "eventVersion": 1,
        "source": "backend",
        "occurredAt": "2026-11-12T00:00:00Z",
        "correlationId": "corr-1",
        "payload": payload,
    }
    event.update(overrides)
    return event


def interaction_payload(**overrides) -> dict:
    payload = {
        "userId": "u-1",
        "movieId": 10,
        "action": "like",
        "score": 5,
        "removed": False,
        "createdAt": "2026-11-12T00:00:00Z",
    }
    payload.update(overrides)
    return payload


def make_profile_handler(
    movie_vector: list[float] | None = None,
    movie_error: Exception | None = None,
    user_data: dict | None = None,
    user_error: Exception | None = None,
):
    movie_service = MagicMock()
    movie_service.find_movie_vector = AsyncMock(
        side_effect=movie_error
        if movie_error is not None
        else None,
        return_value=None if movie_error is not None else {"vector": movie_vector},
    )
    user_service = MagicMock()
    user_service.find_user_profile_vector = AsyncMock(
        side_effect=user_error,
        return_value=user_data,
    )
    user_service.upsert_user_profile_vector = AsyncMock()
    handler = make_handler(movie_service=movie_service, user_service=user_service)
    return handler, movie_service, user_service


class TestActionScore:
    @pytest.mark.parametrize(
        ("action", "expected"),
        [
            ("click", 1.0),
            ("LIKE", 5.0),
            ("like", 5.0),
            ("comment", 2.0),
            ("rating", 0.0),
            ("share", 1.0),  # event lạ → mặc định 1.0
        ],
    )
    def test_action_score_band(self, action, expected):
        handler = make_handler()
        assert handler._get_action_score(action=action) == expected

    def test_rating_value_is_used_when_provided(self):
        handler = make_handler()
        assert handler._get_action_score(action="rating", rating=4) == 4.0
        assert handler._get_action_score(action="rating", rating=None) == 0.0

    def test_non_rating_action_ignores_rating_value(self):
        handler = make_handler()
        assert handler._get_action_score(action="like", rating=2.5) == 5.0


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


class TestHandleInteractionCreated:
    @pytest.mark.parametrize(
        "payload",
        [
            {"movieId": 1, "action": "like", "createdAt": "2026-11-12T00:00:00Z"},
            {"userId": "u-1", "action": "like", "createdAt": "2026-11-12T00:00:00Z"},
            {"userId": "u-1", "movieId": 1, "createdAt": "2026-11-12T00:00:00Z"},
        ],
    )
    def test_missing_required_field_raises_validation_error(self, payload):
        handler = make_handler()

        with pytest.raises(ValidationError):
            run(handler._handle_interaction_created(payload))

    def test_empty_user_id_raises_custom_exception(self):
        handler = make_handler()

        with pytest.raises(CustomException) as exc:
            run(
                handler._handle_interaction_created(
                    interaction_payload(userId="")
                )
            )

        assert exc.value.status_code == 400

    def test_string_movie_id_is_coerced_to_int(self, monkeypatch):
        handler = make_handler()
        update = AsyncMock()
        monkeypatch.setattr(handler, "_update_semantic_profile", update)

        run(handler._handle_interaction_created(interaction_payload(movieId="10")))

        update.assert_awaited_once_with(user_id="u-1", movie_id=10, score=5.0)

    def test_action_score_is_forwarded_to_semantic_update(self, monkeypatch):
        handler = make_handler()
        update = AsyncMock()
        monkeypatch.setattr(handler, "_update_semantic_profile", update)

        run(handler._handle_interaction_created(interaction_payload(action="comment")))

        update.assert_awaited_once_with(user_id="u-1", movie_id=10, score=2.0)

    def test_removed_true_still_updates_semantic_profile(self, monkeypatch):
        handler = make_handler()
        update = AsyncMock()
        monkeypatch.setattr(handler, "_update_semantic_profile", update)

        run(
            handler._handle_interaction_created(
                interaction_payload(removed=True)
            )
        )

        update.assert_awaited_once_with(user_id="u-1", movie_id=10, score=5.0)


class TestSemanticProfileUpdate:
    def test_new_user_vector_is_normalized_movie_vector(self):
        handler, _, user_service = make_profile_handler(
            movie_vector=[3.0, 4.0, 0.0],
            user_error=CustomException("not found", status_code=404),
        )

        run(
            handler._update_semantic_profile(
                user_id="u-1", movie_id=10, score=5.0
            )
        )

        user_service.upsert_user_profile_vector.assert_awaited_once_with(
            user_id="u-1", vector=pytest.approx([0.6, 0.8, 0.0])
        )

    def test_existing_user_vector_uses_ema(self):
        handler, _, user_service = make_profile_handler(
            movie_vector=[1.0, 0.0, 0.0],
            user_data={"vector": [0.0, 1.0, 0.0]},
        )

        run(
            handler._update_semantic_profile(
                user_id="u-1", movie_id=10, score=2.5
            )
        )

        norm = math.sqrt(0.1**2 + 0.8**2)
        user_service.upsert_user_profile_vector.assert_awaited_once_with(
            user_id="u-1",
            vector=pytest.approx([0.1 / norm, 0.8 / norm, 0.0]),
        )

    def test_zero_score_produces_zero_vector_without_nan(self):
        handler, _, user_service = make_profile_handler(
            movie_vector=[1.0, 0.0],
            user_error=CustomException("not found", status_code=404),
        )

        run(
            handler._update_semantic_profile(
                user_id="u-1", movie_id=10, score=0.0
            )
        )

        vector = user_service.upsert_user_profile_vector.await_args.kwargs["vector"]
        assert vector == [0.0, 0.0]
        assert not any(math.isnan(value) for value in vector)

    def test_negative_score_is_normalized(self):
        handler, _, user_service = make_profile_handler(
            movie_vector=[1.0, 0.0],
            user_error=CustomException("not found", status_code=404),
        )

        run(
            handler._update_semantic_profile(
                user_id="u-1", movie_id=10, score=-5.0
            )
        )

        user_service.upsert_user_profile_vector.assert_awaited_once_with(
            user_id="u-1", vector=pytest.approx([-1.0, 0.0])
        )

    def test_missing_movie_propagates_and_skips_user_upsert(self):
        handler, _, user_service = make_profile_handler(
            movie_error=CustomException("movie not found", status_code=404)
        )

        with pytest.raises(CustomException, match="movie not found"):
            run(
                handler._update_semantic_profile(
                    user_id="u-1", movie_id=10, score=5.0
                )
            )

        user_service.upsert_user_profile_vector.assert_not_awaited()

    def test_unexpected_user_lookup_error_propagates(self):
        handler, _, user_service = make_profile_handler(
            movie_vector=[1.0, 0.0],
            user_error=RuntimeError("redis down"),
        )

        with pytest.raises(RuntimeError, match="redis down"):
            run(
                handler._update_semantic_profile(
                    user_id="u-1", movie_id=10, score=5.0
                )
            )

        user_service.upsert_user_profile_vector.assert_not_awaited()

    def test_empty_user_vector_is_treated_as_new_user(self):
        handler, _, user_service = make_profile_handler(
            movie_vector=[1.0, 0.0],
            user_data={"vector": []},
        )

        run(
            handler._update_semantic_profile(
                user_id="u-1", movie_id=10, score=5.0
            )
        )

        user_service.upsert_user_profile_vector.assert_awaited_once_with(
            user_id="u-1", vector=pytest.approx([1.0, 0.0])
        )


class TestDispatch:
    @pytest.mark.parametrize("event_type", ["interaction.created", "interaction.event"])
    def test_interaction_events_dispatch_to_handler(
        self, event_type, monkeypatch
    ):
        handler = make_handler()
        mocked = AsyncMock()
        monkeypatch.setattr(handler, "_handle_interaction_created", mocked)
        payload = interaction_payload()

        run(handler.handle(make_event(event_type, payload)))

        expected = InteractionCreatedPayload.model_validate(payload).model_dump()
        mocked.assert_awaited_once_with(expected)

    def test_training_batch_event_dispatches(self, monkeypatch):
        handler = make_handler()
        mocked = AsyncMock()
        monkeypatch.setattr(handler, "_handle_training_batch", mocked)
        payload = {"interactions": [interaction_payload()]}

        run(handler.handle(make_event("training.batch", payload)))

        expected = InteractionListPayload.model_validate(payload).model_dump()
        mocked.assert_awaited_once_with(expected)

    def test_training_request_creates_background_task(self, monkeypatch):
        scheduler = MagicMock()
        scheduler.train_main_model = AsyncMock()
        handler = make_handler(scheduler=scheduler)
        created = []

        def fake_create_task(coro):
            created.append(coro)
            coro.close()
            return MagicMock()

        monkeypatch.setattr(handler_module.asyncio, "create_task", fake_create_task)

        run(handler.handle(make_event("training.request", {})))

        scheduler.train_main_model.assert_called_once()
        assert len(created) == 1

    def test_unknown_event_only_logs_warning(self, monkeypatch):
        handler = make_handler()
        created = AsyncMock()
        batch = AsyncMock()
        monkeypatch.setattr(handler, "_handle_interaction_created", created)
        monkeypatch.setattr(handler, "_handle_training_batch", batch)

        run(handler.handle(make_event("something.else", {"x": 1})))

        created.assert_not_awaited()
        batch.assert_not_awaited()

    def test_invalid_event_raises_validation_error(self):
        handler = make_handler()

        with pytest.raises(ValidationError):
            run(handler.handle({"eventType": "interaction.created"}))


class TestTrainingBatch:
    def test_empty_batch_is_skipped(self, tmp_path, monkeypatch):
        monkeypatch.chdir(tmp_path)
        scheduler = MagicMock()
        scheduler.train_main_model = AsyncMock()
        handler = make_handler(scheduler=scheduler)

        run(handler._handle_training_batch({"interactions": []}))

        scheduler.train_main_model.assert_not_awaited()
        assert not (tmp_path / "data" / "temp_batches").exists()

    def test_batch_writes_parquet_and_removes_temp_file(self, tmp_path, monkeypatch):
        monkeypatch.chdir(tmp_path)
        removed: list[Path] = []
        monkeypatch.setattr(
            handler_module.os,
            "remove",
            lambda path: removed.append(Path(path)),
        )
        scheduler = MagicMock()
        scheduler.train_main_model = AsyncMock()
        handler = make_handler(scheduler=scheduler)

        run(
            handler._handle_training_batch(
                {"interactions": [interaction_payload()]}
            )
        )

        scheduler.train_main_model.assert_not_awaited()
        assert len(removed) == 1
        assert (
            removed[0].resolve().parent
            == (tmp_path / "data" / "temp_batches").resolve()
        )
        assert removed[0].exists()
        df = pd.read_parquet(removed[0])
        assert len(df) == 1
        assert df.iloc[0]["userId"] == "u-1"

    def test_remove_failure_is_logged_and_does_not_raise(
        self, tmp_path, monkeypatch, caplog
    ):
        monkeypatch.chdir(tmp_path)
        monkeypatch.setattr(
            handler_module.os,
            "remove",
            MagicMock(side_effect=OSError("locked")),
        )
        handler = make_handler()

        with caplog.at_level(logging.WARNING):
            run(
                handler._handle_training_batch(
                    {"interactions": [interaction_payload()]}
                )
            )

        assert "Failed to delete temp batch" in caplog.text
        batch_dir = tmp_path / "data" / "temp_batches"
        assert len(list(batch_dir.glob("*.parquet"))) == 1
