# 01 — Backend Audit & API Inventory (chỉ đọc)

**Commit khảo sát:** `663114aff6804e50b77b88e05dda9f9c784d6fff`
**Phạm vi:** audit **chỉ đọc** theo yêu cầu Q9. **Không sửa backend, không gọi API ghi dữ liệu, không deploy, không tạo hợp đồng API giả.**

## Quy ước mức độ xác minh

| Ký hiệu | Nghĩa |
|---|---|
| **[V-CODE]** | **Đã xác minh bằng mã nguồn phía server** — route + controller tồn tại trong repo, đọc được định nghĩa đầy đủ |
| **[I-FE]** | **Chỉ suy ra từ mã nguồn frontend** — không có định nghĩa server trong repo, không có spec, **chưa xác minh** |
| **[⛔ CHƯA CHẠY]** | Không thực thi được — không có tài khoản test, và **không được phép gọi API thật** |

> ⚠️ **Không endpoint nào được xác minh bằng cách gọi thật.** Không khởi động server HTTP, không gọi API. Theo chỉ thị Q9: không sử dụng tài khoản/token/credential tìm thấy trong source.
>
> 📌 **Đính chính (2026-09-04):** bản audit đầu ghi *"thiếu `backend/vendor/`"* — **điều này SAI**. `backend/vendor/` có sẵn, PHP 8.3.30 và Composer 2.10 đều cài đặt. Bộ test backend **đã chạy được** (baseline 5 passed; sau retention hotfix: 36 passed, exit 0). Việc chưa xác minh endpoint là do **không được phép gọi API thật**, không phải do thiếu công cụ.

---

## 1. Vai trò thực tế của thư mục `backend/`

`backend/` **không phải** backend mà Mini App đang gọi. Nó là một dịch vụ Laravel 12 riêng biệt phục vụ **hai mục đích tách rời nhau**:

| # | Vai trò | Trạng thái | Bằng chứng |
|---|---|---|---|
| **A** | **Prototype lưu mã quét** (`/api/*`) | 🔴 **Đã bị thay thế — frontend không còn gọi** | 🔧 `grep -rn "warehouse-scans\|zalo/login\|/api/receipts/\|/api/outbounds/\|lookup-by-code\|item-lookup" src/` → **0 kết quả trỏ tới backend/** |
| **B** | **Bộ nhận webhook ZNS/OA của Zalo** (`/zns/zalo-webhook`) | 🟢 **ĐANG CHẠY PRODUCTION** | ✅ [docs/zns-webhook-production.md:5](../zns-webhook-production.md) — `https://mini.lptech.info.vn/zns/zalo-webhook`, kèm allowlist App ID thật và checklist deploy |

### 1.1 Bằng chứng vai trò A đã chết

| Bằng chứng | Chi tiết |
|---|---|
| Bề mặt API không khớp | Backend dùng `/api/warehouse-scans/*`, `/api/receipts/*`; frontend gọi `/api/v1/*` — 🔧 `grep -rn "v1" backend/routes/ backend/app/Http/Controllers/` → **0 kết quả** |
| Dữ liệu sản phẩm là **giả** | ✅ [WarehouseScanController.php:252-265](../../backend/app/Http/Controllers/WarehouseScanController.php) — `buildProductInfo()` sinh `sku_code`, `product_name`, `serial_no` từ **hash CRC32 của mã quét**. Comment trong code: *"Adapter dữ liệu tạm để chuẩn bị nối ERP/backend thật"* |
| Không có mô hình nghiệp vụ kho | Chỉ 4 bảng: `warehouse_scans`, `warehouse_staff`, `zalo_webhook_events`, `users`. **Không có** bảng sản phẩm, tồn kho, chứng từ nhập/xuất, bảo hành |
| Cơ chế xác thực khác hẳn | Backend dùng **Zalo OAuth** (`graph.zalo.me`); frontend hiện dùng **email + mật khẩu** tới WMS ngoài |
| Tên DB còn sót template cũ | ✅ [backend/.env.example](../../backend/.env.example) → `DB_DATABASE=bachhoa` |

### 1.2 Vai trò B vẫn sống và **tồn tại xuyên suốt migration**

`ZaloWebhookController` (381 dòng) là code chín, có xử lý nghiêm túc: chống trùng sự kiện (`event_key` unique + `duplicate_count`), allowlist App ID, chuẩn hoá payload, phân biệt `user_received_message` / `user_seen_message`, nhận diện SHA-256 và số điện thoại VN.

> ⚠️ **Quan trọng cho kế hoạch migration:** đây là **phụ thuộc Zalo duy nhất sẽ KHÔNG biến mất** khi chuyển sang React Native. Nếu công ty vẫn gửi thông báo ZNS/OA cho khách, dịch vụ Laravel này phải tiếp tục chạy độc lập với app native.
> ❓ *Cần xác nhận:* ZNS/OA có tiếp tục là kênh vận hành sau migration không?

---

## 2. API Inventory — Nhóm 1: `backend/` **[V-CODE]**

Laravel 12 tự thêm tiền tố `/api` cho `routes/api.php` ✅ [bootstrap/app.php:8-13](../../backend/bootstrap/app.php).

### 2.1 Route công khai (không cần xác thực)

| Method | Path | Controller | Ghi chú |
|---|---|---|---|
| OPTIONS | `/api/{any}` | `WarehouseScanController@options` | Trả 204 + CORS ✅ api.php:7 |
| POST | `/api/zalo/login` | `ZaloAuthController@login` | Cấp session token 12h ✅ api.php:9 |

### 2.2 Route yêu cầu middleware `warehouse.session`

| Method | Path | Controller | Chức năng |
|---|---|---|---|
| GET | `/api/warehouse-scans/dashboard` | `@dashboard` | Đếm chờ duyệt / đã duyệt (cache) ✅ api.php:12 |
| GET | `/api/warehouse-scans/history` | `@history` | Lịch sử quét, `limit` 1–100 ✅ api.php:13 |
| DELETE | `/api/warehouse-scans/history` | `@clearHistory` | ⚠️ **Luôn trả 403** `AUDIT_DELETE_REVIEW_REQUIRED` ✅ Controller:158-165 |
| GET | `/api/warehouse-scans/approved-products` | `@approvedProducts` | 50 bản ghi đã duyệt (cache) ✅ api.php:15 |
| PATCH | `/api/warehouse-scans/{warehouseScan}/approve` | `@approve` | Duyệt bản ghi ✅ api.php:16 |
| POST | `/api/receipts/{documentId}/scans` | `@store('RECEIPT')` | ✅ api.php:18 |
| POST | `/api/outbounds/{documentId}/scans` | `@store('OUTBOUND')` | ✅ api.php:23 |
| POST | `/api/warranty/item-lookup` | `@store('WARRANTY_ITEM')` | ✅ api.php:28 |
| POST | `/api/component-issues/{documentId}/scans` | `@store('WARRANTY_COMPONENT')` | ✅ api.php:32 |
| POST | `/api/inventory/lookup-by-code` | `@store('INVENTORY_LOOKUP')` | ✅ api.php:37 |

### 2.3 Route web

| Method | Path | Ghi chú |
|---|---|---|
| GET | `/` | View `welcome` ✅ web.php:6 |
| GET | `/zns/zalo-webhook` | `ZaloWebhookController@show` ✅ web.php:10 |
| POST | `/zns/zalo-webhook` | `ZaloWebhookController@store` — **miễn CSRF** ✅ [bootstrap/app.php:15-17](../../backend/bootstrap/app.php) |
| GET | `/up` | Health check mặc định Laravel ✅ bootstrap/app.php:12 |

**Tổng: 12 endpoint API + 4 route web — tất cả [V-CODE].**

---

## 3. Cơ chế Authentication / Authorization của `backend/` **[V-CODE]**

### 3.1 Luồng cấp token

```
POST /api/zalo/login  { access_token?, user:{id,name,avatar}? }
   → resolveZaloProfile()
       ├─ nếu có access_token: GET https://graph.zalo.me/v2.0/me  → verified = true
       └─ nếu không / lỗi:     dùng user.id do CLIENT gửi        → verified = false
   → sessionToken = Str::random(80)          (hết hạn sau 12 giờ)
   → lưu hash('sha256', token) vào warehouse_staff.api_token_hash
   → trả { session_token, session_expires_at, staff }
```

### 3.2 Kiểm tra token

✅ [RequireWarehouseSession.php:14-31](../../backend/app/Http/Middleware/RequireWarehouseSession.php) — đọc Bearer token, so `hash('sha256', $token)` với `api_token_hash`, kiểm tra `api_token_expires_at`. Lỗi: `AUTH_REQUIRED` (401) hoặc `SESSION_EXPIRED` (401).

### 3.3 Authorization: **không có**

Middleware chỉ xác thực **danh tính**, không kiểm tra **vai trò**. `warehouse_staff.role` mặc định `'Warehouse Operator'` ✅ (migration 000002) và **không được dùng ở bất kỳ đâu để phân quyền**.

---

## 4. ⚠️ Phát hiện an toàn trong `backend/` (chỉ báo cáo, không sửa)

| # | Mức | Phát hiện | Bằng chứng |
|---|---|---|---|
| **B-01** | 🔴 **Nghiêm trọng** | **Có thể bỏ qua xác thực hoàn toàn.** `resolveZaloProfile()` fallback sang `user.id` do **client tự khai**, trả `verified = false`, nhưng `login()` **chỉ kiểm tra `$profile['id']` có rỗng hay không** rồi vẫn cấp session token 12h. → Bất kỳ ai POST `{"user":{"id":"<bất kỳ>"}}` đều nhận được token hợp lệ và truy cập toàn bộ API | ✅ ZaloAuthController.php:88-94 (fallback) vs :29-35 (chỉ check rỗng) vs :37-61 (vẫn cấp token bất kể `$verified`) |
| **B-02** | 🟠 Cao | `Access-Control-Allow-Origin: *` trên API đã xác thực | ✅ ZaloAuthController.php:114 · WarehouseScanController.php:312 · RequireWarehouseSession.php:46 |
| **B-03** | 🟠 Cao | `approve()` **không kiểm tra quyền**, và `approved_by` lấy trực tiếp từ input của client → **dấu vết audit giả mạo được** | ✅ WarehouseScanController.php:195-201 |
| **B-04** | 🟠 Cao | Chống trùng theo `normalized_code` là **duy nhất toàn hệ thống**: một mã vạch **không bao giờ** quét được lần thứ hai, bất kể chứng từ hay ngữ cảnh | ✅ WarehouseScanController.php:43 |
| **B-05** | 🟡 TB | `client_scan_id` có ràng buộc `unique()` ở DB nhưng controller **không bắt lỗi** → gửi lại cùng key sẽ gây **500**, thay vì trả idempotent | ✅ migration 000001 (`->unique()`) vs Controller:71-94 (không try/catch) |
| **B-06** | 🟡 TB | Dữ liệu sản phẩm là **giả**, sinh từ CRC32 | ✅ WarehouseScanController.php:252-265 |
| **B-07** | 🟠 Cao | **Bảng log tăng không giới hạn — không có cơ chế dọn nào.** Chi tiết §4.1 | 🔧 4 lệnh kiểm tra, xem §4.1 |

### 4.1 B-07 — Tăng trưởng không giới hạn (đã xác minh)

**`zalo_webhook_events`** — bảng log webhook ZNS/OA production:

| Kiểm tra | Kết quả |
|---|---|
| Model có `Prunable` / `MassPrunable`? | ❌ 🔧 `ZaloWebhookEvent.php` chỉ extend `Model` — không có trait dọn |
| Có scheduled task dọn? | ❌ 🔧 `backend/routes/console.php` **chỉ có lệnh `inspire` mặc định của Laravel** |
| Có scheduler đăng ký? | ❌ 🔧 `grep "schedule\|withSchedule" backend/bootstrap/app.php` → 0 kết quả |
| Có code prune/cleanup/retention/delete? | ❌ 🔧 `grep -rni "prune\|cleanup\|retention\|->delete()\|truncate\|Prunable"` trên `backend/app`, `backend/routes`, `backend/database` → **0 kết quả** |

**Mức độ nghiêm trọng cao hơn số dòng:** mỗi bản ghi lưu **hai blob JSON** (`raw_payload` **và** `normalized_payload` ✅ migration `2026_08_08_000001`), nên dung lượng tăng theo cả số sự kiện lẫn kích thước payload.

✅ *Điểm giảm nhẹ:* sự kiện trùng **không** tạo dòng mới — chỉ tăng `duplicate_count` ✅ `ZaloWebhookController.php:336-345`. Nhưng mọi sự kiện **duy nhất** đều tạo một dòng vĩnh viễn.

**`warehouse_scans`** có cùng vấn đề, thậm chí nặng hơn: cũng không có cơ chế dọn, **và** endpoint xoá lịch sử bị khoá vĩnh viễn bằng HTTP 403 ✅ `WarehouseScanController.php:158-165` (`AUDIT_DELETE_REVIEW_REQUIRED`). Mỗi bản ghi còn lưu thêm một blob JSON `response_payload`.

> ⏸️ **Chỉ ghi nhận, KHÔNG sửa trong Gate 01** theo chỉ thị của người dùng.
> ❓ Cần xử lý trong một phạm vi riêng: chính sách lưu trữ (retention), archive, hay prune định kỳ.

> Các phát hiện này **không chặn migration** vì `backend/` (vai trò A) đã chết. Nhưng nếu dịch vụ này **vẫn đang chạy công khai** tại `mini.lptech.info.vn` thì **B-01 là lỗ hổng thực tế đang mở**.
> ❓ *Cần xác nhận gấp:* các route `/api/*` của backend có còn được expose công khai không? Nếu có, nên đóng.

---

## 5. Request / Response schema **[V-CODE]** — `backend/`

### 5.1 `POST /api/{receipts|outbounds|...}/scans` — validate ✅ Controller:27-37

| Trường | Ràng buộc |
|---|---|
| `client_scan_id` | **required**, `uuid` |
| `code` | **required**, string ≤255 |
| `quantity` | nullable, integer ≥1 |
| `scan_method` | **required**, string ≤24 |
| `scan_context` | **required**, string ≤48 |
| `warehouse_staff_id` | nullable, integer, `exists:warehouse_staff,id` |
| `zalo_user_id` | nullable, string ≤255 |
| `scanned_by_name` | nullable, string ≤255 |
| `scanned_at` | nullable, date |

**Response 201:** `{ success, message, data:{ approval_status, product{…}, required_qty, scanned_qty, remaining_qty, matched, warehouse_staff, scan_record_id } }`
**Response 422:** `{ success:false, message, error_code }`

**6 mã lỗi thử nghiệm hardcode** ✅ Controller:16-23 — `NOT-FOUND`→`BARCODE_NOT_FOUND`, `DUPLICATE`→`ITEM_ALREADY_SCANNED`, `WRONG-SKU`→`SKU_NOT_REQUIRED`, `LINE-FULL`→`LINE_ALREADY_FULL`, `NETWORK-ERROR`, `TIMEOUT`. Trùng khớp `MOCK_SCAN_CODES` ở frontend ✅ [scan.constants.ts:56-64](../../src/constants/scan.constants.ts) → xác nhận đây là backend **dùng để test**.

### 5.2 Lược đồ CSDL **[V-CODE]** — 4 bảng

| Bảng | Cột chính | Migration |
|---|---|---|
| `warehouse_scans` | `client_scan_id` (uuid, **unique**), `code`, `normalized_code` (idx), `quantity`, `scan_method`, `scan_context` (idx), `document_id` (idx), `approval_status` (idx), `approved_at/by`, `product_id`, `sku_code`, `product_name`, `item_id/code`, `serial_no`, `warehouse_name`, `response_payload` (json) | `2026_08_06_000001` |
| `warehouse_staff` | `zalo_user_id` (**unique**), `name`, `avatar_url`, `role`, `zalo_verified`, `api_token_hash` (idx), `api_token_expires_at`, `last_login_at` | `2026_08_06_000002` + `2026_08_21_000001` |
| `zalo_webhook_events` | `event_key` (**unique**), `app_id`, `event_name`, `event_scope`, `payload_variant`, `status`, `msg_id`, `tracking_id`, `user_id`, `phone_id`, `raw_payload`/`normalized_payload` (json), `duplicate_count`, `received_at`/`occurred_at` | `2026_08_08_000001` |
| `users` | Bảng mặc định Laravel — **không dùng** | `0001_01_01_000000` |

**CSDL: PostgreSQL** ✅ [backend/.env.example](../../backend/.env.example) `DB_CONNECTION=pgsql`, `DB_DATABASE=bachhoa`.

---

## 6. API Inventory — Nhóm 2: WMS backend ngoài **[I-FE — CHƯA XÁC MINH]**

**~42 endpoint** đã liệt kê đầy đủ tại [01-dependency-inventory.md §1](01-dependency-inventory.md).

> ⛔ **Toàn bộ 42 endpoint này chỉ được suy ra từ mã nguồn frontend.** Trong repository **không có** định nghĩa server, không có OpenAPI/Swagger/Postman, không có tài liệu contract.
> 🔧 `git ls-files | grep -iE "openapi|swagger|postman|\.ya?ml$|contract"` → chỉ trả về `docs/design/05-api-contract.md`, **là hợp đồng API của app bán hoa**, không liên quan.

**Không thể xác minh:** tên trường thật, kiểu dữ liệu, trường bắt buộc/tuỳ chọn, mã lỗi đầy đủ, quy tắc phân trang, hành vi `Idempotency-Key` phía server, ngữ nghĩa `If-Match`/version.

> ⚠️ **Liên quan trực tiếp tới Q8:** bạn yêu cầu *"Quy tắc idempotency cuối cùng phải được đối chiếu với backend/API contract; không được tự khẳng định backend đã hỗ trợ khi chưa có bằng chứng."*
> **Tôi xác nhận: hiện KHÔNG có bằng chứng nào cho thấy WMS backend hỗ trợ `Idempotency-Key`.** Frontend *có gửi* header này ở 18 vị trí, nhưng đó là bằng chứng về **ý định của phía client**, không phải bằng chứng về **hành vi của server**. Việc thiết kế hàng đợi offline **không được giả định** server đã idempotent cho tới khi có contract.

---

## 7. Base URL và biến môi trường — **3 hệ thống riêng biệt**

| # | Base URL | Vai trò | Trạng thái |
|---|---|---|---|
| 1 | `https://khohoanamdev.bigk.click` | **WMS backend ngoài** — app thật gọi tới | ❓ **Chưa xác nhận là dev / staging / production** |
| 2 | `https://mini.lptech.info.vn` | **Laravel `backend/`** — mini API + webhook ZNS | Webhook: production ✅; `/api/*`: ❓ chưa rõ còn expose không |
| 3 | `https://provinces.open-api.vn/api/v2` | API cộng đồng — tỉnh/phường VN | Bên thứ ba, không SLA |

> ⚠️ Tên miền `khohoanamdev.bigk.click` chứa chuỗi `dev`, nhưng đây **là suy đoán từ tên miền, không phải bằng chứng**. `.env` hiện tại dùng chính URL này cho `VITE_API_BASE_URL` **và** `VITE_WMS_API_BASE_URL` — tức app đang chạy với một môi trường duy nhất, không tách dev/staging/prod.

### 7.1 Biến môi trường frontend

11 biến, **6 chưa được tài liệu hoá** — xem [01-source-audit.md §9](01-source-audit.md).

### 7.2 Biến môi trường backend ✅ [backend/.env.example](../../backend/.env.example)

Chuẩn Laravel, cộng 2 biến riêng: `ZALO_WEBHOOK_APP_IDS`, `ZALO_WEBHOOK_LOG_RAW` ✅ [config/services.php](../../backend/config/services.php).

> 🔒 **Không có credential thật nào bị in ra trong báo cáo này.** `.env` gốc (untracked) chứa `APP_ID`/`ZMP_TOKEN` — đã che. Theo chỉ thị Q9: **không sử dụng bất kỳ tài khoản/token nào tìm thấy trong source.**

---

## 8. Tài liệu API sẵn có: **KHÔNG CÓ**

| Loại | Kết quả |
|---|---|
| OpenAPI / Swagger | ❌ 🔧 `git ls-files` + grep nội dung → 0 kết quả |
| Postman collection | ❌ 0 |
| Package sinh doc (l5-swagger, scribe…) | ❌ 🔧 `backend/composer.json` chỉ có `laravel/framework`, `laravel/tinker` |
| `.http` / `.rest` | ❌ 0 |
| Tài liệu API dạng markdown cho WMS | ❌ (chỉ có `docs/design/05-api-contract.md` = app bán hoa) |

**Tài liệu backend hợp lệ duy nhất:** ✅ [docs/zns-webhook-production.md](../zns-webhook-production.md) — chỉ nói về webhook ZNS.

---

## 9. Kiểm thử backend

| | |
|---|---|
| `tests/Feature/ZaloWebhookTest.php` | Test thật duy nhất — cho webhook |
| `tests/Feature/ExampleTest.php`, `tests/Unit/ExampleTest.php` | Stub mặc định Laravel |
| **Độ bao phủ cho 12 endpoint API** | **0** |
| ✅ Đã chạy | `php artisan test` → **36 passed, 89 assertions, exit 0** (sau retention hotfix; baseline trước đó 5 passed) |

---

## 10. Kết quả kiểm tra `docs/design/` (theo yêu cầu Q7)

### 10.1 Kiểm tra nội dung: **không có nội dung WMS nào**

🔧 Đã kiểm tra **cả 10 file**. 7 file khớp trực tiếp từ khoá "hoa tươi/florist/flower". 3 file còn lại (`02-flows-sitemap.md`, `07-architecture.md`, `08-test-plan.md`) tuy không chứa từ "hoa" nhưng:

| File | Từ khoá WMS (kho/inbound/outbound/bảo hành/quét mã/PDA) | Từ khoá bán hàng (giỏ hàng/đơn hàng/checkout/voucher) |
|---|:---:|:---:|
| `02-flows-sitemap.md` | **0** | 14 |
| `07-architecture.md` | **0** | 5 |
| `08-test-plan.md` | **0** | 6 |

Ví dụ `02-flows-sitemap.md` mô tả bottom nav *"Trang chủ · Danh mục · Giỏ hàng · Đơn hàng · Cá nhân"* — hoàn toàn khác bottom nav WMS thật (*"Trang chủ · Quét mã · Duyệt phiếu · Lịch sử · Cá nhân"* ✅ [App.tsx:9-19](../../src/app/App.tsx)).

**Kết luận: cả 10/10 file thuộc app bán hoa. Không phát hiện nội dung hợp lệ nào của WMS_Hoa Nam.**

### 10.2 Kiểm tra dependency/reference

🔧 `grep -rn "docs/design"` trên toàn repo (trừ `node_modules`):

| Nơi tham chiếu | Loại | Ảnh hưởng nếu xoá |
|---|---|---|
| `docs/migration/01-source-audit.md` (§8.2, 3 dòng) | Tài liệu của chính đợt audit này | Chỉ là liên kết dẫn chứng — sẽ thành link chết, cần sửa lại text |
| `docs/migration/01-dependency-inventory.md` (1 dòng) | như trên | như trên |
| `docs/migration/01-ui-ux-defects.md` (1 dòng) | như trên | như trên |
| `docs/migration/gates/GATE_01.md` (2 dòng) | như trên | như trên |
| `.tmp/bachhoa-portable-20260821-032642/docs/design/09-phase-plan.md` | **Bản sao lưu untracked** (`.tmp/` nằm trong `.gitignore`) | Không ảnh hưởng — không thuộc git |

**Không có mã nguồn, cấu hình, script build hay test nào tham chiếu `docs/design/`.**

### 10.3 Danh sách 10 file sẽ bị ảnh hưởng nếu xoá

```
docs/design/README.md
docs/design/01-business-analysis.md
docs/design/02-flows-sitemap.md
docs/design/03-state-machines.md
docs/design/04-erd-database.md
docs/design/05-api-contract.md
docs/design/06-permission-error.md
docs/design/07-architecture.md
docs/design/08-test-plan.md
docs/design/09-phase-plan.md
```

Cộng 5 dòng liên kết trong 4 tài liệu `docs/migration/` cần sửa lại.

> ⏸️ **CHƯA XOÁ.** Điều kiện xoá của bạn đã thoả (là hồ sơ app bán hoa, không chứa nội dung WMS, không có dependency mã nguồn), nhưng theo quy tắc Giai đoạn 1 (*không sửa repository*) và yêu cầu *"báo danh sách file bị ảnh hưởng"*, tôi **báo cáo và chờ bạn ra lệnh xoá riêng**. Xoá là thao tác khó hoàn tác — cần bạn xác nhận rõ ràng.
> 📌 Lưu ý thêm: bản sao `.tmp/bachhoa-portable-*` cũng chứa `docs/design/` và cả source cũ. ❓ Có cần dọn `.tmp/` không?

---

## 11. Tổng kết Q9 — `PASS_FOR_ARCHITECTURE`, phần live hoãn sang Gate riêng

| Hạng mục | Trạng thái |
|---|---|
| Vai trò `backend/` | ✅ **Đã xác định**: prototype đã chết (A) + webhook ZNS production (B) |
| Controllers / routes / endpoints của `backend/` | ✅ **12 endpoint API + 4 route web — [V-CODE]** |
| Authentication / authorization của `backend/` | ✅ Đã xác định — kèm 6 phát hiện an toàn |
| Request/response schema của `backend/` | ✅ Đã trích xuất từ validate rule + migration |
| Base URL & biến môi trường | ✅ 3 hệ thống, 11 biến FE (6 chưa tài liệu hoá), 2 biến BE riêng |
| Tài liệu API sẵn có | ❌ **KHÔNG CÓ** |
| **Contract của WMS backend (~42 endpoint)** | ⛔ **KHÔNG CÓ — [I-FE], chặn cứng** |
| Môi trường (dev/staging/prod) | ⛔ **Chưa xác nhận** |
| Tài khoản test | ⛔ **Chưa có** |

**Q9:** `PASS_FOR_ARCHITECTURE — LIVE CONTRACT/AUTH/ENVIRONMENT DEFERRED_TO_GATE_WMS_API_INTEGRATION`.

Phần kiến trúc đã đóng trong `GATE_01`. Contract chính thức, môi trường, xác thực và hành vi idempotency/conflict phía server **bắt buộc PASS** [`GATE_WMS_API_INTEGRATION`](gates/GATE_WMS_API_INTEGRATION.md) **trước khi phát hành production**.
