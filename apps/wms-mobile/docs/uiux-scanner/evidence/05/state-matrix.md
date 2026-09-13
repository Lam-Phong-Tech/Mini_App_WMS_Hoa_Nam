# State matrix — Prompt 05 Xuất kho

| State | Entry | Required data/guard | CTA and side effect | Exit |
| --- | --- | --- | --- | --- |
| Thông tin | Home → Xuất kho | Nhóm nhận, tên, điện thoại hợp lệ, tỉnh/phường, kho, số lượng 1–1000 | Tạo phiên; tạo phiếu trước khi quét | Màn Quét hàng xuất |
| Quét | Sau khi tạo phiên | Mã resolve phải `eligible_for_outbound`; mã trùng không cộng | Quét camera hoặc nhập tay; không trừ tồn | Tiếp tục quét hoặc Review khi đủ |
| Chưa đủ | `scanned < planned` | Giữ mã hợp lệ, kế hoạch không tự đổi | Tiếp tục soạn; kiểm tra phiếu bị khóa | Quét tiếp |
| Review | `scanned === planned` | Tất cả mã đã resolve/đối chiếu | Gửi record qua outbox với key ổn định; không Post Issue trên App | Kết quả |
| Kết quả posted | Outbox `synced` | Record đã ghi nhận; tồn chỉ giảm ở Web Post Issue | Hiển thị đã gửi/chờ xử lý trên Web theo contract | Lịch sử/Home |
| Kết quả queued/failed/conflict/unknown | Outbox trả trạng thái tương ứng | Không gộp trạng thái lỗi thành queued | Hiển thị đúng trạng thái và lý do; không báo thành công giả | Người dùng xử lý lại trên Web/đối chiếu |
| Nháp/hủy | Back khi còn dữ liệu | Nháp lưu cục bộ 1 tuần | Tiếp tục, lưu nháp và thoát, hoặc chuyển `CANCELLED`; không xóa | Home hoặc phiên tiếp tục |
