# -*- coding: utf-8 -*-
"""fusion.py.

Thuật toán kết hợp đa danh sách xếp hạng (Rank Fusion) cho hệ thống Hybrid Retrieval:
Triển khai chuẩn Reciprocal Rank Fusion (RRF) theo Cormack et al. (SIGIR 2009):
    RRF_score(d) = \\sum_{m \\in M} \\frac{w_m}{k + r_m(d)}
trong đó:
    - M: tập hợp các mô hình truy xuất (ví dụ: BM25, Multilingual E5-base).
    - r_m(d): thứ hạng 1-based (1, 2, ...) của tài liệu d trong mô hình m.
    - k: hằng số làm mượt xếp hạng (mặc định k = 60 theo khuyến nghị học thuật).
    - w_m: trọng số của mô hình m (mặc định w_m = 1.0).
"""

from __future__ import annotations

from collections import defaultdict
from typing import Any, Dict, List, Optional, Set, Tuple


def reciprocal_rank_fusion(
    ranked_lists: Dict[str, List[int]],
    k: int = 60,
    weights: Optional[Dict[str, float]] = None,
    top_n: Optional[int] = None,
) -> List[Tuple[int, float]]:
    """Thực thi Reciprocal Rank Fusion (RRF) trên nhiều danh sách xếp hạng ID.

    Tham số:
        ranked_lists: Dict ánh xạ tên mô hình -> danh sách ID (movie_id) đã sắp xếp theo điểm giảm dần.
                      Ví dụ: {"BM25": [101, 202, 303], "E5_Base": [202, 101, 404]}
        k: Hệ số làm mượt RRF (k > 0, mặc định k=60).
        weights: Trọng số tùy chọn cho từng mô hình. Mặc định 1.0 cho tất cả mô hình.
        top_n: Số lượng kết quả tối đa cần lấy ra (None = lấy toàn bộ).

    Trả về:
        Danh sách các tuple (item_id, rrf_score) được sắp xếp giảm dần theo rrf_score.
        Quy tắc tie-breaking xác định 100%:
            1. -rrf_score (điểm RRF cao hơn đứng trước)
            2. min_rank (tài liệu có thứ hạng đơn lẻ tốt nhất ở bất kỳ hệ thống nào đứng trước)
            3. item_id (ID nhỏ hơn đứng trước để đảm bảo tính tất định tuyệt đối)
    """
    if k <= 0:
        raise ValueError(f"Hệ số làm mượt k phải là số nguyên dương (k > 0), nhận k = {k}")

    if not ranked_lists:
        return []

    scores: Dict[int, float] = defaultdict(float)
    best_rank: Dict[int, int] = {}
    model_count: Dict[int, int] = defaultdict(int)

    for model_name, doc_ids in ranked_lists.items():
        if not doc_ids:
            continue
        w = float(weights.get(model_name, 1.0)) if weights else 1.0

        seen_in_model: Set[int] = set()
        current_rank = 1
        for doc_id in doc_ids:
            # Bỏ qua tài liệu trùng lặp trong cùng một danh sách xếp hạng
            if doc_id in seen_in_model:
                continue
            seen_in_model.add(doc_id)

            rrf_term = w / float(k + current_rank)
            scores[doc_id] += rrf_term
            model_count[doc_id] += 1

            if doc_id not in best_rank or current_rank < best_rank[doc_id]:
                best_rank[doc_id] = current_rank

            current_rank += 1

    # Sắp xếp xác định:
    # 1. -score (cao xuống thấp)
    # 2. best_rank (rank thấp hơn = tốt hơn)
    # 3. doc_id (nhỏ đến lớn)
    sorted_items = sorted(
        scores.items(),
        key=lambda item: (-item[1], best_rank[item[0]], item[0]),
    )

    if top_n is not None and top_n > 0:
        sorted_items = sorted_items[:top_n]

    return sorted_items


def reciprocal_rank_fusion_with_details(
    ranked_lists: Dict[str, List[int]],
    raw_scores_lists: Optional[Dict[str, List[float]]] = None,
    k: int = 60,
    weights: Optional[Dict[str, float]] = None,
    top_n: Optional[int] = None,
) -> List[Dict[str, Any]]:
    """RRF kèm thông tin chi tiết provenance (thứ hạng từng mô hình, số mô hình đồng thuận).

    Dùng cho việc kiểm toán thực nghiệm, truy vết ứng viên và phân tích định tính.
    """
    if k <= 0:
        raise ValueError(f"Hệ số làm mượt k phải là số nguyên dương (k > 0), nhận k = {k}")

    if not ranked_lists:
        return []

    doc_ranks: Dict[int, Dict[str, int]] = defaultdict(dict)
    doc_raw_scores: Dict[int, Dict[str, float]] = defaultdict(dict)
    scores: Dict[int, float] = defaultdict(float)
    best_rank: Dict[int, int] = {}

    for model_name, doc_ids in ranked_lists.items():
        if not doc_ids:
            continue
        w = float(weights.get(model_name, 1.0)) if weights else 1.0
        raw_scores = raw_scores_lists.get(model_name, []) if raw_scores_lists else []

        seen_in_model: Set[int] = set()
        current_rank = 1
        for idx, doc_id in enumerate(doc_ids):
            if doc_id in seen_in_model:
                continue
            seen_in_model.add(doc_id)

            rrf_term = w / float(k + current_rank)
            scores[doc_id] += rrf_term
            doc_ranks[doc_id][model_name] = current_rank

            if idx < len(raw_scores):
                doc_raw_scores[doc_id][model_name] = float(raw_scores[idx])

            if doc_id not in best_rank or current_rank < best_rank[doc_id]:
                best_rank[doc_id] = current_rank

            current_rank += 1

    sorted_docs = sorted(
        scores.keys(),
        key=lambda did: (-scores[did], best_rank[did], did),
    )

    if top_n is not None and top_n > 0:
        sorted_docs = sorted_docs[:top_n]

    results: List[Dict[str, Any]] = []
    for rank, did in enumerate(sorted_docs, start=1):
        results.append({
            "fused_rank": rank,
            "movie_id": did,
            "rrf_score": round(scores[did], 6),
            "model_ranks": doc_ranks[did],
            "raw_scores": doc_raw_scores[did],
            "contributing_models": list(doc_ranks[did].keys()),
            "agreement_count": len(doc_ranks[did]),
            "best_individual_rank": best_rank[did],
        })

    return results

