import sys
from pathlib import Path
import pytest

project_root = Path(__file__).resolve().parent.parent
sys.path.append(str(project_root))

from models.tfidf_search import TFIDFRecommender
from models.bm25_search import BM25Recommender
from core.tokenizer import get_tokenizer

@pytest.fixture
def sample_data():
    corpus = [
        "người máy hủy diệt đến từ tương lai",
        "cuộc chiến không gian ngoài vũ trụ",
        "tình yêu lãng mạn giữa hai người",
        "kẻ hủy diệt trở lại để bảo vệ thế giới"
    ]
    movie_ids = [1, 2, 3, 4]
    return corpus, movie_ids

def test_tfidf_consistency(sample_data):
    corpus, movie_ids = sample_data
    tokenizer = get_tokenizer('vi')
    
    # Khởi tạo model và fit
    model = TFIDFRecommender(tokenizer=tokenizer)
    model.fit(corpus, movie_ids)
    
    # Search
    query = "kẻ hủy diệt"
    results = model.search(query, top_k=2)
    
    # Đảm bảo trả về đúng ID phim số 4 (do có từ khóa 'hủy diệt' và 'kẻ') 
    # và số 1 (do có từ khóa 'hủy diệt')
    assert len(results) == 2
    assert results[0]['movie_id'] == 4
    assert results[1]['movie_id'] == 1

def test_bm25_consistency(sample_data):
    corpus, movie_ids = sample_data
    tokenizer = get_tokenizer('vi')
    
    # Khởi tạo model và fit
    model = BM25Recommender(tokenizer=tokenizer)
    model.fit(corpus, movie_ids)
    
    # Search
    query = "kẻ hủy diệt"
    results = model.search(query, top_k=2)
    
    # Kết quả của BM25 phải ổn định và giống nhau với cùng 1 logic
    assert len(results) == 2
    assert results[0]['movie_id'] == 4
    assert results[1]['movie_id'] == 1
