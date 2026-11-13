"""Unit test cho dependency ``api/dependencies/auth.py``.

Không cần ``python-jose``/HTTP client: gọi trực tiếp dependency với
``Request.state.user`` được set sẵn.
"""

import asyncio

import pytest
from fastapi import HTTPException
from starlette.requests import Request

from src.api.dependencies.auth import get_current_user
from src.api.schemas import CurrentUser


def make_request() -> Request:
    return Request(
        {
            "type": "http",
            "http_version": "1.1",
            "method": "GET",
            "scheme": "http",
            "path": "/protected",
            "raw_path": b"/protected",
            "query_string": b"",
            "root_path": "",
            "headers": [],
            "client": ("127.0.0.1", 12345),
            "server": ("testserver", 80),
        }
    )


class TestGetCurrentUserDependency:
    def test_missing_user_raises_401_vietnamese_message(self):
        request = make_request()
        request.state.user = None

        with pytest.raises(HTTPException) as exc_info:
            asyncio.run(get_current_user(request))

        error = exc_info.value
        assert error.status_code == 401
        assert error.detail == "Bạn chưa đăng nhập"
        assert error.headers == {"WWW-Authenticate": "Bearer"}

    def test_existing_user_is_returned(self):
        request = make_request()
        user = CurrentUser(
            sub="42", email="a@b.c", fullName="A", scopes=["movie:read"]
        )
        request.state.user = user

        assert asyncio.run(get_current_user(request)) is user
