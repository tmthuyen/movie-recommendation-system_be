"""Unit test cho ``utils/config_loader.py`` — dùng thư mục config tạm."""

import pytest

import src.utils.config_loader as config_module


def make_config_dir(tmp_path):
    config_dir = tmp_path / "config"
    config_dir.mkdir()
    return config_dir


class TestLoadYamlConfig:
    def test_loads_valid_yaml(self, tmp_path, monkeypatch):
        config_dir = make_config_dir(tmp_path)
        (config_dir / "config.yaml").write_text(
            "model:\n  name: tfidf\n  top_k: 10\n", encoding="utf-8"
        )
        monkeypatch.setattr(config_module, "PROJECT_ROOT", str(tmp_path))

        config = config_module.load_yaml_config()

        assert config == {"model": {"name": "tfidf", "top_k": 10}}

    def test_loads_custom_config_name(self, tmp_path, monkeypatch):
        config_dir = make_config_dir(tmp_path)
        (config_dir / "custom.yaml").write_text("a: 1\n", encoding="utf-8")
        monkeypatch.setattr(config_module, "PROJECT_ROOT", str(tmp_path))

        assert config_module.load_yaml_config("custom.yaml") == {"a": 1}

    def test_missing_file_raises_file_not_found(self, tmp_path, monkeypatch):
        make_config_dir(tmp_path)
        monkeypatch.setattr(config_module, "PROJECT_ROOT", str(tmp_path))

        with pytest.raises(FileNotFoundError, match="config/"):
            config_module.load_yaml_config("missing.yaml")

    def test_invalid_yaml_raises_wrapped_exception(self, tmp_path, monkeypatch):
        config_dir = make_config_dir(tmp_path)
        (config_dir / "broken.yaml").write_text("a: [unclosed", encoding="utf-8")
        monkeypatch.setattr(config_module, "PROJECT_ROOT", str(tmp_path))

        with pytest.raises(Exception, match="lỗi khi đọc file config"):
            config_module.load_yaml_config("broken.yaml")

    def test_non_mapping_yaml_raises_wrapped_exception(self, tmp_path, monkeypatch):
        config_dir = make_config_dir(tmp_path)
        (config_dir / "list.yaml").write_text("- a\n- b\n", encoding="utf-8")
        monkeypatch.setattr(config_module, "PROJECT_ROOT", str(tmp_path))

        with pytest.raises(Exception, match="lỗi khi đọc file config"):
            config_module.load_yaml_config("list.yaml")
