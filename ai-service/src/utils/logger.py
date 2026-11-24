import json
import logging
import os
from datetime import datetime, timezone


class JsonFormatter(logging.Formatter):
    """JSON log format để CloudWatch/Loki parse theo level/service."""

    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "timestamp": datetime.fromtimestamp(
                record.created, tz=timezone.utc
            ).isoformat(),
            "level": record.levelname.lower(),
            "service": os.getenv("SERVICE_NAME", "movie-ai-service"),
            "logger": record.name,
            "message": record.getMessage(),
            "module": record.module,
            "function": record.funcName,
            "line": record.lineno,
        }
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False, default=str)


def setup_logger(name="project_logger", filename=None):
    """Tạo logger ghi ra stdout/stderr.

    Không ghi file trong container: Docker/ECS thu stdout/stderr và chuyển
    tới Loki hoặc CloudWatch. `filename` giữ lại để tương thích call site cũ.

    Args:
        name (str, optional): Tên logger. Defaults to "project_logger".
        filename (str, optional): Không dùng nữa.

    Returns:
        logging.Logger: Logger đã cấu hình.
    """
    logger = logging.getLogger(name)
    logger.setLevel((os.getenv("LOG_LEVEL") or "DEBUG").upper())
    logger.propagate = False

    # Tránh bị nhân đôi dòng log nếu gọi nhiều lần
    if not logger.handlers:
        log_format = os.getenv("LOG_FORMAT") or (
            "json" if os.getenv("ENVIRONMENT") == "production" else "text"
        )

        if log_format == "json":
            formatter: logging.Formatter = JsonFormatter()
        else:
            formatter = logging.Formatter(
                "%(asctime)s - [%(levelname)s] - %(filename)s - %(message)s",
                datefmt="%Y-%m-%d %H:%M:%S",
            )

        console_handler = logging.StreamHandler()
        console_handler.setFormatter(formatter)
        logger.addHandler(console_handler)

    return logger
