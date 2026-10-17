# CF_Model_Report — Báo cáo mô hình Lọc cộng tác (Collaborative Filtering)

> - **Nguồn code**: `ai-service/notebooks/08_collaborative_filtering.ipynb`
> - **Training Run ID**: `20261016_221939` — Device: CPU — Python 3.11.9
> - **Mục tiêu**: dự đoán điểm / gợi ý phim dựa trên tương tác người dùng (không dùng nội dung phim).
> - **Chỉ số đánh giá chính (theo yêu cầu)**: **NDCG@k** và **Hit Rate@k** (k=5).

---

## 1. Các model / phương pháp đang thực hiện

### 1.1 Tổng quan

| # | Model | Thư viện | Loại | Cấu hình chính | Trạng thái |
|---|---|---|---|---|---|
| 1 | `CollaborativeFilteringModel` (MF-SGD) | PyTorch | Matrix Factorization + bias (dạng SVD/Koren, huấn luyện bằng Adam) | embedding 128, init_std 0.01, Adam lr=1e-3, weight_decay=1e-5, loss MSE, batch 1024, 5 epochs | Code đầy đủ, nhưng **ô huấn luyện & đánh giá đang bị comment** → **chưa có kết quả** trong run hiện tại |
| 2 | `AlternatingLeastSquares` (ALS) | `implicit` | Phân rã ma trận thưa user×item (Alternating Least Squares) | factors=64, regularization=0.01, iterations=20 | **Đã huấn luyện (20 iterations / ~25s) và đã đánh giá** |

### 1.2 MF-SGD — `CollaborativeFilteringModel` (PyTorch)

- **Cấu trúc**: `user_embedding`, `movie_embedding` (dim **128**), `user_bias`, `movie_bias`, `global_bias`.
- **Công thức điểm**: `score(u, i) = ⟨E_u, E_i⟩ + b_u + b_i + b_global` — đây chính là mô hình **Matrix Factorization với bias** (tương đương SVD theo Koren).
- **Khởi tạo**: embedding `normal(std=0.01)`, bias = 0.
- **Huấn luyện**: loss **MSELoss**, optimizer **Adam** (lr=0.001, weight_decay=1e-5), **batch=1024**, **5 epochs**, đọc dữ liệu lazy-loading từ Parquet (`LazyParquetDataset`, chunk 500.000 dòng).
- **Lưu artifact**: `data/artifacts/cf/<RUN_TIMESTAMP>/` gồm `*_cf_model.pth`, `*_mappings.parquet`, `*_metrics.json`, biểu đồ loss.
- **Trạng thái**: toàn bộ ô khởi tạo DataLoader → train → evaluate bị **comment**, nên run hiện tại **không có model MF-SGD nào được huấn luyện/đánh giá**.

### 1.3 ALS — `implicit.als.AlternatingLeastSquares`

- **Đầu vào**: ma trận thưa `csr_matrix` (hàng = user, cột = movie) từ tập **train** (`4.616.650` dòng), giá trị ô = **rating** (dùng trực tiếp làm confidence).
- **Kích thước ma trận**: `(num_users, num_movies)` đọc từ file mapping của run.
- **Tham số**: `factors=64`, `regularization=0.01`, `iterations=20` → `model.fit(matrix)`.
- **Sinh gợi ý**: `model.recommend(user_id, matrix[user_id], N=k)` — hàm `recommend` của `implicit` **tự động loại các item user đã xem** (training items) khỏi danh sách gợi ý → không rò rỉ dữ liệu train vào đánh giá.

### 1.4 Các phương pháp lọc cộng tác phổ biến (sẽ bổ sung sau)

| Nhóm | Phương pháp | Ghi chú |
|---|---|---|
| **Baseline (nên có để so sánh)** | Popularity / MostPop, Random | Thang đo nền: NDCG/HitRate của model phải > baseline |
| **Memory-based** | Item-based CF / User-based CF (cosine, Pearson, KNN) | `Surprise`: KNNBasic, KNNWithMeans, KNNBaseline |
| **Model-based (matrix factorization)** | **SVD / SVD++** | `Surprise` — gần nhất với MF-SGD đang có |
| | **NMF** | Non-negative Matrix Factorization |
| | **ALS** | ✅ đang có |
| | eALS / Logistic MF | Thư viện `implicit` — tối ưu explicit/implicit feedback |
| | **BPR** (Bayesian Personalized Ranking) | `implicit.bpr` — tối ưu xếp hạng pairwise, **hợp với NDCG@k / Hit Rate@k** |
| **Feature-based / Deep Learning** | Factorization Machines / FFM | libFM, xLearn — gắn thêm feature phụ |
| | **NCF** (GMF + MLP), AutoRec, DeepMF | Kỹ thuật neural cho CF |
| | DeepFM / Wide & Deep | |
| **Graph & Sequence** | LightGCN / NGCF | Định dạng đồ thị user–item |
| | SASRec / GRU4Rec | Theo chuỗi tương tác theo thời gian |
| **Hybrid** | CF + embedding ngữ nghĩa | Ghép với Semantic Search tiếng Việt sẵn có của dự án |

**Thứ tự ưu tiên đề xuất**: Popularity baseline → ItemKNN → SVD/SVD++ → BPR → NCF → LightGCN.

---

## 2. Thống kê dữ liệu và các tập

### 2.1 Nguồn dữ liệu

- **File**: `data/final_data/ratings_filtered_by_movie.csv` — **5.617.578 dòng** (tương tác đã lọc theo phim).
- Thống kê toàn file (output `describe`):

| | userId | movieId | rating | datetime |
|---|---|---|---|---|
| count | 5.617.578 | 5.617.578 | 5.617.578 | 5.617.578 |
| mean | 141.747 | 5.062 | **3,5233** | 2005-10-20 |
| min | 1 | 5 | **0,5** | 1996-01-29 |
| 25% | 70.994 | 508 | 3,0 | 2000-03-21 |
| 50% | 141.947 | 1.479 | **3,5** | 2005-02-21 |
| 75% | 212.307 | 2.539 | 4,0 | 2010-11-21 |
| max | 283.228 | 193.717 | **5,0** | 2018-09-26 |
| std | 81.686 | 14.554 | **1,0728** | — |

- Biểu đồ phân bố rating theo thời gian chỉ lọc `datetime > 2000` **để vẽ chart**, không ảnh hưởng tới tập train.

### 2.2 Lọc & ánh xạ

- Lọc các tương tác **mới nhất theo timestamp** (đọc theo chunk 500.000 dòng để tránh nổ RAM). **Số dòng thực chạy theo output: 5.000.000 dòng mới nhất**.
  - ⚠️ *Lệch version trong code*: ô Config đang ghi `MAX_ROWS_TO_PROCESS = 1_000_000` và comment ghi "2 triệu dòng" — cả hai không khớp output chạy thật (`5000000`). **Số đúng theo run là 5.000.000.**
- **Ánh xạ ID → index nguyên**: `user_idx`, `movie_idx` (UUID/int → 0..n-1), lưu kèm vào `*_mappings.parquet` theo từng run (dùng cho `RecommendationClient` và eval).
- Shuffle ngẫu nhiên (`random_state=42`) — không ảnh hưởng chia tập vì từng user vẫn được sort lại theo timestamp trước khi cắt.

### 2.3 Cách chia tập (per-user, theo thời gian — leave-5-out)

Với mỗi user (xếp tăng dần theo timestamp):

1. Nếu tổng số tương tác < 15 → **toàn bộ vào Train** (không có trong Val/Test).
2. Ngược lại: **5 rating CŨỚI CÙNG (mới nhất) → Test**, `num_val_per_user=0` → **Val = 0**, còn lại → **Train**.

→ Tập test được chia ban đầu, dùng thống nhất cho mọi lần đo số liệu.

- ⚠️ Tỷ lệ `TRAIN_RATIO=0.8 / VAL_RATIO=0.1 / TEST_RATIO=0.1` trong `Config` **không được dùng** (3 dòng chia theo ratio đã bị comment; split thật chạy theo số lượng per-user).

### 2.4 Thống kê các tập (output run)

| Tập | Số dòng | Tỷ lệ | Điều kiện |
|---|---|---|---|
| **Train** | **4.616.650** | **92,33%** | các rating cũ hơn của user (user ≥ 15 tương tác) hoặc toàn bộ của user < 15 tương tác |
| **Val** | **0** | **0%** | `num_val_per_user = 0` |
| **Test** | **383.350** | **7,67%** | đúng 5 rating mới nhất / user |
| Tổng | 5.000.000 | 100% | |

**Đặc điểm tập test**:
- Schema: `userId, movieId, rating, timestamp, user_idx, movie_idx` (383.350 dòng, không null).
- Suy ra số user trong test: 383.350 / 5 = **76.670 user × đúng 5 item/user** → mỗi user có **đúng 5 phim ground-truth**.
- File Parquet các tập: `data/interactions_parquet/{train,val,test}/data.parquet`.

---

## 3. Các phương pháp đánh giá

Toàn bộ đánh giá chạy trên **tập Test đã chia ban đầu** (383.350 dòng / 76.670 user), theo **protocol xếp hạng top-k** với **macro-average (trung bình cộng theo từng user)**.

### 3.1 Metric chính (top-k)

| Metric | Ý nghĩa | Cách tính trong code (`Evaluation`) |
|---|---|---|
| **NDCG@k** | Xếp hạng có trọng số — phim trúng nằm càng ở vị trí đầu càng được điểm cao, chuẩn hóa so với danh sách lý tưởng | `DCG = Σ 1/log2(rank+2)` với mọi phim nằm trong tập test (rank bắt đầu từ 0); `IDCG = Σ_{rank=0}^{min(\|rel\|,k)-1} 1/log2(rank+2)`; `NDCG = DCG/IDCG` (relevance **binary**, gain = 1) |
| **Hit Rate@k** | Tỷ lệ user có **ít nhất 1** phim thật trong top-k | = 1.0 nếu `set(top-k) ∩ tập test của user` khác rỗng, ngược lại 0.0; lấy trung bình toàn bộ user |

### 3.2 Các hàm đánh giá top-k khác (ngoài precision/recall/f1 — sẵn sàng bổ sung)

| Hàm | Ý nghĩa |
|---|---|
| **MAP@k** | Mean Average Precision — trung bình AP của từng user (AP xét vị trí từng phim trúng) |
| **MRR@k** | Mean Reciprocal Rank — nghịch đảo hạng của phim trúng đầu tiên (1/rank), đo "trúng sớm hay muộn") |
| **Hit Count / Recall-based Ratio@k** | Số phim trúng trung bình mỗi user trong top-k |
| **Coverage@k** | Tỷ lệ catalog phim được ít nhất một user nhận gợi ý (độ phủ, chống thiên vị phim hot) |
| **Novelty / Diversity@k** | Độ mới / độ khác biệt giữa các danh sách gợi ý |
| **GAUC** | AUC tính riêng từng user rồi trung bình — tách biệt khả năng xếp hạng khỏi ngưỡng điểm |

> ⚠️ Trong notebook hiện **chỉ mới cài hàm NDCG@k và Hit Rate@k** (các hàm ở bảng trên chưa viết code — sẽ thêm khi mở rộng `class Evaluation`).
> **Precision@k / Recall@k / F1@k có trong code nhưng cố tình không đưa vào báo cáo chính** (theo yêu cầu: mức quá thấp với lọc cộng tác — matching id tuyệt đối trên catalog lớn, mỗi user chỉ 5 phim test nên mỗi phim trúng chỉ góp 0,2 điểm).

### 3.3 Metric hồi quy (dự đoán điểm) — dành cho MF-SGD

Trong `ModelTrainer.evaluate` (mode="test"): **MSE, RMSE, MAE, R²** — dùng để đo độ chính xác dự đoán điểm rating 0,5–5,0. Hiện **chưa chạy** (code MF-SGD bị comment).

### 3.4 Quy trình đánh giá (protocol)

1. Đọc tập test đã chia ban đầu (`383.350` dòng).
2. Với mỗi `user_idx` duy nhất trong tập test:
   - `relevant_ids` = tập phim thật của user trong test (5 phim).
   - `recommend(user_id, matrix[user_id], N=k)` — **matrix[user_id] là dòng train của user** → `implicit` tự loại các item đã xem trong train, chỉ xếp hạng các item chưa xem.
   - Tính metric cho user.
3. Trung bình cộng (macro-average) toàn bộ **76.670 user** → số liệu cuối cùng.

**Lưu ý về relevance**: mọi item trong test đều tính là "phim liên quan" (**binary**), **kể cả rating thấp** (0,5 cũng tính trúng) — chưa lọc theo ngưỡng rating.

---

## 4. Kết quả đánh giá

### 4.1 Kết quả theo model — ALS @ k=5 (output notebook)

| Model | k | **NDCG@k** | **Hit Rate@k** |
|---|---|---|---|
| **ALS** (`implicit`, factors=64, reg=0.01, iter=20) | 5 | **0,0858** | **0,3315** |

*(Chỉ 1 model đã được đánh giá; MF-SGD chưa có số do code train/eval bị comment.)*

### 4.2 Đánh giá chung (trên tập test đã chia ban đầu — 383.350 dòng / 76.670 user)

- **Hit Rate@5 = 0,3315** → **33,15% người dùng** có **ít nhất 1 phim** trong 5 phim thật (5 rating mới nhất) lọt vào **top-5 gợi ý**. Tức là cứ ~3 user thì có 1 user được trúng ít nhất 1 phim.
- **NDCG@5 = 0,0858** → điểm xếp hạng đạt **~8,6%** so với danh sách lý tưởng (5 phim thật xếp ngay 5 vị trí đầu). Giá trị thấp là bình thường với nhiệm vụ xếp hạng trên toàn catalog ~193.000 phim; **giá trị dùng để so sánh tương đối giữa các model** chứ không diễn giải tuyệt đối.
- **Nhận xét**:
  - Đây mới là **baseline đầu tiên** — chưa có Popularity/Random để so sánh, nên chưa thể kết luận mô hình "tốt hay chưa".
  - Đánh giá mới ở **k=5** (chưa đo k=10, k=20).
  - Protocol không rò rỉ train (item đã xem đã được filter), chia test theo thời gian → kết quả hợp lệ về mặt methodology.

### 4.3 Khung bảng mở rộng (sẵn cho các model thêm sau)

| Model | Method | k | NDCG@k | Hit Rate@k | Ghi chú |
|---|---|---|---|---|---|
| ALS | `implicit.als` (factors=64, reg=0.01, iter=20) | 5 | **0,0858** | **0,3315** | ✅ đã chạy |
| MF-SGD | PyTorch MF+bias (dim 128) | 5 | — | — | chưa train (code comment) |
| Popularity | MostPop baseline | 5 | — | — | chưa làm |
| ItemKNN | `Surprise` | 5 | — | — | chưa làm |
| SVD / SVD++ | `Surprise` | 5 | — | — | chưa làm |
| BPR | `implicit.bpr` | 5 | — | — | chưa làm |

---

## 5. Ghi chú / Hạn chế / Hướng tiếp theo

**Hạn chế & ghi chú kỹ thuật phát hiện trong code:**

1. **Val = 0** (`num_val_per_user=0`) → không có tập validation để tuning hyperparameter; EPOCHS/factors/reg... hiện đặt cứng.
2. **Lệch version Config**: code ghi `1_000_000` dòng, comment "2 triệu", output chạy thật `5.000.000` → cần đồng bộ lại cho nhất quán.
3. **Chỉ 1 model được eval** (ALS); MF-SGD chưa train/eval; **ALS chưa được lưu artifact** (không có `save` cho model `implicit`).
4. **Mới đo tại k=5** — chưa có k=10/k=20.
5. **Chưa có baseline** (Popularity/Random) để làm thang so sánh.
6. **Relevance binary, gồm cả rating thấp** → nên cân nhắc lọc rating < 3,5 (hoặc 4,0) khi xác định phim "liên quan"; NDCG có thể nâng cấp dùng **gain theo điểm rating** (graded relevance).
7. `Evaluation.evaluate_all` lọc `test_df[test_df["user_idx"]==user_id]` trong vòng for 76.670 user → **O(n²) chậm**; nên thay bằng `groupby("user_idx")`.
8. Ma trận ALS dùng **rating trực tiếp làm confidence** — `implicit` thường mong đợi `confidence = 1 + α·rating` (hoặc binarize + α) → có thể cải thiện kết quả nếu chuẩn hóa lại.

**Hướng tiếp theo:**

- Bật lại pipeline train/eval MF-SGD để có dòng số liệu thứ 2 trong bảng 4.3.
- Bổ sung Popularity baseline → ItemKNN → SVD/SVD++ → BPR để so sánh NDCG@5 / HitRate@5.
- Mở rộng `class Evaluation` với MAP@k, MRR@k, Coverage@k (mục 3.2).
- Thống nhất `k` và ngưỡng rating relevance trước khi chạy so sánh các model.
