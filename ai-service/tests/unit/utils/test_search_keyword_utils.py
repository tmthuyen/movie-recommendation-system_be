from src.utils.search_keyword_utils import normalize_search_keyword


def test_normalize_empty_and_none():
    assert normalize_search_keyword(None) == ""
    assert normalize_search_keyword("") == ""
    assert normalize_search_keyword("   ") == ""


def test_normalize_valid_keyword():
    res = normalize_search_keyword("batman hanh dong 2024")
    assert "batman" in res
    assert "hanh dong" in res


def test_normalize_punctuation_and_idempotent():
    text = "Batman: The Dark Knight! 2008"
    first = normalize_search_keyword(text)
    second = normalize_search_keyword(first)
    assert first == second
    assert "batman" in first
