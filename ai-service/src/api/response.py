from datetime import datetime
from math import ceil
from typing import Any

from .schemas import ApiResponse, Pagination


def success(data: Any = None, message: str = "Success", status_code: int = 200) -> dict:
    return ApiResponse(
        success=True,
        statusCode=status_code, 
        message=message, 
        result=data
    ).model_dump(exclude_none=True)


def paginated(data: Any, total_items: int, page: int, page_size: int, message: str = "Success") -> dict:
    return ApiResponse(
        success=True,
        statusCode=200,
        message=message,
        result=data,
        pagination=Pagination(
            totalItems=total_items,
            totalPages=ceil(total_items / page_size) if page_size else 0,
            currentPage=page,
            pageSize=page_size,
        ),
    ).model_dump(exclude_none=True)


def failure(message: str, error_code: str, status_code: int) -> dict:
    return ApiResponse(
        success=False,
        statusCode=status_code, 
        message=message, 
        errorCode=error_code,
        timestamp=datetime.now().isoformat(),
        # path=request.path,
    ).model_dump(exclude_none=True)