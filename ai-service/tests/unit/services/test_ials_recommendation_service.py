"""Unit test cho ``services/IALSRecommendationService.py``.

Không train implicit thật: các nhánh thuần (top-k, seen map, model holder)
được test trực tiếp; riêng ``__init__`` dùng fake ``AlternatingLeastSquares``.
"""

from types import SimpleNamespace

import numpy as np
import pandas as pd
import pytest

import src.services.IALSRecommendationService as ials_module
from core.custom_exception import CustomException
from src.services.IALSRecommendationService import (
    ALS_Implicit,
    ALSModelService,
    build_seen_map,
)


class TestBuildSeenMap:
    def test_groups_item_indices_by_user(self):
        frame = pd.DataFrame(
            {
                "user_idx": [0, 0, 1, 2],
                "item_idx": [10, 11, 20, 30],
            }
        )

        result = build_seen_map(frame)

        assert result == {0: {10, 11}, 1: {20}, 2: {30}}

    def test_empty_frame_returns_empty_dict(self):
        assert build_seen_map(pd.DataFrame({"user_idx": [], "item_idx": []})) == {}


class TestTopKFromScores:
    def test_empty_candidates_return_empty_arrays(self):
        item_ids, scores = ALS_Implicit._topk_from_scores(None, [], [], 5)

        assert item_ids.tolist() == []
        assert scores.tolist() == []

    def test_sorts_descending_and_breaks_ties_by_item_id(self):
        item_ids, scores = ALS_Implicit._topk_from_scores(
            None,
            [3, 1, 2],
            [0.5, 0.9, 0.9],
            3,
        )

        assert item_ids.tolist() == [1, 2, 3]
        assert scores.tolist() == pytest.approx([0.9, 0.9, 0.5])

    def test_caps_k_at_number_of_candidates(self):
        item_ids, scores = ALS_Implicit._topk_from_scores(
            None,
            [1, 2],
            [0.5, 0.4],
            10,
        )

        assert item_ids.tolist() == [1, 2]
        assert scores.tolist() == pytest.approx([0.5, 0.4])


class TestRecommend:
    def make_model(self) -> ALS_Implicit:
        model = object.__new__(ALS_Implicit)
        model.model = SimpleNamespace(
            user_factors=np.array([[1.0, 0.0]], dtype=np.float32),
            item_factors=np.array(
                [[1.0, 0.0], [1.0, 0.0], [1.0, 1.0]], dtype=np.float32
            ),
        )
        model.num_items = 3
        model.iterations = 1
        return model

    def test_excludes_seen_items_before_top_k(self):
        model = self.make_model()

        item_ids, scores = model.recommend(
            user_idx=0,
            candidate_items=[0, 1, 2],
            k=2,
            seen_items={0},
        )

        assert item_ids.tolist() == [1, 2]
        assert scores.tolist() == pytest.approx([1.0, 1.0])

    def test_without_seen_items_uses_all_candidates(self):
        model = self.make_model()

        item_ids, scores = model.recommend(
            user_idx=0,
            candidate_items=[0, 1, 2],
            k=2,
        )

        assert item_ids.tolist() == [0, 1]
        assert scores.tolist() == pytest.approx([1.0, 1.0])


class TestALSModelService:
    def test_get_model_without_set_raises(self):
        service = ALSModelService()

        with pytest.raises(CustomException) as exc_info:
            service.get_model()

        assert exc_info.value.error_code == "ALS_MODEL_NOT_SET"

    def test_set_model_rejects_invalid_type(self):
        service = ALSModelService()

        with pytest.raises(CustomException) as exc_info:
            service.set_model(SimpleNamespace())

        assert exc_info.value.error_code == "INVALID_ALS_MODEL_TYPE"

    def test_set_and_get_model_round_trip(self):
        service = ALSModelService()
        model = object.__new__(ALS_Implicit)

        service.set_model(model)

        assert service.get_model() is model


class TestInit:
    def test_builds_csr_matrix_and_fits_implicit_model(self, monkeypatch):
        class FakeImplicitALS:
            def __init__(self, **kwargs):
                self.kwargs = kwargs
                self.fit_args = None

            def fit(self, user_items, show_progress=False):
                self.fit_args = (user_items, show_progress)

        monkeypatch.setattr(
            ials_module.implicit.als,
            "AlternatingLeastSquares",
            FakeImplicitALS,
        )
        frame = pd.DataFrame(
            {
                "user_idx": [0, 0, 1],
                "item_idx": [0, 1, 1],
                "action": ["click", "like", "rating"],
                "score": [1.0, 5.0, 3.0],
                "createdAt": pd.to_datetime(
                    [
                        "2024-01-01",
                        "2024-01-02",
                        "2024-01-03",
                    ]
                ),
            }
        )

        model = ALS_Implicit(
            train_frame=frame,
            num_users=2,
            num_items=2,
            factors=8,
            alpha=10,
            regularization=0.2,
            iterations=3,
            random_state=7,
        )

        assert model.user_items.shape == (2, 2)
        assert model.user_items.toarray().tolist() == [[1.0, 5.0], [0.0, 3.0]]
        assert model.num_items == 2
        assert model.iterations == 3
        assert model.model.kwargs == {
            "factors": 8,
            "regularization": 0.2,
            "alpha": 10,
            "iterations": 3,
            "random_state": 7,
        }
        assert model.model.fit_args[1] is False
