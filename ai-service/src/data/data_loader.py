import ast
import hashlib
from pathlib import Path
from typing import Any, List, Tuple, Union

import pandas as pd

from utils.logger import setup_logger

_MISSING_TEXT_VALUES = {"", "nan", "none", "null"}


def extract_genre_names(raw: Any) -> str:
    """Chuyển genres (JSON-list string hoặc list) sang chuỗi tên thể loại cách nhau bằng khoảng trắng."""
    if raw is None:
        return ""

    if isinstance(raw, (list, tuple)):
        names: list[str] = []
        for genre in raw:
            if isinstance(genre, dict):
                value = genre.get("name") or genre.get("vi_name") or ""
            elif isinstance(genre, str):
                value = genre
            else:
                continue
            text = str(value).strip()
            if text.lower() not in _MISSING_TEXT_VALUES:
                names.append(text)
        return " ".join(names)

    if not isinstance(raw, str) or not raw.strip():
        return ""

    text = raw.strip()
    if text.lower() in _MISSING_TEXT_VALUES:
        return ""
    try:
        items = ast.literal_eval(text)
    except Exception:
        return text
    if isinstance(items, (list, tuple)):
        return extract_genre_names(list(items))
    return text


def safe_int(val: Any) -> int:
    """Chuyển giá trị sang int một cách an toàn, trả về 0 nếu lỗi."""
    try:
        return int(float(val))
    except (TypeError, ValueError):
        return 0


def safe_float(val: Any) -> float:
    """Chuyển giá trị sang float một cách an toàn, trả về 0.0 nếu lỗi."""
    try:
        return float(val)
    except (TypeError, ValueError):
        return 0.0


def _as_text(value: Any) -> str:
    """Chuẩn hoá giá trị CSV/pandas thành text sạch.

    - Ô trống khi đọc bằng pandas là ``NaN`` (truthy) nên ``value or fallback``
      sẽ ra chuỗi ``"nan"`` và fallback không chạy.
    - CSV/TMDB đôi khi lưu literal ``"nan"``/``"None"``/``"null"`` — coi như rỗng.
    """
    if value is None:
        return ""
    try:
        if pd.isna(value):
            return ""
    except (TypeError, ValueError):
        pass
    text = str(value).strip()
    return "" if text.lower() in _MISSING_TEXT_VALUES else text


def build_search_text(row: Union[pd.Series, dict]) -> str:
    """
    Hàm tạo search_text chuẩn hóa duy nhất dùng chung cho toàn bộ hệ thống:
    - title: ưu tiên title_vi, nếu thiếu fallback sang title (tiếng Anh) rồi title_en
    - overview: ưu tiên overview_vi, nếu thiếu fallback sang overview
    - genres: trích xuất tên thể loại sạch từ JSON list hoặc list
    """
    title = (
        _as_text(row.get("title_vi"))
        or _as_text(row.get("title"))
        or _as_text(row.get("title_en"))
    )
    overview = _as_text(row.get("overview_vi")) or _as_text(row.get("overview"))
    genres = extract_genre_names(row.get("genres", ""))
    text = f"{title} {overview} {genres}"
    return " ".join(text.split())


def compute_corpus_fingerprint(texts: List[str], ids: List[int] = None) -> str:
    """
    Tính mã băm sha256 đại diện cho toàn bộ corpus search_text và danh sách movieId.
    Phục vụ kiểm tra tính toàn vẹn và ngăn tái sử dụng cache/index cũ khi dữ liệu thay đổi.
    """
    hasher = hashlib.sha256()
    if ids is not None:
        for mid, txt in zip(ids, texts):
            hasher.update(f"{mid}:{txt}\n".encode("utf-8"))
    else:
        for txt in texts:
            hasher.update(f"{txt}\n".encode("utf-8"))
    return hasher.hexdigest()


class MovieDataLoader:
    """
    DataLoader chịu trách nhiệm tải và tiền xử lý dữ liệu phim.
    Hiện tại đọc từ file tĩnh (CSV), tương lai có thể mở rộng để gọi API
    hoặc kết nối Database khi chạy thực tế (dynamic data).
    """

    def __init__(self, data_path: str):
        self.data_path = Path(data_path)
        self.logger = setup_logger(self.__class__.__name__)

    def load_catalog(self, language_mode: str = "vi") -> pd.DataFrame:
        """
        Tải catalog phim từ file CSV/Parquet và tạo search_text chuẩn hóa đồng nhất.
        """
        if not self.data_path.exists():
            raise FileNotFoundError(f"Không tìm thấy file data tại: {self.data_path}")

        if self.data_path.suffix == ".parquet":
            df = pd.read_parquet(self.data_path)
        else:
            df = pd.read_csv(self.data_path, low_memory=False)

        self.logger.info(f"Đã tải {len(df)} dòng từ {self.data_path.name}")

        # Tiền xử lý để tạo 'search_text' gộp chung nội dung bằng hàm chuẩn hóa duy nhất
        df["search_text"] = df.apply(build_search_text, axis=1)

        # Chỉ giữ lại các phim có text hợp lệ (> 20 ký tự chuẩn)
        df = df[df["search_text"].str.len() > 20].copy()
        id_col = (
            "movieId"
            if "movieId" in df.columns and df["movieId"].notna().any()
            else "id"
        )
        df[id_col] = df[id_col].apply(safe_int)
        df = df[df[id_col] > 0].drop_duplicates(subset=[id_col]).reset_index(drop=True)
        if "movieId" not in df.columns or df["movieId"].isna().any():
            df["movieId"] = df[id_col]

        self.logger.info(f"Số lượng phim hợp lệ để train: {len(df)}")
        return df

    def get_corpus_and_ids(
        self, df: pd.DataFrame, id_col: str = "movieId"
    ) -> Tuple[List[str], List[int]]:
        """
        Trích xuất corpus (text) và ID tương ứng để truyền vào model.
        """
        if id_col not in df.columns:
            # Fallback nếu dùng file tmdb_latest_movies.csv có cột id
            id_col = "id"

        corpus = df["search_text"].tolist()
        ids = df[id_col].tolist()
        return corpus, ids
