"""
conftest.py
===========
Pytest global fixtures and environment configuration.
"""

import os
import sys

# Thiết lập encoding UTF-8
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

# Thiết lập biến môi trường bắt buộc cho Pydantic Settings trong unit tests
os.environ.setdefault("JWT_SECRET_KEY", "test-jwt-secret-key-32-chars-minimum!!")
os.environ.setdefault("JWT_ALGORITHM", "HS256")
os.environ.setdefault("VECTOR_DB_PROVIDER", "memory")
os.environ.setdefault("RABBITMQ_ENABLED", "false")
os.environ.setdefault("REDIS_ENABLED", "false")
os.environ.setdefault("OTEL_ENABLED", "false")

