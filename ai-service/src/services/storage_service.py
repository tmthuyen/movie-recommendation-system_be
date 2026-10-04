import logging
import os
import boto3
from botocore.exceptions import ClientError
from pathlib import Path
from typing import Optional

from core.config import get_settings

logger = logging.getLogger(__name__)

class StorageService:
    def __init__(self):
        settings = get_settings()
        self.bucket_name = settings.s3_bucket_name
        self.endpoint_url = settings.s3_endpoint
        self.access_key = settings.s3_access_key
        self.secret_key = settings.s3_secret_key
        self.is_enabled = bool(self.endpoint_url and self.access_key and self.secret_key)
        
        if self.is_enabled:
            self.s3_client = boto3.client(
                's3',
                endpoint_url=self.endpoint_url,
                aws_access_key_id=self.access_key,
                aws_secret_access_key=self.secret_key,
                region_name='auto' # Cloudflare R2 / MinIO uses 'auto' or 'us-east-1'
            )
        else:
            self.s3_client = None
            logger.warning("R2 Storage is not fully configured. StorageService will be bypassed.")

    def upload_file(self, file_path: str, object_name: Optional[str] = None) -> bool:
        """Upload a file to an S3/R2 bucket"""
        if not self.is_enabled:
            return False
            
        if object_name is None:
            object_name = os.path.basename(file_path)

        try:
            self.s3_client.upload_file(file_path, self.bucket_name, object_name)
            logger.info(f"Successfully uploaded {file_path} to {self.bucket_name}/{object_name}")
            return True
        except ClientError as e:
            logger.error(f"Failed to upload {file_path} to R2: {e}")
            return False

    def download_file(self, object_name: str, file_path: str) -> bool:
        """Download a file from an S3/R2 bucket"""
        if not self.is_enabled:
            return False
            
        # Ensure parent directories exist
        Path(file_path).parent.mkdir(parents=True, exist_ok=True)
            
        try:
            self.s3_client.download_file(self.bucket_name, object_name, file_path)
            logger.info(f"Successfully downloaded {object_name} to {file_path}")
            return True
        except ClientError as e:
            logger.error(f"Failed to download {object_name} from R2: {e}")
            return False

    def delete_file(self, object_name: str) -> bool:
        """Delete a file from an S3/R2 bucket"""
        if not self.is_enabled:
            return False
            
        try:
            self.s3_client.delete_object(Bucket=self.bucket_name, Key=object_name)
            logger.info(f"Successfully deleted {object_name} from {self.bucket_name}")
            return True
        except ClientError as e:
            logger.error(f"Failed to delete {object_name} from R2: {e}")
            return False

    def list_files(self, prefix: str = "") -> list:
        """List files in the bucket with an optional prefix"""
        if not self.is_enabled:
            return []
            
        try:
            response = self.s3_client.list_objects_v2(Bucket=self.bucket_name, Prefix=prefix)
            if 'Contents' in response:
                return [obj['Key'] for obj in response['Contents']]
            return []
        except ClientError as e:
            logger.error(f"Failed to list files with prefix {prefix} from R2: {e}")
            return []

storage_service = StorageService()
