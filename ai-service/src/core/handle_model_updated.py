from pathlib import Path
from typing import Any

from fastapi import FastAPI

from infra.storage.storage_service import storage_service
from services.IALSRecommendationService import ALS_Implicit, ALSModelService
from services.mapping_service import mapping_service
from utils.logger import setup_logger

logger = setup_logger(name="FastAPI-Recommendations")


async def handle_model_updated(
    als_model_service: ALSModelService,
    payload: dict[str, Any],
) -> None:
    logger.info(f"Received model.updated: {payload}")

    model_key = payload["modelKey"]
    mapping_key = payload["mappingKey"]

    # download model và mapping từ storage
    Path("data/training/models").mkdir(parents=True, exist_ok=True)

    storage_service.download_file(
        object_name=model_key, file_path=f"data/training/models/als_model.npz"
    )
    mapping_service.load_mapping_from_storage(
        object_name=mapping_key, local_path="data/training/models/mappings.json"
    )

    # Download / load model mới
    new_model = ALS_Implicit.load(path=f"data/training/models/als_model.npz")

    # update FastAPI app.state
    als_model_service.set_model(new_model)

    logger.info("ALS model and mappings reloaded successfully")
