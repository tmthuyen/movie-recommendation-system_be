"""Unit test cho ``services/storage_service.py`` — mock S3/R2 client, không gọi mạng."""

from unittest.mock import MagicMock

from botocore.exceptions import ClientError

from src.services.storage_service import StorageService


def make_service(enabled: bool = True, client=None) -> StorageService:
    service = StorageService.__new__(StorageService)  # bỏ qua __init__ (tránh boto3)
    service.bucket_name = "test-bucket"
    service.endpoint_url = "https://r2.example.com"
    service.access_key = "key"
    service.secret_key = "secret"
    service.is_enabled = enabled
    service.s3_client = client
    return service


def client_error() -> ClientError:
    return ClientError({"Error": {"Code": "500", "Message": "boom"}}, "Operation")


class TestDisabledStorage:
    def test_constructor_disables_storage_without_credentials(self):
        service = StorageService()
        assert service.is_enabled is False
        assert service.s3_client is None

    def test_all_operations_are_noop_when_disabled(self):
        service = make_service(enabled=False)
        assert service.upload_file("a.txt") is False
        assert service.download_file("remote.txt", "local.txt") is False
        assert service.delete_file("remote.txt") is False
        assert service.list_files() == []


class TestUpload:
    def test_upload_success_uses_bucket_and_object_name(self):
        client = MagicMock()
        service = make_service(client=client)

        assert service.upload_file("data/file.parquet", "interactions/file.parquet")

        client.upload_file.assert_called_once_with(
            "data/file.parquet", "test-bucket", "interactions/file.parquet"
        )

    def test_upload_uses_basename_when_object_name_missing(self):
        client = MagicMock()
        service = make_service(client=client)

        assert service.upload_file("data/file.parquet") is True

        client.upload_file.assert_called_once_with(
            "data/file.parquet", "test-bucket", "file.parquet"
        )

    def test_upload_client_error_returns_false(self):
        client = MagicMock()
        client.upload_file.side_effect = client_error()
        service = make_service(client=client)

        assert service.upload_file("data/file.parquet") is False


class TestDownload:
    def test_download_creates_parent_directories(self, tmp_path):
        client = MagicMock()
        service = make_service(client=client)
        target = tmp_path / "nested" / "dir" / "mapping.json"

        assert service.download_file("mapping.json", str(target)) is True

        assert target.parent.is_dir()
        client.download_file.assert_called_once_with(
            "test-bucket", "mapping.json", str(target)
        )

    def test_download_client_error_returns_false(self, tmp_path):
        client = MagicMock()
        client.download_file.side_effect = client_error()
        service = make_service(client=client)

        assert service.download_file("mapping.json", str(tmp_path / "m.json")) is False


class TestDeleteAndList:
    def test_delete_success(self):
        client = MagicMock()
        service = make_service(client=client)

        assert service.delete_file("old.parquet") is True
        client.delete_object.assert_called_once_with(
            Bucket="test-bucket", Key="old.parquet"
        )

    def test_delete_client_error_returns_false(self):
        client = MagicMock()
        client.delete_object.side_effect = client_error()
        service = make_service(client=client)
        assert service.delete_file("old.parquet") is False

    def test_list_returns_keys(self):
        client = MagicMock()
        client.list_objects_v2.return_value = {
            "Contents": [{"Key": "a"}, {"Key": "b"}]
        }
        service = make_service(client=client)

        assert service.list_files("prefix/") == ["a", "b"]
        client.list_objects_v2.assert_called_once_with(
            Bucket="test-bucket", Prefix="prefix/"
        )

    def test_list_without_contents_returns_empty_list(self):
        client = MagicMock()
        client.list_objects_v2.return_value = {}
        service = make_service(client=client)
        assert service.list_files() == []

    def test_list_client_error_returns_empty_list(self):
        client = MagicMock()
        client.list_objects_v2.side_effect = client_error()
        service = make_service(client=client)
        assert service.list_files() == []
