# 1. Tạo môi trường ảo (để không làm rác máy tính)
python -m venv .venv

# 2. Kích hoạt môi trường (Lệnh riêng cho Windows PowerShell)
.\.venv\Scripts\activate

# 3. Cài đặt các thư viện cần thiết 
pip install -e .

# Cài đặt toàn bộ (bao gồm cả Core và nhóm Dev Tools)
pip install -e .[dev]