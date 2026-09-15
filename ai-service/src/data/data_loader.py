import pandas as pd
from pathlib import Path
from typing import Tuple, List
from utils.logger import setup_logger

class MovieDataLoader:
    """
    DataLoader chịu trách nhiệm tải và tiền xử lý dữ liệu phim.
    Hiện tại đọc từ file tĩnh (CSV), tương lai có thể mở rộng để gọi API 
    hoặc kết nối Database khi chạy thực tế (dynamic data).
    """
    def __init__(self, data_path: str):
        self.data_path = Path(data_path)
        self.logger = setup_logger(self.__class__.__name__)
        
    def load_catalog(self, language_mode: str = 'vi') -> pd.DataFrame:
        """
        Tải catalog phim từ file CSV.
        Trong tương lai, hàm này có thể được sửa để fetch từ Backend API.
        """
        if not self.data_path.exists():
            raise FileNotFoundError(f"Không tìm thấy file data tại: {self.data_path}")
            
        if self.data_path.suffix == '.parquet':
            df = pd.read_parquet(self.data_path)
        else:
            df = pd.read_csv(self.data_path)
            
        self.logger.info(f"Đã tải {len(df)} dòng từ {self.data_path.name}")
        
        # Tiền xử lý để tạo 'search_text' gộp chung nội dung
        title_col = 'title_vi' if language_mode == 'vi' and 'title_vi' in df.columns else 'title'
        if title_col not in df.columns:
             title_col = 'original_title' if 'original_title' in df.columns else 'title_x'
             
        overview_col = 'overview_vi' if language_mode == 'vi' and 'overview_vi' in df.columns else 'overview'
        
        # Fallback nếu không có cột _vi
        if overview_col not in df.columns:
            overview_col = 'overview'
            
        genres_col = 'genres_text' if 'genres_text' in df.columns else ('genres' if 'genres' in df.columns else '')

        df['search_text'] = (
            df[title_col].fillna('') + ' ' + 
            df[overview_col].fillna('') + ' ' + 
            (df[genres_col].fillna('') if genres_col else '')
        ).str.replace(r'\s+', ' ', regex=True).str.strip()
        
        # Chỉ giữ lại các phim có text hợp lệ
        df = df[df['search_text'].str.len() > 10].copy()
        self.logger.info(f"Số lượng phim hợp lệ để train: {len(df)}")
        return df

    def get_corpus_and_ids(self, df: pd.DataFrame, id_col: str = 'movieId') -> Tuple[List[str], List[int]]:
        """
        Trích xuất corpus (text) và ID tương ứng để truyền vào model.
        """
        if id_col not in df.columns:
            # Fallback nếu dùng file tmdb_latest_movies.csv có cột id
            id_col = 'id'
            
        corpus = df['search_text'].tolist()
        ids = df[id_col].tolist()
        return corpus, ids
