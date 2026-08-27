# 5. API contract (rút gọn)

Danh sách endpoint theo domain, dùng làm cơ sở sinh OpenAPI spec ở Phase 2. Mọi endpoint ghi (POST/PUT/DELETE) có tác động tiền hoặc trạng thái đơn đều yêu cầu header `Idempotency-Key`. Chuẩn response và HTTP status theo bảng error code ở [06-permission-error.md](06-permission-error.md).

## 5.1 Catalog & giỏ hàng

| Method | Path | Mô tả | Quyền |
|---|---|---|---|
| GET | `/v1/home` | Banner, bộ sưu tập, sản phẩm nổi bật | Public |
| GET | `/v1/categories`, `/occasions`, `/recipient-types`, `/flower-types` | Danh mục điều hướng | Public |
| GET | `/v1/products` | Danh sách + filter/sort | Public |
| GET | `/v1/products/{id}` | Chi tiết sản phẩm — chỉ trả bản `PUBLISHED` | Public |
| GET | `/v1/cart` | Giỏ hàng hiện tại | Customer |
| POST | `/v1/cart/items` | Thêm sản phẩm + biến thể vào giỏ | Customer |
| PUT | `/v1/cart/items/{id}` | Sửa số lượng/tuỳ chọn | Customer |
| DELETE | `/v1/cart/items/{id}` | Xoá dòng giỏ hàng | Customer |
| POST | `/v1/cart/validate` | Kiểm tra lại tồn kho/khu vực/giá trước checkout | Customer |

## 5.2 Checkout, đơn hàng & thanh toán

| Method | Path | Mô tả | Quyền |
|---|---|---|---|
| POST | `/v1/checkout/preview` | Tính lại phí giao, voucher, tổng tiền — không tạo đơn | Customer |
| POST | `/v1/orders` | Tạo đơn (`Idempotency-Key` bắt buộc), khởi tạo `payments.status=UNPAID` | Customer |
| POST | `/v1/orders/{id}/payment-proof` | Khách gửi mã/ảnh chuyển khoản → `PENDING_VERIFICATION` | Customer |
| GET | `/v1/orders`, `/v1/orders/{id}` | Danh sách/chi tiết đơn + timeline trạng thái | Customer (chỉ đơn của mình) |
| POST | `/v1/orders/{id}/cancel-request` | Gửi yêu cầu hủy theo đúng luật §3.1 | Customer |
| POST | `/v1/admin/orders/{id}/confirm` | 9 bước kiểm tra + tạo giữ chỗ tồn kho + `CONFIRMED` | Order Manager, Shop Owner |
| POST | `/v1/admin/orders/{id}/cancel-decision` | Duyệt/từ chối `CANCEL_REQUESTED` | Order Manager, Shop Owner |
| POST | `/v1/admin/payments/{id}/verify` | Xác nhận `PENDING_VERIFICATION → PAID` | Order Manager |
| POST | `/v1/admin/payments/{id}/refund` | Ghi nhận hoàn tiền thủ công (bắt buộc ghi chú + mã tham chiếu) | Order Manager, Shop Owner |

## 5.3 Giao hàng, hoa theo yêu cầu & hồ sơ

| Method | Path | Mô tả | Quyền |
|---|---|---|---|
| GET | `/v1/shipping/zones`, `/delivery-time-slots` | Tra cứu khu vực & khung giờ khả dụng | Public |
| PUT | `/v1/admin/deliveries/{id}/assign` | Gán nhân viên giao hàng nội bộ | Delivery lead, Order Manager |
| PUT | `/v1/admin/deliveries/{id}/status` | Cập nhật trạng thái giao (nhận đơn/bắt đầu/thành công) | Delivery Staff |
| POST | `/v1/custom-flower-requests` | Khách gửi yêu cầu thiết kế riêng | Customer |
| POST | `/v1/admin/custom-flower-requests/{id}/quotes` | Florist gửi vòng báo giá mới | Florist |
| POST | `/v1/custom-flower-requests/{id}/confirm` | Khách chốt phương án → `CONFIRMED` | Customer |
| POST | `/v1/admin/custom-flower-requests/{id}/convert` | Chuyển yêu cầu thành đơn hàng thật | Florist, Order Manager |
| GET / POST | `/v1/addresses`, `/v1/favorites` | Sổ địa chỉ, sản phẩm yêu thích | Customer |
| POST | `/v1/auth/zalo` | Xác thực qua Zalo, cấp JWT | Public |
