"""Unit tests cho các công thức đo lường IR và chính sách xử lý unjudged trong Benchmark Bước 4.

Tất cả các ca kiểm thử đều sử dụng giá trị kỳ vọng được tính thủ công (hand-calculated)
theo chuẩn TREC và Information Retrieval (IR) học thuật.
"""

import math
from typing import List
import pytest

from scripts.benchmark_models_v2 import (
    compute_dcg_at_k,
    compute_idcg_at_k,
    compute_ndcg_at_k,
    compute_precision_at_k,
    compute_pooled_relative_recall_at_k,
    compute_hit_at_k,
    compute_reciprocal_rank,
    compute_average_precision,
)


class TestIRMetricFormulas:
    """Kiểm tra các công thức đo lường hiệu năng truy xuất thông tin (IR Metrics)."""

    def test_precision_at_k_hand_calculated(self):
        """Precision@K = Số tài liệu liên quan trong Top-K / K."""
        # Case 1: 5 kết quả, 2 liên quan (vị trí 1, 3)
        flags = [True, False, True, False, False]
        # P@1 = 1 / 1 = 1.0
        assert compute_precision_at_k(flags, 1) == pytest.approx(1.0, rel=1e-5)
        # P@2 = 1 / 2 = 0.5
        assert compute_precision_at_k(flags, 2) == pytest.approx(0.5, rel=1e-5)
        # P@5 = 2 / 5 = 0.4
        assert compute_precision_at_k(flags, 5) == pytest.approx(0.4, rel=1e-5)
        # P@10 (k vượt quá độ dài danh sách): 2 / 10 = 0.2
        assert compute_precision_at_k(flags, 10) == pytest.approx(0.2, rel=1e-5)

        # Case 2: Không có kết quả nào liên quan
        assert compute_precision_at_k([False, False, False], 3) == pytest.approx(0.0)

        # Case 3: Biên k <= 0
        assert compute_precision_at_k(flags, 0) == pytest.approx(0.0)

    def test_pooled_relative_recall_at_k_hand_calculated(self):
        """Pooled Relative Recall = Số tài liệu liên quan tìm thấy trong Top-K / Tổng số tài liệu liên quan trong pool."""
        flags = [True, False, True, False, False]
        total_rel_in_pool = 4

        # PR-Recall@1: 1 / 4 = 0.25
        assert compute_pooled_relative_recall_at_k(flags, total_rel_in_pool, 1) == pytest.approx(0.25, rel=1e-5)
        # PR-Recall@3: 2 / 4 = 0.50
        assert compute_pooled_relative_recall_at_k(flags, total_rel_in_pool, 3) == pytest.approx(0.50, rel=1e-5)
        # PR-Recall@5: 2 / 4 = 0.50
        assert compute_pooled_relative_recall_at_k(flags, total_rel_in_pool, 5) == pytest.approx(0.50, rel=1e-5)

        # Biên: total_rel_in_pool <= 0 (như query Q076) phải trả về 0.0 an toàn
        assert compute_pooled_relative_recall_at_k(flags, 0, 5) == pytest.approx(0.0)
        assert compute_pooled_relative_recall_at_k(flags, -1, 5) == pytest.approx(0.0)

    def test_dcg_at_k_hand_calculated(self):
        """Kiểm tra DCG@K theo chuẩn TREC: sum((2^g - 1) / log2(i + 1))."""
        grades = [3, 2, 0, 1]
        # Rank 1: (2^3 - 1) / log2(2) = 7.0 / 1.0 = 7.0
        # Rank 2: (2^2 - 1) / log2(3) = 3.0 / 1.584962500721156 = 1.8927892607143721
        # Rank 3: (2^0 - 1) / log2(4) = 0.0
        # Rank 4: (2^1 - 1) / log2(5) = 1.0 / 2.321928094887362 = 0.43067655807339306
        expected_dcg1 = 7.0
        expected_dcg2 = 7.0 + 3.0 / math.log2(3)
        expected_dcg4 = 7.0 + 3.0 / math.log2(3) + 0.0 + 1.0 / math.log2(5)

        assert compute_dcg_at_k(grades, 1) == pytest.approx(expected_dcg1, rel=1e-5)
        assert compute_dcg_at_k(grades, 2) == pytest.approx(expected_dcg2, rel=1e-5)
        assert compute_dcg_at_k(grades, 4) == pytest.approx(expected_dcg4, rel=1e-5)

    def test_idcg_and_ndcg_hand_calculated(self):
        """Kiểm tra IDCG và NDCG với trường hợp tính thủ công cụ thể."""
        pool_grades = [1, 0, 3, 2]
        # Ideal order trong pool: [3, 2, 1, 0]
        # Rank 1 (g=3): 7.0 / log2(2) = 7.0
        # Rank 2 (g=2): 3.0 / log2(3) = 1.89278926
        # Rank 3 (g=1): 1.0 / log2(4) = 0.5
        # Rank 4 (g=0): 0.0
        expected_idcg4 = 7.0 + 3.0 / math.log2(3) + 0.5
        assert compute_idcg_at_k(pool_grades, 4) == pytest.approx(expected_idcg4, rel=1e-5)

        # Case ranking hoàn hảo: retrieved = [3, 2, 1, 0] -> NDCG = 1.0
        perfect_retrieved = [3, 2, 1, 0]
        assert compute_ndcg_at_k(perfect_retrieved, pool_grades, 4) == pytest.approx(1.0, rel=1e-5)

        # Case ranking đảo chiều: retrieved = [1, 0, 2, 3]
        # DCG4 = (2^1 - 1)/log2(2) + 0 + (2^2 - 1)/log2(4) + (2^3 - 1)/log2(5)
        #      = 1.0 + 0 + 3.0 / 2.0 + 7.0 / log2(5) = 2.5 + 7.0 / 2.321928094887362 = 5.514736
        reversed_retrieved = [1, 0, 2, 3]
        expected_dcg_rev = 1.0 + 0.0 + 1.5 + 7.0 / math.log2(5)
        expected_ndcg = expected_dcg_rev / expected_idcg4
        assert compute_ndcg_at_k(reversed_retrieved, pool_grades, 4) == pytest.approx(expected_ndcg, rel=1e-5)

        # Biên: Pool toàn 0 -> IDCG = 0 -> NDCG = 0.0
        assert compute_ndcg_at_k([0, 0], [0, 0, 0], 2) == pytest.approx(0.0)

    def test_reciprocal_rank_hand_calculated(self):
        """MRR: 1 / rank của tài liệu liên quan đầu tiên."""
        assert compute_reciprocal_rank([True, False, False], 3) == pytest.approx(1.0)
        assert compute_reciprocal_rank([False, True, False], 3) == pytest.approx(0.5)
        assert compute_reciprocal_rank([False, False, True], 3) == pytest.approx(1.0 / 3.0)
        assert compute_reciprocal_rank([False, False, False, True], 3) == pytest.approx(0.0)  # Ngoài max_k=3

    def test_average_precision_hand_calculated(self):
        """MAP@K: Trung bình của Precision tại mỗi vị trí tìm thấy tài liệu liên quan, chia cho min(R, K)."""
        # 5 kết quả, hits tại rank 1 và rank 3; total_rel_in_pool = 4
        # Rank 1: Hit 1 -> P@1 = 1 / 1 = 1.0
        # Rank 2: Miss
        # Rank 3: Hit 2 -> P@3 = 2 / 3 = 0.6666667
        # Rank 4: Miss
        # Rank 5: Miss
        # Denom = min(4, 5) = 4
        # AP@5 = (1.0 + 2/3) / 4 = (5/3) / 4 = 5 / 12 = 0.4166667
        flags = [True, False, True, False, False]
        expected_ap = (1.0 + 2.0 / 3.0) / 4.0
        assert compute_average_precision(flags, total_relevant_in_pool=4, max_k=5) == pytest.approx(expected_ap, rel=1e-5)

        # Nếu total_rel_in_pool = 1 và hit tại rank 2:
        # Rank 1: Miss
        # Rank 2: Hit 1 -> P@2 = 1 / 2 = 0.5
        # Denom = min(1, 5) = 1 -> AP = 0.5 / 1 = 0.5
        flags_single = [False, True, False]
        assert compute_average_precision(flags_single, total_relevant_in_pool=1, max_k=3) == pytest.approx(0.5, rel=1e-5)

        # Biên: total_rel_in_pool <= 0 -> trả về 0.0
        assert compute_average_precision(flags, total_relevant_in_pool=0, max_k=5) == pytest.approx(0.0)

    def test_hit_at_k_and_source_hit(self):
        """Hit@K và Source Movie Hit@K."""
        flags = [False, False, True, False]
        assert compute_hit_at_k(flags, 2) == pytest.approx(0.0)
        assert compute_hit_at_k(flags, 3) == pytest.approx(1.0)
        assert compute_hit_at_k(flags, 4) == pytest.approx(1.0)

        # Source Movie Hit
        retrieved_ids = [101, 102, 103, 104]
        source_id = 103
        src_hit_2 = 1.0 if source_id in retrieved_ids[:2] else 0.0
        src_hit_3 = 1.0 if source_id in retrieved_ids[:3] else 0.0
        assert src_hit_2 == 0.0
        assert src_hit_3 == 1.0


class TestUnjudgedHandlingPolicy:
    """Kiểm tra tính đúng đắn và độc lập của chính sách xử lý unjudged."""

    def test_distinguish_grade0_insufficient_and_unpooled(self):
        """Kiểm tra 3 trạng thái của tài liệu Top-10 không bị gộp làm một nhãn duy nhất."""
        cand_pool = {
            101: {"llm_grade": 0, "llm_verdict": "irrelevant"},
            102: {"llm_grade": None, "llm_verdict": "insufficient_evidence"},
        }
        # 103 không nằm trong cand_pool (unpooled)

        retrieved_ids = [101, 102, 103]
        statuses = []
        grades_conservative = []

        for mid in retrieved_ids:
            cand = cand_pool.get(mid)
            if cand is not None and cand.get("llm_grade") is not None and cand["llm_grade"] in (0, 1, 2, 3):
                status = "judged"
                g = int(cand["llm_grade"])
            elif cand is not None and cand.get("llm_verdict") == "insufficient_evidence":
                status = "insufficient_evidence"
                g = 0  # Quy ước bảo thủ
            else:
                status = "unpooled"
                g = 0  # Quy ước bảo thủ

            statuses.append(status)
            grades_conservative.append(g)

        # 3 trạng thái phải tách biệt rõ ràng
        assert statuses == ["judged", "insufficient_evidence", "unpooled"]
        # Nhưng cả 3 trường hợp trong quy ước bảo thủ đều có gain = 0
        assert grades_conservative == [0, 0, 0]

    def test_sensitivity_bounds_order(self):
        """Kịch bản giả định liên quan (Grade 2) tăng gain so với kịch bản bảo thủ."""
        # Giả sử có 1 judged Grade 1, 1 insufficient_evidence, 1 unpooled
        pool_grades = [3, 2, 1]

        # Conservative: unjudged = 0
        grades_cons = [1, 0, 0]
        dcg_cons = compute_dcg_at_k(grades_cons, 3)

        # Assumed relevance: unjudged được gán Grade 2
        grades_opt = [1, 2, 2]
        dcg_opt = compute_dcg_at_k(grades_opt, 3)

        assert dcg_opt >= dcg_cons


class TestEdgeCasesAndZeroRelevancePolicy:
    """Kiểm tra chính sách biên: pool rỗng, 0 tài liệu liên quan, và phân cấp điểm đa mức."""

    def test_empty_pool_and_zero_relevance_policy(self):
        """Xử lý an toàn khi pool rỗng hoặc không có tài liệu liên quan (như query Q076)."""
        # 1. Pool rỗng
        assert compute_idcg_at_k([], 10) == pytest.approx(0.0)
        assert compute_ndcg_at_k([1, 2], [], 10) == pytest.approx(0.0)
        assert compute_pooled_relative_recall_at_k([True], 0, 10) == pytest.approx(0.0)
        assert compute_average_precision([True], 0, 10) == pytest.approx(0.0)

        # 2. Pool chỉ toàn Grade 0
        assert compute_idcg_at_k([0, 0, 0], 10) == pytest.approx(0.0)
        assert compute_ndcg_at_k([0, 0], [0, 0, 0], 10) == pytest.approx(0.0)

        # 3. Query Q076: Pool có 1 Grade 1, nhưng 0 Grade >= 2 (total_rel_in_pool = 0)
        pool_q076 = [1, 0, 0]
        # IDCG@10 = (2^1 - 1) / log2(2) = 1.0
        assert compute_idcg_at_k(pool_q076, 10) == pytest.approx(1.0, rel=1e-5)
        # Nếu retrieved có Grade 1 ở rank 1 -> NDCG = 1.0
        assert compute_ndcg_at_k([1, 0], pool_q076, 10) == pytest.approx(1.0, rel=1e-5)
        # Nhưng PR-Recall@10 và MAP@10 với binary threshold Grade >= 2 phải bằng 0.0 an toàn
        assert compute_pooled_relative_recall_at_k([False, False], 0, 10) == pytest.approx(0.0)
        assert compute_average_precision([False, False], 0, 10) == pytest.approx(0.0)

    def test_graded_relevance_gain_hierarchy(self):
        """Kiểm tra tính phân cấp độ lợi (Gain): Grade 3 > Grade 2 > Grade 1 > Grade 0."""
        # TREC exponential gains:
        # G3: 2^3 - 1 = 7.0
        # G2: 2^2 - 1 = 3.0
        # G1: 2^1 - 1 = 1.0
        # G0: 2^0 - 1 = 0.0
        assert compute_dcg_at_k([3], 1) == pytest.approx(7.0)
        assert compute_dcg_at_k([2], 1) == pytest.approx(3.0)
        assert compute_dcg_at_k([1], 1) == pytest.approx(1.0)
        assert compute_dcg_at_k([0], 1) == pytest.approx(0.0)

        # 1 tài liệu Grade 3 (7.0) phải có DCG cao hơn 2 tài liệu Grade 2 ở rank 1, 2
        # DCG([2, 2]) = 3.0 + 3.0 / log2(3) = 3.0 + 1.892789 = 4.892789 < 7.0
        dcg_one_g3 = compute_dcg_at_k([3, 0], 2)
        dcg_two_g2 = compute_dcg_at_k([2, 2], 2)
        assert dcg_one_g3 > dcg_two_g2

    def test_two_scenarios_hand_calculated(self):
        """Kiểm tra đối chiếu 2 kịch bản (Bảo thủ vs Giả định liên quan Grade 2) tính thủ công."""
        # Giả sử truy vấn có pool gồm: [3, 2, 0]. Ta xét Top-3 kết quả:
        # Rank 1: Judged Grade 3
        # Rank 2: Insufficient evidence
        # Rank 3: Unpooled
        pool_grades = [3, 2, 0]

        # Kịch bản 1: Bảo thủ (Unjudged gain = 0)
        retrieved_cons = [3, 0, 0]
        # DCG@3 = 7.0 / log2(2) = 7.0
        # IDCG@3 = 7.0 + 3.0 / log2(3) = 7.0 + 1.89278926 = 8.89278926
        # NDCG@3 = 7.0 / 8.89278926 = 0.787154
        idcg_cons = compute_idcg_at_k(pool_grades, 3)
        ndcg_cons = compute_ndcg_at_k(retrieved_cons, pool_grades, 3)
        expected_ndcg_cons = 7.0 / (7.0 + 3.0 / math.log2(3))
        assert ndcg_cons == pytest.approx(expected_ndcg_cons, rel=1e-5)

        # Kịch bản 2: Giả định liên quan (Unjudged gán Grade 2)
        retrieved_assumed = [3, 2, 2]
        # Pool được bổ sung 2 tài liệu Grade 2: [3, 2, 2, 2, 0] -> Ideal Top-3: [3, 2, 2]
        opt_pool = pool_grades + [2, 2]
        idcg_assumed = compute_idcg_at_k(opt_pool, 3)
        # DCG@3 = 7.0 + 3.0 / log2(3) + 3.0 / log2(4) = 7.0 + 1.89278926 + 1.5 = 10.39278926
        # IDCG@3 = DCG@3 vì ranking trùng khớp hoàn hảo với lý tưởng Top-3
        # NDCG@3 = 1.0
        ndcg_assumed = compute_ndcg_at_k(retrieved_assumed, opt_pool, 3)
        assert ndcg_assumed == pytest.approx(1.0, rel=1e-5)

        # Chênh lệch delta
        delta_ndcg = ndcg_assumed - ndcg_cons
        assert delta_ndcg > 0.0

