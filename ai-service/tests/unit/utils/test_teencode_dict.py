"""Unit test cho ``utils/teencode_dict.py``.

Module chỉ chứa dữ liệu tĩnh (``TEENCODE_MAP``, ``EMOJI_MAP``,
``COMMON_ABBREVIATIONS``) và một hàm chuẩn hoá ``normalize_typing_rules``.
Không có hàm ``replace``/``normalize`` toàn câu — việc tách từ và tra map do
``utils/clean_text_utils.py`` đảm nhiệm (đã có test riêng). Vì vậy phần lớn
test ở đây kiểm tra tính toàn vẹn của từ điển và hành vi của các entry phổ
biến, cộng thêm một helper mô phỏng đúng cách pipeline tra map theo từng token.
"""

import pytest

from src.utils.teencode_dict import (
    COMMON_ABBREVIATIONS,
    EMOJI_MAP,
    TEENCODE_MAP,
    normalize_typing_rules,
)


def apply_token_map(text: str) -> str:
    """Mô phỏng cách ``clean_text_utils.map_rule`` tra từ điển theo token."""
    return " ".join(TEENCODE_MAP.get(word, word) for word in text.split())


class TestTeencodeMapStructure:
    def test_map_is_not_empty_and_only_string_pairs(self):
        assert TEENCODE_MAP
        for key, value in TEENCODE_MAP.items():
            assert isinstance(key, str) and key
            assert isinstance(value, str) and value

    def test_map_has_no_blank_or_padded_keys(self):
        assert "" not in TEENCODE_MAP
        assert all(key == key.strip() for key in TEENCODE_MAP)
        assert all(value == value.strip() for value in TEENCODE_MAP.values())

    @pytest.mark.parametrize(
        ("token", "expected"),
        [
            ("k", "không"),
            ("ko", "không"),
            ("khong", "không"),
            ("hok", "không"),
            ("j", "gì"),
            ("dc", "được"),
            ("đc", "được"),
            ("vs", "với"),
            ("r", "rồi"),
            ("iu", "yêu"),
            ("mún", "muốn"),
            ("hnay", "hôm_nay"),
            ("sg", "sài_gòn"),
            ("tks", "cảm_ơn"),
            ("sr", "xin_lỗi"),
            ("pls", "làm_ơn"),
            ("avt", "ảnh_đại_diện"),
            ("cheems", "trời_ơi"),
            ("omg", "ôi_trời_ơi"),
        ],
    )
    def test_popular_teencode_entries(self, token, expected):
        assert TEENCODE_MAP[token] == expected

    def test_token_lookup_replaces_known_words_and_keeps_unknown_words(self):
        assert apply_token_map("mk k thjk xem phim") == "mình không thích xem phim"
        assert apply_token_map("tks bn") == "cảm_ơn bạn"

    def test_unknown_word_is_not_changed(self):
        assert apply_token_map("phim hành động") == "phim hành động"
        assert TEENCODE_MAP.get("không có trong từ điển") is None


class TestEmojiMap:
    def test_emoji_map_values_are_normalised_tokens(self):
        assert set(EMOJI_MAP.values()) <= {"TOKENSMILE", "TOKENSAD"}

    @pytest.mark.parametrize("icon", [":))", "=))", ":v", "xD", "^^", "lol"])
    def test_popular_smile_icons_map_to_token_smile(self, icon):
        assert EMOJI_MAP[icon] == "TOKENSMILE"

    def test_sad_icon_maps_to_token_sad(self):
        assert EMOJI_MAP["huhu"] == "TOKENSAD"


class TestCommonAbbreviations:
    @pytest.mark.parametrize(
        ("token", "expected"),
        [
            ("thg", "tháng"),
            ("t2", "thứ_hai"),
            ("t7", "thứ_bảy"),
            ("cn", "chủ_nhật"),
        ],
    )
    def test_weekday_and_month_abbreviations(self, token, expected):
        assert COMMON_ABBREVIATIONS[token] == expected

    def test_identity_entry_for_nam(self):
        assert COMMON_ABBREVIATIONS["năm"] == "năm"


class TestNormalizeTypingRules:
    def test_empty_input_is_returned_unchanged(self):
        assert normalize_typing_rules("") == ""

    def test_none_input_is_returned_unchanged(self):
        assert normalize_typing_rules(None) is None

    @pytest.mark.parametrize(
        ("word", "expected"),
        [("fa", "pha"), ("fim", "phim"), ("f", "ph")],
    )
    def test_leading_f_becomes_ph(self, word, expected):
        assert normalize_typing_rules(word) == expected

    @pytest.mark.parametrize(
        ("word", "expected"),
        [("qá", "quá"), ("qen", "quen")],
    )
    def test_special_q_words_are_corrected(self, word, expected):
        assert normalize_typing_rules(word) == expected

    def test_words_without_matching_rule_are_unchanged(self):
        for word in ("phim", "không", "qua", "quá", "movie", "hành_động"):
            assert normalize_typing_rules(word) == word

    def test_only_leading_f_is_rewritten(self):
        assert normalize_typing_rules("fafim") == "phafim"
