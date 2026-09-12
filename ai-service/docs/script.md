## Script hướng dẫn chạy lệnh tải dữ liệu
```
python scripts/download_data.py --pages 15 --threads 4
python scripts/download_data.py --source dantri --pages 20 --threads 6
python scripts/download_data.py --source vnexpress --pages 20 --threads 6
python scripts/download_data.py --source all --pages 30 --threads 12
```

## Script hướng dẫn chạy lệnh tiền xử lý dữ liệu
```
python scripts/preprocess_data.py --input_dir "data/raw/vnexpress" --output_dir "data/processed"
python scripts/preprocess_data.py --input_dir "data/raw/dantri" --output_dir "data/processed"
python scripts/preprocess_data.py --input_dir "data/raw/all" --output_dir "data/processed"
```

## Script hướng dẫn chạy lệnh huấn luyện mô hình
```
python scripts/train_model.py --model ngram
python scripts/train_model.py --model lstm
```
```
# Lần đầu — train bình thường, tự động lưu checkpoint mỗi epoch
python scripts/train_model.py --model lstm

# Colab bị ngắt → reconnect → chạy lại với --resume
python scripts/train_model.py --model lstm --resume
# → Tự phát hiện epoch_018.pt → tiếp tục từ epoch 19

# Early stopping đã kích hoạt nhưng muốn train thêm
python scripts/train_model.py --model lstm --resume --extra_epochs 15
# → Tổng epochs = 30 + 15 = 45, tiếp tục train thêm

# Xem đã train đến đâu mà không cần load weights
cat data/checkpoints/lstm/meta.json
```


## Script hướng dẫn chạy lệnh dự đoán từ tiếp theo
```
python scripts/predict.py
python scripts/predict_ngram.py
```

## Script hướng dẫn chạy API
```
uvicorn src.api.fastapi_app:app --host 0.0.0.0 --port 8000 --reload

cd src/api/django
python manage.py migrate
python manage.py runserver 0.0.0.0:8001
```

## Script hướng dẫn chạy Docker cho Web
```
docker compose up --build -d ai-assistant

docker compose up --build -d django-web
```
