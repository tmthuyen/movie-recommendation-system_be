"""Unit test cho ``utils/logger.py`` và fixture ``logs/`` ghi được trong conftest."""

import logging

from src.utils.logger import setup_logger


def flush_handlers(logger: logging.Logger) -> None:
    for handler in logger.handlers:
        handler.flush()


class TestSetupLogger:
    def test_creates_dated_log_file_and_writes_message(
        self, logs_dir, unique_logger_name
    ):
        logger = setup_logger(unique_logger_name)
        logger.info("xin chào pytest")

        files = list(logs_dir.glob(f"{unique_logger_name}_*.log"))
        assert len(files) == 1
        flush_handlers(logger)
        assert "xin chào pytest" in files[0].read_text(encoding="utf-8")

    def test_custom_filename_is_used(self, logs_dir, unique_logger_name):
        logger = setup_logger(unique_logger_name, filename="custom-test.log")
        logger.warning("cảnh báo")

        target = logs_dir / "custom-test.log"
        assert target.exists()
        flush_handlers(logger)
        assert "cảnh báo" in target.read_text(encoding="utf-8")

    def test_repeated_setup_does_not_duplicate_handlers(self, unique_logger_name):
        first = setup_logger(unique_logger_name)
        handler_count = len(first.handlers)
        second = setup_logger(unique_logger_name)

        assert first is second
        assert len(second.handlers) == handler_count

    def test_logger_level_is_debug_and_has_console_handler(self, unique_logger_name):
        logger = setup_logger(unique_logger_name)
        assert logger.level == logging.DEBUG
        assert any(
            isinstance(handler, logging.StreamHandler)
            and not isinstance(handler, logging.FileHandler)
            for handler in logger.handlers
        )
