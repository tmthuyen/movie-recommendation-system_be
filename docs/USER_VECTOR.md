# Tài liệu yêu cầu cải thiện backup

- Hướng dẫn agents: đây là yêu cầu backup, các agents không cần edit file này hay hiểu nộ dung file này.

## Chi tiết các yêu cầu:

Rồi hãy chốt lại các ý đã trao đổi:
Nếu tổ hợp req random vô vàng thì tôi không thể cải thiện thêm nữa với giới hạn hạ tầng và cầu hình hiện tại
Tôi muốn cải thiện luồng tốt hơn như sau:

### plan 1: cải thiện cache, lock, stats, semantic/forYou

- Cache hiệu quả với redis lock, watchdog, realease lock, reecheck khi get; bạn cần clean code một chút xíu với redis cache hiện tại, sử dụng redis lock service đi, không code lại các function về lock nữa; nếu là load hay get thì được phép code và lock vẫn dùng redis lock service

- trong recommendation service không được cập nhật logic gì của rerank API: Cấm

- Hãy nâng cấp logic semantic search, forYou phần cursor đi: semantic chuẩn hóa keywword khi lưu, khi load phim score rank từ AI service, bạn cần phải check id của movie trong list đó đó có detail trong cache hay chưa, nếu có thì lấy từ cache trước, không query thẳng xuống db, gom các id bị miss rồi truy vấn (này cứ thiết kê vậy đi xem có hiệu quả hay không nếu cache được warm up tốt)

- Với dữ liệu thống kê: cũng sử dụng tương tự vào cache, áp dụng lock, khi các count thay đổi chỉ cần cập nhật thằng trong redis, dữ liệu sẽ đồng bộ với database bằng cronjob cập nhật thống kê, các tương tác xảy ra, bắt buộc phải thao tác với cache trước và động bộ vào database bằng job và có lock khi chạy job, có thể bổ sung các thông kê phim theo click count: theo tuần, tháng; API stats sẽ trả về các phim hot, click/xem nhiều, rating cao (nhớ lưu rating total, rating avg, và count để thống kê tốt nha)

- Bố sung cache TTL lâu hơn tý đi chứ ngắn quá, đặc biết với detail,

### plan 2: lưu lịch sử search keyword và cập nhật collection vector

- Với search: cần lưu trữ lại lịch sử tìm kiếm của user: search history, đồng thời mỗi lần search và có kết quả thì truyền event qua queue, keyword và user id để AI service nhận từ queue, lưu vào collection mới gọi là: user_search_vector, khi gợi ý hybrid cũng sẽ lấy từ nguồn này kết hợp semantic profile và íALS model,

- Cần tách các loại user vector ra: user_long_term_vector (embedding các phim có tương tác tích cực, embeding search truy vấn), user_short_term_vector (embedding các phim tương tác gần đây) user_search_vector (embedding các keywor mõi khi user tìm kiếm phim chi cần req là cấp nhật nhớ lưu payload chuẩn hóa vào vector rồi mới encode), user_genre_preference_vector (vecto các phim mà user có xu hương tuonwg tác nhieuf và thích thể loại mỗi khi có even tương tác với phim, bắt buộc lấy genreid của phim và cập nhật weight theo mức độ tương tác, cập nhật range nhỏ thôi, vì vector này không phải là của BERT, ) như vậy khi gợi ý for you sẽ lấy tất cả nguồn nguôn như trên và reranking lại, với genre vector sẽ đem các phim popularity từ backend list 100 movieids / genreids tạo lại ma trận và tạo vector rồi đem tính tương tự với vector genre của user đó, lấy nhưng id phim rank theo score, danh sách genreid và 100 movie phổ biến của genre sé lưu ở redis 12h mỗi ngày, job backend cập nhật lại

bây giờ hãy đọc yêu cầu này, tôi ưu lại hệ thống
chia làm 2 plan độc lập và quản lý theo phase mỗi task trong từng plan để quản lý
plan 2 là ý lưu lịch sử search keyword và cập nhật lại collection vector, bạn chỉ đọc thôi và viêt lại yêu cầu nguyên bản này vào plan, chưa cần nghiên cứu kỹ yêu cầu này, xử lý plan 1 các task trên trước đã, plan 2 trạng thái chưa duyệt và chưa triên khải nha

nào hãy viết plan đi, để xme bạn hiểu yêu cầu không
