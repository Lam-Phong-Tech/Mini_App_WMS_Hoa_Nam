# State matrix — Prompt 01

Prompt 01 dùng profile Login đã được duyệt: Chromium `390×844` CSS px, DPR
`3`, `vi-VN`, `Asia/Ho_Chi_Minh`, safe-area `0`, không device frame. Fixture
chính thức là `../00/login-d07-390x844-dpr3.png`. Các fixture auth trong test
chỉ dùng định danh/token giả, không gọi DEV.

| State | Entry | Data được phép hiện | CTA / Back | Side effect |
| --- | --- | --- | --- | --- |
| `login.idle` | Không có phiên hoặc phiên hỏng/hết hạn | Form email/mật khẩu của người dùng | Đăng nhập; hiện/ẩn mật khẩu | Không có |
| `login.submitting` | Form hợp lệ được gửi | Form đang nhập, trạng thái đang xác thực | Khoá gửi trùng | `POST /auth/login` hiện hữu |
| `login.failed` | Login trả lỗi | Giữ email/mật khẩu, lỗi đã phân loại | Thử lại | Không tự retry |
| `login.different-user` | Người dùng B đăng nhập sau phiên fixture A | Chỉ có token/session B; không giữ `userId` A | Xác nhận phiên bằng `/auth/me` | `POST /auth/login` hiện hữu |
| `session.loading` | Login thành công lần này | Chỉ định danh phiên nếu có | Đăng xuất | `GET /auth/me` để lấy dữ liệu đã xác minh |
| `session.ready` | `GET /auth/me` thành công | Tên, email, vai trò, phạm vi kho do BE trả | Tiếp tục vào ứng dụng; Đăng xuất | Không gọi API ca |
| `session.profile-error` | `GET /auth/me` lỗi | Không bịa tên/kho; thông báo + thử lại | Thử lại; Đăng xuất | Không có |
| `session.logout` | Nhấn Đăng xuất | Trạng thái đang đăng xuất | Không bấm lặp | `POST /auth/logout`, sau đó xoá phiên local |
| `session.forced-relogin` | Refresh bị 401 hoặc app khởi động sau refresh dở | Không dùng lại token cũ; lý do buộc đăng nhập lại | Đăng nhập lại | Xoá local session và refresh marker |

## Bằng chứng thiết bị thật — 2026-09-11

- Xiaomi `2206122SC`, Android 13: Login DEV → `GET /auth/me` → xác nhận
  phiên hiển thị người dùng/vai trò/phạm vi kho → Home.
- Logout có hộp thoại xác nhận và quay lại Login; re-login thành công, tiếp
  tục vào Home. Không thực hiện scan hay thao tác thay đổi tồn/chứng từ.

## Fixture kiểm soát được duyệt — 2026-09-11

- Refresh bị server từ chối (401): `refreshSession()` xoá session và marker;
  test xác nhận nhánh này không dùng token lại.
- Refresh bị ngắt/mất mạng: marker được giữ và `recoverAfterRestart()` buộc
  đăng nhập lại, tránh replay refresh token.
- Đổi người dùng: fixture B ghi đè toàn bộ token fixture A và không kế thừa
  `userId` A; dữ liệu hiển thị tiếp theo chỉ được lấy từ `GET /auth/me`.
- Hai lần chạm/Enter trong một frame gọi login đúng một lần; Hiện/Ẩn mật khẩu
  giữ nguyên giá trị và `selection` đang gõ.

## Quyết định loại trừ

- Giữ định danh **email** và validation hiện hữu. Board ghi “Tên đăng nhập”
  không đủ để thay hợp đồng login.
- Không hiện Quên mật khẩu; recovery là BA-BLOCKED.
- Không tạo API hoặc trạng thái “Bắt đầu ca”. Theo D06, thẻ chỉ báo **Chưa áp
  dụng**; CTA thật là “Tiếp tục vào ứng dụng”.
- Không thêm dependency motion. Chuyển trạng thái React Native ở Prompt 01
  giữ tĩnh theo chốt của người dùng; không có animation package/call-site mới.
