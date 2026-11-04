"""Unit test cho ``src/core/fusion.py`` — Reciprocal Rank Fusion (RRF)."""

import math

import pytest

from src.core.fusion import (
    reciprocal_rank_fusion,
    reciprocal_rank_fusion_with_details,
)


class TestReciprocalRankFusionValidation:
    """Validate tham số đầu vào."""

    @pytest.mark.parametrize("k", [0, -1, -60])
    def test_non_positive_k_raises(self, k):
        with pytest.raises(ValueError, match="k > 0"):
            reciprocal_rank_fusion({"BM25": [1]}, k=k)

    def test_non_positive_k_raises_for_details(self):
        with pytest.raises(ValueError, match="k > 0"):
            reciprocal_rank_fusion_with_details({"BM25": [1]}, k=0)

    def test_empty_ranked_lists_return_empty(self):
        assert reciprocal_rank_fusion({}) == []
        assert reciprocal_rank_fusion_with_details({}) == []

    def test_lists_without_documents_are_ignored(self):
        assert reciprocal_rank_fusion({"A": [], "B": []}) == []


class TestReciprocalRankFusionScoring:
    """Điểm RRF và thứ tự kết quả."""

    def test_single_model_returns_positions_by_rank(self):
        result = reciprocal_rank_fusion({"BM25": [10, 20]}, k=60)

        assert [doc_id for doc_id, _ in result] == [10, 20]
        assert result[0][1] == pytest.approx(1 / 61)
        assert result[1][1] == pytest.approx(1 / 62)

    def test_document_appearing_in_both_lists_wins(self):
        result = reciprocal_rank_fusion(
            {"BM25": [1, 2], "E5": [2, 1]}, k=60
        )

        # 1: 1/61 + 1/62, 2: 1/62 + 1/61 -> hoà điểm -> tie-break theo id
        assert [doc_id for doc_id, _ in result] == [1, 2]

    def test_duplicate_ids_within_one_list_count_once(self):
        result = reciprocal_rank_fusion({"BM25": [1, 1, 2]}, k=60)

        assert [doc_id for doc_id, _ in result] == [1, 2]
        # id 2 là tài liệu thứ hai (rank 2), không phải rank 3
        assert result[1][1] == pytest.approx(1 / 62)

    def test_weights_scale_contributions(self):
        result = reciprocal_rank_fusion(
            {"BM25": [1], "E5": [2]}, weights={"BM25": 3.0, "E5": 1.0}, k=60
        )

        scores = dict(result)
        assert scores[1] == pytest.approx(3 / 61)
        assert scores[2] == pytest.approx(1 / 61)
        assert [doc_id for doc_id, _ in result] == [1, 2]

    def test_missing_weight_defaults_to_one(self):
        result = reciprocal_rank_fusion(
            {"BM25": [1], "E5": [2]}, weights={"BM25": 0.5}, k=60
        )

        scores = dict(result)
        assert scores[1] == pytest.approx(0.5 / 61)
        assert scores[2] == pytest.approx(1 / 61)

    def test_top_n_limits_results(self):
        result = reciprocal_rank_fusion({"BM25": [1, 2, 3, 4]}, top_n=2)

        assert [doc_id for doc_id, _ in result] == [1, 2]

    def test_top_n_zero_or_none_returns_all(self):
        docs = [1, 2, 3]

        assert len(reciprocal_rank_fusion({"A": docs}, top_n=None)) == 3
        assert len(reciprocal_rank_fusion({"A": docs}, top_n=0)) == 3


class TestReciprocalRankFusionTieBreaking:
    """Quy tắc tie-break: điểm -> best_rank -> id."""

    def test_tie_broken_by_best_individual_rank(self):
        # k=1: id3 = 1/(1+2) = 1/3 (best rank 2); id5 = (2/3)/(1+1) = 1/3 (best rank 1)
        # Hoà điểm nhưng id5 có thứ hạng đơn lẻ tốt hơn -> đứng trước dù id lớn hơn.
        result = reciprocal_rank_fusion(
            {"A": [7, 3], "B": [5]}, k=1, weights={"B": 2 / 3}
        )

        assert [doc_id for doc_id, _ in result] == [7, 5, 3]

    def test_tie_broken_by_smaller_id(self):
        result = reciprocal_rank_fusion({"A": [5, 4]})

        assert [doc_id for doc_id, _ in result] == [5, 4]
        # cùng không thể xảy ra với một list; dùng 2 list đối xứng:
        symmetric = reciprocal_rank_fusion({"A": [7, 8], "B": [8, 7]})
        assert [doc_id for doc_id, _ in symmetric] == [7, 8]

    def test_result_scores_are_finite(self):
        result = reciprocal_rank_fusion({"A": [1, 2, 3]})

        assert all(math.isfinite(score) for _, score in result)


class TestReciprocalRankFusionWithDetails:
    """Bản có provenance cho kiểm toán thực nghiệm."""

    def test_details_include_provenance_fields(self):
        result = reciprocal_rank_fusion_with_details(
            {"BM25": [1, 2], "E5": [2]}, k=60
        )

        assert result[0]["fused_rank"] == 1
        assert set(result[0]) == {
            "fused_rank",
            "movie_id",
            "rrf_score",
            "model_ranks",
            "raw_scores",
            "contributing_models",
            "agreement_count",
            "best_individual_rank",
        }

    def test_agreement_count_counts_models(self):
        result = reciprocal_rank_fusion_with_details(
            {"BM25": [1], "E5": [1], "TFIDF": [2]}
        )

        by_id = {row["movie_id"]: row for row in result}
        assert by_id[1]["agreement_count"] == 2
        assert by_id[2]["agreement_count"] == 1
        assert set(by_id[1]["model_ranks"]) == {"BM25", "E5"}

    def test_raw_scores_are_attached_by_position(self):
        result = reciprocal_rank_fusion_with_details(
            {"BM25": [1, 2]}, raw_scores_lists={"BM25": [0.9, 0.4]}
        )

        by_id = {row["movie_id"]: row for row in result}
        assert by_id[1]["raw_scores"]["BM25"] == pytest.approx(0.9)
        assert by_id[2]["raw_scores"]["BM25"] == pytest.approx(0.4)

    def test_missing_raw_scores_yield_empty_mapping(self):
        result = reciprocal_rank_fusion_with_details({"BM25": [1]})

        assert result[0]["raw_scores"] == {}

    def test_top_n_limits_details_and_reassigns_fused_rank(self):
        result = reciprocal_rank_fusion_with_details(
            {"BM25": [1, 2, 3]}, top_n=2
        )

        assert [row["movie_id"] for row in result] == [1, 2]
        assert [row["fused_rank"] for row in result] == [1, 2]

    def test_details_match_plain_rrf_order(self):
        lists = {"BM25": [3, 1, 2], "E5": [1, 3]}

        plain = [doc_id for doc_id, _ in reciprocal_rank_fusion(lists)]
        detailed = [row["movie_id"] for row in reciprocal_rank_fusion_with_details(lists)]

        assert plain == detailed
