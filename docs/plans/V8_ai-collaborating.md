# Thiết kế hệ thống lọc cộng tác và kết hợp hybrid (Collaborative + Content-based)

- ALS model và semantic user_profile cho gợi ý hybrid và giải thích tương mình với evidences rõ ràng

## Luồng hoạt động

- Khi user tương tác với phim (click, like, dislike, yêu thích, rating, comment, ..) thì cập nhật vào bảng tương tác. 

- Đồng thời bắn sự kiện cho ai-service vào queue (interaction.queue, exchange: interaction.exchange; routingKey: interaction.event; type:topic). AI-service lắng nghe và tính toán lại ma trận tương tác để đưa vào mô hình hybrid (user_cf_vectors, movie_cf_vectors, user_profile_vectors) và lưu vào vector db (hiện tại lại chroma db và chưa có các service và hàm tương ứng để lưu các vector trong các collection của schroma nên hãy tạo hàm thao tác với db linh động (giữ nguyên code cũ) và các service để tính toán lại vector và lưu lại db).

- AI service phải nhận các sự kiện này và cập nhật lại các vectors liên quan đến hành vi và tươngtac của user nha. Đồng thời đưa các lỗi vào dead letter queue (name: interaction.queue.dlq; ex: interaction.queue.dlx; routingKey: interaction.queue.dlq.rk) và backend NestJS sẽ consumer dlq này để log và lưu các lỗi này. Tương tự như cái recommendation.queue đã làm trước đó nhá

- Việc retrain model hybrid sẽ dùng ALS model đã code ở notebooks 08_collaborating. Train theo giờ cố định và có thể 1 hoăc 2 lần trong ngày. Lượng tương tác là rất lớn nên khi train hay chia từng phần gửi qua queue sau đó upload lên storage ở nơi riêng để tránh lộn xộn. Khi train model hãy load các dữ liệu tương tác này và train lại  ALS model (có thể dùng parquet hay gì đó nhanh nhẹ)

- Lưu trữ model ở storage (R2 Storage). Lưu trữ model mới và có thể xóa model cũ sau đó. Khi app khởi động hay retrain xong thì hãy gán model vào server đi để dùng cho các request

- Lưu các vector của model ALS này vào các collections tương ứng đã nói ở trên và khi có tương tác mới thì cập nhật đồng bộ user_cf_vectors theo tương tác của user nha (cái này cập nhật liên tục dựa theo hành vi user). Còn model retrain thì cùng thay đổi collections này lấy lại user_cf_vectors và movie_cf_vectors theo model retrain nha.

- Cần check xem liệu user hay movie có tồn tại trước khi model train lần gần nhất hay không nha vì ALS sẽ lỗi nếu như user hay movie mới tạo và chưa có trong vector của model

- Chú ý mapping chỉ lưu user id (kiểu UUID và int (data cũ)). Lưu cái mapping cùng với model nha. Không cần movie id vì đòng nhất type int. Cần dọn dẹp mapping cũ khi mà retrain model

- Với semantic theo hành vi user với những phìm nào thì lưu vào collection user_profile_vectors, sau khi tương tác thì cứ cập nhật lại vector này của user dựa trên score và phải chú ý đến trọng số thời gian (càng gần càng ưu thế chứ 5 năm trước xem mà gợi ý thì không hợp lý lắm)

- Hybrid 2 loại model này và cungc rerank thư hạng để gợi ý cho user này. Đồng thời phải sẵn sàng cung cập evidence để Explain AI service có thể dựa và evidences mà diễn giải kết quả hợp lý.

- Tóm lại là retrain với chia nhỏ khi gửi qua queue vì data rất lớn, xử lý xong lưu vào storage (R2) và cập nhật tương tác liên tục sau khi nhận event tương tác của user và các vector đã lưu ở vector db (user_cf_vectors và user_profile_vectors) chú ý kiểm tra tồn tại user hay movie mới tạo nha (return liền khi không tồn tại)

- Sau khi retrain model thành công có thể xóa data cũ ở storage