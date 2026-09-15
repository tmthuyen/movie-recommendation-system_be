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


# Viết code

- Biên cammelCase, cột db là snake_case

- Viết code rõ ràng, dễ hiểu, 

- Dễ mở rộng và bảo trì khi thay đổi provider, lib

- ví dụ mail: có nhiều cách để gửi mail khác nhau

- Giao tiếp event, caching