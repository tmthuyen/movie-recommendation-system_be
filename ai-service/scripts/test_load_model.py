import sys
from pathlib import Path

# Thêm thư mục src vào sys.path để có thể import trực tiếp (vd: from data.data_loader)
project_root = Path(__file__).parent.parent
src_path = project_root / "src"
if str(src_path) not in sys.path:
    sys.path.insert(0, str(src_path))

from models.bm25_search import BM25Recommender
from models.tfidf_search import TFIDFRecommender
from core.tokenizer import get_tokenizer
from utils.logger import setup_logger

logger = setup_logger()

def find_latest_experiment(model_name: str) -> Path:
    exp_dir = project_root / "experiments" / model_name
    if not exp_dir.exists():
        raise FileNotFoundError(f"Không tìm thấy thư mục {exp_dir}")
    
    # Tìm thư mục run_ mới nhất
    runs = sorted([d for d in exp_dir.iterdir() if d.is_dir() and d.name.startswith("run_")])
    if not runs:
        raise FileNotFoundError(f"Không có thực nghiệm nào trong {exp_dir}")
        
    return runs[-1] / "model_artifacts"

def test_load_and_search():
    # 1. Khởi tạo tokenizer (bắt buộc phải có để search cắt chữ đúng như lúc train)
    tokenizer = get_tokenizer('vi')
    
    # 2. Tìm model BM25 mới nhất đã train
    try:
        model_dir = find_latest_experiment("bm25_baseline")
        logger.info(f"Đang tải model BM25 từ: {model_dir}")
        
        # 3. Khởi tạo model rỗng và gọi hàm load
        model = BM25Recommender(tokenizer=tokenizer)
        model.load(str(model_dir))
        
        # 4. Tìm kiếm thử
        query = "người máy hủy diệt tương lai"
        logger.info(f"Đang tìm kiếm với query: '{query}'")
        
        results = model.search(query, top_k=5)
        
        logger.info("=== KẾT QUẢ TÌM KIẾM ===")
        for i, res in enumerate(results, 1):
            logger.info(f"Top {i}: Movie ID = {res['movie_id']}, Score = {res['score']:.4f}")
            
    except Exception as e:
        logger.error(f"Lỗi: {e}")

if __name__ == "__main__":
    test_load_and_search()
