"""Ma trận thể loại từ Redis và payload trọng số thể loại của người dùng."""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import joblib
import numpy as np

from core.config import get_settings
from core.vector_constants import (
    GENRE_MATRIX_TTL_SECONDS,
    GENRE_MIN_ABS_WEIGHT,
    GENRE_WEIGHT_ALPHA,
    GENRE_WEIGHT_MAX,
    GENRE_WEIGHT_MIN,
    TOP_MOVIES_PER_GENRE,
)
from infra.redis.genre_repository import RedisGenreRepository
from services.user_vector_service import UserVectorService
from utils import setup_logger

logger = setup_logger(name="FastAPI-Recommendations")

settings = get_settings()

GENRE_MATRIX_CACHE_PATH = Path("data/cache/genre_matrix.joblib")


@dataclass
class GenreMatrix:
    """Ma trận phim thể loại đã chuẩn hoá L2, xây từ dữ liệu Redis."""

    genre_ids: list[int]
    movie_vectors: dict[int, np.ndarray]
    genre_movies: dict[int, list[int]]
    loaded_at: float = field(default_factory=time.time)


class GenreVectorService:
    """Xếp hạng phim theo sở thích thể loại và cập nhật trọng số thể loại."""

    def __init__(
        self,
        repository: RedisGenreRepository,
        user_vector_service: UserVectorService,
        cache_path: Path | str = GENRE_MATRIX_CACHE_PATH,
    ) -> None:
        self._repository = repository
        self._user_vector_service = user_vector_service
        self._cache_path = Path(cache_path)
        self._cached_matrix: GenreMatrix | None = None

    async def load_matrix_from_redis(self) -> GenreMatrix | None:
        """Đọc 2 key Redis và build ma trận movie↔genre, ô có quan hệ bằng 1.

        Đọc danh sách genreId rồi từng ZSET phim của genre. Mỗi movieId trong
        top `TOP_MOVIES_PER_GENRE` nhận giá trị 1 cho genre đó (không dùng score
        viewCount), sau đó chuẩn hoá L2 vector của từng phim và ghi cache.

        Returns:
            GenreMatrix hoặc None khi Redis chưa có dữ liệu genre.
        """
        try:
            genre_ids = sorted(await self._repository.load_genre_ids())
            if not genre_ids:
                return None

            per_genre: dict[int, list[tuple[int, float]]] = {}
            for genre_id in genre_ids:
                per_genre[genre_id] = await self._repository.load_genre_movies(genre_id)
        except Exception as exc:
            logger.warning("Không đọc được ma trận thể loại từ Redis: %s", exc)
            return None

        matrix = self._build_matrix(genre_ids, per_genre)
        self._cached_matrix = matrix
        self._write_cache(matrix)
        return matrix

    async def get_matrix(self, force_reload: bool = False) -> GenreMatrix | None:
        """Trả về ma trận từ RAM, file cache hoặc Redis theo thứ tự ưu tiên.

        Dùng ma trận RAM/file khi còn trong TTL 12h; quá hạn thì đọc lại Redis
        để lấy dữ liệu sau cron, không gọi HTTP backend.

        Returns:
            GenreMatrix nếu có dữ liệu, None nếu mọi nguồn đều trống.
        """
        if not force_reload:
            now = time.time()
            if self._cached_matrix is not None:
                if now - self._cached_matrix.loaded_at < GENRE_MATRIX_TTL_SECONDS:
                    return self._cached_matrix
            cached = self._read_cache()
            if cached is not None:
                if now - cached.loaded_at < GENRE_MATRIX_TTL_SECONDS:
                    self._cached_matrix = cached
                    return cached
        return await self.load_matrix_from_redis()

    async def reload_matrix(self) -> GenreMatrix | None:
        """Tải lại ma trận từ Redis sau khi cron backend cập nhật key.

        Returns:
            GenreMatrix mới hoặc None khi Redis chưa có dữ liệu.
        """
        return await self.get_matrix(force_reload=True)

    def invalidate_cache(self) -> None:
        """Xoá ma trận trong RAM và file cache để lần sau phải đọc lại Redis.

        Returns:
            None.
        """
        self._cached_matrix = None
        try:
            self._cache_path.unlink(missing_ok=True)
        except OSError as exc:
            logger.warning("Không xoá được file cache thể loại: %s", exc)

    async def rank_for_user(
        self, user_id: str, top_k: int = 10
    ) -> list[dict[str, Any]]:
        """Xếp hạng phim theo độ tương đồng giữa vector thể loại user và phim.

        Lấy payload `{genreId: score}` của user từ metadata collection, lấy ma
        trận phim từ RAM/file/Redis rồi dựng vector user đúng dimension
        `matrix.genre_ids` trước khi tính cosine.

        Returns:
            Danh sách {id, score, rank}; rỗng khi thiếu payload hoặc ma trận.
        """
        matrix = await self.get_matrix()
        if matrix is None or not matrix.movie_vectors:
            return []

        try:
            weights = await self._user_vector_service.find_genre_payload(
                user_id, settings.vector_user_genre_collection
            )
        except Exception as exc:
            logger.warning("Không đọc được payload thể loại user=%s: %s", user_id, exc)
            return []

        active_ids = [
            genre_id
            for genre_id in matrix.genre_ids
            if abs(weights.get(genre_id, 0.0)) >= GENRE_MIN_ABS_WEIGHT
        ]
        if not active_ids:
            return []

        user_vector = np.array(
            [weights.get(genre_id, 0.0) for genre_id in matrix.genre_ids], dtype=float
        )
        norm = float(np.linalg.norm(user_vector))
        if norm == 0:
            return []
        user_vector = user_vector / norm

        candidates: set[int] = set()
        for genre_id in active_ids:
            candidates.update(
                matrix.genre_movies.get(genre_id, [])[:TOP_MOVIES_PER_GENRE]
            )

        scored = []
        for movie_id in candidates:
            movie_vector = matrix.movie_vectors.get(movie_id)
            if movie_vector is None:
                continue
            score = float(np.dot(user_vector, movie_vector))
            scored.append((movie_id, score))

        scored.sort(key=lambda row: (-row[1], row[0]))
        return [
            {"id": movie_id, "score": score, "rank": rank}
            for rank, (movie_id, score) in enumerate(scored[:top_k], start=1)
        ]

    @staticmethod
    def _normalize_genre_score(score: float, interaction_type: str) -> float:
        """Chuẩn hoá score genre-user theo loại tương tác.

        Rating dùng 3 sao làm trung tính nên có thể âm; các loại còn lại chỉ
        dương và lấy score band 1–5 chia 5.

        Returns:
            Score trong [-1, 1].
        """
        value = float(score)
        action = str(interaction_type or "").lower()
        if action == "rating":
            return max(-1.0, min(1.0, (value - 3.0) / 2.0))
        return max(0.0, min(1.0, value / 5.0))

    async def update_from_event(
        self,
        user_id: str,
        genres: list[dict[str, Any]],
        score: float,
        interaction_type: str,
    ) -> bool:
        """Cập nhật trọng số thể loại từ event `user.genre.update`.

        Đọc payload điểm hiện có từ metadata collection, chuẩn hoá score theo
        `interaction_type`, cộng delta
        `GENRE_WEIGHT_ALPHA * score_norm / max(1, |genres|)` cho từng genre rồi
        clamp về [-1, 1] và ghi lại payload `{genreId: score}`. Vector của record
        chỉ giữ nguyên/placeholder, không dùng để tính điểm.

        Returns:
            True khi đã ghi payload, False khi bỏ qua event hoặc ghi thất bại.
        """
        genre_ids = self._extract_genre_ids(genres)
        if not genre_ids:
            logger.info("Không có thể loại trong event, bỏ qua user=%s", user_id)
            return False

        try:
            weights = await self._user_vector_service.find_genre_payload(
                user_id, settings.vector_user_genre_collection
            )
        except Exception as exc:
            logger.warning("Không đọc được payload thể loại user=%s: %s", user_id, exc)
            return False

        # before
        logger.info(f"Current genre weights for user=%s: %s", user_id, weights)

        normalized = self._normalize_genre_score(score, interaction_type)
        delta = GENRE_WEIGHT_ALPHA * normalized / max(1, len(genre_ids))
        for genre_id in genre_ids:
            current = weights.get(genre_id, 0.0) + delta
            weights[genre_id] = max(GENRE_WEIGHT_MIN, min(GENRE_WEIGHT_MAX, current))

        try:
            logger.info(f"Updated genre weights for user=%s: %s", user_id, weights)
            await self._user_vector_service.save_genre_payload(
                user_id=user_id,
                scores=weights,
                collection_name=settings.vector_user_genre_collection,
            )
        except Exception as exc:
            logger.warning("Không ghi được payload thể loại user=%s: %s", user_id, exc)
            return False
        return True

    async def set_preferred_genres(
        self,
        user_id: str,
        genres: list[dict[str, Any]],
    ) -> bool:
        """Set trọng số genre user chủ động chọn trong preferenceData = 1.0.

        Khác `update_from_event()` (cộng dồn theo ALPHA), hàm này ghi đè trực
        tiếp từng genre id về `GENRE_WEIGHT_MAX`. Chỉ ghi payload metadata
        `genre_scores`, không tạo/cập nhật dense vector.

        Returns:
            True khi đã ghi payload, False khi bỏ qua hoặc ghi thất bại.
        """
        genre_ids = self._extract_genre_ids(genres)
        if not genre_ids:
            logger.info("Không có thể loại hợp lệ trong preference UserId=%s", user_id)
            return False

        try:
            weights = await self._user_vector_service.find_genre_payload(
                user_id, settings.vector_user_genre_collection
            )
        except Exception as exc:
            logger.warning("Không đọc được payload thể loại user=%s: %s", user_id, exc)
            return False

        for genre_id in genre_ids:
            weights[genre_id] = GENRE_WEIGHT_MAX

        try:
            await self._user_vector_service.save_genre_payload(
                user_id,
                weights,
                settings.vector_user_genre_collection,
                updated_from="user.profile",
            )
        except Exception as exc:
            logger.warning("Không ghi được payload thể loại user=%s: %s", user_id, exc)
            return False
        return True

    async def delete_user_vector(self, user_id: str) -> None:
        """Xoá record payload thể loại của người dùng khỏi collection.

        Returns:
            None.
        """
        await self._user_vector_service.delete_named_user_vector(
            user_id, settings.vector_user_genre_collection
        )

    @staticmethod
    def _extract_genre_ids(genres: list[dict[str, Any]]) -> list[int]:
        """Lấy danh sách genreId hợp lệ từ payload event.

        Returns:
            Danh sách id nguyên, bỏ qua phần tử không parse được.
        """
        result: list[int] = []
        for genre in genres or []:
            try:
                result.append(int(genre["id"]))
            except (KeyError, TypeError, ValueError):
                continue
        return result

    @staticmethod
    def _build_matrix(
        genre_ids: list[int], per_genre: dict[int, list[tuple[int, float]]]
    ) -> GenreMatrix:
        """Tạo ma trận chuẩn hoá L2 từ danh sách phim của từng thể loại.

        Returns:
            GenreMatrix với ô giá trị 1 cho mỗi cặp genre↔movie.
        """
        raw: dict[int, dict[int, float]] = {}
        genre_movies: dict[int, list[int]] = {}
        for genre_id, rows in per_genre.items():
            movie_ids = [movie_id for movie_id, _ in rows[:TOP_MOVIES_PER_GENRE]]
            genre_movies[genre_id] = movie_ids
            for movie_id in movie_ids:
                raw.setdefault(movie_id, {})[genre_id] = 1.0

        movie_vectors: dict[int, np.ndarray] = {}
        for movie_id, weights in raw.items():
            vector = np.zeros(len(genre_ids), dtype=float)
            for index, genre_id in enumerate(genre_ids):
                vector[index] = weights.get(genre_id, 0.0)
            norm = float(np.linalg.norm(vector))
            if norm > 0:
                vector = vector / norm
            movie_vectors[movie_id] = vector

        return GenreMatrix(
            genre_ids=genre_ids,
            movie_vectors=movie_vectors,
            genre_movies=genre_movies,
        )

    def _write_cache(self, matrix: GenreMatrix) -> None:
        """Ghi ma trận xuống file để tái dùng khi restart.

        Returns:
            None; lỗi ghi file chỉ được log.
        """
        try:
            self._cache_path.parent.mkdir(parents=True, exist_ok=True)
            joblib.dump(
                {
                    "genre_ids": matrix.genre_ids,
                    "movie_vectors": matrix.movie_vectors,
                    "genre_movies": matrix.genre_movies,
                },
                self._cache_path,
            )
        except (OSError, ValueError, TypeError) as exc:
            logger.warning("Không ghi được file cache thể loại: %s", exc)

    def _read_cache(self) -> GenreMatrix | None:
        """Đọc ma trận từ file cache nếu file còn hợp lệ.

        Returns:
            GenreMatrix hoặc None khi không có cache/cache lỗi.
        """
        if not self._cache_path.exists():
            return None
        try:
            cached = joblib.load(self._cache_path)
            return GenreMatrix(
                genre_ids=list(cached["genre_ids"]),
                movie_vectors=dict(cached["movie_vectors"]),
                genre_movies=dict(cached["genre_movies"]),
                loaded_at=self._cache_path.stat().st_mtime,
            )
        except Exception as exc:
            logger.warning("Không đọc được file cache thể loại: %s", exc)
            return None
