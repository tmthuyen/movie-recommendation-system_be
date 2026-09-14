from math import ceil
from typing import Any

from .schemas import ApiResponse, Pagination


def success(data: Any = None, message: str = "Success", status_code: int = 200) -> dict:
    return ApiResponse(statusCode=status_code, message=message, data=data).model_dump(exclude_none=True)


def paginated(data: Any, total_items: int, page: int, page_size: int, message: str = "Success") -> dict:
    return ApiResponse(
        statusCode=200,
        message=message,
        data=data,
        metadata=Pagination(
            totalItems=total_items,
            totalPages=ceil(total_items / page_size) if page_size else 0,
            currentPage=page,
            pageSize=page_size,
        ),
    ).model_dump(exclude_none=True)


def failure(message: str, error_code: str, status_code: int) -> dict:
    return ApiResponse(statusCode=status_code, message=message, errorCode=error_code).model_dump(exclude_none=True)