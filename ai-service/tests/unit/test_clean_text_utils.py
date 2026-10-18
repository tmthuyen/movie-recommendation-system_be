"""Smoke test cho text-cleaning utils (pure function, không cần deps nặng).

Chạy: pytest tests/ -v  (trong thư mục ai-service)
"""

from src.utils.clean_text_utils import clean_text


class TestCleanTextNormal:
    def test_lowercases_and_strips_special_chars(self):
        assert clean_text("Hello, The Gioi! 123", "normal") == "hello the gioi 123"

    def test_empty_string_returns_empty(self):
        assert clean_text("", "normal") == ""

    def test_default_input_is_empty_string(self):
        assert clean_text() == ""


class TestCleanTextArticle:
    def test_html_tags_are_stripped(self):
        result = clean_text("<b>Phim hay</b>", "article")
        assert "<b>" not in result and "</b>" not in result
        assert "phim hay" in result

    def test_url_is_replaced_by_token(self):
        result = clean_text("Xem tại https://example.com nhé", "article")
        assert "TOKENURL" in result
        assert "https://example.com" not in result

    def test_email_is_replaced_by_token(self):
        result = clean_text("Liên hệ test@example.com ngay", "article")
        assert "TOKENEMAIL" in result
        assert "test@example.com" not in result

    def test_vietnamese_text_is_normalized_to_nfc(self):
        # "ế" dạng decomposed (e + dấu huyền + mũ) phải được chuẩn hoá NFC
        decomposed = "phim t\u1ebf hay"
        result = clean_text(decomposed, "article")
        assert "phim t\u1ebf hay" in result
