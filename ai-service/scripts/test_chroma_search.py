import sys
import os
import chromadb
from sentence_transformers import SentenceTransformer

sys.stdout.reconfigure(encoding='utf-8')

def main():
    db_path = r"d:\Du an cntt\movie-recommendation-system_be\ai-service\data\chroma_db"
    model_name = "paraphrase-multilingual-MiniLM-L12-v2"
    
    print(f"=== ChromaDB Verification Test ===")
    print(f"📁 Path: {db_path}")
    
    client = chromadb.PersistentClient(path=db_path)
    collection = client.get_collection(name="movies")
    
    total_count = collection.count()
    print(f"📊 Tổng số vector đã nạp trong DB: {total_count:,} phim")
    
    print(f"🧠 Đang load model embedding '{model_name}'...")
    model = SentenceTransformer(model_name)
    
    queries = [
        "phim hành động siêu hero cứu thế giới đại chiến",
        "phim hoạt hình anime tình cảm nhẹ nhàng xúc động",
        "phim kinh dị ma quái bí ẩn rùng rợn ngôi nhà ma",
        "khoa học viễn tưởng không gian vũ trụ hố đen du hành thời gian"
    ]
    
    for text in queries:
        print(f"\n==================================================================")
        print(f"🔍 TRUY VẤN NGỮ NGHĨA: '{text}'")
        print(f"==================================================================")
        
        vector = model.encode(text, normalize_embeddings=True).tolist()
        
        results = collection.query(
            query_embeddings=[vector],
            n_results=5,
            include=["metadatas", "distances"]
        )
        
        ids = results["ids"][0]
        distances = results["distances"][0]
        metadatas = results["metadatas"][0]
        
        for i, (m_id, dist, meta) in enumerate(zip(ids, distances, metadatas), 1):
            score = 1.0 - dist
            title_vi = meta.get('title_vi')
            title_en = meta.get('title')
            display_title = title_vi if (title_vi and str(title_vi).strip() != 'nan') else title_en
            year = str(meta.get('release_date', ''))[:4]
            genres = meta.get('genres', '')
            vote = meta.get('vote_average', 0)
            
            print(f"{i}. [Độ tương đồng: {score:.4f} ({score*100:.1f}%)] {display_title} ({year})")
            print(f"   - Tên tiếng Anh: {title_en}")
            print(f"   - Thể loại: {genres}")
            print(f"   - Đánh giá: ⭐ {vote}/10 | ID Phim: {m_id} | TMDB ID: {meta.get('tmdb_id')}")

if __name__ == "__main__":
    main()
