from fastapi import HTTPException
from fastapi import Request
from api.schemas import CurrentUser
from typing import Annotated


async def get_current_user(request: Request) -> CurrentUser:
    payload: CurrentUser | None = getattr(
        request.state,
        "user",
        None,
    )

    if not payload:
        raise HTTPException(
            status_code=401,
            detail="Chưa đăng nhập",
            headers={
                "WWW-Authenticate": "Bearer"
            },
        )
        
    return payload