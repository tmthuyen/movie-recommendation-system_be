# Hướng dẫn chạy FastAPI Service

## A. Chạy trong môi trường venv

### 1. Tạo môi trường ảo (để không làm rác máy tính)
python -m venv .venv

### 2. Kích hoạt môi trường (Lệnh riêng cho Windows PowerShell)
.\.venv\Scripts\activate

### 3. Cài đặt các thư viện cần thiết 
pip install -e .

### 4. Cài đặt toàn bộ (bao gồm cả Core và nhóm Dev Tools)
pip install -e .[dev]


## B. Hướng dẫn chạy lệnh huấn luyện mô hình (Mẫu)
```
python scripts/train_baseline.py 
```

## C. Hướng dẫn chạy API
```
uvicorn src.api.server:app --host localhost --port 8082 --reload
```
