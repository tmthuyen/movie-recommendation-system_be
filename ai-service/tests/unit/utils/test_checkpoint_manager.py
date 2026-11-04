"""Unit test cho ``utils/checkpoint_manager.py`` — HIỆN CHƯA CÓ HÀNH VI ĐỂ TEST.

Phát hiện khi đọc source: **toàn bộ 213 dòng** của
``src/utils/checkpoint_manager.py`` đang bị comment (mỗi dòng bắt đầu bằng
``#``), nên module import được nhưng không định nghĩa ``CheckpointManager``
hay bất kỳ hàm public nào. Đây là dead code, không được nơi nào import
(đã kiểm tra bằng grep toàn ``ai-service``).

Vì quy tắc của task là **không sửa code production**, file test này:

1. Ghi nhận hiện trạng bằng 2 test "guard" — sẽ **fail** ngay khi ai đó khôi
   phục code mà quên bật lại các test hành vi bên dưới (nhắc maintainer cập
   nhật file này).
2. Đánh dấu ``skip`` các test hành vi theo đúng contract được mô tả trong
   phần comment của source (save / load_latest / load_best / cleanup + rotate,
   file hỏng hoặc thiếu). Chúng chỉ chạy được sau khi ``CheckpointManager``
   được implement thật.

Xem báo cáo cuối: module này thuộc phần "bỏ qua" của đợt bổ sung unit test.
"""

from pathlib import Path

import pytest

import src.utils.checkpoint_manager as checkpoint_module

SOURCE_PATH = Path(checkpoint_module.__file__)


class TestCheckpointManagerModuleState:
    """Guard cho hiện trạng dead-code của module."""

    def test_module_exposes_no_public_api(self):
        public_names = [
            name for name in vars(checkpoint_module) if not name.startswith("_")
        ]

        assert public_names == []
        assert not hasattr(checkpoint_module, "CheckpointManager")

    def test_source_file_is_entirely_commented_out(self):
        active_lines = [
            line
            for line in SOURCE_PATH.read_text(encoding="utf-8").splitlines()
            if line.strip() and not line.lstrip().startswith("#")
        ]

        assert active_lines == [], (
            "checkpoint_manager.py đã có code hoạt động — hãy bỏ skip và cập nhật "
            "các test hành vi trong TestCheckpointManagerContract."
        )


class TestCheckpointManagerContract:
    """Contract theo phần comment của source — chưa thể chạy."""

    @pytest.mark.skip(
        reason="CheckpointManager chưa được implement (source 100% comment)"
    )
    def test_save_writes_epoch_checkpoint_and_meta_json(self, tmp_path):
        from src.utils.checkpoint_manager import CheckpointManager

        manager = CheckpointManager(str(tmp_path / "ckpt"), keep_last_n=3)

        path = manager.save(
            epoch=1,
            model=_StubStateful(),
            optimizer=_StubStateful(),
            history={"train_loss": [1.5], "val_loss": [1.2]},
            meta={"best_epoch": 1, "best_val_perplexity": 12.0},
        )

        assert Path(path).name == "epoch_001.pt"
        assert (tmp_path / "ckpt" / "meta.json").exists()

    @pytest.mark.skip(
        reason="CheckpointManager chưa được implement (source 100% comment)"
    )
    def test_load_latest_returns_none_when_no_checkpoint(self, tmp_path):
        from src.utils.checkpoint_manager import CheckpointManager

        manager = CheckpointManager(str(tmp_path / "ckpt"))

        assert manager.has_checkpoint() is False
        assert manager.load_latest() is None
        assert manager.load_best() is None

    @pytest.mark.skip(
        reason="CheckpointManager chưa được implement (source 100% comment)"
    )
    def test_cleanup_rotates_old_epochs_but_keeps_best(self, tmp_path):
        from src.utils.checkpoint_manager import CheckpointManager

        manager = CheckpointManager(str(tmp_path / "ckpt"), keep_last_n=2)
        for epoch in range(1, 5):
            manager.save(
                epoch=epoch,
                model=_StubStateful(),
                optimizer=_StubStateful(),
                history={},
                meta={"best_epoch": 2},
                is_best=epoch == 2,
            )

        remaining = sorted(p.name for p in (tmp_path / "ckpt").glob("epoch_*.pt"))
        assert remaining == ["epoch_003.pt", "epoch_004.pt"]
        assert (tmp_path / "ckpt" / "best.pt").exists()

    @pytest.mark.skip(
        reason="CheckpointManager chưa được implement (source 100% comment)"
    )
    def test_corrupt_or_missing_meta_file_is_reported(self, tmp_path):
        from src.utils.checkpoint_manager import CheckpointManager

        manager = CheckpointManager(str(tmp_path / "ckpt"))
        (tmp_path / "ckpt" / "meta.json").write_text("{broken", encoding="utf-8")

        with pytest.raises(Exception):
            manager.get_meta()


class _StubStateful:
    """Đối tượng tối thiểu có ``state_dict`` cho contract ở trên."""

    def state_dict(self) -> dict:
        return {"weight": 1}
