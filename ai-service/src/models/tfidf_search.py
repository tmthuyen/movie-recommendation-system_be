import os
import joblib
from utils.logger import setup_logger
from typing import List, Dict, Any
import numpy as np

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import linear_kernel

from core.base_model import BaseRecommender
from core.tokenizer import BaseTokenizer

def dummy_tokenizer(text):
    """
    Hàm giả để truyền vào TfidfVectorizer
    """
    return text

class TFIDFRecommender(BaseRecommender):
    """
    Mô hình gợi ý sử dụng TF-IDF để vector hóa văn bản và 
    tính toán độ tương đồng Cosine Similarity.
    """
    
    def __init__(self, tokenizer: BaseTokenizer = None, **kwargs):
        super().__init__(tokenizer, **kwargs)
        self.logger = setup_logger(self.__class__.__name__)
        
        # Cấu hình mặc định cho TF-IDF
        self.max_features = kwargs.get('max_features', 10000)
        self.ngram_range = kwargs.get('ngram_range', (1, 1))
        
        # Sử dụng dummy_tokenizer vì chúng ta sẽ tự tokenize dữ liệu trước khi nạp vào
        self.vectorizer = TfidfVectorizer(
            tokenizer=dummy_tokenizer,
            preprocessor=dummy_tokenizer,
            token_pattern=None,
            max_features=self.max_features,
            ngram_range=self.ngram_range
        )
        
        self.tfidf_matrix = None
        self.movie_ids = []
        
    def fit(self, corpus: List[str], movie_ids: List[Any], **kwargs):
        self.logger.info(f"Bắt đầu huấn luyện TF-IDF với {len(corpus)} văn bản...")
        self.movie_ids = movie_ids
        
        # Tokenize toàn bộ corpus
        if self.tokenizer:
            tokenized_corpus = self.tokenizer.tokenize_batch(corpus)
        else:
            tokenized_corpus = [text.split() for text in corpus]

        print('5 từ đầu tiên trong corpus: ', tokenized_corpus[:5])
            
        self.tfidf_matrix = self.vectorizer.fit_transform(tokenized_corpus)
        self.is_fitted = True
        self.logger.info(f"Đã huấn luyện xong. Kích thước ma trận TF-IDF: {self.tfidf_matrix.shape}")
        
    def search(self, query: str, top_k: int = 10) -> List[Dict[str, Any]]:
        if not self.is_fitted:
            raise RuntimeError("Model chưa được fit dữ liệu!")
            
        if self.tokenizer:
            tokenized_query = self.tokenizer.tokenize(query)
        else:
            tokenized_query = query.split()
            
        query_vec = self.vectorizer.transform([tokenized_query])
        cosine_similarities = linear_kernel(query_vec, self.tfidf_matrix).flatten()
        
        # Lấy top k chỉ số có độ tương đồng cao nhất
        related_docs_indices = cosine_similarities.argsort()[:-top_k-1:-1]
        
        results = []
        for i in related_docs_indices:
            score = float(cosine_similarities[i])
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
        joblib.dump(self.vectorizer, os.path.join(output_dir, "vectorizer.joblib"))
        joblib.dump(self.tfidf_matrix, os.path.join(output_dir, "tfidf_matrix.joblib"))
        joblib.dump(self.movie_ids, os.path.join(output_dir, "movie_ids.joblib"))
        self.logger.info(f"Đã lưu model TF-IDF tại {output_dir}")

    def load(self, model_dir: str):
        self.vectorizer = joblib.load(os.path.join(model_dir, "vectorizer.joblib"))
        self.tfidf_matrix = joblib.load(os.path.join(model_dir, "tfidf_matrix.joblib"))
        self.movie_ids = joblib.load(os.path.join(model_dir, "movie_ids.joblib"))
        self.is_fitted = True
        self.logger.info(f"Đã tải model TF-IDF từ {model_dir}")
