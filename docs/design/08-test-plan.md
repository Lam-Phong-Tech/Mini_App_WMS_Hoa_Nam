# 8. Test plan tóm tắt

| Luồng | Unit | Integration | E2E |
|---|---|---|---|
| Tính giá & phí giao hàng | Công thức `shipping_fee` theo zone × loại giao (§1.4 mục 3) | Checkout preview trả đúng tổng khi đổi zone/khung giờ | Đặt hoa STANDARD vs EXPRESS vs EXACT_TIME |
| Voucher | Điều kiện áp dụng, giới hạn lượt dùng | Áp voucher hết hạn/vượt giới hạn bị từ chối đúng error code | Áp voucher hợp lệ tại checkout |
| Tồn kho | Giữ chỗ / hoàn tồn / không cho âm | Xác nhận đơn tạo giữ chỗ đúng warehouse | Sản phẩm hết hàng giữa lúc đang checkout |
| State machine đơn hàng | Mọi cạnh hợp lệ/không hợp lệ theo §3.1 | API từ chối chuyển trạng thái sai cạnh (`INVALID_STATE_TRANSITION`) | Khách gửi yêu cầu hủy → Order Manager duyệt/từ chối |
| Idempotency | Cùng key cùng payload trả kết quả cũ; khác payload → 409 | Tạo đơn khi bấm nút 2 lần liên tiếp chỉ sinh 1 đơn | Double-tap nút "Đặt hàng" trên mạng chậm |
| Thanh toán chuyển khoản | Chuyển trạng thái payment theo §3.2 | Xác nhận thủ công trên Admin cập nhật đúng order + payment | Khách gửi ảnh chuyển khoản → nhân viên xác nhận → đơn tiếp tục |
| Hoa theo yêu cầu | State machine request + validate quote items | Nhiều vòng báo giá lưu đúng lịch sử, convert-to-order tạo order đúng dữ liệu | Khách yêu cầu chỉnh mẫu 2 lần rồi mới xác nhận |
| Quyền & xác thực | Middleware role/branch scope | Nhân viên ngoài branch bị chặn thao tác (403) | Đăng nhập Zalo, từ chối quyền số điện thoại vẫn checkout được |
