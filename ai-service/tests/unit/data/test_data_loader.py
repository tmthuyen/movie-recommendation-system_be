"""Unit test cho ``src/data/data_loader.py``.

Không tải dữ liệu thật, không đọc DB/API/kagglehub: toàn bộ fixture là file
CSV/Parquet nhỏ tạo trong ``tmp_path``. Module này chỉ có nguồn dữ liệu file
(``MovieDataLoader.load_catalog``), nên các nguồn ngoài được cô lập bằng
``tmp_path`` + ``pytest.importorskip`` cho Parquet.

Bao phủ: ``extract_genre_names``, ``safe_int``, ``safe_float``,
``build_search_text``, ``compute_corpus_fingerprint``,
``MovieDataLoader.load_catalog`` và ``MovieDataLoader.get_corpus_and_ids``.
"""

import hashlib

import pandas as pd
import pytest

from src.data.data_loader import (
    MovieDataLoader,
    build_search_text,
    compute_corpus_fingerprint,
    extract_genre_names,
    safe_float,
    safe_int,
)

LONG_OVERVIEW = "Một câu chuyện rất dài và thú vị về tình bạn và lòng dũng cảm."
GENRES_JSON = '[{"id": 18, "name": "Drama"}, {"id": 28, "name": "Action"}]'


def _row(movie_id=1, title="Phim hay", overview=LONG_OVERVIEW, genres=GENRES_JSON):
    return {
        "movieId": movie_id,
        "title": title,
        "overview": overview,
        "genres": genres,
    }


def _write_csv(path, rows, columns=None):
    """Ghi DataFrame nhỏ ra CSV trong ``tmp_path`` (không dùng dữ liệu thật)."""
    pd.DataFrame(rows, columns=columns).to_csv(path, index=False)
    return path


class TestExtractGenreNames:
    """``extract_genre_names`` đổi JSON-list genres thành chuỗi tên."""

    def test_extracts_names_from_json_list(self):
        raw = '[{"id": 1, "name": "Hành động"}, {"id": 2, "name": "Hài"}]'

        assert extract_genre_names(raw) == "Hành động Hài"

    def test_returns_empty_for_non_string(self):
        assert extract_genre_names(None) == ""
        assert extract_genre_names(123) == ""
        assert extract_genre_names(float("nan")) == ""

    def test_returns_empty_for_blank_string(self):
        assert extract_genre_names("") == ""
        assert extract_genre_names("   ") == ""

    def test_returns_empty_for_empty_json_list(self):
        assert extract_genre_names("[]") == ""

    def test_skips_non_name_items_but_keeps_string_names(self):
        # Dict lấy ``name``; string giữ nguyên; số/None bị bỏ.
        assert extract_genre_names('[{"name": "A"}, 3, "B", None]') == "A B"

    def test_json_null_falls_back_to_raw_string(self):
        # ``null`` không phải literal Python → fallback trả nguyên chuỗi.
        raw = '[{"name": "A"}, null]'

        assert extract_genre_names(raw) == raw

    def test_falls_back_to_raw_string_when_not_parseable(self):
        assert extract_genre_names("Drama, Action") == "Drama, Action"
        assert extract_genre_names("  Action  ") == "Action"

    def test_dict_item_without_name_yields_empty_name(self):
        assert extract_genre_names('[{"id": 5}]') == ""


class TestSafeInt:
    """``safe_int`` — convert an toàn, lỗi trả 0."""

    @pytest.mark.parametrize(
        ("raw", "expected"),
        [
            (5, 5),
            ("7", 7),
            ("9.5", 9),
            (3.9, 3),
            (0, 0),
            (-2, -2),
            (True, 1),
        ],
    )
    def test_converts_valid_values(self, raw, expected):
        assert safe_int(raw) == expected

    @pytest.mark.parametrize("raw", [None, "abc", "", [], {}])
    def test_returns_zero_on_invalid_values(self, raw):
        assert safe_int(raw) == 0


class TestSafeFloat:
    """``safe_float`` — convert an toàn, lỗi trả 0.0."""

    @pytest.mark.parametrize(
        ("raw", "expected"),
        [
            (1.5, 1.5),
            ("2.25", 2.25),
            (3, 3.0),
            (0, 0.0),
            (-1.5, -1.5),
        ],
    )
    def test_converts_valid_values(self, raw, expected):
        assert safe_float(raw) == expected

    @pytest.mark.parametrize("raw", [None, "abc", "", [], {}])
    def test_returns_zero_on_invalid_values(self, raw):
        assert safe_float(raw) == 0.0


class TestBuildSearchText:
    """``build_search_text`` gộp title + overview + genres thành text chuẩn."""

    def test_prefers_vietnamese_fields(self):
        row = {
            "title_vi": "Kẻ Trộm Giấc Mơ",
            "title": "Inception",
            "overview_vi": LONG_OVERVIEW,
            "overview": "English overview",
            "genres": GENRES_JSON,
        }

        text = build_search_text(row)

        assert text.startswith("Kẻ Trộm Giấc Mơ")
        assert LONG_OVERVIEW in text
        assert "English overview" not in text

    def test_falls_back_to_english_fields(self):
        row = {
            "title": "Inception",
            "overview": LONG_OVERVIEW,
            "genres": GENRES_JSON,
        }

        assert build_search_text(row) == f"Inception {LONG_OVERVIEW} Drama Action"

    def test_falls_back_when_vietnamese_fields_are_none(self):
        row = {
            "title_vi": None,
            "title": "Inception",
            "overview_vi": None,
            "overview": LONG_OVERVIEW,
            "genres": "[]",
        }

        assert build_search_text(row) == f"Inception {LONG_OVERVIEW}"

    def test_handles_missing_values(self):
        assert build_search_text({}) == ""
        assert build_search_text({"title": "", "overview": "", "genres": ""}) == ""

    def test_normalizes_whitespace(self):
        row = {
            "title": "  Inception   ",
            "overview": "  A   thief  ",
            "genres": '[{"name": "Action"}]',
        }

        assert build_search_text(row) == "Inception A thief Action"

    def test_accepts_pandas_series(self):
        row = pd.Series(
            {
                "title": "Inception",
                "overview": LONG_OVERVIEW,
                "genres": GENRES_JSON,
            }
        )

        assert build_search_text(row) == f"Inception {LONG_OVERVIEW} Drama Action"

    def test_ignores_non_string_genres(self):
        row = {"title": "Inception", "overview": LONG_OVERVIEW, "genres": float("nan")}

        assert build_search_text(row) == f"Inception {LONG_OVERVIEW}"

    def test_nan_title_vi_falls_back_to_title(self):
        row = {
            "title_vi": float("nan"),
            "title": "Inception",
            "overview_vi": float("nan"),
            "overview": LONG_OVERVIEW,
            "genres": GENRES_JSON,
        }

        text = build_search_text(row)

        assert "nan" not in text.split()
        assert text == f"Inception {LONG_OVERVIEW} Drama Action"


class TestComputeCorpusFingerprint:
    """``compute_corpus_fingerprint`` — sha256 của corpus + ids."""

    def test_matches_manual_sha256_with_ids(self):
        expected = hashlib.sha256(b"1:hello\n2:world\n").hexdigest()

        assert compute_corpus_fingerprint(["hello", "world"], [1, 2]) == expected

    def test_matches_manual_sha256_without_ids(self):
        expected = hashlib.sha256(b"hello\nworld\n").hexdigest()

        assert compute_corpus_fingerprint(["hello", "world"]) == expected

    def test_returns_sha256_hex_digest(self):
        fingerprint = compute_corpus_fingerprint(["text"])

        assert len(fingerprint) == 64
        assert all(char in "0123456789abcdef" for char in fingerprint)

    def test_is_deterministic(self):
        first = compute_corpus_fingerprint(["a", "b"], [1, 2])
        second = compute_corpus_fingerprint(["a", "b"], [1, 2])

        assert first == second

    def test_changes_when_text_changes(self):
        assert compute_corpus_fingerprint(["a"]) != compute_corpus_fingerprint(["b"])

    def test_changes_when_ids_change(self):
        assert compute_corpus_fingerprint(["a"], [1]) != compute_corpus_fingerprint(
            ["a"], [2]
        )

    def test_order_matters(self):
        assert compute_corpus_fingerprint(["a", "b"]) != compute_corpus_fingerprint(
            ["b", "a"]
        )

    def test_empty_corpus_hash(self):
        # sha256 của chuỗi rỗng.
        assert compute_corpus_fingerprint([]) == (
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
        )

    def test_empty_ids_list_hashes_nothing(self):
        assert compute_corpus_fingerprint(["a", "b"], []) == compute_corpus_fingerprint(
            []
        )

    def test_ids_are_zipped_with_texts(self):
        # ``zip`` cắt theo danh sách ngắn hơn: text thừa bị bỏ qua.
        assert compute_corpus_fingerprint(["a", "b"], [1]) == (
            compute_corpus_fingerprint(["a"], [1])
        )


class TestMovieDataLoaderLoadCatalog:
    """``MovieDataLoader.load_catalog`` — đọc CSV/Parquet và chuẩn hoá."""

    def test_builds_search_text_and_keeps_valid_rows(self, tmp_path):
        path = _write_csv(
            tmp_path / "movies.csv",
            [
                _row(1, title="Inception"),
                _row(2, title="Interstellar"),
            ],
        )

        df = MovieDataLoader(str(path)).load_catalog()

        assert len(df) == 2
        assert list(df["movieId"]) == [1, 2]
        assert df.loc[0, "search_text"] == f"Inception {LONG_OVERVIEW} Drama Action"
        assert df.loc[1, "search_text"] == (
            f"Interstellar {LONG_OVERVIEW} Drama Action"
        )
        assert list(df.index) == [0, 1]

    def test_filters_rows_with_short_search_text(self, tmp_path):
        path = _write_csv(
            tmp_path / "movies.csv",
            [
                _row(1, title="Inception"),
                _row(2, title="A", overview="ngắn"),
            ],
        )

        df = MovieDataLoader(str(path)).load_catalog()

        assert list(df["movieId"]) == [1]

    def test_converts_movie_id_to_int_and_drops_non_positive(self, tmp_path):
        path = _write_csv(
            tmp_path / "movies.csv",
            [
                _row("7"),
                _row("abc"),
                _row("9.5"),
                _row(0),
            ],
        )

        df = MovieDataLoader(str(path)).load_catalog()

        assert list(df["movieId"]) == [7, 9]
        assert df["movieId"].dtype.kind in "iu"

    def test_deduplicates_by_movie_id_keeping_first_row(self, tmp_path):
        path = _write_csv(
            tmp_path / "movies.csv",
            [
                _row(5, title="Bản gốc"),
                _row(5, title="Bản trùng"),
            ],
        )

        df = MovieDataLoader(str(path)).load_catalog()

        assert len(df) == 1
        assert df.loc[0, "search_text"].startswith("Bản gốc")

    def test_falls_back_to_id_column_and_creates_movie_id(self, tmp_path):
        path = _write_csv(
            tmp_path / "movies.csv",
            [
                {
                    "id": 3,
                    "title": "Inception",
                    "overview": LONG_OVERVIEW,
                    "genres": GENRES_JSON,
                }
            ],
        )

        df = MovieDataLoader(str(path)).load_catalog()

        assert list(df["movieId"]) == [3]
        assert list(df["id"]) == [3]

    def test_uses_id_column_when_movie_id_is_all_null(self, tmp_path):
        path = _write_csv(
            tmp_path / "movies.csv",
            [
                {
                    "movieId": None,
                    "id": 11,
                    "title": "Inception",
                    "overview": LONG_OVERVIEW,
                    "genres": GENRES_JSON,
                }
            ],
        )

        df = MovieDataLoader(str(path)).load_catalog()

        assert list(df["movieId"]) == [11]

    def test_reads_parquet_file(self, tmp_path):
        pytest.importorskip("pyarrow")
        path = tmp_path / "movies.parquet"
        pd.DataFrame([_row(4, title="Inception")]).to_parquet(path, index=False)

        df = MovieDataLoader(str(path)).load_catalog()

        assert list(df["movieId"]) == [4]
        assert df.loc[0, "search_text"].startswith("Inception")

    def test_missing_file_raises_file_not_found(self, tmp_path):
        loader = MovieDataLoader(str(tmp_path / "khong-ton-tai.csv"))

        with pytest.raises(FileNotFoundError, match="Không tìm thấy file data"):
            loader.load_catalog()

    def test_missing_id_columns_raises_key_error(self, tmp_path):
        # Không có movieId lẫn id → fallback "id" không tồn tại.
        path = _write_csv(
            tmp_path / "movies.csv",
            [{"title": "Inception", "overview": LONG_OVERVIEW, "genres": GENRES_JSON}],
            columns=["title", "overview", "genres"],
        )

        with pytest.raises(KeyError, match="id"):
            MovieDataLoader(str(path)).load_catalog()

    def test_empty_csv_raises_attribute_error(self, tmp_path):
        """BUG (báo cáo): file CSV rỗng (chỉ header) ném ``AttributeError``.

        Nguyên nhân: ``df.apply(..., axis=1)`` trên DataFrame 0 dòng trả
        DataFrame rỗng, cột ``search_text`` thành float nên ``.str.len()`` lỗi.
        Kỳ vọng hợp lý là trả DataFrame rỗng hoặc ``ValueError`` rõ ràng.
        Test ghi nhận hành vi hiện tại để tránh thay đổi âm thầm.
        """
        path = _write_csv(
            tmp_path / "empty.csv",
            [],
            columns=["movieId", "title", "overview", "genres"],
        )

        with pytest.raises(AttributeError, match="Can only use .str accessor"):
            MovieDataLoader(str(path)).load_catalog()


class TestMovieDataLoaderGetCorpusAndIds:
    """``MovieDataLoader.get_corpus_and_ids`` — tách corpus & ids."""

    def test_uses_movie_id_by_default(self):
        df = pd.DataFrame({"movieId": [1, 2], "search_text": ["a b", "c d"]})

        corpus, ids = MovieDataLoader("unused.csv").get_corpus_and_ids(df)

        assert corpus == ["a b", "c d"]
        assert ids == [1, 2]

    def test_falls_back_to_id_column(self):
        df = pd.DataFrame({"id": [3, 4], "search_text": ["a b", "c d"]})

        corpus, ids = MovieDataLoader("unused.csv").get_corpus_and_ids(df)

        assert ids == [3, 4]
        assert corpus == ["a b", "c d"]

    def test_accepts_explicit_id_column(self):
        df = pd.DataFrame(
            {"id": [3], "internal_id": [99], "search_text": ["a b"]}
        )

        _, ids = MovieDataLoader("unused.csv").get_corpus_and_ids(
            df, id_col="internal_id"
        )

        assert ids == [99]

    def test_missing_search_text_raises_key_error(self):
        df = pd.DataFrame({"movieId": [1]})

        with pytest.raises(KeyError):
            MovieDataLoader("unused.csv").get_corpus_and_ids(df)

    def test_missing_id_columns_raises_key_error(self):
        df = pd.DataFrame({"search_text": ["a b"]})

        with pytest.raises(KeyError):
            MovieDataLoader("unused.csv").get_corpus_and_ids(df)
