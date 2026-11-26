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
    - Song ngữ Anh - Việt:
      + title: kết hợp title_vi và title (tiếng Anh) nếu khác nhau
      + overview: kết hợp cả overview_vi và overview
      + genres: trích xuất tên thể loại sạch từ JSON list hoặc list
    """
    title_vi = _as_text(row.get("title_vi"))
    title_en = _as_text(row.get("title")) or _as_text(row.get("title_en"))
    if title_vi and title_en and title_vi.strip().lower() != title_en.strip().lower():
        title = f"{title_vi} ({title_en})"
    else:
        title = title_vi or title_en

    overview_vi = _as_text(row.get("overview_vi"))
    overview_en = _as_text(row.get("overview"))
    overviews = []
    if overview_vi:
        overviews.append(overview_vi)
    if overview_en and overview_en.strip().lower() != overview_vi.strip().lower():
        overviews.append(overview_en)
    overview = " ".join(overviews)

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
        # Fallback movieId sang id nếu trống hoặc <= 0 để giữ toàn bộ danh mục phim
        if "id" in df.columns:
            df["id"] = df["id"].apply(safe_int)
        if "movieId" in df.columns:
            df["movieId"] = df["movieId"].apply(safe_int)
            if "id" in df.columns:
                df.loc[df["movieId"] <= 0, "movieId"] = df.loc[df["movieId"] <= 0, "id"]
            id_col = "movieId"
        else:
            id_col = "id"
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
