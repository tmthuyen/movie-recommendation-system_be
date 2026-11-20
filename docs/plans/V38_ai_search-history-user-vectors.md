# V38 — Lịch sử tìm kiếm & cập nhật collection user vector

- **Trạng thái:** ⚪ **CHƯA DUYỆT / CHƯA TRIỂN KHAI**
- **Người thực hiện:** Chờ developer phê duyệt
- **Thời gian ghi nhận:** 2026-11-20
- **Scope:** `ai` (liên quan backend producer + Redis popularity cache)
- **Plan độc lập:** Có. Không block V37.

## Yêu cầu nguyên bản (giữ nguyên, chưa research)

> Với search: cần lưu trữ lại lịch sử tìm kiếm của user: search history, đồng thời mỗi lần search và có kết quả thì truyền event qua queue, keyword và user id để AI service nhận từ queue, lưu vào collection mới gọi là: user_search_vector, khi gợi ý hybrid cũng sẽ lấy từ nguồn này kết hợp semantic profile và íALS model,
> - Cần tách các loại user vector ra: user_long_term_vector (embedding các phim có tương tác tích cực, embeding search truy vấn), user_short_term_vector (embedding các phim tương tác gần đây) user_search_vector (embedding các keywor  mõi khi user tìm kiếm phim chi cần req là cấp nhật nhớ lưu payload chuẩn hóa vào vector rồi mới encode), user_genre_preference_vector (vecto các phim mà user có  xu hương tuonwg tác nhieuf và thích thể loại mỗi khi có even tương tác với phim, bắt buộc lấy genreid của phim và cập nhật weight theo mức độ tương tác, cập nhật range nhỏ thôi, vì vector này không phải là của BERT, ) như vậy khi gợi ý for you sẽ lấy tất cả nguồn nguôn như trên và reranking lại, với genre vector sẽ đem các phim popularity từ backend list 100 movieids / genreids tạo lại ma trận và tạo vector rồi đem tính tương tự với vector genre của user đó, lấy nhưng id phim rank theo score, danh sách genreid và 100 movie phổ biến của genre sé lưu ở redis 12h mỗi ngày, job backend ca[ạ nhật lại

## Phân rã ở mức ghi nhận (chưa thiết kế)

| Phase | Nội dung | Trạng thái |
|---|---|---|
| 0 | Ghi nhận yêu cầu nguyên bản | `[x]` |
| 1 | Search history + queue event `keyword + userId` | `[ ]` Chưa duyệt |
| 2 | Collection `user_search_vector` | `[ ]` Chưa duyệt |
| 3 | Hybrid dùng `user_search_vector` + semantic profile + ALS | `[ ]` Chưa duyệt |
| 4 | Tách 4 loại user vector | `[ ]` Chưa duyệt |
| 5 | ForYou rerank từ mọi nguồn vector | `[ ]` Chưa duyệt |
| 6 | Genre vector + ma trận 100 movieIds/genreIds | `[ ]` Chưa duyệt |
| 7 | Redis 12h + job backend cập nhật ngày | `[ ]` Chưa duyệt |

## Điều kiện bắt đầu

- Developer phê duyệt.
- V37 hoàn thành hoặc tách rõ ranh giới.
- Không tự động implement cùng V37.
