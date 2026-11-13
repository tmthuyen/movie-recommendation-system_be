from typing import Annotated

from fastapi import HTTPException, Request

from api.schemas import CurrentUser


async def get_current_user(request: Request) -> CurrentUser:
    payload: CurrentUser | None = getattr(
        request.state,
        "user",
        None,
    )

    if payload:
        return payload

    auth_error = getattr(request.state, "auth_error", None)

    if auth_error == "TOKEN_EXPIRED":
        raise HTTPException(
            status_code=401,
            detail="Token đã hết hạn",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if auth_error:
        raise HTTPException(
            status_code=401,
            detail="Token không hợp lệ",
            headers={"WWW-Authenticate": "Bearer"},
        )

    raise HTTPException(
        status_code=401,
        detail="Bạn chưa đăng nhập",
        headers={"WWW-Authenticate": "Bearer"},
    )
