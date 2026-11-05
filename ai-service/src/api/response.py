from datetime import datetime, timezone
from math import ceil
from typing import TypeVar

from fastapi import Request

from .schemas import ApiResponse, Pagination

T = TypeVar("T")


def success(
    data: T,
    message: str = "Lấy dữ liệu thành công",
    status_code: int = 200,
) -> ApiResponse[T]:
    """Trả về thành công với dữ liệu"""
    return ApiResponse[T](
        success=True,
        statusCode=status_code,
        message=message,
        result=data,
    )


def paginated(
    data: T,
    total: int,
    page: int,
    limit: int,
    message: str = "Danh sách kết quả",
) -> ApiResponse[T]:
    """Trả về phân trang

    Args:
        data (T): Dữ liệu với generic T
        total (int): số lượng item
        page (int): trang hiện tại
        limit (int): kích thước 1 trang
        message (str, optional): thông báo trả về. Defaults to "Danh sách kết quả".

    Returns:
        ApiResponse[T]: _description_
    """
    return ApiResponse[T](
        success=True,
        statusCode=200,
        message=message,
        result=data,
        pagination=Pagination(
            total=total,
            totalPages=ceil(total / limit) if limit else 0,
            page=page,
            limit=limit,
        ),
    )


def failure(
    message: str,
    error_code: str,
    status_code: int,
    request: Request,
) -> ApiResponse[None]:
    """
    Trả về lỗi
    """
    return ApiResponse[None](
        success=False,
        statusCode=status_code,
        message=message,
        errorCode=error_code,
        timestamp=datetime.now(timezone.utc),
        path=request.url.path,
    )
