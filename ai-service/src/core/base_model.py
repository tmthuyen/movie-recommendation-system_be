from abc import ABC, abstractmethod
from typing import List, Dict, Any

from core.tokenizer import BaseTokenizer

class BaseRecommender(ABC):
    """
    Interface chung cho tất cả các mô hình gợi ý (Baseline, DL).
    Tất cả các model phải tuân thủ hợp đồng này để dễ dàng so sánh và thay thế.
    """

    def __init__(self, tokenizer: BaseTokenizer = None, **kwargs):
        self.tokenizer = tokenizer
        self.config = kwargs
        self.is_fitted = False

    @abstractmethod
    def fit(self, corpus: List[str], movie_ids: List[Any], **kwargs):
        """
        Huấn luyện hoặc index dữ liệu (đối với tfidf, bm25, vector db).
        :param corpus: Danh sách các chuỗi văn bản (overview + title + genres...)
        :param movie_ids: Danh sách ID tương ứng với corpus
        """
        pass

    @abstractmethod
    def search(self, query: str, top_k: int = 10) -> List[Dict[str, Any]]:
        """
        Tìm kiếm các bộ phim liên quan đến truy vấn.
        :param query: Câu truy vấn của người dùng (tự nhiên hoặc từ khóa)
        :param top_k: Số lượng kết quả trả về
        :return: Danh sách các dictionary chứa {'movie_id': ..., 'score': ...}
        """
        pass

    @abstractmethod
    def save(self, output_dir: str):
        """
        Lưu trạng thái model (weights, vectors, tfidf matrix) xuống đĩa.
        """
        pass

    @abstractmethod
    def load(self, model_dir: str):
        """
        Tải trạng thái model từ đĩa.
        """
        pass

    def get_config(self) -> Dict[str, Any]:
        """
        Lấy cấu hình của model để log vào experiment tracker.
        """
        return {
            'model_class': self.__class__.__name__,
            'tokenizer': self.tokenizer.name() if self.tokenizer else 'none',
            **self.config
        }
