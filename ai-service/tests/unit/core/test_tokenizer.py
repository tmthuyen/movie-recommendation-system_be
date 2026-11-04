"""Unit test cho ``src/core/tokenizer.py``.

Không load model underthesea thật cho các case logic: monkeypatch
``_word_tokenize`` để kiểm tra chuẩn hoá dấu câu / stop words / fallback.
Một case dùng underthesea thật (câu ngắn) để xác nhận tích hợp hoạt động.
"""

import pytest

from src.core.tokenizer import (
    BaseTokenizer,
    EnglishTokenizer,
    UndertheseaTokenizer,
    get_tokenizer,
)


@pytest.fixture(scope="module")
def vi_tokenizer() -> UndertheseaTokenizer:
    return UndertheseaTokenizer()


@pytest.fixture(scope="module")
def en_tokenizer() -> EnglishTokenizer:
    return EnglishTokenizer()


class TestUndertheseaTokenizer:
    def test_empty_inputs_return_empty_list(self, vi_tokenizer):
        assert vi_tokenizer.tokenize("") == []
        assert vi_tokenizer.tokenize("   ") == []
        assert vi_tokenizer.tokenize(None) == []

    def test_punctuation_only_returns_empty_list(self, vi_tokenizer):
        assert vi_tokenizer.tokenize("!!!???") == []

    def test_real_underthesea_tokenizes_short_vietnamese_sentence(self, vi_tokenizer):
        tokens = vi_tokenizer.tokenize("Tôi rất thích bộ phim này!")
        assert "phim" in tokens
        assert all(token == token.lower() for token in tokens)
        assert all(len(token) > 1 for token in tokens)

    def test_punctuation_is_stripped_and_stopwords_removed(
        self, vi_tokenizer, monkeypatch
    ):
        # "và"/"hay" nằm trong danh sách stop words tiếng Việt.
        monkeypatch.setattr(
            vi_tokenizer, "_word_tokenize", lambda text, format="text": "PHIM, và HAY!"
        )
        assert vi_tokenizer.tokenize("bất kỳ") == ["phim"]

    def test_single_character_tokens_are_dropped(self, vi_tokenizer, monkeypatch):
        monkeypatch.setattr(
            vi_tokenizer,
            "_word_tokenize",
            lambda text, format="text": "a phim b hay c",
        )
        # "hay" là stop word, "a"/"b"/"c" dài 1 ký tự.
        assert vi_tokenizer.tokenize("abc") == ["phim"]

    def test_fallback_regex_when_underthesea_raises(self, vi_tokenizer, monkeypatch):
        def _boom(text, format="text"):
            raise RuntimeError("underthesea lỗi")

        monkeypatch.setattr(vi_tokenizer, "_word_tokenize", _boom)
        assert vi_tokenizer.tokenize("Phim hay 123 và") == ["phim", "hay", "123", "và"]

    def test_stop_words_are_loaded_from_files(self, vi_tokenizer):
        assert len(vi_tokenizer.stop_words) > 0
        assert "và" in vi_tokenizer.stop_words

    def test_name_and_repr(self, vi_tokenizer):
        assert vi_tokenizer.name() == "underthesea"
        assert repr(vi_tokenizer) == "UndertheseaTokenizer(lib=underthesea)"


class TestEnglishTokenizer:
    def test_removes_stopwords_and_normalizes_case(self, en_tokenizer):
        assert en_tokenizer.tokenize("The Movie, and the ACTOR!") == ["movie", "actor"]

    def test_empty_input_returns_empty_list(self, en_tokenizer):
        assert en_tokenizer.tokenize("") == []
        assert en_tokenizer.tokenize("   ") == []
        assert en_tokenizer.tokenize(None) == []

    def test_simple_sentence_split(self, en_tokenizer):
        assert en_tokenizer.tokenize("Hello world") == ["hello", "world"]

    def test_tokenize_batch(self, en_tokenizer):
        assert en_tokenizer.tokenize_batch(["Hello world", "The movie"]) == [
            ["hello", "world"],
            ["movie"],
        ]

    def test_stop_words_are_loaded_from_file(self, en_tokenizer):
        assert len(en_tokenizer.stop_words) > 0
        assert "the" in en_tokenizer.stop_words

    def test_name_and_repr(self, en_tokenizer):
        assert en_tokenizer.name() == "split"
        assert repr(en_tokenizer) == "EnglishTokenizer(lib=split)"


class TestTokenizerConfig:
    def test_get_config_reports_class_name_and_stopword_count(self, en_tokenizer):
        config = en_tokenizer.get_config()
        assert config["class"] == "EnglishTokenizer"
        assert config["name"] == "split"
        assert config["stop_words_count"] == len(en_tokenizer.stop_words)
        assert len(config["stop_words_hash"]) == 64

    def test_config_hash_is_deterministic_for_same_stopwords(self):
        first = EnglishTokenizer()
        second = EnglishTokenizer()
        assert first.get_config_hash() == second.get_config_hash()

    def test_config_hash_changes_when_stopwords_change(self):
        tokenizer = EnglishTokenizer()
        before = tokenizer.get_config_hash()
        tokenizer.stop_words.add("zzz-khong-ton-tai")
        assert tokenizer.get_config_hash() != before

    def test_get_tokenizer_dispatches_by_language(self):
        assert isinstance(get_tokenizer("vi"), UndertheseaTokenizer)
        assert isinstance(get_tokenizer("VI"), UndertheseaTokenizer)
        assert isinstance(get_tokenizer("en"), EnglishTokenizer)
        assert isinstance(get_tokenizer("fr"), EnglishTokenizer)

    def test_base_tokenizer_is_abstract(self):
        with pytest.raises(TypeError):
            BaseTokenizer()
