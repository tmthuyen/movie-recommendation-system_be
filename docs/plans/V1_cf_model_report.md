# V1 — Viết báo cáo mô hình Lọc cộng tác (CF_Model_Report.md)

- **Trạng thái**: ✅ Hoàn thành
- **Người thực hiện**: AI Agent (OpenCode)
- **Thời gian thực hiện**: 2026-10-16
- **Phạm vi**: Phân tích notebook `08_collaborative_filtering.ipynb` (chỉ đọc code notebook, không lấy số liệu từ file khác) và ghi báo cáo vào `ai-service/docs/models/CF_Model_Report.md`.

## Các module được sửa hoặc liên quan

| Module / File | Hành động |
|---|---|
| `ai-service/notebooks/08_collaborative_filtering.ipynb` | Nguồn phân tích — **không sửa** |
| `ai-service/docs/models/CF_Model_Report.md` | Tạo mới (file đang trống 0 dòng) |
| `docs/plans/V1_cf_model_report.md` | Tạo plan này |

## Yêu cầu đã chốt với developer

1. Metric đánh giá chính: **NDCG@k** và **Hit Rate@k**, cộng các hàm đánh giá top-k khác ngoài precision/recall/f1. **Không** đưa bảng số của precision/recall/f1.
2. Đánh giá theo **k=5** (số liệu thật từ output notebook).
3. Đọc file cũ trước khi ghi → file hiện trống → ghi mới toàn bộ.
4. Báo cáo gồm các mục: các model/phương pháp đang làm (kèm roadmap bổ sung sau), thống kê dữ liệu và các tập, các phương pháp đánh giá, kết quả đánh giá theo model + đánh giá chung trên tập test ban đầu, ghi chú/hạn chế.

## Task

### Phase 1 — Phân tích code ✅
- [x] Đọc toàn bộ notebook: Config, DataPreprocessor, Model (MF-SGD), Trainer, Evaluation.
- [x] Tóm tắt 2 model: `CollaborativeFilteringModel` (PyTorch, chưa train/eval) và ALS (`implicit`, đã eval).
- [x] Thống kê dữ liệu + cách chia tập Train/Val/Test từ output chạy thật.
- [x] Đọc kết quả đánh giá output (NDCG@5, Hit Rate@5) và các phương pháp CF phổ biến khác.

### Phase 2 — Viết báo cáo ✅
- [x] Đọc file cũ `CF_Model_Report.md` (trống 0 dòng).
- [x] Ghi báo cáo `ai-service/docs/models/CF_Model_Report.md` đủ 5 mục:
  - M1 — Các model/phương pháp đang làm (MF-SGD, ALS) + roadmap bổ sung sau
  - M2 — Thống kê dữ liệu và các tập (Train/Val/Test)
  - M3 — Các phương pháp đánh giá (NDCG@k, Hit Rate@k chính + top-k khác ngoài P/R/F1 + hồi quy)
  - M4 — Kết quả đánh giá (ALS NDCG@5 = 0,0858; Hit Rate@5 = 0,3315) + đánh giá chung trên tập test
  - M5 — Ghi chú / Hạn chế / Hướng tiếp theo

**Tiến độ tổng: 100%**
