import sys
from pathlib import Path
import time

# Thêm thư mục src vào sys.path để có thể import trực tiếp (vd: from data.data_loader)
project_root = Path(__file__).resolve().parent.parent
sys.path.append(str(project_root / 'src'))

from data.data_loader import MovieDataLoader
from core.tokenizer import get_tokenizer
from models.tfidf_search import TFIDFRecommender
from models.bm25_search import BM25Recommender
from utils.experiment_tracker import ExperimentTracker
from utils import setup_logger

logger = setup_logger()

def main():
    # 1. Khởi tạo Data Loader
    data_path = project_root / "data" / "artifacts" / "lexical_search" / "catalog_vi.parquet"
    if not data_path.exists():
        # Fallback to other files if parquet is missing
        data_path = project_root / "data" / "tmdb" / "all_movies_fully_translated.csv"
        
    loader = MovieDataLoader(str(data_path))
    
    try:
        df = loader.load_catalog(language_mode='vi')
        # Lấy 1000 dòng để test nhanh, bỏ dòng này nếu muốn train toàn bộ
        # df = df.head(1000)
    except FileNotFoundError:
        logger.error(f"Không tìm thấy file {data_path}. Vui lòng kiểm tra lại dữ liệu.")
        return

    corpus, movie_ids = loader.get_corpus_and_ids(df, id_col='movieId')
    
    # 2. Định nghĩa các thực nghiệm
    # Chọn tokenizer: vi (underthesea) hoặc en (split)
    tokenizer = get_tokenizer('vi')
    
    experiments = [
        {
            "name": "tfidf_baseline",
            "model": TFIDFRecommender(tokenizer=tokenizer, max_features=10000)
        },
        {
            "name": "bm25_baseline",
            "model": BM25Recommender(tokenizer=tokenizer)
        }
    ]
    
    # 3. Chạy từng thực nghiệm
    query = "người máy hủy diệt tương lai"
    
    for exp in experiments:
        logger.info(f"=== Bắt đầu thực nghiệm: {exp['name']} ===")
        tracker = ExperimentTracker(base_dir=str(project_root / "experiments"), model_name=exp['name'])
        model = exp['model']
        
        # Train
        start_time = time.time()
        model.fit(corpus, movie_ids)
        train_time = time.time() - start_time
        
        # Lưu config
        tracker.log_config(model.get_config())
        
        # Đánh giá cơ bản (Thực tế cần bộ test set, ở đây tính tốc độ search)
        search_start = time.time()
        results = model.search(query, top_k=5)
        search_time = time.time() - search_start
        
        logger.info(f"Kết quả cho query '{query}': {results}")
        
        # Lưu metrics
        metrics = {
            "train_time_seconds": train_time,
            "search_time_seconds": search_time,
            "corpus_size": len(corpus)
        }
        tracker.log_metrics(metrics)
        
        # Lưu model
        model.save(tracker.get_model_save_dir())
        logger.info(f"=== Hoàn thành thực nghiệm: {exp['name']} ===\n")

if __name__ == "__main__":
    main()
