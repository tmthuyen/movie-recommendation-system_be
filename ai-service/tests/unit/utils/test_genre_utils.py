"""Unit test cho ``src/utils/genre_utils.py``.

Phủ toàn bộ public API: ``extract_genres``, ``compute_genre_similarity``,
``rerank_similar_candidates`` và các nhánh lỗi/biên của chúng.
"""

import math

import pytest

from src.utils.genre_utils import (
    GENRE_EN_TO_VI,
    KNOWN_GENRES_VI,
    _sort_key,
    compute_genre_similarity,
    extract_genres,
    rerank_similar_candidates,
)


class TestExtractGenresEmptyInputs:
    """`extract_genres` với đầu vào rỗng/không hợp lệ."""

    def test_none_returns_empty_set(self):
        assert extract_genres(None) == set()

    @pytest.mark.parametrize("raw", ["", "   ", "nan", "None", "null", "[]", "{}"])
    def test_missing_markers_return_empty_set(self, raw):
        assert extract_genres(raw) == set()

    def test_empty_list_and_dict_return_empty_set(self):
        assert extract_genres([]) == set()
        assert extract_genres({}) == set()
        assert extract_genres({"name": ""}) == set()


class TestExtractGenresStructures:
    """`extract_genres` với list/tuple/set/dict/JSON string."""

    def test_list_of_dicts_uses_name_field(self):
        raw = [{"id": 1, "name": "Action"}, {"id": 2, "name": "Drama"}]

        assert extract_genres(raw) == {"phim hành động", "phim chính kịch"}

    def test_dict_uses_genre_name_fallback(self):
        assert extract_genres({"genre_name": "Horror"}) == {"phim kinh dị"}

    def test_json_string_list_is_parsed(self):
        assert extract_genres('["Comedy", "Romance"]') == {
            "phim hài",
            "phim lãng mạn",
        }

    def test_tuple_and_set_are_supported(self):
        assert extract_genres(("Action",)) == {"phim hành động"}
        assert extract_genres({"Action"}) == {"phim hành động"}


class TestExtractGenresText:
    """`extract_genres` với chuỗi tự do (VI/EN) và ranh giới từ."""

    def test_english_genre_maps_to_vietnamese(self):
        assert extract_genres("Science Fiction") == {"phim khoa học viễn tưởng"}

    def test_vietnamese_genre_is_kept(self):
        assert extract_genres("phim hành động") == {"phim hành động"}

    def test_multiple_genres_in_one_string(self):
        assert extract_genres("Action, Comedy") == {
            "phim hành động",
            "phim hài",
        }

    @pytest.mark.parametrize(
        "text,not_expected",
        [
            ("award winning", "phim chiến tranh"),  # "war" trong "award"
            ("interaction design", "phim hành động"),  # "action" trong "interaction"
        ],
    )
    def test_word_boundaries_prevent_false_positive(self, text, not_expected):
        assert not_expected not in extract_genres(text)

    def test_unknown_comma_list_is_preserved_casefolded(self):
        assert extract_genres("Kịch tính, Tâm lý") == {"kịch tính", "tâm lý"}

    def test_unknown_single_word_returns_empty(self):
        assert extract_genres("blockbuster") == set()


class TestComputeGenreSimilarity:
    """`compute_genre_similarity` (0.5 Jaccard + 0.5 target recall)."""

    def test_empty_target_returns_zero(self):
        assert compute_genre_similarity(set(), {"a"}) == 0.0

    def test_empty_candidate_returns_zero(self):
        assert compute_genre_similarity({"a"}, set()) == 0.0

    def test_disjoint_sets_return_zero(self):
        assert compute_genre_similarity({"a"}, {"b"}) == 0.0

    def test_identical_sets_return_one(self):
        assert compute_genre_similarity({"a", "b"}, {"a", "b"}) == 1.0

    def test_partial_overlap_formula(self):
        target = {"a", "b"}
        candidate = {"a", "c"}
        # jaccard = 1/3, recall = 1/2 -> 0.5*(1/3) + 0.5*(1/2)
        expected = 0.5 * (1 / 3) + 0.5 * (1 / 2)

        assert compute_genre_similarity(target, candidate) == pytest.approx(
            expected
        )

    def test_candidate_superset_has_partial_score(self):
        # jaccard = 1/2, recall = 1 -> 0.75
        assert compute_genre_similarity({"a"}, {"a", "b"}) == pytest.approx(0.75)


class TestSortKey:
    """`_sort_key` sắp xếp giảm dần theo score, tie-break theo id."""

    def test_higher_score_first(self):
        assert _sort_key({"id": 1, "score": 0.9}) < _sort_key({"id": 2, "score": 0.5})

    def test_equal_score_sorts_by_numeric_id(self):
        assert _sort_key({"id": 2, "score": 1.0}) < _sort_key({"id": 10, "score": 1.0})

    def test_non_numeric_id_after_numeric_ids(self):
        numeric = _sort_key({"id": 1, "score": 1.0})
        non_numeric = _sort_key({"id": "abc", "score": 1.0})

        assert numeric < non_numeric

    def test_non_finite_score_raises(self):
        with pytest.raises(ValueError, match="finite"):
            _sort_key({"id": 1, "score": math.inf})


class TestRerankValidation:
    """`rerank_similar_candidates` validate tham số."""

    @pytest.mark.parametrize("top_k", [0, -1, 1.5, True])
    def test_invalid_top_k_raises(self, top_k):
        with pytest.raises(ValueError, match="top_k"):
            rerank_similar_candidates([], set(), top_k=top_k)

    def test_invalid_mode_raises(self):
        with pytest.raises(ValueError, match="mode"):
            rerank_similar_candidates([{"id": 1, "score": 1.0}], {"a"}, mode="x")

    @pytest.mark.parametrize("weight", [-0.1, 1.1, math.nan])
    def test_invalid_weight_raises(self, weight):
        with pytest.raises(ValueError, match="genre_weight"):
            rerank_similar_candidates(
                [{"id": 1, "score": 1.0}], {"a"}, genre_weight=weight
            )

    def test_empty_candidates_return_empty_list(self):
        assert rerank_similar_candidates([], {"a"}) == []


class TestRerankModes:
    """Hành vi từng mode: off / soft / strict."""

    candidates = [
        {"id": 1, "score": 1.0, "genres": ["Action"]},
        {"id": 2, "score": 0.9, "genres": ["Drama"]},
        {"id": 3, "score": 0.5, "genres": ["Action"]},
    ]
    target = {"phim hành động"}

    def test_off_keeps_cosine_order_and_limits_top_k(self):
        ranked = rerank_similar_candidates(self.candidates, self.target, mode="off", top_k=2)

        assert [item["id"] for item in ranked] == [1, 2]

    def test_missing_target_genres_falls_back_to_off(self):
        ranked = rerank_similar_candidates(self.candidates, set(), mode="soft")

        assert [item["id"] for item in ranked] == [1, 2, 3]

    def test_strict_returns_only_shared_genre_candidates(self):
        ranked = rerank_similar_candidates(self.candidates, self.target, mode="strict")

        assert [item["id"] for item in ranked] == [1, 3]

    def test_strict_does_not_backfill_when_no_match(self):
        ranked = rerank_similar_candidates(
            [{"id": 9, "score": 1.0, "genres": ["Drama"]}], self.target, mode="strict"
        )

        assert ranked == []

    def test_soft_weights_cosine_and_genre_similarity(self):
        ranked = rerank_similar_candidates(
            self.candidates, self.target, mode="soft", genre_weight=0.5, top_k=3
        )

        # (1-w)*cosine + w*genre: id1 1.0, id3 0.75, id2 0.45
        assert [item["id"] for item in ranked] == [1, 3, 2]
        assert ranked[0]["raw_cosine_score"] == pytest.approx(1.0)
        assert ranked[0]["genre_similarity"] == pytest.approx(1.0)
        assert ranked[2]["genre_similarity"] == pytest.approx(0.0)

    def test_soft_zero_weight_returns_cosine_order(self):
        ranked = rerank_similar_candidates(
            self.candidates, self.target, mode="soft", genre_weight=0.0
        )

        assert [item["id"] for item in ranked] == [1, 2, 3]

    def test_soft_missing_candidate_genres_uses_neutral_cosine(self):
        candidates = [{"id": 1, "score": 0.8}, {"id": 2, "score": 0.9}]

        ranked = rerank_similar_candidates(candidates, self.target, mode="soft")

        assert [item["id"] for item in ranked] == [2, 1]
        assert ranked[0]["genre_similarity"] is None

    def test_reads_genres_from_payload_when_top_level_missing(self):
        candidates = [
            {"id": 1, "score": 1.0, "payload": {"genres": '["Action"]'}},
            {"id": 2, "score": 0.9, "payload": {"genres": '["Drama"]'}},
        ]

        ranked = rerank_similar_candidates(candidates, self.target, mode="strict")

        assert [item["id"] for item in ranked] == [1]

    def test_does_not_mutate_original_candidates(self):
        original = {"id": 1, "score": 0.5, "genres": ["Action"]}

        rerank_similar_candidates([original], self.target, mode="soft")

        assert original == {"id": 1, "score": 0.5, "genres": ["Action"]}


class TestGenreConstants:
    """Bảng hằng số genre dùng cho mapping."""

    def test_known_genres_are_unique_lowercase(self):
        assert len(KNOWN_GENRES_VI) == len(set(KNOWN_GENRES_VI))
        assert all(genre == genre.lower() for genre in KNOWN_GENRES_VI)

    def test_every_english_genre_maps_to_known_vietnamese_genre(self):
        assert set(GENRE_EN_TO_VI.values()) <= set(KNOWN_GENRES_VI)
