import json
import logging
import os
import uuid
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from core.config import get_settings
from core.custom_exception import CustomException
from core.integrations import TrainingScheduler
from infra.messaging.event_schemas import (
    DomainEvent,
    InteractionAction,
    InteractionCreatedEvent,
    InteractionCreatedPayload,
)
from infra.storage.storage_service import storage_service
from services.movie_vector_service import MovieVectorService
from services.user_vector_service import UserVectorService

logger = logging.getLogger(name="FastAPI-Recommendations")

settings = get_settings()


class InteractionEventHandler:
    def __init__(
        self,
        training_scheduler: TrainingScheduler,
        user_vector_service: UserVectorService,
        movie_vector_service: MovieVectorService,
    ):
        self.training_scheduler = training_scheduler
        self.user_vector_service = user_vector_service
        self.movie_vector_service = movie_vector_service

    async def handle(
        self, event_type: str, payload: dict[str, Any], event: DomainEvent
    ) -> None:
        """
        Handle incoming interaction events from RabbitMQ.
        """
        logger.info(
            f"[InteractionEventHandler] Xử lý sự kiện {json.dumps(event.model_dump(), indent=2)}"
        )

        if event_type in ("interaction.created", "interaction.event"):
            await self._handle_interaction_created(payload)
        elif event_type == "training.batch":
            await self._handle_training_batch(payload)
        else:
            logger.warning(
                f"[InteractionEventHandler] Unsupported event type: {event_type}"
            )

    async def _handle_training_batch(self, payload: dict[str, Any]) -> None:
        """
        Receive batch of interactions from Backend, save as Parquet, and upload to R2.
        """
        interactions = payload.get("interactions", [])
        if not interactions:
            logger.warning("Empty training batch received. Skipping.")
            return

        logger.info(f"Received training batch with {len(interactions)} records.")

        df = pd.DataFrame(interactions)

        temp_dir = Path("data/temp_batches")
        temp_dir.mkdir(parents=True, exist_ok=True)

        file_name = f"batch_{uuid.uuid4().hex[:8]}.parquet"
        local_path = temp_dir / file_name

        df.to_parquet(local_path, index=False)

        r2_key = f"interactions/{file_name}"
        success = storage_service.upload_file(str(local_path), r2_key)

        if success:
            logger.info(f"Successfully uploaded training batch to R2: {r2_key}")
            # Trigger retrain asynchronously in the background
            import asyncio

            asyncio.create_task(self.training_scheduler.train_main_model())
        else:
            logger.error(f"Failed to upload training batch to R2: {r2_key}")
            raise RuntimeError(f"Failed to upload batch {r2_key} to storage")

        try:
            os.remove(local_path)
        except Exception as e:
            logger.warning(f"Failed to delete temp batch file {local_path}: {e}")

    async def _handle_interaction_created(self, payload: dict[str, Any]) -> None:
        """
        Process a new interaction (click, like, rating, etc.) and update user vectors.
        """
        # user_id = payload.get("userId")
        # movie_id = payload.get("movieId")
        # action = payload.get("action", "click")
        # rating = payload.get("rating")
        # removed = bool(payload.get("removed", False))

        payload_obj = InteractionCreatedPayload.model_validate(payload)
        user_id = payload_obj.userId
        movie_id = payload_obj.movieId
        action = payload_obj.action
        score = payload_obj.score
        removed = payload_obj.removed

        if not user_id or not movie_id or not action:
            raise CustomException(
                "Missing required fields in interaction payload: userId, movieId, and action are required.",
                status_code=400,
                error_code="INVALID_PAYLOAD",
            )

        movie_id = int(movie_id)

        # Tính score dựa trên action và rating (nếu có): Confidence score
        score = self._get_action_score(action=action, rating=score)

        logger.info(
            f"[InteractionEventHandler] Đang xử lý tương tác: User {user_id} -> Movie {movie_id} "
            f"(Action: {action}, Score: {score}, Removed: {removed})"
        )

        # 2. Update Semantic Profile Vector
        await self._update_semantic_profile(
            user_id=user_id, movie_id=movie_id, score=score
        )
        logger.info(
            f"[InteractionEventHandler] Xử lý xong sự kiện interaction.created: User {user_id} -> Movie {movie_id} (Action: {action}, Score: {score})"
        )

    def _get_action_score(self, action: str, rating: float | None = None) -> float:
        """Tính score dựa trên action và rating (nếu có)."""
        if action == InteractionAction.RATING and rating is not None:
            return float(rating)

        scores = {
            InteractionAction.VIEW: 1.0,
            InteractionAction.LIKE: 5.0,
            InteractionAction.COMMENT: 2.0,
            InteractionAction.RATING: 0.0,
        }
        return scores.get(action.lower(), 1.0)

    @staticmethod
    def _normalize_score(score: float) -> float:
        """Chuẩn hoá score band 5 về khoảng [-1, 1] cho EMA."""
        return max(-1.0, min(1.0, float(score) / 5.0))

    async def _update_semantic_profile(
        self, user_id: str, movie_id: int, score: float
    ) -> None:
        """Update user_profile_vectors using Exponential Moving Average."""
        # Get movie semantic vector

        movie_data = await self.movie_vector_service.find_movie_vector(movie_id)

        movie_vec = np.array(movie_data["vector"])

        try:
            user_data = await self.user_vector_service.find_user_profile_vector(user_id)
        except CustomException as e:
            logger.info(
                f"[InteractionEventHandler] Không tìm thấy user vector với id={user_id}. Tạo mới."
            )
            user_data = None

        alpha = 0.2  # Time decay factor for newer interactions

        if user_data and user_data.get("vector"):
            current_user_vec = np.array(user_data["vector"])
            new_vec = (1 - alpha) * current_user_vec + alpha * (
                self._normalize_score(score)
            ) * movie_vec
        else:
            new_vec = self._normalize_score(score) * movie_vec

        # Normalize to prevent explosion
        norm = np.linalg.norm(new_vec)
        if norm > 0:
            new_vec = new_vec / norm

        await self.user_vector_service.upsert_user_profile_vector(
            user_id=user_id, vector=new_vec.tolist()
        )
        logger.info(
            f"[InteractionEventHandler] Cập nhật user profile vector cho user_id={user_id} dựa trên interaction với movie_id={movie_id} (score={score})"
        )
