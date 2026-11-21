"""Hằng số cho vector người dùng, trọng số ForYou và key Redis thể loại."""

GENRE_IDS_KEY = "cache:stats:genre:ids"
POPULAR_MOVIES_KEY = "cache:stats:popular:all"


def genre_movies_key(genre_id: int) -> str:
    """Trả về key ZSET chứa các phim của một thể loại."""
    return f"cache:stats:genre:{genre_id}:movies"


GENRE_PAYLOAD_METADATA_KEY = "genre_scores"

TOP_MOVIES_PER_GENRE = 100

# TTL cache ma trận thể loại; hết hạn thì đọc lại Redis sau cron.
GENRE_MATRIX_TTL_SECONDS = 12 * 60 * 60

GENRE_WEIGHT_ALPHA = 0.05
GENRE_WEIGHT_MIN = -1.0
GENRE_WEIGHT_MAX = 1.0
GENRE_MIN_ABS_WEIGHT = 0.05

# CBF/profile đã tắt; trọng số còn lại được chuẩn hoá lại theo tỉ lệ cũ.
FOR_YOU_WEIGHTS = {
    "CF": 0.375,
    "LONG_TERM": 0.1875,
    "SHORT_TERM": 0.1875,
    "SEARCH": 0.125,
    "GENRE": 0.125,
}

FOR_YOU_COLD_WEIGHTS = {
    "LONG_TERM": 2 / 15,
    "SHORT_TERM": 5 / 15,
    "SEARCH": 2 / 15,
    "GENRE": 6 / 15,
}

FOR_YOU_CF_POPULAR_WEIGHTS = {"CF": 0.70, "POPULAR": 0.30}
