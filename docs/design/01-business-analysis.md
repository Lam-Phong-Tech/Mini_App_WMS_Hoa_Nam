# 1. Phân tích mô hình kinh doanh & phạm vi MVP

## 1.1 Đặc thù mô hình kinh doanh

Bán hoa qua Zalo Mini App khác biệt với thương mại điện tử hàng hoá thông thường ở bốn điểm, và toàn bộ thiết kế phía sau bám theo bốn đặc thù này:

1. **Hàng hoá dễ hỏng, theo lô, không chỉ theo số lượng** — tồn kho hoa tươi phải tách `reserved_qty` (đã giữ chỗ) và `available_qty` (khả dụng), theo từng lô nhập (`inventory_batches`), không chỉ một con số tồn chung.
2. **Đơn hàng gắn với một khung giờ, không chỉ một địa chỉ** — `delivery_date` + `delivery_time_slot` là trường bắt buộc ngang hàng với địa chỉ; hệ thống phải xác nhận năng lực giao *trước khi* cho đặt, không xác nhận sau.
3. **Có một nhánh "tư vấn trước khi bán" song song với nhánh mua ngay** — "Đặt hoa theo yêu cầu" là một yêu cầu cần florist phản hồi bằng mẫu + báo giá, khách xác nhận, rồi mới phát sinh đơn hàng thật (mô hình CRM/ticket lồng trong luồng thương mại điện tử).
4. **Zalo OA/ZNS là kênh vận hành, không phải tiện ích phụ** — Mini App không có push riêng; toàn bộ vòng đời đơn hàng phải kể lại qua OA/ZNS, có lưu vết `msg_id`/`tracking_id`, và **gửi ZNS thành công không đồng nhất với đơn đã giao thành công**.

### Actor chính

Khách mua · Florist · Inventory Staff · Order Manager · Delivery Staff · Customer Support · Shop Owner · System Admin · Marketing Staff.

## 1.2 Phạm vi MVP

| Trong phạm vi MVP | Ngoài phạm vi MVP (P1/P2) |
|---|---|
| Trang chủ tĩnh: banner, danh mục nhanh, bán chạy/mới | Bộ sưu tập theo màu sắc, gợi ý theo dịp gần nhất, combo hoa & quà curated |
| Danh mục, filter giá / dịp / loại hoa, sort cơ bản | Filter theo khu vực giao realtime theo lô |
| Chi tiết sản phẩm, chọn biến thể, thiệp, ngày/khung giờ giao | Video sản phẩm, đánh giá có ảnh |
| Giỏ hàng + validate tồn kho/khu vực trước checkout | Lưu để mua sau, thanh toán từng dòng riêng |
| Checkout: COD + chuyển khoản thủ công | ZaloPay, thẻ, ví khác |
| Order state machine đầy đủ + hủy đơn theo luật | Tracking người giao hàng realtime, đa đơn vị vận chuyển |
| Thông báo OA cho các mốc chính | ZNS có template Zalo duyệt + webhook đối soát |
| Trang cá nhân: hồ sơ, sổ địa chỉ, đơn hàng, yêu thích | Điểm/hạng thành viên, voucher theo hạng |
| Đặt hoa theo yêu cầu — florist tư vấn thủ công | Auto-báo giá |
| Admin: CRUD sản phẩm/danh mục/banner, đổi trạng thái đơn, tồn kho theo kho/lô | Phân quyền nhân viên chi tiết theo scope nâng cao, audit log đầy đủ |

## 1.3 Danh sách chức năng theo mức ưu tiên

### P0 — Bắt buộc go-live

- Đăng nhập/nhận diện Zalo; xin quyền số điện thoại tại checkout, không xin ngay khi mở app
- Danh mục hoa và phụ kiện, danh sách sản phẩm, chi tiết sản phẩm, biến thể + phụ kiện đi kèm
- Giỏ hàng có validate lại tồn kho/khu vực/giá trước checkout
- Checkout đủ bước, thanh toán COD + chuyển khoản thủ công
- Địa chỉ giao hàng, chọn ngày/khung giờ, bảng phí giao theo khu vực
- Tạo đơn có Idempotency-Key; Order Manager xác nhận thủ công; giữ chỗ tồn kho
- Quản lý trạng thái đơn theo state machine; giao hàng nội bộ; theo dõi đơn hàng
- Đặt hoa theo yêu cầu — florist tư vấn và báo giá thủ công
- Admin Portal: sản phẩm & ảnh (có quy trình duyệt), tồn kho, chi nhánh/kho, đơn hàng, khách hàng
- Thông báo trong Mini App; chat/liên hệ OA
- Audit log cho thao tác quản trị nhạy cảm; Idempotency; unit + integration test cho flow chính

### P1 — Sau MVP

- ZaloPay; ZNS (gửi thật + webhook tracking)
- Điểm thành viên, hạng thành viên; voucher nâng cao
- Tích hợp Ahamove/Grab; auto-confirm đơn đủ điều kiện; hoàn tiền tự động
- Auto-báo giá hoa thiết kế riêng; hoá đơn VAT điện tử
- Nhắc sinh nhật/ngày kỷ niệm

### P2 — Mở rộng

- Giá riêng theo chi nhánh; dynamic pricing theo ngày lễ
- Tối ưu tuyến giao hàng; florist workload planning; dự báo nhu cầu hoa
- Gợi ý sản phẩm cá nhân hoá; subscription giao hoa định kỳ
- Loyalty nâng cao; chat realtime; AI tư vấn chọn hoa

## 1.4 Mười quyết định nghiệp vụ đã chốt

| # | Chủ đề | Quyết định MVP | Đẩy sang |
|---|---|---|---|
| 1 | Thanh toán | COD + chuyển khoản thủ công, nhân viên xác nhận trên Admin | ZaloPay → P1 |
| 2 | Giao hàng | Đội giao nội bộ, `provider_type = INTERNAL`, schema mở cho provider ngoài | Ahamove/Grab → P1 |
| 3 | Phí giao hàng | Bảng giá cố định theo `shipping_zone` × loại giao, backend luôn tính lại | Tính khoảng cách động → P2 |
| 4 | Hoa theo yêu cầu | Florist tư vấn thủ công, nhiều vòng trao đổi, không cần realtime | Auto báo giá → P1/P2 |
| 5 | Điểm thành viên | Chỉ dựng schema, chưa kích hoạt tích/quy đổi, mặc định hạng `MEMBER` | Kích hoạt đầy đủ → P1 |
| 6 | Hủy đơn | `PENDING_CONFIRMATION` hủy trực tiếp; `CONFIRMED` trở đi qua `CANCEL_REQUESTED` | Hoàn tiền tự động → P1 |
| 7 | ZNS | Thông báo in-app + OA; bắt đầu đăng ký template ngay từ Phase 1 | Gửi ZNS thật + webhook → P1 |
| 8 | Mô hình cửa hàng | Schema `Store → Branch → Warehouse` ngay từ đầu, seed 1-1-1 | Giá riêng theo branch → P2 |
| 9 | Xác nhận đơn | Order Manager xác nhận thủ công 100%, đủ 9 bước kiểm tra trước khi `CONFIRMED` | Auto-confirm điều kiện đủ → P1 |
| 10 | Ảnh & VAT | Ảnh qua duyệt `DRAFT → PENDING_REVIEW → PUBLISHED`; giá đã gồm VAT, chưa tách hiển thị | Hoá đơn VAT điện tử → P1 |
