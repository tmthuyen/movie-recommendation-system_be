import os

# Tạo file txt mới
with open("tree.txt", "w", encoding="utf-8") as f:
    for root, dirs, files in os.walk("."):
        # CHẶN các thư mục rác ở đây
        dirs[:] = [d for d in dirs if d not in ['venv', 'Lib', 'Include', 'Scripts', '.git', '__pycache__', 'data_mining_project.egg-info']]
        
        level = root.replace(".", "").count(os.sep)
        indent = "│   " * level
        f.write(f"{indent}├── {os.path.basename(root)}/\n")
        for file in files:
            if not file.endswith(".pyc"): # Bỏ qua file .pyc
                f.write(f"{indent}│   └── {file}\n")

print("Đã xong! Bạn hãy mở file 'tree.txt' để xem kết quả.")