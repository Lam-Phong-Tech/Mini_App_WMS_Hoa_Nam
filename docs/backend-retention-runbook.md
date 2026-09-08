# Runbook — Data Retention (`BACKEND_RETENTION_HOTFIX`)

**Trạng thái:** ✅ `RETENTION_POLICY_APPROVED_CODE_COMPLETE_NOT_DEPLOYED`
**Ngày phê duyệt chính sách:** 2026-09-04 (chủ sở hữu dữ liệu)
**Mặc định:** ⛔ `RETENTION_ENABLED=false` — **chưa triển khai, chưa từng chạy trên production**

## 0. Chính sách đã được phê duyệt

| Bảng / loại dữ liệu | Thời hạn | Hành động | Ràng buộc |
|---|---:|---|---|
| `zalo_webhook_events` — payload | **90 ngày** | Làm rỗng `raw_payload` + `normalized_payload` | Chỉ với trạng thái kết thúc **đã được source code chứng minh** |
| `zalo_webhook_events` — dòng | **365 ngày** | Xoá dòng | Chỉ trạng thái kết thúc đã xác minh. **Không xoá** `NULL`, `other_event`, chưa xử lý, failed, chưa xác định |
| `warehouse_scans` — payload | **180 ngày** | Làm rỗng `response_payload` | Chỉ dòng `APPROVED` và đã hoàn tất |
| `warehouse_scans` — dòng | — | ❌ **KHÔNG BAO GIỜ tự động xoá** | Khoá cứng trong code |

Toàn bộ metadata/audit được giữ nguyên. `PENDING_APPROVAL`, failed, conflict, chưa đồng bộ và trạng thái không xác định **luôn được giữ**.

Giá trị 90/365/180 đã ghi vào `backend/.env.example`, nhưng **vẫn trơ** vì `RETENTION_ENABLED=false`.

> ⚠️ **Chưa deploy.** Chưa chạy migration production, chưa bật retention, chưa có giám sát thực tế. Xem §8.

---

## 1. Nguyên nhân gốc

| # | Nguyên nhân | Bằng chứng |
|:--:|---|---|
| 1 | Không có cơ chế dọn nào tồn tại | Model không dùng `Prunable`/`MassPrunable`; `routes/console.php` chỉ có lệnh `inspire` mặc định; không có scheduler đăng ký trong `bootstrap/app.php`; grep `prune\|cleanup\|retention\|truncate` trên toàn `backend/` → 0 kết quả |
| 2 | Mỗi dòng lưu blob JSON lớn | `zalo_webhook_events` lưu **2** blob (`raw_payload`, `normalized_payload`); `warehouse_scans` lưu **1** blob (`response_payload`) |
| 3 | Các blob **chỉ ghi, không bao giờ đọc** | grep toàn `backend/app`, `routes`, `tests`: cả 3 cột chỉ xuất hiện ở lệnh ghi, khai báo `$fillable` và `$casts` — không có nơi nào đọc |
| 4 | Đường thoát duy nhất bị khoá | `DELETE /api/warehouse-scans/history` trả HTTP 403 `AUDIT_DELETE_REVIEW_REQUIRED` vô điều kiện |

**Kết quả:** dung lượng tăng đơn điệu theo số sự kiện, không có giới hạn trên.

---

## 2. Chính sách bảo vệ dữ liệu nghiệp vụ

### 2.1 `zalo_webhook_events`

Bảng này **không có cột trạng thái xử lý nội bộ**. Ghi thất bại trả HTTP 500 và **không tạo dòng nào** (`ZaloWebhookController::store` bắt `Throwable` rồi chỉ ghi log). Do đó **mọi dòng tồn tại đều là dòng đã xử lý thành công** — không tồn tại dòng pending/failed/retrying.

Cột `status` là **trạng thái Zalo báo về**, không phải trạng thái xử lý của ta. 6 giá trị có thể có (nguồn: `getEventSemantics()`):

| status | Được xử lý? | Lý do |
|---|:--:|---|
| `delivered` | ✅ | ZNS đã tới thiết bị — quan sát bất biến |
| `received` | ✅ | User nhận tin OA |
| `seen` | ✅ | User đã xem tin OA |
| `oa_sent` | ✅ | OA đã gửi tin |
| `inbound_user_event` | ✅ | User tương tác với OA |
| `other_event` | ❌ **LOẠI TRỪ** | Sự kiện không nhận diện được ⇒ "chưa xác định trạng thái" |
| `NULL` | ❌ **LOẠI TRỪ** | Không xác định |

### 2.2 `warehouse_scans`

> 🔒 **KHÔNG BAO GIỜ XOÁ DÒNG.** Cờ `allow_row_deletion` bị khoá cứng `false` trong code (không đọc từ env), và `RetentionPolicy::validate()` **từ chối chạy** nếu ai đó bật nó lên.

Căn cứ: đây là audit trail nghiệp vụ kho, và chủ hệ thống đã tường minh khoá đường xoá bằng HTTP 403. Chưa chứng minh được việc xoá dòng là an toàn ⇒ giữ nguyên dòng, chỉ dọn payload.

| approval_status | Được dọn payload? |
|---|:--:|
| `APPROVED` | ✅ |
| `PENDING_APPROVAL` | ❌ **LOẠI TRỪ TUYỆT ĐỐI** — việc chưa xử lý xong |

`validate()` còn từ chối chạy nếu `PENDING_APPROVAL` bị đưa nhầm vào `compactable_statuses`.

### 2.3 Vì sao dọn payload là mất mát bằng không

| Cột | Có ai đọc không? | Tái tạo được không? |
|---|:--:|---|
| `zalo_webhook_events.raw_payload` | ❌ Không | — (metadata đã tách ra cột riêng) |
| `zalo_webhook_events.normalized_payload` | ❌ Không | — |
| `warehouse_scans.response_payload` | ❌ Không | ✅ **100%** — `historyPayload()` dựng lại đúng cấu trúc đó từ các cột, không hề đọc `response_payload` |

---

## 3. Command

### `retention:prune` — dọn dữ liệu

```bash
# DRY-RUN (mặc định) — chỉ báo cáo, không thay đổi gì
php artisan retention:prune

# Thực thi
php artisan retention:prune --execute

# Giới hạn phạm vi
php artisan retention:prune --execute --target=zalo-payloads --limit=1000
```

| Cờ | Ý nghĩa |
|---|---|
| *(không có)* | **Dry-run** — mặc định an toàn |
| `--execute` | Thực sự thay đổi dữ liệu |
| `--target=` | `all` (mặc định) · `zalo-payloads` · `zalo-rows` · `warehouse-payloads` |
| `--limit=` | Trần số bản ghi cho lượt chạy này (bị kẹp bởi `RETENTION_MAX_ROWS_PER_RUN`) |

**Exit code:** `0` thành công · `1` cấu hình sai hoặc có tác vụ thất bại.

### `retention:status` — health-check & cảnh báo

```bash
php artisan retention:status --max-age-hours=48 --max-backlog=50000
```

Trả **exit 1** khi: cấu hình sai · retention đang bật nhưng chưa từng chạy · lần chạy gần nhất quá cũ (scheduler chết) · backlog vượt ngưỡng (dung lượng vẫn tăng nhanh hơn tốc độ dọn).

**Đấu nối giám sát:**

```bash
# cron — cảnh báo nếu exit != 0
0 * * * * cd /path/to/backend && php artisan retention:status || /usr/local/bin/alert.sh "Retention unhealthy"
```

---

## 4. Scheduler

Đăng ký tại `routes/console.php`, **chỉ khi** `RETENTION_ENABLED=true` **và** cấu hình hợp lệ:

| Thuộc tính | Giá trị |
|---|---|
| Tần suất | `dailyAt(RETENTION_SCHEDULE_AT)` — mặc định `02:30` |
| Timezone | `RETENTION_TIMEZONE` — mặc định `Asia/Ho_Chi_Minh` (app.timezone là UTC nên cần cấu hình riêng) |
| Chống chạy chồng | `withoutOverlapping(120)` — lock tự hết hạn sau 120 phút |
| Chống đa server | `onOneServer()` — an toàn vì cache store mặc định là `database`, Laravel `DatabaseStore` hiện thực `LockProvider` và bảng `cache_locks` đã tồn tại |
| Chạy nền | `runInBackground()` |
| Log | `storage/logs/retention.log` |

Yêu cầu hệ thống: cron của Laravel phải chạy —
`* * * * * cd /path/to/backend && php artisan schedule:run >> /dev/null 2>&1`

---

## 5. Bật retention (sau khi chính sách được phê duyệt)

```bash
# 1. Chạy migration (an toàn, chỉ thêm index + nới ràng buộc NOT NULL)
php artisan migrate --force

# 2. Đặt thời hạn trong .env — CHƯA bật
ZALO_WEBHOOK_PAYLOAD_RETENTION_DAYS=90
ZALO_WEBHOOK_RETENTION_DAYS=365
WAREHOUSE_SCAN_PAYLOAD_RETENTION_DAYS=180

# 3. Xem trước tác động — KHÔNG thay đổi gì
php artisan config:clear
php artisan retention:prune          # dry-run

# 4. Kiểm tra bảng kết quả. Nếu số "Đủ điều kiện" hợp lý:
#    chạy thử một lô nhỏ trước
php artisan retention:prune --execute --limit=100

# 5. Kiểm tra lại dữ liệu, rồi mới bật scheduler
RETENTION_ENABLED=true
php artisan config:clear
```

## 6. Tắt / Rollback

### Tắt ngay (không mất dữ liệu)

```bash
RETENTION_ENABLED=false
php artisan config:clear
```
Scheduler ngừng được đăng ký ngay lập tức. Đây là **kill switch** an toàn nhất.

### Tắt từng tác vụ

Để trống biến `*_RETENTION_DAYS` tương ứng → tác vụ đó bị vô hiệu hoá.

### Rollback code

```bash
git revert <commit>
php artisan migrate:rollback --step=1   # gỡ index
php artisan config:clear
```

> ⚠️ **`migrate:rollback` chỉ gỡ index.** Migration `make_webhook_payloads_nullable` **cố ý có `down()` rỗng**: sau khi đã dọn, các dòng hợp lệ mang giá trị NULL; đặt lại `NOT NULL` sẽ thất bại hoặc buộc phải điền dữ liệu giả đè lên bản ghi audit. Nới lỏng ràng buộc là thao tác tương thích ngược — mã cũ vẫn ghi giá trị khác NULL như trước.

### Khôi phục dữ liệu đã dọn

> 🔴 **Không thể khôi phục bằng code.** Dọn payload và xoá dòng là thao tác một chiều.
>
> **Đường khôi phục duy nhất là bản sao lưu database.** Trước lần chạy `--execute` đầu tiên trên production **bắt buộc**:
> 1. Chụp full backup và **xác minh khôi phục được**.
> 2. Ghi lại timestamp bắt đầu chạy.
> 3. Chạy `--limit` nhỏ trước, kiểm tra kết quả, rồi mới mở rộng.

---

## 7. Điều chưa thể xác minh ⛔

| # | Hạng mục | Lý do |
|:--:|---|---|
| 1 | Dung lượng và số dòng thực tế trên production | Không được đọc dữ liệu production |
| 2 | Tốc độ tăng trưởng thực tế mỗi ngày | như trên |
| 3 | Hiệu quả thực của index trên PostgreSQL | Test chạy trên SQLite; cần `EXPLAIN ANALYZE` trên PostgreSQL với dữ liệu thật |
| 4 | Thời gian chạy `CREATE INDEX CONCURRENTLY` trên bảng lớn | Phụ thuộc kích thước bảng thật |
| 5 | Hành vi `onOneServer()` khi triển khai nhiều máy | Chỉ suy ra từ cấu hình; chưa có môi trường đa server để thử |
| 6 | Thời hạn retention phù hợp nghiệp vụ | **Cần chủ sở hữu dữ liệu quyết định** |
| 7 | Có nghĩa vụ pháp lý/tuân thủ nào buộc giữ dữ liệu lâu hơn không | Cần xác nhận |

---

## 8. Ghi chú quan trọng

> ⚠️ **Chưa có gì được triển khai lên production.** Toàn bộ công việc mới chỉ ở mức mã nguồn + test. Retention **đang tắt**, chưa từng chạy `--execute` ngoài database test, và **chưa có kết quả quan sát thực tế nào**.
