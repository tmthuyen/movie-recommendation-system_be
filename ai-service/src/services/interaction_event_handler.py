import logging
import pandas as pd
import uuid
import os
import uuid
import pandas as pd
from pathlib import Path
from typing import Any
import numpy as np
from core.config import get_settings
from core.integrations import VectorStore, TrainingScheduler
from services.mapping_service import mapping_service
from services.storage_service import storage_service

logger = logging.getLogger(__name__)

class InteractionEventHandler:
    def __init__(self, vector_store: VectorStore, training_scheduler: TrainingScheduler):
        self.settings = get_settings()
        self.vector_store = vector_store
        self.training_scheduler = training_scheduler

    async def handle(self, event_type: str, payload: dict[str, Any]) -> None:
        """
        Handle incoming interaction events from RabbitMQ.
        """
        logger.info(f"[InteractionEventHandler] Received event: {event_type}")
        
        if event_type == "interaction.created":
            await self._handle_interaction_created(payload)
        elif event_type == "training.batch":
            await self._handle_training_batch(payload)
        else:
            logger.warning(f"[InteractionEventHandler] Unsupported event type: {event_type}")

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
        user_uuid = payload.get("userId")
        movie_id = payload.get("movieId")
        action = payload.get("action", "click")
        rating = payload.get("rating")
        
        if not user_uuid or not movie_id:
            raise ValueError("userId and movieId are required for interaction events.")
            
        movie_id = int(movie_id)
        
        # 1. Determine interaction score
        score = self._get_action_score(action, rating)
        
        logger.info(f"Processing interaction: User {user_uuid} -> Movie {movie_id} (Action: {action}, Score: {score})")
        
        # 2. Update Semantic Profile Vector
        await self._update_semantic_profile(user_uuid, movie_id, score)
        
        # 3. Update Collaborative Filtering Vector (if exists)
        await self._update_cf_profile(user_uuid, movie_id, score)

    def _get_action_score(self, action: str, rating: Any) -> float:
        if action == "rating" and rating is not None:
            return float(rating)
        scores = {
            "click": 2.0,
            "like": 8.0,
            "favorite": 10.0,
            "dislike": -4.0,
            "comment": 6.0,
            "watch": 8.0
        }
        return scores.get(action.lower(), 2.0)

    async def _update_semantic_profile(self, user_uuid: str, movie_id: int, score: float) -> None:
        """Update user_profile_vectors using Exponential Moving Average."""
        # Get movie semantic vector
        movie_data = await self.vector_store.get_by_id(movie_id, collection_name=self.settings.vector_collection)
        if not movie_data or not movie_data.get("vector"):
            logger.warning(f"Movie {movie_id} not found in semantic collection. Skipping semantic update.")
            return
            
        movie_vec = np.array(movie_data["vector"])
        
        # We use UUID directly as the ID for user_profile_vectors
        user_id_str = str(user_uuid)
        # However, VectorStore expects integer IDs currently. We might need a hash or just use mapping.
        # Wait, ChromaVectorBackend converts int to str. Let's use a hashed int for user_uuid, or modify it to accept string.
        # For now, let's hash the UUID to int to bypass VectorStore type hints, or just use the mapped index if available.
        user_idx = mapping_service.get_user_idx(user_uuid)
        
        # Fallback to hash if not mapped (e.g. new user)
        if user_idx is None:
            user_idx = abs(hash(user_uuid)) % (10**9) # pseudo-id for Chroma string conversion
            
        user_data = await self.vector_store.get_by_id(user_idx, collection_name=self.settings.vector_user_profile_collection)
        
        alpha = 0.2 # Time decay factor for newer interactions
        
        if user_data and user_data.get("vector"):
            current_user_vec = np.array(user_data["vector"])
            new_vec = (1 - alpha) * current_user_vec + alpha * (score / 10.0) * movie_vec
        else:
            new_vec = (score / 10.0) * movie_vec

        # Normalize to prevent explosion
        norm = np.linalg.norm(new_vec)
        if norm > 0:
            new_vec = new_vec / norm

        await self.vector_store.upsert(
            movie_id=user_idx, # Used as ID
            vector=new_vec.tolist(),
            payload={"user_uuid": user_uuid, "updated_from": "semantic_realtime"},
            collection_name=self.settings.vector_user_profile_collection
        )
        logger.info(f"Updated Semantic Profile for user {user_uuid}")

    async def _update_cf_profile(self, user_uuid: str, movie_id: int, score: float) -> None:
        """Update user_cf_vectors using EMA if user and movie exist in CF model."""
        user_idx = mapping_service.get_user_idx(user_uuid)
        
        if user_idx is None:
            logger.warning(f"User {user_uuid} not found in CF mapping (Cold-Start). Skipping CF update.")
            return
            
        movie_cf_data = await self.vector_store.get_by_id(movie_id, collection_name=self.settings.vector_movie_cf_collection)
        if not movie_cf_data or not movie_cf_data.get("vector"):
            logger.warning(f"Movie {movie_id} not found in CF collection (Cold-Start). Skipping CF update.")
            return
            
        user_cf_data = await self.vector_store.get_by_id(user_idx, collection_name=self.settings.vector_user_cf_collection)
        if not user_cf_data or not user_cf_data.get("vector"):
            logger.warning(f"User {user_idx} not found in CF collection. Skipping CF update.")
            return

        movie_vec = np.array(movie_cf_data["vector"])
        current_user_vec = np.array(user_cf_data["vector"])
        
        alpha = 0.1 # Slower decay for CF to maintain global preferences
        
        new_vec = (1 - alpha) * current_user_vec + alpha * (score / 10.0) * movie_vec
        
        await self.vector_store.upsert(
            movie_id=user_idx,
            vector=new_vec.tolist(),
            payload={"user_uuid": user_uuid, "updated_from": "cf_realtime"},
            collection_name=self.settings.vector_user_cf_collection
        )
        logger.info(f"Updated CF Profile for user {user_uuid}")
