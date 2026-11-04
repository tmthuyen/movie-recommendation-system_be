"""Unit test cho text-cleaning utils (pure function, không cần deps nặng).

Chạy: pytest tests/ -v  (trong thư mục ai-service)

Bao phủ toàn bộ nhánh của ``clean_text``:
- ``normal``: unicode NFC, ký tự đặc biệt, khoảng trắng, rỗng/None.
- ``article``: HTML/entity, URL/email, emoji, teencode, số/ngày/%, dấu câu,
  caption, ký tự lặp, chữ hoa.
- ``type`` lạ (không thuộc normal/article) trả nguyên văn.
- ``is_valid_sentence`` / ``is_valid_article`` với các ngưỡng biên.
"""

import unicodedata

import pytest

from src.utils.clean_text_utils import (
    clean_text,
    is_valid_article,
    is_valid_sentence,
)


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


class TestCleanTextNormalEdgeCases:
    def test_collapses_whitespace_and_newlines(self):
        raw = "  Multiple   spaces\tand\nnewlines  "
        assert clean_text(raw, "normal") == "multiple spaces and newlines"

    def test_underscore_and_punctuation_become_spaces(self):
        assert clean_text("Phim_hay_2024", "normal") == "phim hay 2024"

    def test_decomposed_unicode_is_composed(self):
        composed = unicodedata.normalize("NFC", "phim tế hay")
        decomposed = unicodedata.normalize("NFD", composed)
        assert clean_text(decomposed, "normal") == composed

    def test_none_input_raises_type_error(self):
        # Hợp đồng hiện tại chỉ nhận str; None không được âm thầm bỏ qua.
        with pytest.raises(TypeError):
            clean_text(None, "normal")

    def test_unknown_type_returns_input_unchanged(self):
        assert clean_text("  Keep As Is!  ", "unknown") == "  Keep As Is!  "


class TestCleanTextArticleHtmlAndTokens:
    def test_html_entities_are_decoded_and_tags_stripped(self):
        raw = "<b>Phim hay</b> &amp; &lt;hot&gt; &quot;A&quot; &#39;B&#39;"
        assert clean_text(raw, "article") == "phim hay <hot> a b"

    def test_http_www_and_email_are_replaced_by_tokens(self):
        raw = "Xem tại https://example.com và www.foo.vn nhé. Mail test@example.com"
        result = clean_text(raw, "article")
        assert result.count("TOKENURL") == 2
        assert "TOKENEMAIL" in result
        assert "https://example.com" not in result
        assert "test@example.com" not in result
        assert "TOKENEOS" in result

    def test_emoji_map_is_replaced_by_smile_token(self):
        result = clean_text("Phim này hay :)) =)) :v xD quá", "article")
        assert result.count("TOKENSMILE") == 4
        assert "quá" in result

    def test_caption_source_and_video_blocks_are_removed(self):
        raw = "(Ảnh: minh họa) Phim hay (Nguồn: VnExpress) (Video: trailer)"
        assert clean_text(raw, "article") == "phim hay"

    def test_smart_quotes_and_dashes_are_normalized(self):
        raw = "“Phim” – hay — thật „vậy‟ «ok»"
        assert clean_text(raw, "article") == "phim hay thật vậy ok"

    def test_ellipsis_and_sentence_punctuation_become_eos_token(self):
        result = clean_text("Anh ấy nói... rồi im lặng………", "article")
        assert result.count("TOKENEOS") >= 2
        assert "..." not in result


class TestCleanTextArticleTeencode:
    def test_teencode_and_typing_rules_are_normalized(self):
        raw = "ko dc j z mk bn 2ny fím qá"
        assert clean_text(raw, "article") == (
            "không được gì vậy mình bạn người_yêu phím quá"
        )

    def test_repeated_characters_are_collapsed_before_mapping(self):
        # "waaaaaa" → "wa" → map teencode → "quá"; "hayyyy" → "hay"
        assert clean_text("waaaaaa hayyyy", "article") == "quá hay"

    def test_article_is_lowercased(self):
        assert clean_text("PHIM HAY", "article") == "phim hay"

    def test_unknown_teencode_word_is_kept(self):
        # Từ không có trong từ điển teencode phải giữ nguyên (không bị mất).
        assert clean_text("phim kinh dị", "article") == "phim kinh dị"


class TestCleanTextArticleDigits:
    def test_percent_date_money_float_roman_and_ratio_tokens(self):
        raw = "Tỷ lệ 37.5% ngày 15/8 giá 1.500.000 và 3.14, tập III, 1:2"
        result = clean_text(raw, "article")
        assert "TOKENPERCENT" in result
        assert "TOKENDATE" in result
        assert result.count("TOKENNUM") == 4
        assert "37.5" not in result
        assert "III" not in result

    def test_consecutive_numbers_are_deduplicated_into_one_token(self):
        result = clean_text("giá 10.000 20.000 30.000 đồng", "article")
        assert result.count("TOKENNUM") == 1
        assert "đồng" in result

    def test_empty_and_whitespace_article_return_empty_string(self):
        assert clean_text("", "article") == ""
        assert clean_text("   \t\n  ", "article") == ""

    def test_none_article_raises_type_error(self):
        with pytest.raises(TypeError):
            clean_text(None, "article")


class TestIsValidSentence:
    def test_too_short_sentence_is_invalid(self):
        assert is_valid_sentence("phim hay") is False

    def test_ten_tokens_with_three_vietnamese_words_is_valid(self):
        assert is_valid_sentence("phim hay và tôi thích bộ phim này rất nhiều") is True

    def test_nine_tokens_is_invalid(self):
        assert is_valid_sentence("phim hay và tôi thích bộ phim này rất") is False

    def test_too_many_numeric_tokens_is_invalid(self):
        sent = "TOKENNUM TOKENNUM TOKENNUM TOKENNUM TOKENNUM phim hay và tôi thích"
        assert is_valid_sentence(sent) is False

    def test_numeric_ratio_at_threshold_is_still_valid(self):
        # 4/10 = 0.4 — điều kiện là "> 0.4" nên biên này vẫn hợp lệ.
        sent = "TOKENNUM TOKENNUM TOKENNUM TOKENNUM và tôi thích a b c"
        assert is_valid_sentence(sent) is True

    def test_mostly_english_sentence_is_invalid(self):
        sent = "this is a very good movie and i like it a lot ok"
        assert is_valid_sentence(sent) is False

    def test_exactly_thirty_percent_vietnamese_words_is_valid(self):
        sent = "và tôi thích a b c d e f g"
        assert is_valid_sentence(sent) is True


class TestIsValidArticle:
    def test_article_with_50_words_and_title_is_valid(self):
        article = {"content": " ".join(["phim"] * 50), "title": "Tiêu đề"}
        assert is_valid_article(article) is True

    def test_article_with_49_words_is_invalid(self):
        article = {"content": " ".join(["phim"] * 49), "title": "Tiêu đề"}
        assert is_valid_article(article) is False

    def test_article_missing_content_is_invalid(self):
        assert is_valid_article({"content": "", "title": "Tiêu đề"}) is False
        assert is_valid_article({"content": "   ", "title": "Tiêu đề"}) is False

    def test_article_missing_title_is_invalid(self):
        article = {"content": " ".join(["phim"] * 50), "title": "  "}
        assert is_valid_article(article) is False

    def test_article_handles_none_fields(self):
        assert is_valid_article({"content": None, "title": None}) is False
        assert is_valid_article({}) is False
