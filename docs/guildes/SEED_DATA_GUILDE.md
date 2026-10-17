# Nhập seed data

- Cập nhật các entity như trên git
- Sử dụng file sql đã cung cấp và import và db
- Chạy các lệnh sql dưới đây để khóa chính các bảng mới import có thể auto increment sau này

    ```
    SELECT setval(
        pg_get_serial_sequence('genres', 'id'), 
        COALESCE((SELECT MAX(id) FROM genres), 1)
    );
    ```

    ```
    SELECT setval(
        pg_get_serial_sequence('movies', 'id'), 
        COALESCE((SELECT MAX(id) FROM movies), 1)
    );
    ```
    ```
    SELECT setval(
        pg_get_serial_sequence('seed_ratings', 'id'), 
        COALESCE((SELECT MAX(id) FROM seed_ratings), 1)
    );
    ```