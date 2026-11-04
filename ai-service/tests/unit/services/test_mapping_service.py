"""Unit test cho ``services/mapping_service.py`` (logic thuần, không cần R2)."""

import json

import src.services.mapping_service as mapping_module
from src.services.mapping_service import MappingService


def write_mapping(path, payload):
    path.write_text(json.dumps(payload), encoding="utf-8")
    return path


class TestLoadMappingFromFile:
    def test_loads_bidirectional_mapping(self, storage_tmp_dir):
        path = write_mapping(
            storage_tmp_dir / "mapping.json",
            {
                "users": {"uuid-a": 1, "uuid-b": "2"},
                "movies": {"10": 0},
            },
        )
        service = MappingService()

        assert service.load_mapping_from_file(str(path)) is True
        assert service.get_user_idx("uuid-a") == 1
        assert service.get_user_idx("uuid-b") == 2
        assert service.get_user_uuid(2) == "uuid-b"
        assert service.get_user_idx("missing") is None
        assert service.get_user_uuid(999) is None

    def test_missing_file_returns_false(self, storage_tmp_dir):
        service = MappingService()
        assert service.load_mapping_from_file(str(storage_tmp_dir / "nope.json")) is False
        assert service.user_to_idx == {}

    def test_invalid_json_returns_false(self, storage_tmp_dir):
        path = storage_tmp_dir / "broken.json"
        path.write_text("{not-json", encoding="utf-8")
        service = MappingService()
        assert service.load_mapping_from_file(str(path)) is False

    def test_non_integer_index_returns_false(self, storage_tmp_dir):
        path = write_mapping(
            storage_tmp_dir / "bad-value.json", {"users": {"uuid-a": "not-a-number"}}
        )
        service = MappingService()
        assert service.load_mapping_from_file(str(path)) is False

    def test_failed_reload_keeps_previous_mapping(self, storage_tmp_dir):
        service = MappingService()
        good = write_mapping(
            storage_tmp_dir / "good.json", {"users": {"uuid-a": 1}}
        )
        broken = storage_tmp_dir / "broken.json"
        broken.write_text("{oops", encoding="utf-8")

        assert service.load_mapping_from_file(str(good)) is True
        assert service.load_mapping_from_file(str(broken)) is False
        assert service.get_user_idx("uuid-a") == 1

    def test_empty_users_is_valid(self, storage_tmp_dir):
        path = write_mapping(storage_tmp_dir / "empty.json", {"users": {}})
        service = MappingService()
        assert service.load_mapping_from_file(str(path)) is True
        assert service.get_user_idx("any") is None


class TestLoadMappingFromStorage:
    def test_download_failure_returns_false(self, monkeypatch):
        service = MappingService()
        monkeypatch.setattr(
            mapping_module.storage_service, "download_file", lambda *_: False
        )
        assert service.load_mapping_from_storage("remote.json", "local.json") is False

    def test_download_success_then_loads_file(self, storage_tmp_dir, monkeypatch):
        local_path = storage_tmp_dir / "downloaded.json"

        def fake_download(object_name, destination):
            assert object_name == "mappings/users.json"
            write_mapping(
                storage_tmp_dir / "downloaded.json",
                {"users": {"uuid-x": 42}},
            )
            return True

        monkeypatch.setattr(mapping_module.storage_service, "download_file", fake_download)

        service = MappingService()
        assert (
            service.load_mapping_from_storage(
                "mappings/users.json", str(local_path)
            )
            is True
        )
        assert service.get_user_idx("uuid-x") == 42
