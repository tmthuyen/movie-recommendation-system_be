"""Select human-readable movie evidence from Chroma metadata/document.

The existing Chroma index stores concatenated corpus text in `documents`, while
its scalar metadata does not necessarily have overview_vi/overview/search_text.
Do not mistake an absent overview for absent reviewable content.
"""
from __future__ import annotations

from typing import Any, Mapping


def _useful_text(value: Any) -> str:
    if value is None:
        return ""
    text = str(value).strip()
    return "" if text.casefold() in {"", "none", "null", "nan"} else text


def select_review_text(metadata: Mapping[str, Any] | None, document: Any = None) -> tuple[str, str]:
    """Return (text, provenance) for manual relevance judgement.

    Prefer actual synopsis fields; Chroma's `documents` is corpus search_text
    (title + overview + genres), and must be labeled as such for reviewers.
    """
    meta = metadata or {}
    for key in ("overview_vi", "overview"):
        text = _useful_text(meta.get(key))
        if text:
            return text, f"metadata.{key}"
    text = _useful_text(document)
    if text:
        return text, "chroma.document_search_text"
    text = _useful_text(meta.get("search_text"))
    if text:
        return text, "metadata.search_text"
    return "", "missing"
