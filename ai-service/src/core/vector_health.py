from __future__ import annotations

from typing import Any

from utils import setup_logger

logger = setup_logger(name="FastAPI-Recommendations")


async def build_vector_db_health(vector_store: Any, settings: Any) -> dict[str, Any]:
    """Return provider, location and collection counts for a vector store."""
    if vector_store is None:
        return {
            "provider": None,
            "location": None,
            "collections": {},
            "moviesIndexed": False,
        }

    counts = await vector_store.collection_counts()
    movies_collection = getattr(settings, "vector_collection", "movies")
    return {
        "provider": getattr(settings, "vector_db_provider", None),
        "location": vector_store.location,
        "collections": counts,
        "moviesIndexed": bool(counts.get(movies_collection)),
    }


async def log_vector_db_health(vector_store: Any, settings: Any) -> dict[str, Any]:
    """Log vector DB location/counts and warn about empty collections."""
    health = await build_vector_db_health(vector_store, settings)

    if not getattr(settings, "vector_db_enabled", True):
        logger.info("Vector DB disabled; collection check skipped.")
        return health

    counts = health["collections"]
    logger.info(
        "Vector DB ready provider=%s location=%s collections=%s",
        health["provider"],
        health["location"],
        counts,
    )

    movies_collection = getattr(settings, "vector_collection", "movies")
    if not health["moviesIndexed"]:
        logger.warning(
            "Collection '%s' is empty: semantic search and similar movies will "
            "return no results/404. Check CHROMA_PERSIST_DIR or rebuild the index.",
            movies_collection,
        )

    hybrid_collections = (
        getattr(settings, "vector_user_cf_collection", "user_cf_vectors"),
        getattr(settings, "vector_movie_cf_collection", "movie_cf_vectors"),
        getattr(settings, "vector_user_profile_collection", "user_profile_vectors"),
    )
    for name in hybrid_collections:
        if counts.get(name) == 0:
            logger.warning(
                "Collection '%s' is empty: hybrid recommendations will lack data.",
                name,
            )

    return health
