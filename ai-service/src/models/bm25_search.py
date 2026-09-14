import os
import joblib
from utils.logger import setup_logger
from typing import List, Dict, Any
import numpy as np

from rank_bm25 import BM25Okapi

from core.base_model import BaseRecommender
from core.tokenizer import BaseTokenizer

class BM25Recommender(BaseRecommender):
    """
    Mô hình gợi ý sử dụng BM25 (Rank-BM25) để tìm kiếm.
    """
    
    def __init__(self, tokenizer: BaseTokenizer = None, **kwargs):
        super().__init__(tokenizer, **kwargs)
        self.logger = setup_logger(self.__class__.__name__)
        
        self.bm25 = None
        self.movie_ids = []
        
    def fit(self, corpus: List[str], movie_ids: List[Any], **kwargs):
        self.logger.info(f"Bắt đầu huấn luyện BM25 với {len(corpus)} văn bản...")
        self.movie_ids = movie_ids
        
        # Tokenize toàn bộ corpus
        if self.tokenizer:
            tokenized_corpus = self.tokenizer.tokenize_batch(corpus)
        else:
            tokenized_corpus = [text.split() for text in corpus]
            
        self.bm25 = BM25Okapi(tokenized_corpus)
        self.is_fitted = True
        self.logger.info(f"Đã huấn luyện xong BM25.")
        
    def search(self, query: str, top_k: int = 10) -> List[Dict[str, Any]]:
        if not self.is_fitted:
            raise RuntimeError("Model chưa được fit dữ liệu!")
            
        if self.tokenizer:
            tokenized_query = self.tokenizer.tokenize(query)
        else:
            tokenized_query = query.split()
            
        scores = self.bm25.get_scores(tokenized_query)
        
        # Lấy top k chỉ số
        top_n = np.argsort(scores)[::-1][:top_k]
        
        results = []
        for i in top_n:
            score = float(scores[i])
            if score > 0:  # Chỉ lấy kết quả có độ tương đồng > 0
                results.append({
                    'movie_id': self.movie_ids[i],
                    'score': score
                })
        return results

    def save(self, output_dir: str):
        if not self.is_fitted:
            raise RuntimeError("Không thể lưu model chưa được fit.")
            
        os.makedirs(output_dir, exist_ok=True)
        joblib.dump(self.bm25, os.path.join(output_dir, "bm25_model.joblib"))
        joblib.dump(self.movie_ids, os.path.join(output_dir, "movie_ids.joblib"))
        self.logger.info(f"Đã lưu model BM25 tại {output_dir}")

    def load(self, model_dir: str):
        self.bm25 = joblib.load(os.path.join(model_dir, "bm25_model.joblib"))
        self.movie_ids = joblib.load(os.path.join(model_dir, "movie_ids.joblib"))
        self.is_fitted = True
        self.logger.info(f"Đã tải model BM25 từ {model_dir}")
