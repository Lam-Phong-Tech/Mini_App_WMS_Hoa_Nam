# 01 — Inventory ZNS / Zalo OA

**Commit:** `663114aff6804e50b77b88e05dda9f9c784d6fff`
**Phạm vi:** chỉ lập inventory theo chỉ thị mục 6. **Không xoá, không sửa, không thay đổi luồng ZNS/OA.**

---

## 1. Kết luận đầu tiên — quan trọng nhất

> ✅ **ZNS/OA hiện KHÔNG PHẢI dependency của ứng dụng Mini App.**
> Toàn bộ ZNS/OA nằm gọn trong `backend/`. Frontend **không có một dòng nào** liên quan.

🔧 Bằng chứng:

```
grep -rn "zns|ZNS|zalo-webhook|user_received_message|user_seen_message|oa_id|followOA|openOA|sendMessage" src/
  → 0 kết quả

grep -rn "tracking_id|msg_id" src/
  → 0 kết quả
```

**Hệ quả:** chỉ thị *"Không đưa ZNS/OA thành dependency bắt buộc của ứng dụng React Native mới"* **được thoả mãn tự nhiên** — không cần làm gì để tách. App React Native mới chỉ cần **không thêm mới** phụ thuộc này.

> 📌 Ghi chú đính chính: `CLAUDE.md` mô tả `src/app.tsx` POST sự kiện `miniapp-open` kèm `tracking_id`/`msg_id` tới một endpoint ngrok. Điều này **không còn đúng** tại commit hiện tại — 🔧 grep `tracking_id|msg_id` trong `src/` → 0 kết quả. Đây là mô tả lỗi thời.

---

## 2. Nơi ZNS/OA đang được sử dụng

### 2.1 Danh sách đầy đủ (5 vị trí)

| # | File | Vai trò | Dòng |
|:--:|---|---|:--:|
| 1 | [backend/app/Http/Controllers/ZaloWebhookController.php](../../backend/app/Http/Controllers/ZaloWebhookController.php) | **Toàn bộ logic xử lý webhook** | 381 |
| 2 | [backend/routes/web.php](../../backend/routes/web.php) | Khai báo 2 route `GET`/`POST /zns/zalo-webhook` | 10-11 |
| 3 | [backend/bootstrap/app.php](../../backend/bootstrap/app.php) | Miễn CSRF cho `zns/zalo-webhook` | 15-17 |
| 4 | [backend/.env.example](../../backend/.env.example) | `ZALO_WEBHOOK_APP_IDS`, `ZALO_WEBHOOK_LOG_RAW` | cuối tệp |
| 5 | [backend/config/services.php](../../backend/config/services.php) | Ánh xạ config `zalo_webhook` | — |

**Hỗ trợ:** [backend/database/migrations/2026_08_08_000001_create_zalo_webhook_events_table.php](../../backend/database/migrations) · [backend/app/Models/ZaloWebhookEvent.php](../../backend/app/Models/ZaloWebhookEvent.php) · [backend/tests/Feature/ZaloWebhookTest.php](../../backend/tests/Feature/ZaloWebhookTest.php)

**Tài liệu:** [docs/zns-webhook-production.md](../zns-webhook-production.md)

### 2.2 Endpoint

| Method | Path | Handler | CSRF |
|---|---|---|:--:|
| GET | `/zns/zalo-webhook` | `ZaloWebhookController::show` | — |
| POST | `/zns/zalo-webhook` | `ZaloWebhookController::store` | **Miễn** |

**URL production** ✅ [docs/zns-webhook-production.md:5](../zns-webhook-production.md):
```
https://mini.lptech.info.vn/zns/zalo-webhook
```
Nằm **ngoài** tiền tố `/api` để khớp URL cấu hình trong Zalo Developer/OA.

---

## 3. Nghiệp vụ phụ thuộc vào ZNS/OA

### 3.1 Những gì hệ thống ĐANG làm với ZNS/OA

| # | Chức năng | Bằng chứng |
|:--:|---|---|
| 1 | **Nhận và lưu vết sự kiện gửi tin ZNS** — `user_received_message` (khách đã nhận tin) | ✅ `ZaloWebhookController.php:16` |
| 2 | **Nhận và lưu vết sự kiện OA** — `user_seen_message` (khách đã xem tin) | ✅ `:18` |
| 3 | **Chống trùng sự kiện** — `event_key` unique + `duplicate_count++` khi trùng | ✅ `:73-81, 336-345` |
| 4 | **Lọc theo allowlist App ID** — bỏ qua traffic không liên quan | ✅ `:293-301` + `ZALO_WEBHOOK_APP_IDS` |
| 5 | **Chuẩn hoá payload** — lưu cả `raw_payload` và `normalized_payload` | ✅ `:108-160` |
| 6 | **Tương quan tin nhắn** — `msg_id`, `tracking_id` | ✅ `:228-272` |
| 7 | **Nhận diện định danh người dùng** — `user_id`, `user_id_by_app`, `phone_id`, kiểm tra SHA-256 và số ĐT VN | ✅ `:303-311, 372-381` |

### 3.2 Những gì hệ thống KHÔNG làm

| Chức năng | Có? |
|---|:--:|
| **Gửi** tin ZNS đi | ❌ Không tìm thấy code gửi — chỉ **nhận** webhook |
| Mini App hiển thị trạng thái ZNS | ❌ Frontend không đọc bảng này |
| Mini App kích hoạt gửi ZNS | ❌ |
| Liên kết sự kiện ZNS với phiếu nhập/xuất/bảo hành | ❌ Bảng `zalo_webhook_events` **không có khoá ngoại** tới `warehouse_scans` hay bất kỳ bảng nghiệp vụ nào |

> ⚠️ **Phát hiện quan trọng:** `zalo_webhook_events` là một **kho log độc lập**, không nối với dữ liệu nghiệp vụ kho. Không có nghiệp vụ WMS nào trong repo này **đọc** dữ liệu đó.
> ❓ **Cần xác nhận:** ai đang tiêu thụ dữ liệu `zalo_webhook_events`? (Hệ thống ngoài? Báo cáo thủ công? Hay chưa ai dùng?)

---

## 4. Đánh giá mức phụ thuộc cho migration

| Câu hỏi | Trả lời |
|---|---|
| App React Native mới **có cần** ZNS/OA không? | ❌ **Không** — Mini App hiện tại cũng không cần |
| Migration **có làm hỏng** luồng ZNS/OA không? | ❌ **Không** — hai hệ thống hoàn toàn tách rời |
| ZNS/OA **có chặn** migration không? | ❌ **Không** |
| Dịch vụ Laravel **có phải tiếp tục chạy** sau migration? | ✅ **Có, nếu** vẫn cần nhận webhook ZNS/OA — chạy độc lập, không liên quan app native |

### 4.1 Rủi ro cần lưu ý (không hành động ở giai đoạn này)

| # | Rủi ro |
|:--:|---|
| 1 | Dịch vụ Laravel hiện **gộp chung** hai thứ: webhook ZNS (sống) và API quét prototype (chết). Nếu sau này tắt dịch vụ vì phần API chết, sẽ **vô tình tắt luôn webhook production** |
| 2 | Nếu `/api/*` vẫn expose công khai thì phát hiện an toàn B-01 (xem [01-backend-audit.md §4](01-backend-audit.md)) đang mở trên **cùng host với webhook production** |

> ⏸️ Theo chỉ thị mục 6: **chỉ lập inventory, không quyết định.** Việc tiếp tục hay loại bỏ ZNS/OA sẽ được xử lý trong một phạm vi riêng.

---

## 5. Tuân thủ chỉ thị mục 6

| Chỉ thị | Tuân thủ |
|---|:--:|
| Không đưa ZNS/OA thành dependency bắt buộc của app RN mới | ✅ Đã xác minh: hiện **không phải** dependency |
| Không xoá hoặc sửa luồng ZNS/OA hiện tại | ✅ 🔧 `git diff HEAD -- backend/` rỗng |
| Giữ nguyên implementation trong backend | ✅ Không chạm |
| Chỉ lập inventory | ✅ Tài liệu này |
| Không quyết định tiếp tục hay loại bỏ | ✅ Để lại cho phạm vi riêng |

---

## 6. Câu hỏi cần bạn xác nhận (không chặn Gate 01)

| # | Câu hỏi |
|:--:|---|
| 1 | Ai/hệ thống nào đang **tiêu thụ** dữ liệu `zalo_webhook_events`? |
| 2 | Có hệ thống nào đang **gửi** ZNS không (code gửi không nằm trong repo này)? |
| 3 | Sau migration, ZNS/OA có tiếp tục là kênh vận hành không? |
| 4 | Dịch vụ tại `mini.lptech.info.vn` có nên **tách** phần webhook khỏi phần API prototype đã chết không? |
