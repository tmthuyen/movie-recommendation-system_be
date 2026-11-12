from pathlib import Path
from typing import Any

import implicit
import numpy as np
import pandas as pd
import pyarrow.parquet as pq
import torch

# Use implicit library for ALS
from implicit.cpu.als import AlternatingLeastSquares as ALS_CPU
from implicit.gpu.als import AlternatingLeastSquares as ALS_GPU
from implicit.recommender_base import RecommenderBase
from scipy.sparse import csr_matrix, load_npz

from core.custom_exception import CustomException
from utils.logger import setup_logger

logger = setup_logger(name="FastAPI-Recommendations")


class ALS_Implicit:
    name = "ALS-Implicit"

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
    ):
        interactions = train_frame.sort_values("createdAt").drop_duplicates(
            ["user_idx", "item_idx", "action"], keep="last"
        )

        values = interactions["score"].to_numpy(dtype=np.float32)

        self.user_items = csr_matrix(
            (
                values,
                (
                    interactions["user_idx"].to_numpy(dtype=np.int64),
                    interactions["item_idx"].to_numpy(dtype=np.int64),
                ),
            ),
            shape=(num_users, num_items),
            dtype=np.float32,
        )

        self.model = implicit.als.AlternatingLeastSquares(
            factors=factors,
            regularization=regularization,
            alpha=alpha,
            iterations=iterations,
            random_state=random_state,
        )
        self.model.fit(user_items=self.user_items, show_progress=False)
        self.num_items = num_items
        self.iterations = iterations

    def save(self, path: str):
        self.model.save(path)
        logger.info(f"ALS model saved to {path}")

    @staticmethod
    def load(path: str):

        use_gpu = torch.cuda.is_available()

        if use_gpu:
            # Load the model on GPU
            model = ALS_GPU.load(file=path)

        else:
            # Load the model on CPU
            model = ALS_CPU.load(fileobj_or_path=path)

        als_model = ALS_Implicit.__new__(ALS_Implicit)
        als_model.model = model
        als_model.num_items = model.item_factors.shape[0]
        als_model.iterations = model.iterations

        logger.info(f"ALS model loaded from {path} (GPU: {use_gpu})")
        return als_model

    def score_items(self, user_idx, item_ids):
        item_ids = np.asarray(item_ids, dtype=np.int64)
        user_vector = self.model.user_factors[int(user_idx)]
        item_vectors = self.model.item_factors[item_ids]
        return item_vectors @ user_vector

    def recommend(
        self,
        user_idx: int,
        candidate_items: list[int],
        k=10,
        seen_items=None,
    ) -> tuple[np.ndarray, np.ndarray]:
        if seen_items is not None:
            candidates = np.array(
                [i for i in candidate_items if i not in seen_items], dtype=np.int64
            )
        else:
            candidates = np.array(candidate_items, dtype=np.int64)

        scores = self.score_items(user_idx, candidates)
        return self._topk_from_scores(candidates, scores, k)

    def _topk_from_scores(self, item_ids, scores, max_k):
        item_ids = np.asarray(item_ids, dtype=np.int64)
        scores = np.asarray(scores, dtype=np.float32)

        if len(item_ids) == 0:
            return (
                np.array([], dtype=np.int64),
                np.array([], dtype=np.float32),
            )

        max_k = min(int(max_k), len(item_ids))

        # Sort scores descending, item_idx ascending on ties
        order = np.lexsort((item_ids, -scores))
        top_indices = order[:max_k]

        return item_ids[top_indices], scores[top_indices]


def build_seen_map(frame):
    return (
        frame.groupby("user_idx")["item_idx"]
        .apply(lambda values: set(map(int, values)))
        .to_dict()
    )


class ALSModelService:
    def __init__(self, als_model: ALS_Implicit | None = None):
        self.model: ALS_Implicit | None = als_model

    def set_model(self, model: ALS_Implicit):
        """Set the ALS model for collaborative filtering recommendations.

        Args:
            model (ALS_Implicit): The ALS model instance.
        """
        if not isinstance(model, ALS_Implicit):
            raise CustomException(
                "Invalid model type. Expected ALS_Implicit instance.",
                status_code=500,
                error_code="INVALID_ALS_MODEL_TYPE",
            )
        self.model = model

        logger.info("ALS model has been set successfully.")

    def get_model(self) -> ALS_Implicit:
        """Get the current ALS model.

        Returns:
            ALS_Implicit: The current ALS model instance.
        """
        if self.model is None:
            raise CustomException(
                "ALS model is not set. Please set the model before using it.",
                status_code=500,
                error_code="ALS_MODEL_NOT_SET",
            )
        return self.model
