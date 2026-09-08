# 01 — API Inventory (suy ra từ source)

**Commit:** `663114aff6804e50b77b88e05dda9f9c784d6fff`
**Trạng thái:** `DRAFT_DERIVED_FROM_SOURCE` — ⚠️ **KHÔNG PHẢI HỢP ĐỒNG API CHÍNH THỨC**

---

## 0. ĐÍNH CHÍNH QUAN TRỌNG về phạm vi

Yêu cầu ban đầu ghi *"sử dụng khoảng 42 endpoint đã audit từ `backend/`"*. Cần đính chính để tránh sai lệch hồ sơ:

| | Số endpoint | Nguồn suy ra | Mức xác minh |
|---|:---:|---|---|
| **Nhóm A — `backend/` (Laravel trong repo)** | **12** | Route + Controller **thực tế trong repo** | **[V-CODE]** — đọc được định nghĩa server đầy đủ |
| **Nhóm B — WMS backend ngoài** | **~42** | **CHỈ call-site ở frontend** | **[I-FE]** — không có định nghĩa server ở bất kỳ đâu |

**~42 endpoint KHÔNG đến từ `backend/`.** Hai nhóm này thuộc hai hệ thống khác nhau, có bề mặt API không giao nhau (`backend/` không có route `/v1/` nào — 🔧 grep = 0 kết quả).

Vì vậy tài liệu này tách bạch hai nhóm, và **chỉ Nhóm A mới có thể "dẫn chiếu controller/route thực tế"** như yêu cầu.

### Tệp OpenAPI 3.1 đã tạo

| Tệp | Phạm vi | Độ tin cậy |
|---|---|---|
| [openapi/backend-mini-api.draft.yaml](openapi/backend-mini-api.draft.yaml) | Nhóm A — 12 endpoint | 🟡 Trung bình — suy từ source server thật, chưa gọi thử |
| [openapi/wms-external-api.draft.yaml](openapi/wms-external-api.draft.yaml) | Nhóm B — ~42 endpoint | 🔴 **Thấp** — chỉ suy từ client |

> ⛔ **Không tệp nào được coi là contract chính thức.** Cả hai cần backend nghiệm thu.

---

## 1. Nhóm A — API inventory có dẫn chiếu controller/route thực tế **[V-CODE]**

Laravel 12 tự thêm tiền tố `/api` ✅ [backend/bootstrap/app.php:8-13](../../backend/bootstrap/app.php).

| # | Method | Path | Route | Controller::method | Auth |
|:--:|---|---|---|---|:--:|
| 1 | OPTIONS | `/api/{any}` | `api.php:7` | `WarehouseScanController::options` | — |
| 2 | POST | `/api/zalo/login` | `api.php:9` | `ZaloAuthController::login` | — |
| 3 | GET | `/api/warehouse-scans/dashboard` | `api.php:12` | `WarehouseScanController::dashboard` | 🔒 |
| 4 | GET | `/api/warehouse-scans/history` | `api.php:13` | `WarehouseScanController::history` | 🔒 |
| 5 | DELETE | `/api/warehouse-scans/history` | `api.php:14` | `WarehouseScanController::clearHistory` | 🔒 |
| 6 | GET | `/api/warehouse-scans/approved-products` | `api.php:15` | `WarehouseScanController::approvedProducts` | 🔒 |
| 7 | PATCH | `/api/warehouse-scans/{warehouseScan}/approve` | `api.php:16` | `WarehouseScanController::approve` | 🔒 |
| 8 | POST | `/api/receipts/{documentId}/scans` | `api.php:18` | `WarehouseScanController::store('RECEIPT')` | 🔒 |
| 9 | POST | `/api/outbounds/{documentId}/scans` | `api.php:23` | `WarehouseScanController::store('OUTBOUND')` | 🔒 |
| 10 | POST | `/api/warranty/item-lookup` | `api.php:28` | `WarehouseScanController::store('WARRANTY_ITEM')` | 🔒 |
| 11 | POST | `/api/component-issues/{documentId}/scans` | `api.php:32` | `WarehouseScanController::store('WARRANTY_COMPONENT')` | 🔒 |
| 12 | POST | `/api/inventory/lookup-by-code` | `api.php:37` | `WarehouseScanController::store('INVENTORY_LOOKUP')` | 🔒 |

🔒 = middleware `warehouse.session` ✅ [api.php:11](../../backend/routes/api.php)

**Route web (ngoài `/api`):** `GET /` · `GET /zns/zalo-webhook` · `POST /zns/zalo-webhook` (miễn CSRF) · `GET /up` ✅ [web.php](../../backend/routes/web.php), [bootstrap/app.php:12,15-17](../../backend/bootstrap/app.php)

---

## 2. Bảng authentication / method / path / request / response / error **đã xác minh** — Nhóm A

### 2.1 Cơ chế xác thực ✅ [V-CODE]

| Hạng mục | Giá trị | Nguồn |
|---|---|---|
| Kiểu | HTTP Bearer | `RequireWarehouseSession.php:14` |
| Cấp token | `POST /api/zalo/login` | `ZaloAuthController.php:37` |
| Sinh token | `Str::random(80)` | `:37` |
| Lưu trữ | `hash('sha256', $token)` → `warehouse_staff.api_token_hash` | `:47` |
| TTL | **12 giờ** (`now()->addHours(12)`) | `:38` |
| Kiểm tra | So hash + `api_token_expires_at > now()` | `RequireWarehouseSession.php:20-27` |
| Lỗi thiếu token | **401** `AUTH_REQUIRED` | `:17` |
| Lỗi token sai/hết hạn | **401** `SESSION_EXPIRED` | `:30` |
| **Authorization (phân quyền)** | ❌ **KHÔNG CÓ** — chỉ xác thực danh tính | `role` không được dùng ở bất kỳ đâu |
| Refresh token | ❌ Không có | — |
| Thu hồi token | ❌ Không có endpoint logout | — |

### 2.2 Request/response đã xác minh

**`POST /api/{receipts|outbounds|component-issues}/{documentId}/scans` · `/api/warranty/item-lookup` · `/api/inventory/lookup-by-code`**

Validate rule ✅ `WarehouseScanController.php:27-37`:

| Trường | Ràng buộc | Bắt buộc |
|---|---|:--:|
| `client_scan_id` | `uuid` | ✔ |
| `code` | string ≤255 | ✔ |
| `quantity` | integer ≥1 (mặc định 1) | ✘ |
| `scan_method` | string ≤24 | ✔ |
| `scan_context` | string ≤48 — ⚠️ **bị bỏ qua**, server dùng giá trị cứng theo route | ✔ |
| `warehouse_staff_id` | integer, `exists:warehouse_staff,id` | ✘ |
| `zalo_user_id` | string ≤255 | ✘ |
| `scanned_by_name` | string ≤255 | ✘ |
| `scanned_at` | date | ✘ |

**201 Created** ✅ `:57-99`:
```json
{ "success": true, "message": "Đã lưu mã quét vào danh sách chờ duyệt.",
  "data": { "scan_record_id": 0, "approval_status": "PENDING_APPROVAL",
            "product": { "product_id":0,"sku_code":"","product_name":"","item_id":0,
                         "item_code":"","serial_no":"","warehouse_name":"Kho trung tâm" },
            "required_qty": 1, "scanned_qty": 0, "remaining_qty": 0,
            "matched": true, "warehouse_staff": null } }
```
⚠️ `required_qty`, `remaining_qty`, `matched` là **hardcode**; `product` là **dữ liệu giả** sinh từ CRC32 ✅ `:252-265`.

**422** ✅ `:47-53` → `{ success:false, message, error_code }`

### 2.3 Danh mục mã lỗi **đã xác minh** — Nhóm A

| error_code | HTTP | Nguồn phát sinh |
|---|:--:|---|
| `BARCODE_NOT_FOUND` | 422 | Hardcode khi `code == "NOT-FOUND"` ✅ `:17` |
| `ITEM_ALREADY_SCANNED` | 422 | Hardcode `"DUPLICATE"` ✅ `:18` **HOẶC** `normalized_code` đã tồn tại toàn hệ thống ✅ `:43` |
| `SKU_NOT_REQUIRED` | 422 | Hardcode `"WRONG-SKU"` ✅ `:19` |
| `LINE_ALREADY_FULL` | 422 | Hardcode `"LINE-FULL"` ✅ `:20` |
| `NETWORK_ERROR` | 422 | Hardcode `"NETWORK-ERROR"` ✅ `:21` |
| `REQUEST_TIMEOUT` | 422 | Hardcode `"TIMEOUT"` ✅ `:22` |
| `AUDIT_DELETE_REVIEW_REQUIRED` | 403 | `clearHistory()` — luôn trả ✅ `:158-165` |
| `ZALO_LOGIN_FAILED` | 401 | `login()` khi không giải được profile ✅ `ZaloAuthController:33` |
| `AUTH_REQUIRED` | 401 | Thiếu Bearer token ✅ `RequireWarehouseSession:17` |
| `SESSION_EXPIRED` | 401 | Token sai/hết hạn ✅ `:30` |

> 📌 6 mã đầu **khớp chính xác** `MOCK_SCAN_CODES` ở frontend ✅ [src/constants/scan.constants.ts:56-64](../../src/constants/scan.constants.ts) → xác nhận `backend/` là **môi trường thử nghiệm**, không phải WMS sản xuất.

---

## 3. Nhóm B — WMS backend ngoài **[I-FE — CHƯA XÁC MINH]**

Danh sách đầy đủ 42 endpoint kèm call-site: xem khối `x-endpoint-index` trong [openapi/wms-external-api.draft.yaml](openapi/wms-external-api.draft.yaml) và [01-dependency-inventory.md §1](01-dependency-inventory.md).

Phân bố: auth 3 · inbound 12 · outbound 11 · warranty 11 · inventory 5 · scan 2 · **1 path dựng động lúc chạy**.

### 3.1 Những gì CHẮC CHẮN (quan sát ở phía client)

| Hạng mục | Nội dung |
|---|---|
| Xác thực | `Authorization: Bearer <token>`, lấy theo 3 nguồn ưu tiên ✅ [wms-link-context.ts:141-152](../../src/services/wms-link-context.ts) |
| Header phi chuẩn client gửi | `If-Match` (7 vị trí), `Idempotency-Key` (18 vị trí), `X-Mini-App-Inbound-Fallback: legacy` (1 vị trí ✅ receipt-flow.service.ts:874) |
| Envelope client kỳ vọng | `{ success, message?, data?, meta?, error_code?, code?, error? }` ✅ [scan.service.ts:38-46](../../src/services/scan.service.ts) |
| Xử lý lỗi client | 401 → hết phiên · 403 → thiếu quyền ✅ [api-client.ts:336-345](../../src/services/api-client.ts) |
| Timeout mặc định | 12 000 ms ✅ [api-client.ts:8](../../src/services/api-client.ts) |
| Content types | `application/json`, `multipart/form-data` (upload bảo hành), `blob` (tải file) |

### 3.2 Dấu hiệu contract chưa từng được biết rõ ⚠️

`zalo-auth.service.ts` chấp nhận **ít nhất 8 vị trí khác nhau** cho token (`session_token`, `access_token`, `token`, `data.access_token`, `data.token`, …) và **5 vị trí** cho user (`data.staff`, `staff`, `data.user`, `user`, `data`) ✅ [zalo-auth.service.ts:18-41, 145-168](../../src/services/zalo-auth.service.ts).

Tương tự, `api-client.ts:319-322` đọc mã lỗi từ **cả `payload.error_code` lẫn `payload.error.code`**.

> Đây **không phải** dấu hiệu API linh hoạt — đây là dấu hiệu **người viết frontend cũng phải đoán** shape response. Củng cố cho việc Q9 là blocker thật.

---

## 4. Danh sách endpoint / schema **CHƯA THỂ XÁC MINH**

### 4.1 Toàn bộ Nhóm B (42/42 endpoint)

Không có định nghĩa server, không có spec. Cụ thể **không xác minh được**:

| # | Hạng mục |
|:--:|---|
| 1 | Tên trường + kiểu dữ liệu của **mọi** request/response |
| 2 | Trường nào bắt buộc / tuỳ chọn |
| 3 | Danh mục mã lỗi đầy đủ và HTTP status tương ứng |
| 4 | Quy tắc phân trang (`per_page` thấy được, nhưng `page`/`cursor`/tổng số thì không) |
| 5 | Enum `{action}` của `packing-labels/{labelId}/{action}` — chỉ suy được `ready`, `print` ✅ scan.service.ts:1675 |
| 6 | Tập giá trị `{resource}` của path dựng động ✅ scan.service.ts:937 — chỉ thấy `warranty-component-issues` ✅ :453 |
| 7 | Segment cuối của 4 endpoint `warranty-cases/{caseId}/…` (đổi trạng thái, events, attachments, upload) |
| 8 | Server **có** hỗ trợ `Idempotency-Key` không |
| 9 | Server **có** dùng `If-Match` cho optimistic concurrency không |
| 10 | Định dạng token (JWT hay opaque), TTL, có refresh không |
| 11 | Ý nghĩa `X-Mini-App-Inbound-Fallback: legacy` |
| 12 | Giới hạn dung lượng/định dạng file upload bảo hành |

### 4.2 Nhóm A — chưa xác minh bằng thực thi

| Hạng mục | Lý do |
|---|---|
| Hành vi runtime của cả 12 endpoint | ⛔ Chưa khởi động server HTTP, chưa gọi thật (không được phép). Bộ test **đã chạy**: 36 passed, exit 0 |
| Shape lỗi validate của Laravel | Suy theo mặc định framework, chưa quan sát |
| Hành vi khi `client_scan_id` trùng | Suy ra là **500** (xem §5), chưa kiểm chứng bằng thực thi |
| `/api/*` có còn expose công khai tại `mini.lptech.info.vn` không | ⛔ **Không kiểm tra** — tuân thủ chỉ thị không dò quét, không khai thác |

---

## 5. 📋 BÁO CÁO RIÊNG — Idempotency · Duplicate detection · Conflict handling

### 5.1 Nhóm A — `backend/` **[V-CODE, kết luận dứt khoát]**

| Cơ chế | Có? | Bằng chứng |
|---|:---:|---|
| Xử lý header `Idempotency-Key` | ❌ **KHÔNG** | 🔧 `grep -rn "Idempotency" backend/app backend/routes backend/config backend/database` → **0 kết quả** |
| Idempotency qua `client_scan_id` | ⚠️ **MỘT PHẦN, HỎNG** | Cột có ràng buộc `unique()` ✅ migration `2026_08_06_000001` — **nhưng** `WarehouseScanController` **không có `try`/`catch` nào** (🔧 grep `QueryException\|try {\|catch` trong file → 0 kết quả) → gửi lại cùng key gây **HTTP 500**, không phải replay idempotent |
| Duplicate detection | ⚠️ **CÓ, nhưng sai mô hình** | ✅ `Controller:43` — `where('normalized_code', …)->exists()` là **duy nhất TOÀN HỆ THỐNG**: một mã vạch **không bao giờ** quét được lần thứ hai, bất kể chứng từ, ngữ cảnh hay thời điểm |
| Conflict handling (`If-Match`/ETag/version/409) | ❌ **KHÔNG CÓ GÌ** | 🔧 grep `If-Match\|ETag\|409\|Conflict\|lockForUpdate\|optimistic` → **0 kết quả liên quan**. 🔧 Không có cột `version`/`revision`/`lock` nào trong migration nghiệp vụ |
| Transaction / khoá bi quan | ❌ **KHÔNG** | Không có `DB::transaction`, không `lockForUpdate` |

#### ⚖️ Tương phản đáng chú ý trong cùng repo

`ZaloWebhookController` **làm đúng** điều mà `WarehouseScanController` bỏ sót:

```
ZaloWebhookController.php:75-81
    } catch (QueryException $error) {
        if (! $this->isUniqueConstraintViolation($error)) { throw ... }
        $this->markDuplicate($eventKey, $receivedAt);   // duplicate_count + 1
    }
```

→ Webhook ZNS **có** xử lý trùng đúng chuẩn (bắt vi phạm unique, tăng `duplicate_count`), còn API quét thì không. Củng cố kết luận: **phần webhook là code sản xuất chín; phần API quét là prototype**.

### 5.2 Nhóm B — WMS backend ngoài **[KHÔNG CÓ BẰNG CHỨNG]** — 🔄 ĐÃ LẬT 2026-09-05

> 🔴 **ĐÍNH CHÍNH QUAN TRỌNG — đọc trước phần bên dưới.**
>
> Kết luận *"KHÔNG CÓ BẰNG CHỨNG"* trong mục này đúng **tại thời điểm audit 2026-09-04**, khi chưa ai có tài liệu API.
>
> Ngày **2026-09-05** người dùng cung cấp spec OpenAPI chính thức của WMS. Spec **CÓ** tài liệu hoá đầy đủ:
>
> | | |
> |---|---|
> | `Idempotency-Key` | **48 endpoint** — *8–100 ký tự · cùng key+payload → replay · cùng key khác payload → **409** · sai độ dài → **422*** |
> | `If-Match` | **75 endpoint** — optimistic locking theo cột `version`; thiếu → **428**, sai → **412 STALE_VERSION** |
>
> 📄 Chi tiết: [03-api-contract-delta.md §3](03-api-contract-delta.md)
>
> ⚠️ **Vẫn chưa kiểm chứng trên staging** và contract **chưa được chủ sở hữu ký duyệt** — [Gate WMS §5](gates/GATE_WMS_API_INTEGRATION.md) đòi cả hai. Nên các lệnh cấm hiện hành **chưa được gỡ**.
>
> Phần văn bản gốc dưới đây **giữ nguyên** làm hồ sơ lịch sử, không viết lại.

<sub>— văn bản gốc 2026-09-04 —</sub>

| Cơ chế | Kết luận |
|---|---|
| `Idempotency-Key` | 🔴 **KHÔNG CÓ BẰNG CHỨNG SERVER HỖ TRỢ.** Client gửi ở 18 vị trí — đó là **ý định phía client**, không phải hành vi phía server |
| Duplicate detection | ❓ Không biết. Client có cơ chế riêng (`pendingKeysRef` + debounce 1800 ms ✅ [useScanRequest.ts:80-92](../../src/hooks/useScanRequest.ts)) nhưng đó là chống trùng **phía client** |
| Conflict handling | ❓ Không biết. Client gửi `If-Match` và **báo lỗi nếu không lấy được version** ✅ scan.service.ts:490, 1066 → gợi ý server **có thể** dùng, nhưng **không phải bằng chứng** |

#### ⚠️ Lỗi dùng `Idempotency-Key` ngay cả khi server có hỗ trợ

| Cách dùng | Số vị trí | Đánh giá |
|---|:--:|---|
| Key **bền** qua các lần thử lại | 3 | ✅ Đúng — `ReceiptCreatePage:25` (`useRef`), `OutboundReviewPage:86-87` (lưu trong store), `receipt-flow.service.ts:1791` |
| Key **sinh mới ngay tại lời gọi** | 10 | ❌ **Sai** — `generateClientScanId()` = `crypto.randomUUID()`, mỗi lần thử lại tạo key mới → **mất hoàn toàn tác dụng chống trùng** |

Vị trí sai: `receipt-flow.service.ts:500, 754, 802, 848, 909, 923` · `scan.service.ts:1695, 1748` · `warranty-flow.service.ts:192, 318`.

### 5.3 Hệ quả bắt buộc cho thiết kế offline (ràng buộc Q8 quy tắc 6)

> ✅ **Xác nhận tuân thủ chỉ thị:** *"không được tự khẳng định backend đã hỗ trợ khi chưa có bằng chứng"*.
>
> **Kết luận chính thức: KHÔNG CÓ BẰNG CHỨNG NÀO cho thấy WMS backend hỗ trợ idempotency, duplicate detection hay conflict handling.**
>
> Do đó, theo chỉ thị mục 4 của bạn:
> - ❌ **Không gửi header `Idempotency-Key`** với giả định server đã hỗ trợ.
> - ❌ **Không mở hàng đợi đồng bộ mutation** cho tới khi Q9 xác nhận contract + duplicate handling + conflict handling.
> - ✅ Chỉ giữ **local draft bền vững** và **hiển thị trạng thái chưa gửi**; mọi mutation do **người dùng chủ động bấm khi có mạng**.

---

## 6. Điều kiện để nâng cấp tài liệu này thành contract chính thức

| # | Cần từ phía bạn / đội backend |
|:--:|---|
| 1 | OpenAPI/Swagger/Postman chính thức của WMS backend (42 endpoint) |
| 2 | Xác nhận môi trường: `khohoanamdev.bigk.click` là dev / staging / prod; có môi trường tách biệt không |
| 3 | Tài khoản test (cấp qua kênh an toàn, **không dán vào hội thoại**) |
| 4 | Trả lời dứt điểm: server **có** xử lý `Idempotency-Key` không, ngữ nghĩa thế nào (replay kết quả cũ? 409 khi khác payload?) |
| 5 | Trả lời dứt điểm: server **có** dùng `If-Match` không, trả mã gì khi version lệch |
| 6 | Quy tắc phát hiện trùng và xử lý xung đột phía server |
| 7 | Danh mục mã lỗi đầy đủ |
| 8 | Enum `{action}` và tập `{resource}` cho các path dựng động |

Khi có đủ, hai tệp `.draft.yaml` sẽ được đối chiếu, sửa và chỉ khi đó mới đổi trạng thái khỏi `DRAFT_DERIVED_FROM_SOURCE`.

---

## 7. Tuân thủ ràng buộc Q9

| Chỉ thị | Tuân thủ |
|---|:--:|
| Không sửa backend | ✅ 🔧 `git diff HEAD -- backend/` rỗng |
| Không gọi API ghi dữ liệu | ✅ Không gọi bất kỳ API nào |
| Không deploy | ✅ |
| Không tạo hợp đồng API giả | ✅ Cả hai tệp đều mang nhãn `DRAFT_DERIVED_FROM_SOURCE`, `x-confidence`, và cảnh báo ở đầu tệp |
| Không dùng credential trong repo | ✅ Không đọc, không dùng, không in `.env` thật |
| Không suy luận môi trường từ tên miền | ✅ Đánh dấu `x-environment-confirmed: false` |
| Chỉ báo cáo về `/api/*` public, không khai thác | ✅ Không dò quét, không gọi thử — xem [01-backend-audit.md §4](01-backend-audit.md) |
