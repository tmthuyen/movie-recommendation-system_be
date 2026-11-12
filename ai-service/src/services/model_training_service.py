import glob
import json
import os
from pathlib import Path
from typing import Any, Tuple

import pandas as pd

# Use implicit library for ALS
from implicit.als import AlternatingLeastSquares

from core.config import get_settings
from infra.messaging.event_schemas import InteractionAction
from infra.redis.redis_service import RedisStore
from infra.storage.storage_service import storage_service
from services.IALSRecommendationService import ALS_Implicit
from utils.logger import setup_logger

logger = setup_logger(name="FastAPI-Recommendations")


class ModelTrainingService:
    def __init__(self, redis_store: RedisStore):
        self.settings = get_settings()
        self.redis_store = redis_store

        # Paths
        self.data_dir = Path("data/training")
        self.interaction_dir = self.data_dir / "interactions"
        self.models_dir = self.data_dir / "models"

        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.interaction_dir.mkdir(exist_ok=True)
        self.models_dir.mkdir(exist_ok=True)

    async def run_training_pipeline(self):
        """Run the full end-to-end retraining pipeline using implicit ALS."""
        logger.info("Starting ALS Retraining Pipeline (Phase 4)...")
        try:
            # 1. Download Data from R2
            await self._download_training_data()

            # 2. Preprocess Data & Create Sparse Matrix
            user_mapping, movie_mapping, full_df = self._preprocess_data()

            # 3. Train ALS Model

            model = self._train_model(
                train_df=full_df,
                num_users=len(user_mapping),
                num_items=len(movie_mapping),
            )

            # 5. Upload Model & Mapping to R2
            self._upload_artifacts(model, user_mapping, movie_mapping)

            # 7. Cleanup
            # self._cleanup_local_data()

            # Thông báo đã có model mới cho các instance khác và instance này biết để cập nhật model mới
            await self.redis_store.publish(
                "model.updated",
                {
                    "modelKey": "models/als_model.npz",
                    "mappingKey": "models/mappings.json",
                },
            )
            logger.info(
                "Đã thông báo cho các instance khác về model mới. Các instance sẽ cập nhật model mới."
            )

            logger.info("Retraining Pipeline completed successfully.")
        except Exception as e:
            logger.error(f"Training pipeline failed: {e}")
            raise e

    async def _download_training_data(self):
        logger.info("Downloading interaction data from R2...")
        # Tải danh sách file từ R2
        files = storage_service.list_files("interactions/")

        # jsonl
        self.storage_interaction_files = [f for f in files if f.endswith(".jsonl")]

        if not self.storage_interaction_files:
            logger.warning("No files found in R2 under interactions/ prefix.")

        for s3_key in self.storage_interaction_files:
            local_path = self.interaction_dir / os.path.basename(s3_key)
            storage_service.download_file(s3_key, str(local_path))
            logger.info(f"Downloaded {s3_key} to {local_path}")

    def _get_action_score(self, action: str, rating: float | None = None) -> float:
        """Tính score dựa trên action và rating (nếu có)."""
        if action == InteractionAction.RATING and rating is not None:
            return float(rating)

        scores = {
            InteractionAction.CLICK: 1.0,
            InteractionAction.LIKE: 5.0,
            InteractionAction.COMMENT: 2.0,
            InteractionAction.RATING: 0.0,
        }
        return scores.get(action.lower(), 1.0)

    def _preprocess_data(self) -> Tuple[Any, dict, dict, pd.DataFrame]:
        logger.info("Preprocessing data and creating mappings...")

        interaction_files = glob.glob(str(self.interaction_dir / "*.jsonl"))

        if not interaction_files:
            logger.warning("No local jsonl files to process. Skipping training.")
            return None, {}, {}

        # Đọc tất cả các file jsonl
        df_list = []
        for file in interaction_files:
            try:
                df = pd.read_json(file, lines=True)
                df_list.append(df)
            except Exception as e:
                logger.error(f"Failed to read jsonl file {file}: {e}")

        if not df_list:
            return None, {}, {}

        full_df = pd.DataFrame()
        full_df = pd.concat([full_df] + df_list, ignore_index=True)

        # sắp xếp
        # Lọc dữ liệu: loại trùng chỉ lấy mới nhất, loại bỏ các cột có action null
        # 15h, 16h thì lấy tương tác lúc 16h (mới nhất)
        full_df = full_df.dropna(subset=["action"])
        full_df["createdAt"] = pd.to_datetime(full_df["createdAt"])
        full_df = full_df.sort_values("createdAt", ascending=True).drop_duplicates(
            subset=["userId", "movieId", "action"], keep="last"
        )

        # EDA
        logger.info("Performing EDA...")
        statistics = {
            "total_interactions": len(full_df),
            "unique_users": full_df["userId"].nunique(),
            "unique_movies": full_df["movieId"].nunique(),
            "average_score": full_df["score"].mean(),
            "min_score": full_df["score"].min(),
            "max_score": full_df["score"].max(),
        }
        logger.info(f"DataFrame statistics:\n{statistics}")

        logger.info("EDA complete.")

        # Cần cột userId và movieId. Nếu thiếu, bỏ qua
        if "userId" not in full_df.columns or "movieId" not in full_df.columns:
            logger.error("Data missing 'userId' or 'movieId' columns.")
            return None, {}, {}

        # Mapping UUIDs và Movie IDs sang int index (0 to N-1)
        unique_users = full_df["userId"].unique()
        unique_movies = full_df["movieId"].unique()

        user_mapping = {str(u): i for i, u in enumerate(unique_users)}
        movie_mapping = {str(m): i for i, m in enumerate(unique_movies)}

        # Chuyển đổi DataFrame sang Indices
        full_df["user_idx"] = full_df["userId"].astype(str).map(user_mapping)
        full_df["item_idx"] = full_df["movieId"].astype(str).map(movie_mapping)

        # Tính score cho từng tương tác
        full_df["score"] = full_df.apply(
            lambda row: self._get_action_score(
                action=row["action"], rating=row.get("score")
            ),
            axis=1,
        )

        # Lưu full_df lại để dùng cho bước merge master data
        return user_mapping, movie_mapping, full_df

    def _train_model(
        self,
        train_df: pd.DataFrame,
        num_users: int,
        num_items: int,
    ) -> ALS_Implicit:
        logger.info("Training Implicit ALS Model...")
        settings = get_settings()

        model = ALS_Implicit(
            train_frame=train_df,
            num_users=num_users,
            num_items=num_items,
            factors=settings.cf_num_factors,
            alpha=settings.cf_alpha,
            regularization=settings.cf_regularization,
            iterations=settings.cf_iterations,
            random_state=settings.cf_random_state,
        )

        logger.info("ALS Model training complete.")
        return model

    def _upload_artifacts(
        self, model: ALS_Implicit, user_mapping: dict, movie_mapping: dict
    ):
        logger.info("Saving and Uploading new Model and Mapping to R2...")

        model_path = self.models_dir / "als_model.npz"
        model.save(path=str(model_path))

        mapping_path = self.models_dir / "mappings.json"
        with open(mapping_path, "w") as f:
            json.dump({"users": user_mapping, "movies": movie_mapping}, f)

        storage_service.upload_file(str(model_path), "models/als_model.npz")
        storage_service.upload_file(str(mapping_path), "models/mappings.json")
        logger.info("Artifacts uploaded to R2 successfully.")

    def _cleanup_local_data(self):
        logger.info("Cleaning up local training data...")

        files_to_delete = []
        files_to_delete.extend(glob.glob(str(self.interaction_dir / "*.parquet")))
        files_to_delete.extend(glob.glob(str(self.models_dir / "*")))

        for f in files_to_delete:
            try:
                os.remove(f)
            except Exception as e:
                logger.warning(f"Could not remove file {f}: {e}")

        logger.info("Local cleanup complete.")
