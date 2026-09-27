# Rules for backend

## Kết quả trả về

### Thành công

- Thành công bình thường
```
{
  success: true,
  statusCode: 2xx, 3xx
  message: '',
  result:{}
}
```
- Với list có thêm pagination:
```
 {
  success: true
  statusCode, message, 
  result: [],
  pagination: {
    total: 100,
    page: 1,
    limit: 10,
    totalPages: 10,
  }
}
```

### Tiêu chuẩn Query Params Phân trang
- Mọi API Get List có phân trang đều dùng chung DTO `PaginationDto`:
  - `page`: Trang hiện tại (mặc định: 1)
  - `limit`: Số phần tử trên mỗi trang (mặc định: 10)
  - `keyword`: (Optional) Dùng để tìm kiếm chung (tìm theo tên, email, title, ... tùy logic API).

### Thất bại
- statusCode, message, errorCode, success = false, timestamp, path
```
{
  success: false,
  statusCode: 4xx, 5xx
  message: '',
  errorCode: '',
  timestamp: '',
  path: ''
}
```

### Khi lỗi

- Sử dụng httpException của nestjs hoặc AppException (common/custom-exception class)

- Tuyệt đối không dùng Error lỏ nha

- TẤT CẢ CÁC EXCEPTION MESSAGE (Thông báo lỗi) trả về cho client PHẢI BẰNG TIẾNG VIỆT, TUYỆT ĐỐI CẤM DÙNG TIẾNG ANH (Ví dụ: `throw new BadRequestException('Quốc gia không tồn tại')`).

## Auth

- Login: data: { acccessToken, refreshToken }, refreshToken httpOnly cookie

- Get me sau khi đăng nhập trả về thông tin user

- Mã hóa password, sử dụng bcrypt

- JWT cho accessToken và opaque random string cho refreshToken (lưu user sesions)

- Đưa các scopes vào acccessToken

- Có quản lý thiết bị đăng nhập

- Đăng xuất, đăng xuất all, đăng xuất theo sessionId

- Revoke token khi refesh, lưu blacklist jti accessToken sau khi đăng xuất mà vẫn còn hạn

- Xác thực phân quyền người dùng (Role-Based Access Control). Với permission để mở rộng.

- Tạo bảng token để: xác thực email khi đăng ký, quên mật khẩu, reset mật khẩu

- Đăng ký thì gửi mail xác thực, click vào link mail thì tài khoản mới được active


## Security

- Ratelimit APi quan trọng: theo ip, theo userId

- Có thể dùng redis

## Database

- Không được tim Reposiroty của nestjs typeorm vô trực tiếp Service. Phải viết interface riêng Reposiroty và viết implement chung 1 file. Service sẽ tim IUserRepository vào Service

- Không được có n+1 query

- Chỉ trả về dữ liệu cần thiết

- Tối ưu truy vấn và trả đủ dữ liệu cần thiết

- Đảm bảo tính nhất quán ở một số transaction liên tục. Sử dụng transaction của typeorm cho những case này

## Event

- Các sự kiện gửi đồng bộ qua message queue
- Không block luồng chính

## Caching

- Cache những API thường xuyên dùng

## Log

- Không log thông tin nhạy cảm

## Storage / Upload

- Các file tĩnh (ảnh phim, avatar user) không lưu trên disk local mà phải lưu trên Object Storage (S3 / Cloudflare R2).
- Sử dụng Design Pattern Strategy hoặc Interface (`IStorageService`) để dễ dàng swap giữa các provider.
- Validate chặt chẽ kích thước file (giới hạn Max Size) và định dạng file (MIME type).

## User Interactions & Behavior

- Các hành vi (view, rating, comment, favorite) ngoài việc lưu vào các bảng cụ thể (như `comments`, `ratings`) thì cần lưu lịch sử (log) vào bảng `interactions` để phục vụ cho thuật toán Gợi ý (AI Recommendation) sau này.
- Dùng Message Queue hoặc bất đồng bộ (EventEmitter) để ghi log tương tác, tránh làm chậm response của API chính.


## Validation

- Kiếm tra và validation dữ liệu DTO hoặc params request

##  Viết code

- Biên cammelCase, cột db là snake_case

- Viết code rõ ràng, dễ hiểu, 

- Dễ mở rộng và bảo trì khi thay đổi provider, lib

- ví dụ mail: có nhiều cách để gửi mail khác nhau

- Giao tiếp event, caching

- Log tập trung
- Caching
- Tối ưu query db
- Đảm bảo transaction toàn vẹn, ACID
- Giải quyết N + 1 query
- Rate limiting, cors, DDoS attack, security
- Giao tiếp message queue, xử lý message lỗi (dead letter queue), lưu lại khi vẫn lỗi
- Response đúng format cho success / err
- Chia tách code rõ ràng, không All In File, có khả năng tái sử dụng cao, dễ maintain, dễ sửa đổi
- Clean code như design pattern, abstraction (interface), SOLID principle, Dependency Invertion
- Unit test cơ bản
- UI thân thiện, hiện đại, đồng nhất các trang, spacing, responsive, 
cấm tông màu lệch lạc (quá AI thô sơ), animation, frame motion, …"
- Sử dụng git thành thạo
- Tên nhánh: fea/{domain làm việc, fixbug, ...}: fea/aut; fea/users, / fea/movie, fea/ai-**
main để show, dev staging, production deploy
- Commit message đúng format: fea: **   \n task: ui **, backend **, Ai***
fea: auth
task: luồng đăng ký đăng nhập, sửa bug, sửa docs
- Dùng rebase để tạo commit thẳng và đẹp, Hạn chế merge local merge remote
- Làm cái luồng gì viết các plans / docs bỏ vô docs/**.md"