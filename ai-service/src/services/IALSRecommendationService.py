from pathlib import Path
from typing import Any

from implicit.als import AlternatingLeastSquares
from scipy.sparse import load_npz


class IALSRecommendationService:

    def __init__(
        self,
        model: AlternatingLeastSquares,
        user_items,
        user_to_idx: dict[str, int],
        idx_to_movie_id: dict[int, str],
    ):
        self.model = model
        self.user_items = user_items.tocsr()
        self.user_to_idx = user_to_idx
        self.idx_to_movie_id = idx_to_movie_id

    @classmethod
    def load(
        cls,
        model_path: str,
        matrix_path: str,
        user_to_idx: dict[str, int],
        idx_to_movie_id: dict[int, str],
    ):
        model = AlternatingLeastSquares.load(model_path)
        user_items = load_npz(matrix_path).tocsr()

        return cls(
            model=model,
            user_items=user_items,
            user_to_idx=user_to_idx,
            idx_to_movie_id=idx_to_movie_id,
        )

    def recommend(
        self,
        user_id: str,
        top_k: int = 20,
        current_user_items=None,
    ) -> list[dict[str, Any]]:

        user_idx = self.user_to_idx.get(str(user_id))

        if user_idx is None:
            return []

        # Lấy lịch sử tương tác của user
        user_row = (
            current_user_items
            if current_user_items is not None
            else self.user_items[user_idx]
        )

        # Gọi trực tiếp iALS Model
        item_indices, scores = self.model.recommend(
            userid=user_idx,
            user_items=user_row,
            N=top_k,
            filter_already_liked_items=True,
            recalculate_user=current_user_items is not None,
        )

        results = []

        for item_idx, score in zip(item_indices, scores):

            movie_id = self.idx_to_movie_id.get(int(item_idx))

            if movie_id is None:
                continue

            results.append(
                {
                    "id": str(movie_id),
                    "score": float(score),
                    "item_idx": int(item_idx),
                }
            )

        return results
