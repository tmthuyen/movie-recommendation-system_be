Dưới đây là bài giảng chi tiết, hệ thống hóa lại 3 luồng xử lý cốt lõi trong hệ thống gợi ý phim: **Huấn luyện mô hình DL cho Semantic Search**, **Huấn luyện mô hình Collaborative Filtering với SVD/Matrix Factorization**, và **Quy trình kết hợp Hybrid để trả về Top-K phim**.

---

### **LUỒNG 1: Huấn Luyện Mô Hình Deep Learning Cho Semantic Text Search**

Mục tiêu của luồng này là chuyển đổi toàn bộ mô tả văn bản của bộ phim (tiêu đề, tóm tắt, thể loại, diễn viên) thành một vector đặc trưng ngữ nghĩa mật độ cao (Dense Vector).

#### **1. Dựng Kiến Trúc Mô Hình (Sentence-BERT / Bi-Encoder)**

- **Đầu vào (Input Representation):**
  Ghép các trường thông tin phim thành một chuỗi duy nhất:
  \\[\text{Input} = \text{"[CLS] Tiêu đề: Interstellar [SEP] Cốt truyện: Du hành vũ trụ qua hố đen... [SEP]"}\\]
  Mỗi token được mã hóa thành tổng của 3 vector: **Token Embedding**, **Segment Embedding** và **Position Embedding**.

- **Cơ chế Mã hóa Ngữ cảnh (Transformer Encoder):**
  Đưa chuỗi token qua các tầng Transformer Encoder. Tại đây, cơ chế **Self-Attention** sử dụng bộ ba ma trận chiếu \\(W_Q, W_K, W_V\\) để tạo ra các vector \\(Q\\) (Query), \\(K\\) (Key), \\(V\\) (Value):
  \\[Q = XW_Q, \quad K = XW_K, \quad V = XW_V\\]
  Điểm tương quan ngữ nghĩa giữa các từ được tính qua công thức **Scaled Dot-Product Attention**:
  \\[\text{Attention}(Q, K, V) = \text{softmax}\left(\frac{QK^T}{\sqrt{d_k}}\right)V\\]
  _(Hệ số \\(\sqrt{d_k}\\) giúp chuẩn hóa độ biến thiên, tránh việc hàm Softmax bị bão hòa làm triệt tiêu đạo hàm)._

- **Tạo Vector Phim Cố Định (Mean Pooling):**
  Lấy trung bình cộng các vector ẩn ở lớp cuối cùng (hoặc lấy vector của token `[CLS]`) để thu được vector nén biểu diễn bộ phim \\(v\_{\text{movie}} \in \mathbb{R}^{d}\\) (với \\(d = 768\\)).

#### **2. Quy Trình Huấn Luyện (Fine-tuning với Contrastive Learning)**

- **Chuẩn bị Dữ liệu Cặp / Bộ Ba (Triplets):**
  Tạo tập dữ liệu dạng \\((A, P, N)\\):
  - **Anchor (\\(A\\)):** Tóm tắt phim hoặc câu truy vấn tìm kiếm.
  - **Positive (\\(P\\)):** Phim có nội dung tương tự hoặc phim được người dùng xem tiếp theo.
  - **Negative (\\(N\\)):** Phim không liên quan.
- **Hàm Mất Mát (Multiple Negatives Ranking Loss - MNRL):**
  \\[\mathcal{L} = -\log \frac{\exp(\text{CosineSim}(v_A, v_P) / \tau)}{\sum_{j} \exp(\text{CosineSim}(v_A, v_j) / \tau)}\\]
- **Tối ưu hóa:** Sử dụng thuật toán AdamW để cập nhật trọng số mô hình sao cho các phim cùng chủ đề được kéo sát lại gần nhau trong không gian vector.

#### **3. Lưu Trữ Vào Vector Database**

- Đưa toàn bộ danh mục phim qua mô hình đã huấn luyện để trích xuất \\(v\_{\text{movie}}\\).
- Lưu các vector này vào Vector DB như **Qdrant** hoặc **FAISS** và dựng chỉ mục **HNSW** để phục vụ tìm kiếm hàng xóm gần nhất (ANN Search).

---

### **LUỒNG 2: Huấn Luyện Mô Hình Lọc Cộng Tác Với Matrix Factorization (SVD)**

Mục tiêu của luồng này là học hành vi tương tác lịch sử giữa User và Movie mà không cần quan tâm đến nội dung văn bản.

#### **1. Khởi Tạo Ma Trận Tương Tác (\\(R\\))**

Dựng ma trận tương tác \\(R \in \mathbb{R}^{M \times N}\\) với \\(M\\) người dùng và \\(N\\) bộ phim.

- **Explicit Feedback:** Mỗi ô \\(R\_{u, i}\\) chứa điểm đánh giá (1–5 sao).
- **Implicit Feedback:** \\(R*{u, i} = 1\\) nếu người dùng đã xem/click, \\(R*{u, i} = 0\\) nếu chưa tương tác.

#### **2. Phân Tích Ma Trận Tương Tác (SVD Decomposition)**

Mô hình giả định rằng hành vi người dùng và đặc tính bộ phim được quyết định bởi \\(k\\) nhân tố ẩn (Latent Factors, ví dụ \\(k = 64\\)):

- \\(P_u \in \mathbb{R}^k\\): Vector thể hiện sở thích ẩn của người dùng \\(u\\).
- \\(Q_i \in \mathbb{R}^k\\): Vector thể hiện đặc tính ẩn của bộ phim \\(i\\).

Dự đoán mức độ yêu thích \\(\hat{r}_{u, i}\\) của người dùng \\(u\\) cho phim \\(i\\):
\\[\hat{r}_{u, i} = \mu + b_u + b_i + P_u^T Q_i\\]

- \\(\mu\\): Điểm đánh giá trung bình của toàn bộ hệ thống.
- \\(b_u\\): Độ thiên lệch của người dùng \\(u\\) (dễ tính hay khó tính).
- \\(b_i\\): Độ thiên lệch của bộ phim \\(i\\) (phim hay toàn bộ cộng đồng đều thích hay phim dở).

#### **3. Hàm Mất Mát & Huấn Luyện**

Tối ưu hóa tổng sai số bình phương giữa điểm thực tế \\(r*{u,i}\\) và điểm dự đoán \\(\hat{r}*{u,i}\\), kết hợp với thành phần chuẩn hóa L2 (Regularization) để chống học vẹt (Overfitting):
\\[\mathcal{L}_{\text{SVD}} = \sum_{(u,i) \in \text{Train}} \left(r_{u,i} - \hat{r}_{u,i}\right)^2 + \lambda \left( \|P_u\|^2 + \|Q_i\|^2 + b_u^2 + b_i^2 \right)\\]

- **Thuật toán tối ưu:** Dùng **SGD (Stochastic Gradient Descent)** hoặc **ALS (Alternating Least Squares)** để cập nhật liên tục \\(P_u\\) và \\(Q_i\\).

---

### **LUỒNG 3: Luồng Kết Hợp Hybrid & Trả Về Top-K Phim Gợi Ý**

Hệ thống kết hợp cả 2 mô hình trên theo cấu trúc phễu lọc 2 giai đoạn (Retrieval & Ranking):

```
                                [ Dữ liệu Yêu cầu Gợi ý ]
                                            │
               ┌────────────────────────────┴────────────────────────────┐
               ▼ (Luồng Semantic Search)                                 ▼ (Luồng Collaborative Filtering)
   [ Vector DB (Qdrant/FAISS) ]                              [ SVD Matrix Factorization ]
               │                                                         │
               ▼                                                         ▼
     Top-100 Phim Ngữ nghĩa ($C_{\text{text}}$)                Top-100 Phim Hành vi ($C_{\text{CF}}$)
               │                                                         │
               └────────────────────────────┬────────────────────────────┘
                                            │
                                            ▼
                           [ Gom tập ứng viên: $C = C_{\text{text}} \cup C_{\text{CF}}$ ]
                                            │
                                            ▼
                           [ HYBRID SCORING & FUSION LAYER ]
                                            │
                                            ▼
                            [ RE-RANKING & DIVERSITY (MMR) ]
                                            │
                                            ▼
                               [ TOP-K MOVIES RECOMMENDATION ]
```

#### **Giai Đoạn 1: Candidate Generation / Retrieval (Lọc Thô)**

Khi người dùng \\(u\\) gửi yêu cầu gợi ý:

1. **Lọc theo Ngữ nghĩa (Semantic Search):**
   - Lấy vector sở thích văn bản người dùng \\(v\_{\text{user_text}}\\) (hoặc câu truy vấn).
   - Bắn vào Vector DB (Qdrant/FAISS) để lấy ra **Top-100 phim ứng viên** \\(C\_{\text{text}}\\).
2. **Lọc theo Hành vi (Collaborative Filtering):**
   - Dùng vector ẩn \\(P_u\\) nhân với ma trận \\(Q_i\\) để dự đoán điểm số trên toàn bộ danh mục.
   - Lấy ra **Top-100 phim ứng viên** \\(C\_{\text{CF}}\\).
3. **Gom Tập Ứng Viên:**
   - Hợp nhất 2 tập ứng viên: \\(C = C*{\text{text}} \cup C*{\text{CF}}\\) (thu được khoảng 150–200 bộ phim ứng viên duy nhất).

#### **Giai Đoạn 2: Scoring & Hybrid Fusion (Xếp Hạng Tinh)**

Tính điểm số kết hợp cho từng bộ phim \\(i \in C\\):
\\[\text{Score}_{\text{Hybrid}}(u, i) = \alpha \cdot \text{Score}_{\text{SVD}}(u, i) + (1-\alpha) \cdot \text{CosineSim}(v_{\text{user\_text}}, v_{\text{movie\_i}})\\]
_(Trọng số \\(\alpha \in\\) được tinh chỉnh dựa trên độ dài lịch sử người dùng: nếu người dùng mới \\(\rightarrow\\) giảm \\(\alpha\\) để ưu tiên gợi ý nội dung văn bản; nếu người dùng lâu năm \\(\rightarrow\\) tăng \\(\alpha\\) để ưu tiên lọc cộng tác)._

Hoặc truyền các vector \\(P*u, Q_i, v*{\text{movie_i}}\\) qua mạng **Neural Collaborative Filtering (NCF)** để học điểm số tương tác phi tuyến tính.

#### **Giai Đoạn 3: Re-ranking & Cắt Top-K**

1. **Lọc Quy Tắc (Business Rules):** Loại bỏ các phim người dùng đã xem trong lịch sử gần đây.
2. **Đảm bảo Độ Đa Dạng (Maximal Marginal Relevance - MMR):** Cân bằng giữa điểm số gợi ý và độ khác biệt giữa các phim trong Top-K để tránh danh sách xuất hiện toàn phim trùng series/thể loại.
3. **Đầu Ra:** Xuất danh sách **Top-K Phim** chính thức (ví dụ: Top 10 phim) cho người dùng.

---

Em có muốn chúng ta tìm hiểu sâu hơn về cách viết code Python minh họa cho hàm tính điểm **Hybrid Fusion** hay cách cấu hình tham số \\(\alpha\\) thích ứng động không?
