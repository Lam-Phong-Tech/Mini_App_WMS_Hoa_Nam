# State matrix — Prompt 01

Scope revision D06 được người dùng xác nhận ngày 2026-09-11: Prompt 01 được
chạy như một UI sub-gate, không phải mở Gate 00 tổng. Preview chỉ review
`390×844`, `vi-VN`, `Asia/Ho_Chi_Minh` theo font/icon/màu/layout; không tuyên
bố pixel-perfect hoặc nghiệm thu DEV/hardware.

| State | Entry | Data được phép hiện | CTA / Back | Side effect |
| --- | --- | --- | --- | --- |
| `login.idle` | Không có phiên hoặc phiên hỏng/hết hạn | Form email/mật khẩu của người dùng | Đăng nhập; hiện/ẩn mật khẩu | Không có |
| `login.submitting` | Form hợp lệ được gửi | Form đang nhập, trạng thái đang xác thực | Khoá gửi trùng | `POST /auth/login` hiện hữu |
| `login.failed` | Login trả lỗi | Giữ email/mật khẩu, lỗi đã phân loại | Thử lại | Không tự retry |
| `session.loading` | Login thành công lần này | Chỉ định danh phiên nếu có | Đăng xuất | `GET /auth/me` để lấy dữ liệu đã xác minh |
| `session.ready` | `GET /auth/me` thành công | Tên, email, vai trò, phạm vi kho do BE trả | Tiếp tục vào ứng dụng; Đăng xuất | Không gọi API ca |
| `session.profile-error` | `GET /auth/me` lỗi | Không bịa tên/kho; thông báo + thử lại | Thử lại; Đăng xuất | Không có |
| `session.logout` | Nhấn Đăng xuất | Trạng thái đang đăng xuất | Không bấm lặp | `POST /auth/logout`, sau đó xoá phiên local |

## Quyết định loại trừ

- Giữ định danh **email** và validation hiện hữu. Board ghi “Tên đăng nhập”
  không đủ để thay hợp đồng login.
- Không hiện Quên mật khẩu; recovery là BA-BLOCKED.
- Không tạo API hoặc trạng thái “Bắt đầu ca”. Theo D06, thẻ chỉ báo **Chưa áp
  dụng**; CTA thật là “Tiếp tục vào ứng dụng”.
- Không thêm dependency motion. Chuyển trạng thái ở native giữ tĩnh; motion
  parity chưa có call-site/timing được duyệt cho board 01.
