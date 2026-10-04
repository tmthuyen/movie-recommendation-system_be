import logging
from typing import Dict, Optional
import pandas as pd
from pathlib import Path
import json

from services.storage_service import storage_service

logger = logging.getLogger(__name__)

class MappingService:
    def __init__(self):
        self.user_to_idx: Dict[str, int] = {}
        self.idx_to_user: Dict[int, str] = {}
        # Movies are mapped 1-1 with their integer IDs in this architecture
        
    def load_mapping_from_file(self, file_path: str) -> bool:
        """Load user mapping from a parquet file."""
        if not Path(file_path).exists():
            logger.error(f"Mapping file not found: {file_path}")
            return False
            
        try:
            with open(file_path, "r") as f:
                data = json.load(f)
            
            # The JSON has {"users": {"uuid": idx, ...}, "movies": {"id_str": idx, ...}}
            users_dict = data.get("users", {})
            self.user_to_idx = {str(k): int(v) for k, v in users_dict.items()}
            self.idx_to_user = {int(v): str(k) for k, v in self.user_to_idx.items()}
            logger.info(f"Loaded {len(self.user_to_idx)} user mappings successfully.")
            return True
        except Exception as e:
            logger.error(f"Failed to load mapping from {file_path}: {e}")
            return False

    def load_mapping_from_storage(self, object_name: str, local_path: str) -> bool:
        """Download from R2 and load mapping into memory."""
        if storage_service.download_file(object_name, local_path):
            return self.load_mapping_from_file(local_path)
        return False
        
    def get_user_idx(self, user_uuid: str) -> Optional[int]:
        """Convert string UUID to internal integer index."""
        return self.user_to_idx.get(str(user_uuid))
        
    def get_user_uuid(self, user_idx: int) -> Optional[str]:
        """Convert internal integer index back to string UUID."""
        return self.idx_to_user.get(user_idx)

mapping_service = MappingService()
