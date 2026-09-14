# Tài liệu Thiết kế Mô hình Gợi ý Cơ bản (Baseline Models)

Tài liệu này mô tả chi tiết cách hoạt động của hai mô hình tìm kiếm/gợi ý cơ bản (baseline) trong dự án: **TF-IDF** và **BM25**. Cả hai đều tuân thủ theo bản thiết kế chung `BaseRecommender`.

---

## 1. Dữ liệu Đầu vào (Input)

Mô hình mong đợi 2 tham số chính khi bắt đầu huấn luyện (`fit`):
- `corpus` (List[str]): Danh sách các câu văn bản đại diện cho từng bộ phim. Hiện tại, `MovieDataLoader` sẽ gộp các cột (ví dụ: `title` + `overview` + `genres`) thành một chuỗi duy nhất để tạo thành corpus.
- `movie_ids` (List[int/float]): Danh sách ID của các bộ phim tương ứng với `corpus`.

---

## 2. Tiền Xử Lý Văn Bản (Text Processing)

Trái tim của việc hiểu ngôn ngữ nằm ở bộ `Tokenizer` (nằm tại `src/core/tokenizer.py`).

Khi nhận được `corpus` (lúc train) hoặc `query` (lúc search), văn bản sẽ trải qua 3 bước nghiêm ngặt:
1. **Làm sạch (Cleaning):** Hàm `clean_text` luộc sạch sẽ mọi dấu phẩy, dấu chấm, ký tự lạ, emoji, html tag và đưa văn bản về dạng chữ thường (lowercase).
2. **Cắt chữ (Tokenization):** 
   - Tiếng Việt (`UndertheseaTokenizer`): Sử dụng AI của underthesea để cắt từ. Từ ghép sẽ được nối lại bằng dấu gạch dưới (VD: `bạn_bè`, `người_máy`).
   - Tiếng Anh (`EnglishTokenizer`): Cắt từ đơn giản bằng khoảng trắng (`.split()`).
3. **Lọc Stop words:** Mọi từ vô nghĩa (như *của, là, có, the, in, on...*) sẽ bị ném đi dựa trên danh sách từ điển có sẵn tại `src/utils/vietnamese-stopwords.txt` và `english-stopwords.txt`.

Kết quả: Từ câu văn thô sẽ biến thành một danh sách (List) các "từ khóa" (tokens) tinh khiết.

---

## 3. Huấn Luyện (Training)

Quá trình "học" của 2 thuật toán có sự khác biệt:

### A. TF-IDF (`TFIDFRecommender`)
- **Nguyên lý:** Đếm tần suất xuất hiện của từ khóa trong 1 bộ phim (TF) so với độ hiếm của từ khóa đó trên toàn bộ kho phim (IDF).
- **Hoạt động:** Sử dụng `TfidfVectorizer` của scikit-learn. Nhận vào các tokens đã qua xử lý, giới hạn lượng từ khóa tối đa (VD: `max_features=15000`) và tạo ra một **Ma trận TF-IDF** (Sparse Matrix) khổng lồ chứa điểm số của mọi bộ phim.

### B. BM25 (`BM25Recommender`)
- **Nguyên lý:** Là phiên bản nâng cấp của TF-IDF, giải quyết tốt hơn vấn đề độ dài của văn bản (phim có mô tả dài không bị thiên vị).
- **Hoạt động:** Sử dụng thư viện `rank_bm25`. Nhận vào tokens, thuật toán lập tức xây dựng bảng băm (Inverted Index) và tính toán công thức IDF riêng của BM25.

---

## 4. Lưu Trữ và Tải Mô Hình (Save & Load)

**Tại sao phải lưu?** 
Quá trình khởi tạo tokenizer, cắt hàng triệu từ và tính toán ma trận mất từ vài chục giây đến vài phút. Trong môi trường thực tế (Production API), chúng ta không thể bắt server học lại từ đầu mỗi khi khởi động.

**Cách hoạt động:**
- Hàm `save(output_dir)` dùng thư viện `joblib` để nén và lưu "bộ não" (Artifacts) của AI xuống ổ cứng:
  - TF-IDF lưu: `vectorizer.joblib` (từ điển), `tfidf_matrix.joblib` (ma trận điểm), và `movie_ids.joblib`.
  - BM25 lưu: `bm25_model.joblib` (chỉ mục) và `movie_ids.joblib`.
- Bất kỳ lúc nào, Server API (FastAPI) chỉ cần gọi hàm `load()` là có thể bế toàn bộ khối dữ liệu này lên RAM trong tích tắc (1-2 giây) và sẵn sàng chiến đấu.

*(Ghi chú: Toàn bộ quá trình chạy sẽ được `ExperimentTracker` theo dõi và lưu lại tại thư mục `experiments/`, bao gồm cả `config.json` và tốc độ chạy trong `metrics.json`).*

---

## 5. Tìm Kiếm (Search/Inference)

Khi người dùng nhập câu truy vấn `query`:
1. `query` lập tức bị đưa vào Tokenizer để làm sạch, gạch chân và lọc stop words.
2. **TF-IDF:** Biến query thành một vector, sau đó đo **Cosine Similarity** (độ tương đồng góc) giữa vector này và toàn bộ 19,000 vector phim trong ma trận đã lưu.
3. **BM25:** Đưa tokens của query vào hàm `get_scores()` để BM25 tự động khớp với Inverted Index và trả ra điểm số.
4. Cuối cùng, hàm `search` gom danh sách lại, xếp hạng từ cao xuống thấp, và trả về Top K các `movie_id` có điểm số cao nhất.

---

## 6. Đánh Giá (Evaluation) - Next Steps

Để chứng minh thuật toán nào thông minh hơn một cách khoa học, hệ thống cần (và sẽ) xây dựng một Evaluation Pipeline:
1. **Ground Truth:** Cần một tập dữ liệu gán nhãn bao gồm `(Query, [Danh sách Movie ID liên quan])`.
2. **Metrics:**
   - `NDCG@K`: Chấm điểm xem phim đúng có được đẩy lên top 1, 2 hay không.
   - `MRR`: Xem phim đúng xuất hiện sớm cỡ nào.
   - `Precision@K` / `Recall@K`: Tỷ lệ trả về đúng trong Top K kết quả.
   
*(Hiện tại 2 mô hình đã sẵn sàng để đối chiếu khi có tập Ground Truth).*
