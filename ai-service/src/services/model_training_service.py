import os
import json
import glob
import pandas as pd
import numpy as np
from pathlib import Path
import pyarrow.parquet as pq
from datetime import datetime
import logging
from typing import Dict, Any, Tuple
import scipy.sparse as sparse

# Use implicit library for ALS
from implicit.als import AlternatingLeastSquares

from core.config import get_settings
from services.storage_service import storage_service

from typing import TYPE_CHECKING
if TYPE_CHECKING:
    from core.integrations import VectorStore

logger = logging.getLogger(__name__)

class ModelTrainingService:
    def __init__(self, vector_store: "VectorStore"):
        self.settings = get_settings()
        self.vector_store = vector_store
        
        # Paths
        self.data_dir = Path("data/training")
        self.parquet_dir = self.data_dir / "interactions_parquet"
        self.models_dir = self.data_dir / "models"
        
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.parquet_dir.mkdir(exist_ok=True)
        self.models_dir.mkdir(exist_ok=True)
        
    async def run_training_pipeline(self) -> bool:
        """Run the full end-to-end retraining pipeline using implicit ALS."""
        logger.info("Starting ALS Retraining Pipeline (Phase 4)...")
        try:
            # 1. Download Data from R2
            await self._download_training_data()
            
            # 2. Preprocess Data & Create Sparse Matrix
            user_item_matrix, user_mapping, movie_mapping, full_df = self._preprocess_data()
            
            # 3. Train ALS Model
            if user_item_matrix is not None:
                model = self._train_model(user_item_matrix)
                
                # 4. Update ChromaDB with new vectors
                await self._update_chroma_vectors(model, user_mapping, movie_mapping)
                
                # 5. Upload Model & Mapping to R2
                self._upload_artifacts(model, user_mapping, movie_mapping)
                
                # 6. Aggregate to Master Data and Delete old batches
                self._manage_r2_data(full_df)
            
            # 7. Cleanup
            self._cleanup_local_data()
            
            logger.info("Retraining Pipeline completed successfully.")
            return True
        except Exception as e:
            logger.error(f"Training pipeline failed: {e}")
            return False
            
    async def _download_training_data(self):
        logger.info("Downloading interaction data from R2...")
        # Tải danh sách file từ R2
        files = storage_service.list_files("interactions/")
        self.r2_parquet_files = [f for f in files if f.endswith(".parquet")]
        
        if not self.r2_parquet_files:
            logger.warning("No parquet files found in R2 under interactions/ prefix.")
            
        for s3_key in self.r2_parquet_files:
            local_path = self.parquet_dir / os.path.basename(s3_key)
            storage_service.download_file(s3_key, str(local_path))
            logger.info(f"Downloaded {s3_key} to {local_path}")
        
    def _preprocess_data(self) -> Tuple[Any, dict, dict, pd.DataFrame]:
        logger.info("Preprocessing data and creating mappings...")
        
        parquet_files = glob.glob(str(self.parquet_dir / "*.parquet"))
        
        if not parquet_files:
            logger.warning("No local parquet files to process. Skipping training.")
            return None, {}, {}
            
        # Đọc tất cả các file parquet
        df_list = []
        for file in parquet_files:
            try:
                df = pd.read_parquet(file)
                df_list.append(df)
            except Exception as e:
                logger.error(f"Failed to read parquet file {file}: {e}")
                
        if not df_list:
            return None, {}, {}
            
        full_df = pd.concat(df_list, ignore_index=True)
        
        # Cần cột userId và movieId. Nếu thiếu, bỏ qua
        if "userId" not in full_df.columns or "movieId" not in full_df.columns:
            logger.error("Data missing 'userId' or 'movieId' columns.")
            return None, {}, {}
            
        # Mapping UUIDs và Movie IDs sang int index (0 to N-1)
        unique_users = full_df["userId"].unique()
        unique_movies = full_df["movieId"].unique()
        
        user_mapping = {str(u): i for i, u in enumerate(unique_users)}
        movie_mapping = {str(m): i for i, m in enumerate(unique_movies)}
        
        # Chuyển đổi DataFrame sang Indices
        full_df["user_idx"] = full_df["userId"].astype(str).map(user_mapping)
        full_df["movie_idx"] = full_df["movieId"].astype(str).map(movie_mapping)
        
        # Nếu có cột rating thì dùng, không thì mặc định 1.0
        if "rating" in full_df.columns:
            ratings = full_df["rating"].astype(float).values
        else:
            ratings = np.ones(len(full_df), dtype=float)
            
        rows = full_df["user_idx"].values
        cols = full_df["movie_idx"].values
        
        # Tạo ma trận thưa User-Item
        user_item_matrix = sparse.csr_matrix(
            (ratings, (rows, cols)), 
            shape=(len(user_mapping), len(movie_mapping))
        )
        
        logger.info(f"Created User-Item matrix with shape {user_item_matrix.shape}")
        
        # Lưu full_df lại để dùng cho bước merge master data
        return user_item_matrix, user_mapping, movie_mapping, full_df
        
    def _train_model(self, user_item_matrix: sparse.csr_matrix) -> AlternatingLeastSquares:
        logger.info("Training Implicit ALS Model...")
        
        model = AlternatingLeastSquares(
            factors=self.settings.cf_vector_size,
            regularization=0.1,
            iterations=20,
            use_gpu=False
        )
        
        # Implicit >= 0.6.0 mong đợi ma trận User-Item cho quá trình huấn luyện
        model.fit(user_item_matrix)
        
        logger.info("ALS Model training complete.")
        return model
        
    async def _update_chroma_vectors(self, model: AlternatingLeastSquares, user_mapping: dict, movie_mapping: dict):
        logger.info("Syncing new CF vectors to ChromaDB...")
        
        user_factors = model.user_factors
        item_factors = model.item_factors
            
        for user_uuid, idx in user_mapping.items():
            vec = user_factors[idx].tolist()
            await self.vector_store.upsert(
                movie_id=int(idx),
                vector=vec,
                payload={"user_uuid": user_uuid, "updated_from": "batch_train"},
                collection_name=self.settings.vector_user_cf_collection
            )
            
        for movie_id_str, idx in movie_mapping.items():
            vec = item_factors[idx].tolist()
            m_id = int(float(movie_id_str)) # Handle strings like '100.0'
            await self.vector_store.upsert(
                movie_id=m_id,
                vector=vec,
                payload={"movieId": m_id, "updated_from": "batch_train"},
                collection_name=self.settings.vector_movie_cf_collection
            )
        logger.info("ChromaDB sync complete.")
        
    def _upload_artifacts(self, model: AlternatingLeastSquares, user_mapping: dict, movie_mapping: dict):
        logger.info("Saving and Uploading new Model and Mapping to R2...")
        
        model_path = self.models_dir / "als_model.npz"
        model.save(str(model_path))
        
        mapping_path = self.models_dir / "mappings.json"
        with open(mapping_path, "w") as f:
            json.dump({"users": user_mapping, "movies": movie_mapping}, f)
            
        storage_service.upload_file(str(model_path), "models/als_model.npz")
        storage_service.upload_file(str(mapping_path), "models/mappings.json")
        logger.info("Artifacts uploaded to R2 successfully.")
        
    def _manage_r2_data(self, full_df: pd.DataFrame):
        """Gộp các file batch mới vào master data và xóa các batch cũ trên R2."""
        logger.info("Managing R2 dataset files...")
        master_path = self.parquet_dir / "master_interactions.parquet"
        full_df.to_parquet(master_path, index=False)
        
        # Ghi đè file master lên R2
        storage_service.upload_file(str(master_path), "interactions/master_interactions.parquet")
        
        # Xóa các file batch cũ (trừ file master)
        for s3_key in self.r2_parquet_files:
            if "master_interactions.parquet" not in s3_key:
                storage_service.delete_file(s3_key)
                
        logger.info("Successfully merged to master and cleaned up old batches on R2.")
        
    def _cleanup_local_data(self):
        logger.info("Cleaning up local training data...")
        
        files_to_delete = []
        files_to_delete.extend(glob.glob(str(self.parquet_dir / "*.parquet")))
        files_to_delete.extend(glob.glob(str(self.models_dir / "*")))
        
        for f in files_to_delete:
            try:
                os.remove(f)
            except Exception as e:
                logger.warning(f"Could not remove file {f}: {e}")
        
        logger.info("Local cleanup complete.")
