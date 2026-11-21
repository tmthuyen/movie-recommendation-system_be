"""Đọc dữ liệu thể loại và phim phổ biến từ Redis cho gợi ý."""

from __future__ import annotations

from core.vector_constants import GENRE_IDS_KEY, POPULAR_MOVIES_KEY, genre_movies_key
from infra.redis.redis_service import RedisStore


class RedisGenreRepository:
    """Repository truy cập các key Redis phục vụ gợi ý theo thể loại."""

    def __init__(self, redis_store: RedisStore | None) -> None:
        self._redis_store = redis_store

    @property
    def client(self):
        """Trả về client Redis đang hoạt động; None nếu Redis bị tắt.

        Returns:
            Client Redis async hoặc None khi không có store.
        """
        if self._redis_store is None:
            return None
        return self._redis_store.client

    async def load_genre_ids(self) -> list[int]:
        """Trả về danh sách ID thể loại có ma trận được làm mới.

        Đọc SET `cache:stats:genre:ids` và giữ lại các giá trị nguyên.

        Returns:
            Danh sách ID thể loại; rỗng khi Redis không dùng được.
        """
        client = self.client
        if client is None:
            return []
        values = await client.smembers(GENRE_IDS_KEY)
        return [int(value) for value in values if str(value).lstrip("-").isdigit()]

    async def load_genre_movies(self, genre_id: int) -> list[tuple[int, float]]:
        """Trả về (movieId, score) của một thể loại, sắp theo score giảm dần.

        Đọc ZSET `cache:stats:genre:{genreId}:movies`; score chỉ để sắp thứ
        tự, ai-service sẽ gán ô ma trận bằng 1 khi build ma trận.

        Returns:
            Danh sách cặp (movieId, score); rỗng khi không có dữ liệu.
        """
        client = self.client
        if client is None:
            return []
        rows = await client.zrevrange(
            genre_movies_key(genre_id), 0, -1, withscores=True
        )
        return [(int(movie_id), float(score)) for movie_id, score in rows]

    async def load_popular_movie_ids(self, limit: int) -> list[int]:
        """Trả về các movieId phổ biến nhất từ ZSET `cache:stats:popular:all`.

        Returns:
            Danh sách movieId nhiều nhất theo limit; rỗng khi Redis tắt.
        """
        client = self.client
        if client is None or limit <= 0:
            return []
        values = await client.zrevrange(POPULAR_MOVIES_KEY, 0, limit - 1)
        return [int(value) for value in values if str(value).lstrip("-").isdigit()]
