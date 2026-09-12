# Vietnamese Next Word Prediction

Dự án xây dựng hệ thống **dự đoán từ tiếp theo cho văn bản tiếng Việt** dựa trên dữ liệu bài báo tiếng Việt. Project được tổ chức theo hướng modular, có đầy đủ các phần: crawl dữ liệu, tiền xử lý, tokenization, tạo vocabulary, encode dữ liệu, huấn luyện mô hình, đánh giá kết quả, dự đoán và triển khai API.

Các mô hình hiện có trong project:

- **N-Gram**: mô hình baseline dựa trên thống kê tần suất.
- **LSTM**: mô hình deep learning cho dữ liệu chuỗi.
- **Transformer**: mô hình dùng cơ chế self-attention cho bài toán ngôn ngữ.

---

## I. Mục tiêu dự án

Mục tiêu chính là xây dựng một pipeline hoàn chỉnh cho bài toán **Next Word Prediction** trong tiếng Việt.

Ví dụ:

```text
Input  : "thị trường chứng khoán"
Output : "hôm"
```

Dự án hướng đến các mục tiêu cụ thể:

1. Thu thập dữ liệu bài báo tiếng Việt từ nhiều nguồn.
2. Làm sạch và chuẩn hóa dữ liệu văn bản.
3. Tách câu và tách từ tiếng Việt bằng tokenizer.
4. Xây dựng vocabulary và thống kê tần suất từ.
5. Encode văn bản thành token id.
6. Tạo dữ liệu dạng sequence cho bài toán dự đoán từ tiếp theo.
7. Huấn luyện các mô hình N-Gram, LSTM và Transformer.
8. Đánh giá mô hình bằng Cross-Entropy Loss và Perplexity.
9. Triển khai API để nhập văn bản và nhận dự đoán.

---

## II. Cấu trúc dự án hiện tại

Cấu trúc dưới đây được cập nhật theo file `tree.txt` hiện tại của project.

```text
├── ./
│   ├── .dockerignore
│   ├── .env
│   ├── .gitignore
│   ├── docker-compose.yml
│   ├── Dockerfile
│   ├── Dockerfile.django
│   ├── print_tree.py
│   ├── pyproject.toml
│   ├── README.md
│   ├── task.txt
│   ├── tree.txt
│   │
│   ├── .github/
│   │   └── workflows/
│   │       └── ci.yml
│   │
│   ├── .vscode/
│   │   └── settings.json
│   │
│   ├── config/
│   │   └── config.yaml
│   │
│   ├── data/
│   │   ├── checkpoints/
│   │   │   └── lstm/
│   │   │
│   │   ├── colab/
│   │   │
│   │   ├── models/
│   │   │   └── .gitkeep
│   │   │
│   │   ├── predictions/
│   │   │   ├── .gitkeep
│   │   │   ├── lstm_20260315_070046_history.csv
│   │   │   └── lstm_20260315_070046_metrics.json
│   │   │
│   │   ├── processed/
│   │   │   ├── .gitkeep
│   │   │   ├── word_frequencies.json
│   │   │   │
│   │   │   ├── cleaned/
│   │   │   │   ├── cleaned_articles.json
│   │   │   │   └── split_sentences.json
│   │   │   │
│   │   │   ├── encoded/
│   │   │   │   ├── encoded_test_articles.pkl
│   │   │   │   ├── encoded_train_articles.pkl
│   │   │   │   ├── encoded_val_articles.pkl
│   │   │   │   └── vocab.pkl
│   │   │   │
│   │   │   └── tokenized/
│   │   │       ├── test_tokens.json
│   │   │       ├── train_tokens.json
│   │   │       └── val_tokens.json
│   │   │
│   │   └── raw/
│   │       ├── .gitkeep
│   │       ├── all/
│   │       │   ├── jsons/
│   │       │   └── texts/
│   │       └── dantri/
│   │
│   ├── docs/
│   │   ├── script.md
│   │   └── setup_project.md
│   │
│   ├── logs/
│   │   ├── .gitkeep
│   │   └── UndertheseaTokenizer_2026-04-28.log
│   │
│   ├── notebooks/
│   │   ├── 00_exploration.ipynb
│   │   ├── 01.eda_data_before_train.ipynb
│   │   ├── 01_eda_before_train.ipynb
│   │   ├── 02_training_evaluation.ipynb
│   │   ├── load_data.ipynb
│   │   ├── pipeline_next_word_prediction.ipynb
│   │   └── transformer_next_word_prediction.ipynb
│   │
│   ├── scripts/
│   │   ├── download_data.py
│   │   ├── predict.py
│   │   ├── predict_ngram.py
│   │   ├── preprocess_data.py
│   │   ├── train_model.py
│   │   └── __init__.py
│   │
│   ├── src/
│   │   ├── api/
│   │   │   ├── app.py
│   │   │   ├── fastapi_app.py
│   │   │   └── __init__.py
│   │   │
│   │   ├── crawlers/
│   │   │   ├── article.py
│   │   │   ├── base_crawler.py
│   │   │   ├── dantri_crawler.py
│   │   │   ├── thanhnien_crawler.py
│   │   │   ├── vietnamnet_crawler.py
│   │   │   ├── vnexpress_crawler.py
│   │   │   └── __init__.py
│   │   │
│   │   ├── data_processing/
│   │   │   ├── article_dataset.py
│   │   │   ├── preprocessor.py
│   │   │   ├── __init__.py
│   │   │   └── tokenizer/
│   │   │       ├── base_tokenizer.py
│   │   │       ├── pyvi_tokenizer.py
│   │   │       ├── tokenizer_factory.py
│   │   │       └── underthesea_tokenizer.py
│   │   │
│   │   ├── features/
│   │   │   ├── extractor.py
│   │   │   ├── selector.py
│   │   │   └── __init__.py
│   │   │
│   │   ├── models/
│   │   │   ├── base_model.py
│   │   │   ├── lstm_model.py
│   │   │   ├── model_factory.py
│   │   │   ├── ngram_model.py
│   │   │   ├── transformer_model.py
│   │   │   └── __init__.py
│   │   │
│   │   ├── pipelines/
│   │   │   ├── prediction_pipeline.py
│   │   │   ├── preprocessing_pipeline.py
│   │   │   ├── training_pipeline.py
│   │   │   └── __init__.py
│   │   │
│   │   └── utils/
│   │       ├── checkpoint_manager.py
│   │       ├── clean_text_utils.py
│   │       ├── config_loader.py
│   │       ├── logger.py
│   │       ├── teencode_dict.py
│   │       └── __init__.py
│   │
│   └── tests/
│       ├── test_crawlers.py
│       ├── test_models.py
│       ├── test_preprocessing_data.py
│       └── __init__.py
```

---

## III. Ý nghĩa các thư mục và file chính

### 1. `config/`

Chứa file cấu hình chính:

```text
config/config.yaml
```

File này dùng để quản lý tham số của project, ví dụ:

- đường dẫn dữ liệu
- tokenizer sử dụng
- batch size
- sequence length
- learning rate
- số epoch
- loại mô hình cần train
- đường dẫn checkpoint và kết quả dự đoán

---

### 2. `data/raw/`

Chứa dữ liệu thô sau khi crawl hoặc tải về.

Các nguồn dữ liệu hiện có trong project:

```text
data/raw/all/jsons/
data/raw/all/texts/
data/raw/dantri/
```

Ví dụ dữ liệu raw:

```text
VietNamNet_bat-dong-san-du-an_20260422_045819.json
VietNamNet_bat-dong-san-kim-oanh-group_20260422_045847.json
VnExpress_y-kien-thoi-su_20260421_164736.json
tintuc_doi-song_20260223_223552.txt
```

---

### 3. `data/processed/`

Đây là thư mục quan trọng nhất trong phần xử lý dữ liệu. Dữ liệu sau mỗi bước preprocessing sẽ được lưu vào đây.

#### `data/processed/cleaned/`

```text
cleaned_articles.json
split_sentences.json
```

Ý nghĩa:

- `cleaned_articles.json`: dữ liệu bài báo sau khi làm sạch.
- `split_sentences.json`: dữ liệu sau khi tách thành câu.

#### `data/processed/tokenized/`

```text
train_tokens.json
val_tokens.json
test_tokens.json
```

Ý nghĩa:

- `train_tokens.json`: dữ liệu train sau khi tách từ.
- `val_tokens.json`: dữ liệu validation sau khi tách từ.
- `test_tokens.json`: dữ liệu test sau khi tách từ.

#### `data/processed/encoded/`

```text
encoded_train_articles.pkl
encoded_val_articles.pkl
encoded_test_articles.pkl
vocab.pkl
```

Ý nghĩa:

- `encoded_train_articles.pkl`: dữ liệu train đã được encode thành token id.
- `encoded_val_articles.pkl`: dữ liệu validation đã được encode thành token id.
- `encoded_test_articles.pkl`: dữ liệu test đã được encode thành token id.
- `vocab.pkl`: vocabulary dùng để ánh xạ token sang id và id về token.

Ngoài ra còn có:

```text
data/processed/word_frequencies.json
```

File này lưu tần suất xuất hiện của từ/token trong tập dữ liệu.

---

### 4. `data/checkpoints/`

Chứa checkpoint của mô hình sau hoặc trong quá trình huấn luyện.

Hiện tại có:

```text
data/checkpoints/lstm/
```

Checkpoint dùng để:

- lưu trạng thái model
- resume training
- chọn model tốt nhất
- phục vụ inference/prediction

---

### 5. `data/predictions/`

Chứa kết quả training/evaluation/prediction.

Hiện tại có:

```text
lstm_20260315_070046_history.csv
lstm_20260315_070046_metrics.json
```

Ý nghĩa:

- `history.csv`: lịch sử huấn luyện qua từng epoch.
- `metrics.json`: kết quả đánh giá mô hình.

---

### 6. `notebooks/`

Chứa notebook phục vụ EDA, kiểm tra dữ liệu, huấn luyện thử và đánh giá.

Các notebook hiện có:

```text
00_exploration.ipynb
01.eda_data_before_train.ipynb
01_eda_before_train.ipynb
02_training_evaluation.ipynb
load_data.ipynb
pipeline_next_word_prediction.ipynb
transformer_next_word_prediction.ipynb
```

Gợi ý sử dụng:

- EDA dữ liệu trước khi train.
- Kiểm tra dữ liệu sau khi clean/tokenize/encode.
- Kiểm tra `vocab.pkl` và tần suất từ.
- Theo dõi loss/perplexity.
- Thử nghiệm LSTM và Transformer.

---

### 7. `scripts/`

Chứa các script chạy độc lập từ terminal.

```text
download_data.py
preprocess_data.py
train_model.py
predict.py
predict_ngram.py
```

Ý nghĩa:

- `download_data.py`: crawl hoặc tải dữ liệu.
- `preprocess_data.py`: chạy pipeline tiền xử lý.
- `train_model.py`: huấn luyện mô hình.
- `predict.py`: dự đoán bằng mô hình neural network.
- `predict_ngram.py`: dự đoán bằng mô hình N-Gram.

---

### 8. `src/crawlers/`

Chứa code crawl dữ liệu từ các trang báo.

```text
article.py
base_crawler.py
dantri_crawler.py
thanhnien_crawler.py
vietnamnet_crawler.py
vnexpress_crawler.py
```

Ý nghĩa:

- `article.py`: định nghĩa cấu trúc dữ liệu bài báo.
- `base_crawler.py`: class nền cho các crawler.
- `dantri_crawler.py`: crawler cho Dân trí.
- `thanhnien_crawler.py`: crawler cho Thanh Niên.
- `vietnamnet_crawler.py`: crawler cho VietNamNet.
- `vnexpress_crawler.py`: crawler cho VnExpress.

---

### 9. `src/data_processing/`

Chứa logic xử lý dữ liệu.

```text
article_dataset.py
preprocessor.py
tokenizer/
```

Ý nghĩa:

- `preprocessor.py`: làm sạch, chuẩn hóa và tách câu.
- `article_dataset.py`: tạo dataset/sequence cho training.
- `tokenizer/`: module tách từ tiếng Việt.

Trong `tokenizer/` có:

```text
base_tokenizer.py
pyvi_tokenizer.py
tokenizer_factory.py
underthesea_tokenizer.py
```

Ý nghĩa:

- `base_tokenizer.py`: interface chung cho tokenizer.
- `pyvi_tokenizer.py`: tokenizer dùng PyVi.
- `underthesea_tokenizer.py`: tokenizer dùng Underthesea.
- `tokenizer_factory.py`: chọn tokenizer theo cấu hình.

---

### 10. `src/models/`

Chứa các mô hình dự đoán từ tiếp theo.

```text
base_model.py
lstm_model.py
model_factory.py
ngram_model.py
transformer_model.py
```

Ý nghĩa:

- `base_model.py`: class nền cho model.
- `ngram_model.py`: mô hình N-Gram.
- `lstm_model.py`: mô hình LSTM.
- `transformer_model.py`: mô hình Transformer.
- `model_factory.py`: khởi tạo model theo cấu hình.

---

### 11. `src/pipelines/`

Chứa pipeline chính của project.

```text
preprocessing_pipeline.py
training_pipeline.py
prediction_pipeline.py
```

Ý nghĩa:

- `preprocessing_pipeline.py`: chạy toàn bộ quá trình tiền xử lý.
- `training_pipeline.py`: chạy quá trình huấn luyện.
- `prediction_pipeline.py`: chạy quá trình dự đoán.

---

### 12. `src/api/`

Chứa phần triển khai API.

```text
app.py
fastapi_app.py
```

Ý nghĩa:

- `fastapi_app.py`: FastAPI app cho dự đoán từ tiếp theo.
- `app.py`: app/entrypoint bổ sung tùy cấu hình triển khai.

---

### 13. `src/utils/`

Chứa các module tiện ích.

```text
checkpoint_manager.py
clean_text_utils.py
config_loader.py
logger.py
teencode_dict.py
```

Ý nghĩa:

- `checkpoint_manager.py`: lưu và tải checkpoint.
- `clean_text_utils.py`: các hàm làm sạch văn bản.
- `config_loader.py`: đọc cấu hình.
- `logger.py`: ghi log.
- `teencode_dict.py`: từ điển chuẩn hóa teencode.

---

### 14. `tests/`

Chứa unit test.

```text
test_crawlers.py
test_models.py
test_preprocessing_data.py
```

Các test kiểm tra:

- crawler
- model
- preprocessing/data processing

---

## IV. Pipeline tổng quát

Flow xử lý chính của dự án:

```text
Raw Articles
    ↓
Crawling / Download Data
    ↓
Clean Text
    ↓
Sentence Splitting
    ↓
Tokenization
    ↓
Build Vocabulary
    ↓
Encode Articles
    ↓
Create Dataset / DataLoader
    ↓
Train Model
    ↓
Evaluate
    ↓
Predict Next Word
    ↓
Deploy API
```

---

## V. Quy trình chuẩn của đồ án

### Bước 1: Data Collection

**Mục tiêu:** thu thập dữ liệu bài báo tiếng Việt.

Code liên quan:

```text
src/crawlers/
scripts/download_data.py
```

Crawler hiện có cho nhiều nguồn:

```text
VnExpress
VietNamNet
Dân trí
Thanh Niên
```

Output:

```text
data/raw/
```

---

### Bước 2: Text Preprocessing

**Mục tiêu:** làm sạch và chuẩn hóa dữ liệu văn bản.

Code liên quan:

```text
src/data_processing/preprocessor.py
src/utils/clean_text_utils.py
scripts/preprocess_data.py
```

Các thao tác chính:

- loại bỏ ký tự rác
- chuẩn hóa khoảng trắng
- chuẩn hóa teencode nếu có
- tách bài báo thành câu
- lọc câu quá ngắn hoặc không hợp lệ
- lưu dữ liệu cleaned và split sentence

Output:

```text
data/processed/cleaned/cleaned_articles.json
data/processed/cleaned/split_sentences.json
```

---

### Bước 3: Tokenization

**Mục tiêu:** tách từ tiếng Việt để mô hình hiểu đúng đơn vị từ.

Code liên quan:

```text
src/data_processing/tokenizer/
```

Tokenizer hỗ trợ:

```text
PyVi
Underthesea
```

Output:

```text
data/processed/tokenized/train_tokens.json
data/processed/tokenized/val_tokens.json
data/processed/tokenized/test_tokens.json
```

---

### Bước 4: Build Vocabulary và Encode Data

**Mục tiêu:** chuyển token thành số để đưa vào mô hình.

Output vocabulary:

```text
data/processed/encoded/vocab.pkl
```

Output encoded data:

```text
data/processed/encoded/encoded_train_articles.pkl
data/processed/encoded/encoded_val_articles.pkl
data/processed/encoded/encoded_test_articles.pkl
```

File thống kê tần suất từ:

```text
data/processed/word_frequencies.json
```

---

### Bước 5: Modeling & Training

**Mục tiêu:** huấn luyện mô hình dự đoán từ tiếp theo.

Code liên quan:

```text
src/models/
src/pipelines/training_pipeline.py
scripts/train_model.py
```

Các mô hình hiện có:

```text
N-Gram
LSTM
Transformer
```

Checkpoint model:

```text
data/checkpoints/lstm/
```

Kết quả training:

```text
data/predictions/lstm_20260315_070046_history.csv
data/predictions/lstm_20260315_070046_metrics.json
```

---

### Bước 6: Evaluation

**Mục tiêu:** đánh giá chất lượng mô hình.

Metric chính:

- Cross-Entropy Loss
- Perplexity

Với bài toán dự đoán từ tiếp theo, **Perplexity** thường quan trọng hơn Accuracy vì bài toán có vocabulary lớn và nhiều từ có thể hợp lý trong cùng một ngữ cảnh.

Công thức:

```text
perplexity = exp(loss)
```

Ý nghĩa:

- Perplexity càng thấp thì mô hình càng tự tin.
- Perplexity càng cao thì mô hình càng phân vân giữa nhiều từ.

---

### Bước 7: Prediction & Deployment

**Mục tiêu:** dùng mô hình đã train để dự đoán từ tiếp theo.

Code liên quan:

```text
src/pipelines/prediction_pipeline.py
scripts/predict.py
scripts/predict_ngram.py
src/api/fastapi_app.py
```

Flow dự đoán:

```text
Input text
    ↓
Clean text
    ↓
Tokenize
    ↓
Convert token to id using vocab.pkl
    ↓
Model predicts next token
    ↓
Convert predicted id back to word
    ↓
Return result
```

---

## VI. Hướng dẫn chạy project

### 1. Cài đặt môi trường

Cài project ở chế độ editable:

```bash
pip install -e .
```

Nếu project có file dependency riêng, có thể cài thêm theo file đó:

```bash
pip install -r requirements.txt
```

---

### 2. Chạy crawl/tải dữ liệu

```bash
python scripts/download_data.py
```

Dữ liệu raw được lưu vào:

```text
data/raw/
```

---

### 3. Chạy tiền xử lý dữ liệu

```bash
python scripts/preprocess_data.py
```

Sau khi chạy xong, kiểm tra các file:

```text
data/processed/cleaned/cleaned_articles.json
data/processed/cleaned/split_sentences.json
data/processed/tokenized/train_tokens.json
data/processed/tokenized/val_tokens.json
data/processed/tokenized/test_tokens.json
data/processed/encoded/vocab.pkl
data/processed/encoded/encoded_train_articles.pkl
data/processed/encoded/encoded_val_articles.pkl
data/processed/encoded/encoded_test_articles.pkl
```

---

### 4. Huấn luyện mô hình

```bash
python scripts/train_model.py
```

Checkpoint được lưu trong:

```text
data/checkpoints/
```

Kết quả training/evaluation được lưu trong:

```text
data/predictions/
```

---

### 5. Dự đoán bằng mô hình neural network

```bash
python scripts/predict.py
```

---

### 6. Dự đoán bằng N-Gram

```bash
python scripts/predict_ngram.py
```

---

### 7. Chạy FastAPI

File API chính:

```text
src/api/fastapi_app.py
```

Chạy server:

```bash
uvicorn src.api.fastapi_app:app --host 0.0.0.0 --port 8000 --reload
```

Endpoint:

```text
GET  http://localhost:8000/health
POST http://localhost:8000/predict
GET  http://localhost:8000/docs
```

Ví dụ request JSON:

```json
{
  "text": "ứng dụng công nghệ",
  "top_k": 5,
  "temperature": 1.0
}
```

---

### 8. Chạy bằng Docker

Build và chạy container:

```bash
docker-compose up --build -d
```

Sau khi chạy, kiểm tra port được khai báo trong `docker-compose.yml` để truy cập API hoặc giao diện tương ứng.

---

## VII. Chạy notebook

Các notebook nằm trong:

```text
notebooks/
```

Gợi ý thứ tự sử dụng:

```text
00_exploration.ipynb
→ 01_eda_before_train.ipynb hoặc 01.eda_data_before_train.ipynb
→ load_data.ipynb
→ pipeline_next_word_prediction.ipynb
→ 02_training_evaluation.ipynb
→ transformer_next_word_prediction.ipynb
```

Notebook thường dùng để:

- kiểm tra dữ liệu raw/cleaned/tokenized/encoded
- EDA độ dài câu, số token, tần suất từ
- kiểm tra `vocab.pkl`
- kiểm tra các từ hiếm hoặc từ cuối vocabulary
- xem lịch sử train loss/perplexity
- thử nghiệm mô hình LSTM hoặc Transformer

---

## VIII. Chạy kiểm thử

Chạy toàn bộ test:

```bash
python -m pytest tests -v
```

Chạy test kèm coverage:

```bash
python -m pytest tests -v --cov=src --cov-report=term-missing
```

Các test hiện có:

```text
tests/test_crawlers.py
tests/test_models.py
tests/test_preprocessing_data.py
```

Nếu chạy trong Docker container:

```bash
docker exec -it next-word-prediction-ai-assistant bash
python -m pytest tests -v --cov=src --cov-report=term-missing
```

---

## IX. Các file đầu ra quan trọng

Sau khi chạy đầy đủ pipeline, các file quan trọng cần kiểm tra gồm:

### Dữ liệu đã làm sạch

```text
data/processed/cleaned/cleaned_articles.json
data/processed/cleaned/split_sentences.json
```

### Dữ liệu đã tokenize

```text
data/processed/tokenized/train_tokens.json
data/processed/tokenized/val_tokens.json
data/processed/tokenized/test_tokens.json
```

### Dữ liệu đã encode

```text
data/processed/encoded/encoded_train_articles.pkl
data/processed/encoded/encoded_val_articles.pkl
data/processed/encoded/encoded_test_articles.pkl
```

### Vocabulary

```text
data/processed/encoded/vocab.pkl
```

### Tần suất từ

```text
data/processed/word_frequencies.json
```

### Checkpoint model

```text
data/checkpoints/lstm/
```

### Kết quả training/evaluation

```text
data/predictions/lstm_20260315_070046_history.csv
data/predictions/lstm_20260315_070046_metrics.json
```

---

## X. Ghi chú về các mô hình

### 1. N-Gram

N-Gram là mô hình baseline dựa trên thống kê tần suất xuất hiện của các cụm từ.

Ưu điểm:

- đơn giản
- dễ hiểu
- chạy nhanh
- phù hợp làm baseline

Nhược điểm:

- khó học ngữ cảnh dài
- dễ thiếu dữ liệu với cụm từ hiếm
- không tổng quát tốt với câu mới

---

### 2. LSTM

LSTM là mô hình neural network phù hợp với dữ liệu chuỗi.

Ưu điểm:

- học được quan hệ theo thứ tự từ
- phù hợp với bài toán language modeling
- tốt hơn N-Gram khi dữ liệu đủ lớn

Nhược điểm:

- train lâu hơn N-Gram
- khó học ngữ cảnh rất dài
- dễ overfitting nếu dữ liệu ít hoặc nhiễu

---

### 3. Transformer

Transformer sử dụng cơ chế self-attention để học quan hệ giữa các token.

Ưu điểm:

- học ngữ cảnh tốt
- xử lý quan hệ xa giữa các từ
- phù hợp với NLP hiện đại

Nhược điểm:

- cần nhiều tài nguyên hơn
- cần dữ liệu nhiều hơn
- cấu hình phức tạp hơn LSTM

---

## XI. Các file quan trọng cần nhớ

```text
config/config.yaml
scripts/download_data.py
scripts/preprocess_data.py
scripts/train_model.py
scripts/predict.py
scripts/predict_ngram.py
src/crawlers/
src/data_processing/preprocessor.py
src/data_processing/article_dataset.py
src/data_processing/tokenizer/
src/models/lstm_model.py
src/models/ngram_model.py
src/models/transformer_model.py
src/models/model_factory.py
src/pipelines/preprocessing_pipeline.py
src/pipelines/training_pipeline.py
src/pipelines/prediction_pipeline.py
src/api/fastapi_app.py
src/utils/checkpoint_manager.py
src/utils/config_loader.py
data/processed/encoded/vocab.pkl
data/checkpoints/lstm/
data/predictions/
```

---

## XII. Tổng kết

Project hiện tại có cấu trúc rõ ràng theo từng module:

```text
Crawl data
→ Clean text
→ Split sentences
→ Tokenize
→ Build vocabulary
→ Encode data
→ Create dataset
→ Train model
→ Evaluate
→ Predict
→ Deploy API
```

So với README cũ, phiên bản này đã được cập nhật lại theo cấu trúc thật trong `tree.txt`, đặc biệt là các phần:

- `data/processed/cleaned/`
- `data/processed/tokenized/`
- `data/processed/encoded/`
- `data/checkpoints/lstm/`
- `data/predictions/`
- tokenizer PyVi/Underthesea
- mô hình N-Gram, LSTM, Transformer
- pipeline preprocessing/training/prediction
- FastAPI app tại `src/api/fastapi_app.py`

Đây là README dùng để mô tả đúng flow hiện tại của dự án Next Word Prediction tiếng Việt.
