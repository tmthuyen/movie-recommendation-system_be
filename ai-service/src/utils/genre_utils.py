"""Genre parsing and optional reranking for item-to-item recommendations.

No vector database mutation. All modes rerank the same ANN candidates.
"""

from __future__ import annotations

import ast
import json
import logging
import math
import re
from typing import Any

logger = logging.getLogger(__name__)

KNOWN_GENRES_VI: tuple[str, ...] = (
    "phim khoa học viễn tưởng",
    "chương trình truyền hình",
    "phim chiến tranh",
    "phim phiêu lưu",
    "phim gia đình",
    "phim giả tượng",
    "phim hoạt hình",
    "phim chính kịch",
    "phim hành động",
    "phim lãng mạn",
    "phim lịch sử",
    "phim miền tây",
    "phim kinh dị",
    "phim hình sự",
    "phim tài liệu",
    "phim gây cấn",
    "phim bí ẩn",
    "phim nhạc",
    "phim hài",
)

GENRE_EN_TO_VI: dict[str, str] = {
    "action": "phim hành động",
    "adventure": "phim phiêu lưu",
    "animation": "phim hoạt hình",
    "comedy": "phim hài",
    "crime": "phim hình sự",
    "documentary": "phim tài liệu",
    "drama": "phim chính kịch",
    "family": "phim gia đình",
    "fantasy": "phim giả tượng",
    "history": "phim lịch sử",
    "horror": "phim kinh dị",
    "music": "phim nhạc",
    "musical": "phim nhạc",
    "mystery": "phim bí ẩn",
    "romance": "phim lãng mạn",
    "science fiction": "phim khoa học viễn tưởng",
    "sci-fi": "phim khoa học viễn tưởng",
    "tv movie": "chương trình truyền hình",
    "thriller": "phim gây cấn",
    "war": "phim chiến tranh",
    "western": "phim miền tây",
}

# Word boundaries prevent e.g. "war" matching "award", "action" matching "interaction".
_VI_PATTERNS = [
    (re.compile(r"(?<!\w)" + re.escape(g) + r"(?!\w)", re.I), g)
    for g in KNOWN_GENRES_VI
]
_EN_PATTERNS = [
    (re.compile(r"(?<!\w)" + re.escape(g) + r"(?!\w)", re.I), vi)
    for g, vi in GENRE_EN_TO_VI.items()
]


def extract_genres(raw: Any) -> set[str]:
    """Normalize recognized Vietnamese/English genres from string/JSON/list/dict."""
    if raw is None:
        return set()
    if isinstance(raw, (list, tuple, set)):
        result: set[str] = set()
        for item in raw:
            result.update(extract_genres(item))
        return result
    if isinstance(raw, dict):
        name = raw.get("name") or raw.get("genre_name")
        return extract_genres(name) if name else set()

    text = str(raw).strip()
    if not text or text.casefold() in {"nan", "none", "null", "[]", "{}"}:
        return set()
    if (text.startswith("[") and text.endswith("]")) or (
        text.startswith("{") and text.endswith("}")
    ):
        try:
            parsed = json.loads(text)
        except (ValueError, TypeError):
            try:
                parsed = ast.literal_eval(text)
            except (SyntaxError, ValueError):
                parsed = None
        if parsed is not None and not isinstance(parsed, str):
            return extract_genres(parsed)

    result: set[str] = set()
    for pattern, genre in _VI_PATTERNS:
        if pattern.search(text):
            result.add(genre)
    for pattern, genre in _EN_PATTERNS:
        if pattern.search(text):
            result.add(genre)

    # Preserve comma-separated unknown genres (e.g., an external category), but
    # never guess a genre from a substring of an unrelated word.
    if not result and "," in text:
        return {p.strip().casefold() for p in text.split(",") if p.strip()}
    return result


def compute_genre_similarity(
    target_genres: set[str], candidate_genres: set[str]
) -> float:
    """0.5 * Jaccard + 0.5 * target genre recall, in [0, 1]."""
    if not target_genres or not candidate_genres:
        return 0.0
    common = target_genres & candidate_genres
    if not common:
        return 0.0
    jaccard = len(common) / len(target_genres | candidate_genres)
    target_recall = len(common) / len(target_genres)
    return 0.5 * jaccard + 0.5 * target_recall


def _sort_key(item: dict[str, Any]) -> tuple[float, int, str]:
    score = float(item.get("score", 0.0))
    if not math.isfinite(score):
        raise ValueError("Candidate score must be finite")
    raw_id = item.get("id")
    try:
        return (-score, 0, f"{int(raw_id):020d}")
    except (TypeError, ValueError, OverflowError):
        return (-score, 1, str(raw_id))


def rerank_similar_candidates(
    candidates: list[dict[str, Any]],
    target_genres: set[str],
    mode: str = "off",
    genre_weight: float = 0.3,
    top_k: int = 10,
) -> list[dict[str, Any]]:
    """Rerank candidates without mutating them.

    off: original cosine ranking.
    strict: only shared-genre candidates (may return fewer than top_k).
            Empty target genres -> off fallback.
    soft: (1-w)*cosine + w*genre_similarity. Missing candidate genres -> cosine.
    The caller should expose raw cosine separately from the reranking score.
    """
    if not isinstance(top_k, int) or isinstance(top_k, bool) or top_k < 1:
        raise ValueError("top_k must be a positive integer")
    mode = (mode or "off").strip().lower()
    if mode not in {"off", "soft", "strict"}:
        raise ValueError(f"Invalid rerank mode: {mode}")
    if not math.isfinite(float(genre_weight)) or not 0.0 <= float(genre_weight) <= 1.0:
        raise ValueError("genre_weight must be finite and in [0,1]")
    if not candidates:
        return []

    ranked = sorted(candidates, key=_sort_key)
    if mode == "off" or not target_genres:
        return ranked[:top_k]

    if mode == "strict":
        # IMPORTANT: strict must never backfill with nonmatching movies.
        return [
            c
            for c in ranked
            if extract_genres(c.get("genres") or (c.get("payload") or {}).get("genres"))
            & target_genres
        ][:top_k]

    if genre_weight == 0.0:
        return ranked[:top_k]
    scored: list[dict[str, Any]] = []
    for cand in ranked:
        raw_cosine = float(cand.get("score", 0.0))
        genres = extract_genres(
            cand.get("genres") or (cand.get("payload") or {}).get("genres")
        )
        genre_score = compute_genre_similarity(target_genres, genres)
        # Missing candidate metadata: neutral fallback to the raw cosine score.
        final_score = (
            (1.0 - genre_weight) * raw_cosine + genre_weight * genre_score
            if genres
            else raw_cosine
        )
        item = dict(cand)
        item["raw_cosine_score"] = raw_cosine
        item["genre_similarity"] = genre_score if genres else None
        item["score"] = final_score  # no rounding until presentation
        scored.append(item)
    scored.sort(key=_sort_key)
    return scored[:top_k]
