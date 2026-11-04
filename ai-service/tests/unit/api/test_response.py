"""Unit test cho response envelope ``src/api/response.py``.

Kiểm tra contract ``{success, statusCode, message, result, pagination}`` mà
backend/ai-service thống nhất, gồm cả các trường hợp biên của pagination.
"""

from datetime import datetime

from starlette.requests import Request

from src.api.response import failure, paginated, success


def make_request(path: str = "/api/recommendations/similar/1", method: str = "GET"):
    return Request(
        {
            "type": "http",
            "http_version": "1.1",
            "method": method,
            "scheme": "http",
            "path": path,
            "raw_path": path.encode(),
            "query_string": b"",
            "root_path": "",
            "headers": [],
            "client": ("127.0.0.1", 12345),
            "server": ("testserver", 80),
        }
    )


class TestSuccessEnvelope:
    def test_default_success_omits_none_fields(self):
        body = success()
        assert body == {"success": True, "statusCode": 200, "message": "Success"}
        assert "result" not in body
        assert "errorCode" not in body
        assert "pagination" not in body

    def test_success_with_data_and_custom_status(self):
        body = success(data={"id": 7}, message="Lấy phim thành công", status_code=201)
        assert body["success"] is True
        assert body["statusCode"] == 201
        assert body["message"] == "Lấy phim thành công"
        assert body["result"] == {"id": 7}

    def test_success_keeps_empty_list_result(self):
        # [] là kết quả hợp lệ, không được bị loại bởi exclude_none.
        body = success(data=[], message="Danh sách rỗng")
        assert body["result"] == []
        assert "result" in body

    def test_success_keeps_zero_and_empty_string_values(self):
        body = success(data=0, message="")
        assert body["result"] == 0
        assert body["message"] == ""


class TestPaginatedEnvelope:
    def test_total_pages_rounds_up_for_remainder(self):
        body = paginated([{"id": 1}], total_items=25, page=2, page_size=10)
        assert body["success"] is True
        assert body["statusCode"] == 200
        assert body["pagination"] == {
            "totalItems": 25,
            "totalPages": 3,
            "currentPage": 2,
            "pageSize": 10,
        }
        assert body["result"] == [{"id": 1}]
        assert len(body["pagination"]) == 4

    def test_exact_multiple_has_no_extra_page(self):
        body = paginated([], total_items=20, page=2, page_size=10)
        assert body["pagination"]["totalPages"] == 2

    def test_zero_items_gives_zero_pages(self):
        body = paginated([], total_items=0, page=1, page_size=10)
        assert body["pagination"]["totalItems"] == 0
        assert body["pagination"]["totalPages"] == 0
        assert body["result"] == []

    def test_zero_page_size_does_not_divide_by_zero(self):
        body = paginated([], total_items=5, page=1, page_size=0)
        assert body["pagination"]["totalPages"] == 0
        assert body["pagination"]["pageSize"] == 0


class TestFailureEnvelope:
    def test_failure_contains_error_metadata(self):
        request = make_request(path="/api/recommendations/similar/999")
        body = failure(
            message="Không tìm thấy phim",
            error_code="MOVIE_NOT_FOUND",
            status_code=404,
            request=request,
        )
        assert body["success"] is False
        assert body["statusCode"] == 404
        assert body["message"] == "Không tìm thấy phim"
        assert body["errorCode"] == "MOVIE_NOT_FOUND"
        assert body["path"] == "/api/recommendations/similar/999"

    def test_failure_timestamp_is_parseable_iso_datetime(self):
        body = failure("Lỗi", "INTERNAL_ERROR", 500, make_request())
        parsed = datetime.fromisoformat(body["timestamp"])
        assert isinstance(parsed, datetime)

    def test_failure_omits_result_and_pagination(self):
        body = failure("Lỗi", "INTERNAL_ERROR", 500, make_request())
        assert "result" not in body
        assert "pagination" not in body
        assert set(body) == {
            "success",
            "statusCode",
            "message",
            "errorCode",
            "timestamp",
            "path",
        }
