# 3. State machine

## 3.1 Đơn hàng — quyền hủy theo trạng thái

```mermaid
stateDiagram-v2
  [*] --> DRAFT
  DRAFT --> PENDING_CONFIRMATION
  PENDING_CONFIRMATION --> CONFIRMED : Order Manager xác nhận (9 bước kiểm tra)
  PENDING_CONFIRMATION --> CANCELLED : Khách hủy trực tiếp
  CONFIRMED --> PREPARING
  CONFIRMED --> CANCEL_REQUESTED : Khách gửi yêu cầu hủy
  CANCEL_REQUESTED --> CANCELLED : Order Manager duyệt hủy
  CANCEL_REQUESTED --> CONFIRMED : Order Manager từ chối hủy
  PREPARING --> READY_FOR_DELIVERY
  PREPARING --> CANCELLED : Chỉ nhân viên có quyền
  READY_FOR_DELIVERY --> DELIVERING
  DELIVERING --> DELIVERED
  DELIVERED --> COMPLETED
  COMPLETED --> [*]
  CANCELLED --> [*]
```

| Trạng thái | Khách hàng | Nhân viên có quyền |
|---|---|---|
| `PENDING_CONFIRMATION` | Hủy trực tiếp | Hủy trực tiếp |
| `CONFIRMED` | Chỉ gửi yêu cầu hủy | Duyệt / từ chối yêu cầu |
| `PREPARING` | Không được hủy | Chỉ Order Manager / Shop Owner |
| `READY_FOR_DELIVERY` | Không được hủy | Không hủy, chỉ xử lý sự cố thủ công |
| `DELIVERING` | Không được hủy | Không hủy |
| `DELIVERED` | Không hủy — chỉ mở khiếu nại | Không hủy |

Mọi cạnh trên sơ đồ tương ứng một bản ghi bắt buộc trong `order_status_histories`; không có cạnh nào khác được phép ở tầng service (trả lỗi `INVALID_STATE_TRANSITION` — xem [06-permission-error.md](06-permission-error.md)).

## 3.2 Trạng thái thanh toán

```mermaid
stateDiagram-v2
  [*] --> UNPAID
  UNPAID --> PENDING_VERIFICATION : Khách gửi mã/ảnh chuyển khoản
  PENDING_VERIFICATION --> PAID : Nhân viên xác nhận trên Admin
  PENDING_VERIFICATION --> FAILED : Không xác minh được
  UNPAID --> PAID : COD — xác nhận khi giao thành công
  PAID --> REFUND_PENDING : Đơn bị hủy sau khi đã thanh toán
  REFUND_PENDING --> REFUNDED : Order Manager xác nhận đã hoàn tiền ngoài hệ thống
  UNPAID --> CANCELLED
  FAILED --> CANCELLED
```

Ảnh chuyển khoản **không phải bằng chứng thanh toán cuối** — chỉ chuyển `PENDING_VERIFICATION → PAID` khi nhân viên xác nhận thủ công trên Admin Portal. Hoàn tiền bắt buộc ghi chú, người xác nhận và mã tham chiếu.

## 3.3 Yêu cầu hoa thiết kế riêng

```mermaid
stateDiagram-v2
  [*] --> NEW
  NEW --> CONSULTING : Florist tiếp nhận
  CONSULTING --> SAMPLE_SENT : Gửi ảnh mẫu + báo giá
  SAMPLE_SENT --> WAITING_CUSTOMER_CONFIRMATION
  WAITING_CUSTOMER_CONFIRMATION --> SAMPLE_SENT : Khách yêu cầu chỉnh mẫu — vòng mới
  WAITING_CUSTOMER_CONFIRMATION --> CONFIRMED : Khách chốt phương án
  CONFIRMED --> CONVERTED_TO_ORDER
  NEW --> CANCELLED
  CONSULTING --> CANCELLED
  SAMPLE_SENT --> CANCELLED
  WAITING_CUSTOMER_CONFIRMATION --> CANCELLED
  CONVERTED_TO_ORDER --> [*]
  CANCELLED --> [*]
```
