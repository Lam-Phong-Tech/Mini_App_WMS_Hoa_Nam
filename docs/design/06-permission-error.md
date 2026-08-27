# 6. Permission matrix & Error code catalog

## 6.1 Permission matrix

| Hành động | Sys Admin | Shop Owner | Order Mgr | Florist | Inventory | Delivery | Support | Marketing |
|---|---|---|---|---|---|---|---|---|
| Cấu hình phí giao / khu vực | ✓ | ✓ | – | – | – | – | – | – |
| Duyệt ảnh & publish sản phẩm | ✓ | ✓ | – | – | – | – | – | Chỉ tải lên |
| Xác nhận đơn (`CONFIRMED`) | ✓ | ✓ | ✓ | – | – | – | – | – |
| Duyệt/từ chối yêu cầu hủy | ✓ | ✓ | ✓ | – | – | – | – | – |
| Hủy đơn ở `PREPARING` | ✓ | ✓ | ✓ | – | – | – | – | – |
| Xác nhận thanh toán / hoàn tiền | ✓ | ✓ | ✓ | – | – | – | – | – |
| Điều chỉnh tồn kho / lô hàng | ✓ | ✓ | – | – | ✓ | – | – | – |
| Gán & cập nhật trạng thái giao | ✓ | ✓ | ✓ | – | – | Chỉ đơn được gán | – | – |
| Tư vấn & báo giá hoa thiết kế riêng | ✓ | ✓ | – | ✓ | – | – | – | – |
| Chuyển yêu cầu → đơn hàng | ✓ | ✓ | ✓ | ✓ | – | – | – | – |
| Trả lời khách qua OA | ✓ | ✓ | Về đơn hàng | Về mẫu hoa | – | – | ✓ | – |
| Quản lý banner / bộ sưu tập | ✓ | ✓ | – | – | – | – | – | ✓ |
| Xem audit log | ✓ | ✓ | – | – | – | – | – | – |
| Phân quyền nhân viên khác | ✓ | Trong phạm vi branch | – | – | – | – | – | – |

## 6.2 Error code catalog

| Error code | HTTP | Khi nào trả về |
|---|---|---|
| `VALIDATION_FAILED` | 422 | Payload sai định dạng hoặc thiếu trường bắt buộc |
| `UNAUTHENTICATED` | 401 | Thiếu hoặc hết hạn JWT |
| `FORBIDDEN_ROLE` | 403 | Đúng token nhưng sai role/branch scope (§6.1) |
| `PRODUCT_NOT_PUBLISHED` | 404 | Truy vấn sản phẩm đang `DRAFT`/`PENDING_REVIEW` |
| `OUT_OF_STOCK` | 409 | Số lượng khả dụng không đủ khi validate giỏ hàng/checkout |
| `ZONE_NOT_SUPPORTED` | 422 | Địa chỉ giao rơi vào `ZONE_UNSUPPORTED` — chặn tạo đơn tự động |
| `TIME_SLOT_UNAVAILABLE` | 409 | Khung giờ đã đầy hoặc đã qua thời điểm nhận đơn |
| `PRICE_MISMATCH` | 409 | Giá/phí frontend gửi lên lệch với giá backend tính lại tại checkout |
| `IDEMPOTENCY_KEY_CONFLICT` | 409 | Cùng `Idempotency-Key`, khác payload |
| `INVALID_STATE_TRANSITION` | 409 | Yêu cầu chuyển trạng thái đơn/thanh toán không đúng cạnh hợp lệ (§3) |
| `COUPON_NOT_APPLICABLE` | 422 | Voucher hết hạn, vượt giới hạn dùng, hoặc không khớp điều kiện đơn tối thiểu |
| `PAYMENT_PROOF_REQUIRED` | 422 | Xác nhận `BANK_TRANSFER` khi chưa có mã/ảnh chuyển khoản |
| `RATE_LIMITED` | 429 | Vượt giới hạn request (đặc biệt endpoint tạo đơn/checkout) |
| `INTERNAL_ERROR` | 500 | Lỗi hệ thống không xác định — log kèm `request_id` |

## 6.3 Chuẩn response

**Thành công**

```json
{
  "success": true,
  "message": "Thao tác thành công",
  "data": {},
  "meta": {},
  "request_id": "uuid"
}
```

**Lỗi**

```json
{
  "success": false,
  "error_code": "VALIDATION_FAILED",
  "message": "Dữ liệu không hợp lệ",
  "errors": {},
  "request_id": "uuid"
}
```
