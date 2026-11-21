"""Chuẩn hoá keyword tìm kiếm trước khi embedding."""

from __future__ import annotations

import re
import unicodedata
from functools import lru_cache
from pathlib import Path

from utils.teencode_dict import COMMON_ABBREVIATIONS, TEENCODE_MAP

_PUNCTUATION_PATTERN = re.compile(r"[^a-z0-9\s]+")
_WHITESPACE_PATTERN = re.compile(r"\s+")


def _strip_accents(text: str) -> str:
    """Loại bỏ dấu tiếng Việt và chuẩn hoá về chữ thường."""
    decomposed = unicodedata.normalize("NFD", text.lower())
    return "".join(char for char in decomposed if unicodedata.category(char) != "Mn")


@lru_cache(maxsize=1)
def _stopwords() -> frozenset[str]:
    """Tập stopword đã chuẩn hoá, đọc từ các file stopword của dự án."""
    words: set[str] = set()
    directory = Path(__file__).resolve().parent
    for name in ("vietnamese-stopwords.txt", "english-stopwords.txt"):
        path = directory / name
        if not path.exists():
            continue
        for line in path.read_text(encoding="utf-8").splitlines():
            word = line.strip()
            if word:
                words.add(word)

    normalized: set[str] = set()
    for word in words:
        cleaned = _PUNCTUATION_PATTERN.sub(" ", _strip_accents(word))
        normalized.update(part for part in cleaned.split() if part)
    return frozenset(normalized)


def normalize_search_keyword(keyword: str | None) -> str:
    """Chuẩn hoá keyword về dạng không dấu, không teencode và không stopword.

    Hàm là idempotent: chuẩn hoá một keyword đã chuẩn hoá cho kết quả như cũ.
    """
    if not keyword:
        return ""

    text = unicodedata.normalize("NFC", str(keyword)).lower()
    mapped = []
    for token in text.split():
        token = TEENCODE_MAP.get(token, token)
        token = COMMON_ABBREVIATIONS.get(token, token)
        mapped.append(token)

    accentless = _strip_accents(" ".join(mapped))
    cleaned = _PUNCTUATION_PATTERN.sub(" ", accentless)
    tokens = [token for token in cleaned.split() if token not in _stopwords()]
    return _WHITESPACE_PATTERN.sub(" ", " ".join(tokens)).strip()
