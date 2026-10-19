# EXPERIMENT TRACKING – NHẬT KÝ THỰC NGHIỆM

**Đề tài:** Ứng dụng mô hình ngôn ngữ vào hệ thống khuyến nghị phim  
**GVHD:** TS. Trần Trung Tín  
**Sinh viên:** Phan Nguyễn Quốc Thắng (52300063) — Trần Minh Thuyên (52300070)  
**Cập nhật:** 09/10/2026

---

## 1. Nhật ký các phiên chạy

| Run           | Ngày          | Dữ liệu                           | Mô hình / Cấu hình                                                                                                                          | Kết quả chính                                                                            | Trạng thái                    |
| ------------- | ------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ----------------------------- |
| **#01**       | 14/09         | 19.673 phim                       | TF-IDF (10k features), BM25 (Underthesea)                                                                                                   | Đo tốc độ ban đầu, chưa có ground truth                                                  | Hoàn thành                    |
| **#02**       | 25/09         | 14.815 phim, 10 queries           | SBERT MiniLM-L12-v2 + ChromaDB                                                                                                              | NDCG@5 ≈ 0,74; latency ≈ 25 ms                                                           | Hoàn thành                    |
| **#03**       | 08/10         | 14.815 phim, 20 queries, 163 nhãn | TF-IDF (25k), BM25 (k1=1.5, b=0.75), SBERT 384d + HNSW                                                                                      | SBERT NDCG@5 = 0,8033; latency = 44,2 ms                                                 | Hoàn thành (sơ bộ)            |
| **#03-Audit** | 18/10         | 14.815 phim, 20 queries, 163 nhãn | Thống nhất 100% search_text, sửa tokenizer tiếng Việt, warmup ChromaDB                                                                      | SBERT NDCG@5 = 0,8033, Latency = 25,3 ms; BM25 P@5 = 0,08                                | Hoàn thành (Kiểm chứng)       |
| **#03.1**     | 18/10         | 14.815 phim, 20 queries, 163 nhãn | Chuẩn hóa ngưỡng nhị phân Grade >= 2, Underthesea Tokenizer, hàm dùng chung `build_search_text`, ChromaDB Manifest & Verify, Unit Tests 9/9 | SBERT NDCG@5 = 0,8033; P@5 = 0,8300; Latency = 27,9 ms; BM25 = 27,9 ms; TF-IDF = 11,4 ms | Hoàn thành (Chuẩn hóa Bước 1) |
| **#04**       | Dự kiến 15/10 | 100 queries                       | Mở rộng ground truth, rà soát tính lập, kiểm chứng baseline và metric                                                                       | Đánh giá độ tin cậy thống kê                                                             | Kế hoạch                      |
| **#05**       | Chưa xác định | Ground truth đã kiểm chứng        | Hybrid Retrieval, Metadata Filtering, Redis Cache                                                                                           | Tối ưu chất lượng và tốc độ                                                              | Kế hoạch                      |

---

## 2. Cấu hình thực nghiệm Run #03

**Dữ liệu:**

- Corpus: 14.815 phim (TMDB + MovieLens), tóm tắt song ngữ Anh – Việt.
- Ground Truth: 20 queries, 163 lượt gán nhãn, 134 phim duy nhất.
- 5 nhóm truy vấn: Semantic Mismatch, Slang, Emotional Tone, Animation/Fantasy, Action/Superhero.

**Mô hình:**

- **TF-IDF:** 25.000 features, unigram + bigram, sublinear TF.
- **BM25:** Okapi BM25, k1 = 1.5, b = 0.75.
- **SBERT:** `paraphrase-multilingual-MiniLM-L12-v2`, embedding 384 chiều.
- **ChromaDB:** HNSW, cosine similarity; cấu hình dự kiến M=16, ef=100 (cần xác minh từ chỉ mục thực tế).

**Độ đo:** Precision@K, Recall@K, NDCG@K, MRR và Latency.

---

## 3. Kết quả định lượng Run #03

| Mô hình              |        P@5 |        R@5 |     NDCG@5 |       P@10 |       R@10 |    NDCG@10 |        MRR |      Latency |
| -------------------- | ---------: | ---------: | ---------: | ---------: | ---------: | ---------: | ---------: | -----------: |
| TF-IDF               |     0.0700 |     0.0399 |     0.0715 |     0.0600 |     0.0704 |     0.0748 |     0.1643 |     82.60 ms |
| BM25                 |     0.1200 |     0.0704 |     0.1102 |     0.0800 |     0.0940 |     0.1021 |     0.2558 |    139.03 ms |
| **SBERT + ChromaDB** | **0.8600** | **0.5293** | **0.8033** | **0.4600** | **0.5640** | **0.6671** | **0.9750** | **44.20 ms** |

**Nhận xét:**

- SBERT có NDCG@5 cao hơn TF-IDF khoảng 1.023,5% và BM25 khoảng 629,0%.
- SBERT đạt chất lượng truy xuất tốt nhất trên 20 truy vấn thử nghiệm.
- Kết quả latency chỉ mang tính tham khảo khi chưa chuẩn hóa môi trường đo.

**Giới hạn:** Ground truth còn nhỏ, chưa xác minh đầy đủ tính độc lập của nhãn và độ bao phủ phim liên quan. Kết quả hiện tại mang tính sơ bộ, chưa đủ để kết luận mô hình vượt trội trên mọi loại truy vấn.

---

## 3b. Kết quả đối chuẩn đã kiểm chứng (Run #03-Audit - 18/10/2026)

| Mô hình              |    P@5     |    P@10    |    R@5     |    R@10    |   NDCG@5   |  NDCG@10   |   MRR@10   | Latency (ms) |
| :------------------- | :--------: | :--------: | :--------: | :--------: | :--------: | :--------: | :--------: | :----------: |
| **TF-IDF**           |   0.0400   |   0.0250   |   0.0231   |   0.0293   |   0.0427   |   0.0366   |   0.0900   |   32.0 ms    |
| **BM25**             |   0.0800   |   0.0600   |   0.0474   |   0.0699   |   0.0754   |   0.0697   |   0.1733   |   74.5 ms    |
| **SBERT + ChromaDB** | **0.8600** | **0.4600** | **0.5293** | **0.5640** | **0.8033** | **0.6671** | **0.9750** | **25.3 ms**  |

---

## 3c. Báo cáo đánh giá chi tiết chuẩn hóa (Run #03.1 - 18/10/2026)

### 3c.1. Thiết lập thực nghiệm & Cải tiến hệ thống

- **Tập dữ liệu:** 14.815 bộ phim (TMDB + MovieLens), trường `search_text` đồng nhất 100% bằng hàm dùng chung `data.data_loader.build_search_text`.
- **Tập Ground Truth:** 20 câu truy vấn (human-annotated), thang điểm relevance: 3 = Rất liên quan, 2 = Liên quan, 1 = Một phần, 0 = Không liên quan.
- **Chuẩn hóa ngưỡng nhị phân (Binary Cutoff):** **Grade >= 2**. Chỉ những phim có liên quan trực tiếp mới được tính vào Precision@K, Recall@K, MRR@10. Phim Grade 1 (liên quan một phần) chỉ được tính điểm trong NDCG@K đa cấp.
- **Tokenizer Lexical:** Tích hợp `UndertheseaTokenizer` (chuẩn hóa Unicode NFC, nhận diện từ ghép tiếng Việt có dấu, lọc 2.067 stop words, lưu cache có mã băm xác thực nạp trong 0.5s).
- **Xác thực ChromaDB & Manifest:** File `movies_manifest.json` và hàm `verify_vector_db` kiểm tra mã băm SHA-256 corpus, model name và cosine similarity thực tế; ngăn chặn tái sử dụng index cũ. Lưu `documents=batch_texts` trong `collection.upsert()`.
- **Kiểm thử tự động:** Đạt **9/9 tests PASS** trong `tests/test_benchmark_audit.py`.

### 3c.2. Bảng kết quả so sánh tổng thể

| Mô hình                |    P@5     |    P@10    |    R@5     |    R@10    |   NDCG@5   |  NDCG@10   |    MRR     | Latency (ms) |
| ---------------------- | :--------: | :--------: | :--------: | :--------: | :--------: | :--------: | :--------: | :----------: |
| **TF-IDF**             |   0.0300   |   0.0200   |   0.0208   |   0.0264   |   0.0347   |   0.0314   |   0.0921   |   11.4 ms    |
| **BM25 (Underthesea)** |   0.0300   |   0.0300   |   0.0201   |   0.0398   |   0.0315   |   0.0391   |   0.1029   |   27.9 ms    |
| **SBERT + ChromaDB**   | **0.8300** | **0.4400** | **0.5374** | **0.5688** | **0.8033** | **0.6671** | **0.9500** | **27.9 ms**  |

### 3c.3. Mức độ cải thiện tương đối của SBERT so với Baselines

| Độ đo            | TF-IDF |  BM25  | SBERT + ChromaDB | Cải thiện vs TF-IDF | Cải thiện vs BM25 |
| :--------------- | :----: | :----: | :--------------: | :-----------------: | :---------------: |
| **PRECISION@5**  | 0.0300 | 0.0300 |    **0.8300**    |    **+2666.7%**     |   **+2666.7%**    |
| **PRECISION@10** | 0.0200 | 0.0300 |    **0.4400**    |    **+2100.0%**     |   **+1366.7%**    |
| **RECALL@5**     | 0.0208 | 0.0201 |    **0.5374**    |    **+2483.7%**     |   **+2573.6%**    |
| **RECALL@10**    | 0.0264 | 0.0398 |    **0.5688**    |    **+2054.5%**     |   **+1329.1%**    |
| **NDCG@5**       | 0.0347 | 0.0315 |    **0.8033**    |    **+2215.0%**     |   **+2450.2%**    |
| **NDCG@10**      | 0.0314 | 0.0391 |    **0.6671**    |    **+2024.5%**     |   **+1606.1%**    |
| **MRR**          | 0.0921 | 0.1029 |    **0.9500**    |     **+931.5%**     |    **+823.2%**    |

### 3c.4. Phân tích kết quả theo 5 nhóm truy vấn

#### Nhóm A — Ngữ nghĩa trừu tượng / Vocabulary Mismatch

| Mô hình              |    P@5     |   NDCG@5   |    MRR     |
| -------------------- | :--------: | :--------: | :--------: |
| TF-IDF               |   0.0000   |   0.0000   |   0.0000   |
| BM25                 |   0.0000   |   0.0000   |   0.0250   |
| **SBERT + ChromaDB** | **0.8500** | **0.7807** | **0.8750** |

#### Nhóm B — Tiếng lóng / Ngôn ngữ thông thường

| Mô hình              |    P@5     |   NDCG@5   |    MRR     |
| -------------------- | :--------: | :--------: | :--------: |
| TF-IDF               |   0.0000   |   0.0000   |   0.0000   |
| BM25                 |   0.0000   |   0.0000   |   0.0312   |
| **SBERT + ChromaDB** | **0.8500** | **0.8107** | **0.8750** |

#### Nhóm C — Tông cảm xúc

| Mô hình              |    P@5     |   NDCG@5   |    MRR     |
| -------------------- | :--------: | :--------: | :--------: |
| TF-IDF               |   0.0500   |   0.0328   |   0.0500   |
| BM25                 |   0.0000   |   0.0000   |   0.0417   |
| **SBERT + ChromaDB** | **0.9000** | **0.8524** | **1.0000** |

#### Nhóm D — Hoạt hình / Thế giới kỳ ảo

| Mô hình              |    P@5     |   NDCG@5   |    MRR     |
| -------------------- | :--------: | :--------: | :--------: |
| TF-IDF               |   0.0500   |   0.0559   |   0.1250   |
| BM25                 |   0.0500   |   0.0443   |   0.0833   |
| **SBERT + ChromaDB** | **0.8000** | **0.8167** | **1.0000** |

#### Nhóm E — Hành động / Siêu anh hùng

| Mô hình              |    P@5     |   NDCG@5   |    MRR     |
| -------------------- | :--------: | :--------: | :--------: |
| TF-IDF               |   0.0500   |   0.0848   |   0.2857   |
| BM25                 |   0.1000   |   0.1131   |   0.3333   |
| **SBERT + ChromaDB** | **0.7500** | **0.7561** | **1.0000** |

### 3c.5. Kết luận phân tích định lượng

- **Chất lượng tìm kiếm:** SBERT + ChromaDB đạt **NDCG@5 = 0.8033** và **MRR = 0.9500**, vượt trội hoàn toàn so với TF-IDF (+2215.0%) và BM25 (+2450.2%).
- **Sự vượt trội ở Nhóm B (tiếng lóng) và C (cảm xúc):** Các mô hình từ khóa lexical gần như đạt điểm 0 ở các nhóm này do không bắt được sự đồng nghĩa/ngữ cảnh ngầm, trong khi SBERT đạt P@5 từ 0.85 – 0.90.
- **Tốc độ thực thi:** Sau khi warmup HNSW, SBERT + ChromaDB chỉ mất trung bình **27.9 ms/truy vấn** (tương đương BM25 27.9 ms), đáp ứng hoàn hảo yêu cầu thời gian thực.

---

## 4. Minh chứng thực nghiệm

**Bảng kết quả IR:**

![IR Metrics](assets/ir_metrics_table.png)

**Biểu đồ so sánh mô hình:**

![IR Comparison](assets/ir_metrics_overall_chart.png)

**NDCG@5 theo nhóm truy vấn:**

![NDCG by Group](assets/ndcg_by_group.png)

**So sánh thời gian phản hồi:**

![Latency](assets/latency_comparison.png)

**Case Study trên Colab:**

![Case Study](assets/colab_case_study.png)

---

## 4b. Bước 2: Xây dựng Bộ Query Benchmark V2 (100 Queries từ Database thật qua Gemini LLM)

### 4b.1. Bối cảnh & Cơ sở dữ liệu nguồn
- **Database thực tế:** Hệ thống sử dụng PostgreSQL (`nestjs_db`, bảng `movies`) với 19.706 bản ghi (18.938 phim có `overview_vi` tiếng Việt chất lượng cao) đồng bộ với ChromaDB (`data/chroma_db`, 14.815 vectors).
- **Quy trình trích xuất & xác minh chéo bắt buộc (Strict Cross-DB Verification):**
  1. Trích xuất 1.000 phim ứng viên từ PostgreSQL có tóm tắt tiếng Việt rõ ràng (độ dài 80 – 600 ký tự, `vote_count >= 10` hoặc có tương tác).
  2. Bắt buộc xác minh 100% `movieId` tồn tại trong ChromaDB: Nếu ChromaDB không tồn tại hoặc rỗng, tiến trình dừng lại ngay lập tức (raise `RuntimeError`), tuyệt đối không bỏ qua. Đã đối chiếu và giữ lại 989 phim hợp lệ tồn tại ở cả 2 cơ sở dữ liệu (loại bỏ 11 phim chưa có vector).
  3. Chọn lọc phân tầng theo 10 nhóm thể loại chính $\rightarrow$ thu được đúng **100 phim đại diện đa dạng** lưu tại `experiments/ground_truth/benchmark_source_movies_100.json`.

### 4b.2. Tích hợp LLM thực sự & Thiết kế 5 nhóm truy vấn (Query Taxonomy)
Sử dụng LLM **Google Gemini** (`gemini-3.5-flash` qua Gemini API với cơ chế fallback tự động đa model: `gemini-3.5-flash-lite`, `gemini-3.1-flash-lite`) để đóng vai người dùng thực tế tại Việt Nam tìm kiếm phim. Toàn bộ 100 truy vấn được sinh từ **100 phim nguồn riêng biệt** (mỗi query từ 1 phim khác nhau):
1. **Lexical (20 queries / 20 phim nguồn riêng):** Tìm kiếm bằng từ khóa thực thể đặc thù (3–8 từ): tên nhân vật chính, địa danh, thuật ngữ hoặc tên phim kết hợp thể loại/hành động chính nhằm kiểm thử BM25/TF-IDF.
2. **Semantic (20 queries / 20 phim nguồn riêng):** Người xem không nhớ tên phim/nhân vật, diễn đạt lại cốt truyện bằng từ đồng nghĩa và câu văn tự nhiên hàng ngày. Tuyệt đối không dùng tên riêng hay tên phim, không chép nguyên văn tóm tắt.
3. **Abstract (20 queries / 20 phim nguồn riêng):** Tìm phim dựa trên cảm xúc sâu sắc, tâm trạng, thông điệp nhân văn, ý niệm triết lý hoặc xung đột đạo đức/tâm lý (cô đơn, day dứt số phận, bài học trắc ẩn, ranh giới thiện - ác, căng thẳng nghẹt thở). **Tuyệt đối không kể lại tình tiết, sự kiện hay diễn biến cụ thể của cốt truyện**, không dùng tên riêng hay tên phim.
4. **Typo / Slang (20 queries / 20 phim nguồn riêng):** Mô phỏng câu hỏi tìm phim thực tế của cư dân mạng trên Google/Group phim ảnh: dùng các cấu trúc tìm kiếm tự nhiên (`tim fim...`, `review fim gi ma...`, `fim chieu rap...`, `cho hoi fim j ma...`, `ai bit ten fim nay ko ak`), kết hợp teencode, từ viết tắt và lỗi gõ vội tự nhiên (`fim`, `k/ko`, `ng`, `dc`, `thik`, `zay`, `m.n`).
5. **Short / Long (20 queries / 20 phim nguồn riêng):** Cân bằng đối cực:
   - 10 queries cực ngắn (1–2 từ khóa cô đọng nhất về đề tài/khái niệm cốt lõi, vd: `cá vàng`, `hố đen`, `the joker`).
   - 10 queries mô tả hội thoại rất dài (2–3 câu hỏi đáp tìm phim trên diễn đàn/mạng xã hội bắt đầu bằng `Mọi người cho mình hỏi tên bộ phim kể về...`).

### 4b.3. Quy trình Ghép nối, Khử trùng lặp & Kiểm toán Chất lượng
- **Xác minh nội dung chéo bằng định danh đáng tin cậy:** PostgreSQL và ChromaDB bắt buộc đối chiếu định danh `tmdb_id` và tiêu đề phim (`title`, `title_vi`). Tuyệt đối không xác nhận khớp chỉ dựa vào tiêu đề gần giống khi thiếu ID. Toàn bộ 100/100 phim nguồn được hàm `verify_source_movies_against_current_dbs()` kiểm tra lại với dữ liệu hiện tại, đạt độ trùng khớp **100/100 phim nguồn (0 sai lệch)**.
- **Nguyên tắc ghép nối:** CHỈ ghép query với phim khi `movie_id` khớp chính xác. Tuyệt đối không ghép dựa vào thứ tự phần tử trong mảng kết quả.
- **Bảo mật & Cấu hình:** Thông tin kết nối Database (`DATABASE_URL`) và LLM API (`GEMINI_API_KEY`, `GEMINI_MODEL`) được đọc an toàn 100% từ biến môi trường (`.env`), không hardcode bất kỳ mật khẩu mặc định nào trong mã nguồn. File `.env` chứa khóa API và thông tin nhạy cảm được loại trừ hoàn toàn khỏi đóng gói ZIP và Git commit (chỉ chia sẻ `.env.example`).
- **Cơ chế Fallback & Kiểm định lại sau khi sinh (Post-Regeneration Quality Audit):**
  - Khi query cần sinh lại nhưng Gemini thất bại hoặc thiếu API key $\rightarrow$ tự động đánh dấu trạng thái `needs_manual_verification`.
  - Khi Gemini sinh lại query $\rightarrow$ hệ thống chạy lại bộ kiểm tra chất lượng nhóm (Semantic không spoil cao trào/tình tiết tai nạn, Abstract không kể tình tiết cốt truyện/chuỗi số/nhiệm vụ mặt trời/phóng viên) và kiểm tra trùng lặp Jaccard $\ge 0.75$. Chỉ chấp nhận nếu câu mới đạt chuẩn, ngược lại gắn cờ `needs_manual_verification`.
- **Kết quả Rà soát & Chốt Thực tế (Final Step 2 Audit Report):**
  - **Tổng số queries:** 100 / 100 queries (20 queries x 5 nhóm cân bằng, 100 phim nguồn riêng biệt).
  - **Số query thực sự do Gemini sinh thành công:** 100 / 100 queries (`llm_verified_count = 100`).
  - **Số query đạt chuẩn giữ nguyên:** 78 queries.
  - **Số query được tinh chỉnh & sinh lại (Regenerated Quality & Diversity):** 22 queries:
    + **Semantic (4 queries):** Q021, Q032, Q035, Q039 được paraphrase sâu hơn, thoát ly hoàn toàn cụm từ sao chép từ tóm tắt.
    + **Abstract (11 queries):** Q041, Q042, Q046, Q047, Q048, Q049, Q050, Q051, Q052, Q054, Q055 loại bỏ rập khuôn kinh dị ("phim kinh dị có không khí ngột ngạt"), đa dạng hóa cảm xúc và chủ đề triết lý (đức tin, tha hóa nhân tính, ân hận muộn màng, rạn nứt tình thân, lòng tha thứ, châm biếm danh vọng mạng).
    + **Typo/Slang (7 queries):** Q067, Q068, Q069, Q070, Q076, Q077, Q078 loại bỏ yêu cầu xin link/full HD/vietsub thô, thay bằng truy vấn teencode/typo tìm kiếm tự nhiên theo nội dung phim.
  - **Số query cần kiểm chứng thủ công:** **0 queries** (100% đạt chuẩn chất lượng tự động sau rà soát).
  - **Kết quả Unit Tests Bước 2:** **26/26 tests PASS** (`tests/unit/test_benchmark_queries.py`).
  - **Toàn bộ Unit Tests hệ thống:** **40/40 tests PASS** (`tests/unit/`).
- **Tệp dữ liệu đầu ra:** Lưu tại `experiments/ground_truth/benchmark_queries_v2.json`.

### 4b.4. Quy định & Chuẩn bị cho Bước 3 (Ground Truth Policy)
- **Không coi phim nguồn là đáp án duy nhất:** `source_movie_id` chỉ là tài liệu tham chiếu ban đầu để tạo câu hỏi. Trong hệ thống tìm kiếm thực tế, một truy vấn ngữ nghĩa hoặc trừu tượng luôn có thể có nhiều phim liên quan khác.
- **Không tự đánh dấu câu hỏi do LLM sinh là Ground Truth đã xác minh:** Câu hỏi do LLM sinh cần bước thẩm định và gán nhãn khách quan.
- **Chuẩn bị cho Bước 3:** Trường `relevant_candidates: []` và trạng thái `ready_for_step3_candidate_pooling` trong schema đã sẵn sàng cho quy trình Candidate Pooling từ TF-IDF, BM25 và SBERT ChromaDB, tiếp theo là gán nhãn Graded Relevance đa mức độ (0–3) ở Bước 3. Không triển khai trước Candidate Pooling hay Ground Truth V2 trong phạm vi Bước 2.

---

## 4c. Bước 3: Xây dựng Ground Truth V2 bằng Candidate Pooling (TREC / BEIR Standard)

### 4c.1. Cơ sở dữ liệu & Thẩm định chéo đa nguồn (Cross-Database Integrity)
- **Corpus đối chuẩn:** 14.815 bộ phim (`all_movies_fully_translated.csv`) được đồng nhất tuyệt đối qua hàm chuẩn hóa `data.data_loader.build_search_text`. Mã băm xác thực SHA-256 fingerprint: `f47867b05751151a612854f7ed924feb0e0faff42d5e67197ebb0fe423d40c61`.
- **Đồng bộ đa hệ thống:** Khớp 100% với ChromaDB (`data/chroma_db`, collection `movies`, 14.815 vectors) và bộ nhớ đệm từ khóa Underthesea (`data/artifacts/lexical_search/tokenized_corpus_underthesea.joblib`).
- **Kiểm chứng nghiêm ngặt 100/100 queries:** Toàn bộ 100 `source_movie_id` từ `benchmark_queries_v2.json` và `benchmark_source_movies_100.json` được kiểm tra chéo, xác nhận tồn tại 100% trong PostgreSQL `movies`, ChromaDB và Corpus CSV với tiêu đề và metadata nội dung trùng khớp hoàn toàn.

### 4c.2. Chiến lược Candidate Pooling từ TF-IDF, BM25 và SBERT
Để tránh thiên kiến (evaluation bias) khi chỉ đánh giá trên một mô hình đơn lẻ và không tự coi phim nguồn là đáp án duy nhất, hệ thống áp dụng phương pháp **Candidate Pooling** chuẩn quốc tế (tương tự benchmark TREC và BEIR):
- **3 mô hình retrieval độc lập tham gia pooling:**
  1. **TF-IDF:** 25.000 đặc trưng từ vựng tiếng Việt, sublinear TF, cosine similarity.
  2. **BM25:** Thuật toán Okapi BM25 trên tập văn bản đã tách từ bằng `UndertheseaTokenizer` (chuẩn NFC, 2.067 stop words).
  3. **SBERT + ChromaDB:** Dense embeddings 384 chiều từ `paraphrase-multilingual-MiniLM-L12-v2` truy vấn trên chỉ mục vector HNSW của ChromaDB.
- **Độ sâu pooling:** Top $K = 10$ cho mỗi mô hình.
- **Theo dõi nguồn gốc truy xuất (Provenance Tracking):** Mỗi ứng viên được gắn nhãn `pooled_by: ["TF-IDF", "BM25", "SBERT"]`, ghi nhận thứ hạng cụ thể (`model_ranks`) và điểm số tương đồng/khoảng cách từ từng mô hình.

### 4c.3. Thống kê kết quả Candidate Pooling
| Chỉ số | Giá trị thực tế | Ghi chú |
|---|:---:|---|
| **Tổng số queries đánh giá** | **100 queries** | 5 nhóm x 20 queries cân bằng (Lexical, Semantic, Abstract, Typo/Slang, Short/Long) |
| **Tổng số ứng viên được pool** | **2.231 lượt** | Tổng hợp từ Top-10 của TF-IDF, BM25 và SBERT |
| **Số phim duy nhất trong pool** | **1.574 phim** | Chiếm ~10.6% toàn bộ corpus 14.815 phim |
| **Trung bình ứng viên / query** | **22.31 phim** | Trung bình mỗi query thu được 22.3 phim liên quan tiềm năng |
| **Ensemble Source Recall@10** | **56.0%** | Tỷ lệ phim nguồn gốc xuất hiện trong Top-10 của ít nhất một mô hình |
| - *Recall@10 của TF-IDF* | 46.0% | Hiệu quả cao ở nhóm Lexical và Short/Long |
| - *Recall@10 của BM25* | 50.0% | Hiệu quả cao ở nhóm Lexical và Typo/Slang |
| - *Recall@10 của SBERT* | 38.0% | Hiệu quả cao ở nhóm Semantic và Abstract |

### 4c.4. Thang điểm Graded Relevance & Ngưỡng nhị phân
- **Thang điểm 4 mức (0 – 3):**
  - **Grade 3 (Rất liên quan — Exact / Primary Match):** Phim khớp hoàn toàn chủ đề, nhân vật, thực thể hoặc ý định tìm kiếm chính của query.
  - **Grade 2 (Liên quan — Strong Partial Match):** Phim cùng thể loại chính, cốt truyện hoặc chủ đề liên quan mật thiết đến yêu cầu.
  - **Grade 1 (Liên quan một phần — Weak / Peripheral Match):** Phim chỉ chia sẻ một yếu tố phụ (diễn viên phụ, bối cảnh phụ hoặc thể loại tương đồng).
  - **Grade 0 (Không liên quan — Irrelevant):** Hoàn toàn không liên quan đến ý định tìm kiếm.
- **Quy chuẩn đánh giá:**
  - **Độ đo nhị phân (Precision@K, Recall@K, MRR):** Sử dụng ngưỡng **Grade $\ge 2$** (chỉ những phim thực sự liên quan mới được tính là hit).
  - **Độ đo đa mức (NDCG@K):** Sử dụng toàn bộ thang điểm 0, 1, 2, 3 có chiết khấu vị trí rank.
- **Phân biệt rạch ròi giữa Null và Grade 0:**
  - **Chưa đánh giá:** `relevance_grade: null`, `status: "unassessed"`, `verified_by_human: false`.
  - **Đã đánh giá không liên quan:** `relevance_grade: 0`, `status: "verified"`, `verified_by_human: true`.

### 4c.5. Quy trình & Công cụ hỗ trợ Human Annotation
- **Script thẩm định tương tác (`scripts/annotate_ground_truth_v2.py`):**
  - Cung cấp giao diện dòng lệnh cho chuyên gia: hiển thị query, tóm tắt phim tiếng Việt & tiếng Anh, thể loại, nguồn pooling (`pooled_by`), thứ hạng mô hình.
  - Hỗ trợ gán nhãn 0–3, ghi chú rationale, bỏ qua (skip), tự động lưu tăng dần (incremental autosave).
  - Báo cáo tiến độ thời gian thực qua cờ `--stats`.
- **Hàng đợi thẩm định (`experiments/ground_truth/annotation_queue_v2.json`):**
  - Gồm đúng **2.231 items** sẵn sàng cho việc phân chia công việc đánh giá theo nhóm chuyên gia hoặc gán nhãn chéo (inter-annotator agreement).
- **Chính sách không thiên vị (Strict Ground Truth Policy):**
  - Tuyệt đối không coi phim nguồn là đáp án duy nhất.
  - Tuyệt đối không đánh dấu nhãn LLM hay phim nguồn là đã được con người xác minh: Trạng thái ban đầu có đúng **0 / 2.231 nhãn** được đánh dấu `verified_by_human = True`.

### 4c.6. Báo cáo số lượng nhãn và kết quả kiểm thử
- **Tập tin dữ liệu xuất xưởng:**
  - `experiments/ground_truth/ground_truth_v2.json` (Ground Truth V2 đầy đủ metadata và candidate pool).
  - `experiments/ground_truth/annotation_queue_v2.json` (Hàng đợi đánh giá 2.231 items).
- **Báo cáo số lượng nhãn hiện tại:**
  - Tổng số ứng viên: **2.231 cặp**
  - Nhãn đã xác minh bởi con người: **0 / 2.231 (0.0%)** (chuẩn tắc trước khi human review)
  - Ứng viên chưa đánh giá: **2.131 ứng viên** (cùng 100 phim nguồn có điểm tham chiếu 3 chờ xác nhận)
- **Bảo toàn dữ liệu cũ:** Ground Truth V1 (`experiments/ground_truth/ground_truth.json`) và các kết quả Run #01, #02, #03, #03.1 được giữ nguyên 100%.
- **Kết quả Unit Tests:** Đạt **51/51 tests PASS** trong `tests/unit/` (trong đó có 11 tests mới kiểm chứng toàn bộ quy tắc Ground Truth V2).

---

## 5. Kế hoạch thực nghiệm tiếp theo

### Run #04 – Benchmark Validation

1. Tăng ground truth từ 20 lên 100 queries, bổ sung các nhóm truy vấn đa dạng.
2. Candidate Pooling từ TF-IDF, BM25 và SBERT; gán nhãn độc lập, bổ sung phim không liên quan.
3. Chuẩn hóa relevance 0–3, sử dụng ngưỡng ≥2 cho metric nhị phân.
4. Mời người đánh giá thứ hai, tính Cohen's Kappa.
5. Cải thiện baseline với tokenizer tiếng Việt.
6. Chạy lại benchmark, bổ sung NDCG@20, confidence interval 95% và phân tích lỗi.

### Run #05 – System Optimization

1. Thử nghiệm Hybrid Retrieval (BM25 + SBERT bằng RRF).
2. Tích hợp Redis Semantic Cache, đo cache hit rate và latency P50/P95.

---

## 6. Quy định ghi log

Mỗi phiên chạy cần lưu:

- Run ID, ngày chạy, Git commit và phiên bản dữ liệu.
- Cấu hình mô hình, random seed và môi trường CPU/GPU.
- Ground truth version, quy tắc relevance và metric.
- Kết quả CSV/JSON, biểu đồ và nhận xét.

**Nguyên tắc:** Không ghi đè kết quả cũ; khi thay đổi dữ liệu, cấu hình hoặc phương pháp đánh giá phải tạo Run mới.

---

## 7. Kết luận

Run #03 cho thấy **Sentence-BERT + ChromaDB có tiềm năng cải thiện đáng kể chất lượng tìm kiếm phim bằng ngôn ngữ tự nhiên**, đạt NDCG@5 = 0,8033 và MRR = 0,9750 trên tập thử nghiệm hiện tại.

**Ưu tiên tiếp theo:** Hoàn thiện ground truth và kiểm chứng kết quả trong Run #04, sau đó tối ưu chất lượng và hiệu năng hệ thống ở Run #05.

_Cập nhật: 18/10/2026 — Phiên hoàn thành gần nhất: Run #03.1._
