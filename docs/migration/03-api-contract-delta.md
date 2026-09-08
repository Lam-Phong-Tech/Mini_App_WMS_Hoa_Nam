# 03 — Đối chiếu contract WMS thật với giả định của client

**Ngày:** 2026-09-05
**Nguồn spec:** `https://khohoanamdev.bigk.click/docs?api-docs.json` — người dùng cung cấp
**Phân loại môi trường:** **STAGING** — người dùng xác nhận trực tiếp 2026-09-05

> 🔴 Tài liệu này **thay đổi tiền đề của nhiều quyết định trước đó**. Đọc §4 trước khi làm gì tiếp.

---

## 1. Spec thật — thông tin cơ bản

| Mục | Giá trị |
|---|---|
| Chuẩn | **OpenAPI 3.0.0** |
| Tên | `WMS_HoaNam API` |
| Version | **2.0.0** |
| Server | `https://khohoanamdev.bigk.click` |
| Kích thước | 2.479.991 byte |
| Path | **277** |
| Operation | **340** |
| Tag | 24 (Mini App là tag `22`) |
| Operation thuộc Mini App | **62** |
| Authentication | `bearerAuth` — HTTP bearer, **JWT** |
| Mã lỗi khai báo | **147** |

🔒 **TLS được cưỡng chế**: `http://` trả `301` chuyển sang `https://`.

---

## 2. Đối chiếu 44 endpoint client đang gọi

Nguồn phía client: `x-endpoint-index` trong [wms-external-api.draft.yaml](openapi/wms-external-api.draft.yaml) — suy từ call-site, nhãn `CLIENT_EXPECTED_CONTRACT`.

| Kết quả | Số lượng |
|---|:--:|
| ✅ **Khớp spec thật** | **37** |
| ❌ Không tìm thấy | **1** |
| 🔀 Trước đây "chưa xác định", **nay đã tra ra** | **6** |

### 2.1 ❌ Một endpoint client gọi SAI đường dẫn

| | |
|---|---|
| Client gọi | `GET /api/v1/mini-app/warranty-attachments/{id}` |
| Nguồn | `src/services/warranty-flow.service.ts:413,439` |
| Spec thật | `GET /api/v1/mini-app/warranty-attachments/{attachmentId}/**download**` |
| Khác biệt | Thiếu hậu tố `/download` |

Đây là **lỗi thật của Mini App cũ** (hoặc API đã đổi mà client chưa cập nhật). Chức năng tải tệp đính kèm bảo hành nhiều khả năng đang hỏng.

> ✅ **ĐÃ KIỂM CHỨNG trên staging** — đường dẫn client trả **405 Method Not Allowed**, đường dẫn spec trả **401**. Xác nhận lỗi có thật. Xem §4b.3.

### 2.2 🔀 Sáu chỗ "chưa xác định" nay đã tra ra

| Trước | Sau |
|---|---|
| `packing-labels/{labelId}/{action}` — *"enum ĐẦY ĐỦ CHƯA BIẾT"* | **5 action**: `apply` · `preview` · `print` · `ready` · `reprint` |
| `warranty-cases/{caseId}/…` POST đổi trạng thái | `POST .../{id}/**status**` |
| `warranty-cases/{caseId}/…` GET timeline | `GET .../{id}/**events**` |
| `warranty-cases/{caseId}/…` GET attachments | `GET .../{id}/**attachments**` |
| `warranty-cases/{caseId}/…` POST upload | `POST .../{id}/**attachments**` |
| `{resource}/{documentId}/{scanPath}` — path dựng động | `POST /api/v1/mini-app/warranty-component-issues/{id}/**scans**` |

### 2.3 Một header client gửi mà spec không khai

`X-Mini-App-Inbound-Fallback: legacy` → **0 lần xuất hiện** trong spec. Cần hỏi chủ sở hữu WMS header này còn tác dụng không.

### 2.4 Hai bề mặt API song song

Nhiều tài nguyên tồn tại ở **cả hai** dạng:

```
/api/v1/outbound-documents/{id}/packing-labels/{labelId}/print
/api/v1/mini-app/outbound-documents/{id}/packing-labels/{labelId}/print
```

Client hiện dùng lẫn cả hai. Cần hỏi: bản `mini-app/` có phải là bề mặt bắt buộc cho ứng dụng di động không, và hai bên có khác nhau về quyền hay hành vi không.

---

## 3. 🔑 Idempotency và Conflict — spec CÓ tài liệu hoá đầy đủ

Đây là thông tin mà toàn bộ hồ sơ trước đây khẳng định là **không tồn tại**.

### 3.1 `Idempotency-Key` — 48 endpoint

Ngữ nghĩa lấy nguyên văn từ spec:

> *"Bắt buộc. Chuỗi 8-100 ký tự do client sinh. **Gửi lại cùng key trả về kết quả lần đầu (replay); dùng lại key cho payload khác trả 409.**"*

| Thuộc tính | Giá trị |
|---|---|
| Độ dài | **8–100 ký tự**, do client sinh |
| Sai độ dài | **422 `VALIDATION_ERROR`** |
| Cùng key + cùng payload | **replay** kết quả lần đầu |
| Cùng key + **khác** payload | **409** |
| Một số endpoint trả | `replayed=true` |
| Bắt buộc / tuỳ chọn | tuỳ endpoint — có cả hai |

Ví dụ đúng những endpoint đang chặn thiết kế offline:

- `POST /api/v1/mini-app/inbound-documents/{id}/post-receipt` — *"Bắt buộc cho Post Receipt; retry cùng key replay kết quả cũ."*
- `POST /api/v1/mini-app/inbound/record` — *"Giữ nguyên key khi retry cùng một lần XÁC NHẬN GHI NHẬN."*
- `POST /api/v1/mini-app/outbound-documents` — *"Giữ nguyên key khi retry cùng một lần tạo phiếu."*
- `POST /api/v1/mini-app/outbound/record` — *"Giữ nguyên key khi retry cùng một lần Xác nhận ghi nhận."*

### 3.2 `If-Match` — 75 endpoint, optimistic locking

> *"Bắt buộc. Optimistic locking theo cột version của resource. **Thiếu header: 428 PRECONDITION_REQUIRED. Sai version: 412 STALE_VERSION.**"*

`ETag` xuất hiện 15 lần. Có nhóm endpoint để `If-Match` **tuỳ chọn**, gửi thì mới kiểm.

### 3.3 Mã trạng thái phủ khắp

`400` · `401` · `403` · `404` · `409` · `412` · `422` · `428` · `500` xuất hiện trên **339/340** operation — nghĩa là error schema được khai báo nhất quán, không phải bỏ trống.

---

## 4. 🔴 Hệ quả: hai tiền đề cũ đã bị lật

### 4.1 Tiền đề bị lật

[GATE_01 §3](gates/GATE_01.md) thu hẹp quy tắc offline với lý do ghi rõ:

> *"Lý do thu hẹp: audit xác nhận **không có bằng chứng** WMS backend hỗ trợ `Idempotency-Key`."*

[01-api-inventory.md §5.2](01-api-inventory.md) xếp Nhóm B là **`KHÔNG CÓ BẰNG CHỨNG`**.

**Cả hai nay đã sai** — spec chính thức tài liệu hoá `Idempotency-Key` trên 48 endpoint kèm ngữ nghĩa replay/409 rõ ràng.

### 4.2 Điều này KHÔNG tự động mở khoá gì

| Hạng mục | Trạng thái |
|---|---|
| Bằng chứng **bằng văn bản** cho idempotency | ✅ **có rồi** |
| **Kiểm chứng trên staging** | 🔴 **chưa** — [Gate WMS §5 điều 4](gates/GATE_WMS_API_INTEGRATION.md) đòi *"xác nhận bằng văn bản **VÀ** kiểm chứng trên staging"* |
| Contract được chủ sở hữu **ký duyệt** | 🔴 chưa — Swagger tự sinh ≠ văn bản ký duyệt |
| **5xx có rollback toàn bộ không** | 🔴 **vẫn chưa biết** — OpenAPI không mô tả hành vi transaction |

> ❗ Vì vậy `HTTP_5XX_POLICY` vẫn giữ `'unknown'`, và `FORBIDDEN_HEADERS` vẫn chặn `Idempotency-Key` cho tới khi có Change Control.

### 4.3 Ba ràng buộc hiện vẫn còn hiệu lực

| Nguồn | Nội dung |
|---|---|
| [GATE_01 §11 điều 6](gates/GATE_01.md) | Cấm gửi `Idempotency-Key` với **giả định** server hỗ trợ |
| [GATE_01 §11 điều 4](gates/GATE_01.md) | Cấm gọi mutation thật lên WMS |
| [Gate WMS §2b.3](gates/GATE_WMS_API_INTEGRATION.md) | Cấm bật `wmsGateApproved: true` |

Điều 6 nói *"với giả định"*. Nay không còn là giả định nữa — nhưng **gỡ ràng buộc là quyết định của người dùng**, không phải suy luận của tôi.

---

## 4b. ✅ Contract test ĐỌC trên staging — đã chạy thật 2026-09-05

Người dùng chọn phương án A. Ràng buộc tự áp khi chạy: **chỉ GET**, không gửi credential, tuần tự, giãn cách 250 ms, không ghi gì lên server.

### 4b.1 Endpoint công khai — envelope thật

| Endpoint | HTTP | Thời gian |
|---|:--:|:--:|
| `/api/v1/health` | **200** | 555 ms |
| `/api/v1/public/health/version` | **200** | 336 ms |
| `/api/v1/public/config` | **200** | 269 ms |
| `/api/v1/public/categories` | **200** | 397 ms |

Envelope chuẩn của toàn hệ thống:

```json
{ "success", "message", "error_code", "errors", "data", "meta" }
```

`meta` luôn có **`request_id`** (UUID) — dùng được để tra cứu khi báo lỗi cho backend.

### 4b.2 Mười một endpoint client đang gọi — **tất cả TỒN TẠI**

| Kết quả | Số endpoint |
|---|:--:|
| **401** — tồn tại, được bảo vệ đúng | **11/11** |
| 404 — không tồn tại | 0 |

Gồm `/auth/me` · `/warehouses` · `/products` · `/defects` · `/inventory/balances` · `/scan/events` · `/mini-app/inbound-documents` · `/mini-app/outbound-documents` · `/mini-app/printer-configs` · `/mini-app/warranty-cases` · `/mini-app/products`. Thời gian phản hồi 232–615 ms.

> ✅ Xác nhận ở **runtime**, không chỉ trên giấy: 37 endpoint khớp spec là khớp thật.

### 4b.3 🔴 Xác nhận lỗi `warranty-attachments` — bằng chứng dứt khoát

| Đường dẫn | HTTP | Nghĩa |
|---|:--:|---|
| `/api/v1/mini-app/warranty-attachments/1` *(client đang gọi)* | **405** | Route có tồn tại nhưng **GET không được phép** — path đó chỉ khai `DELETE` |
| `/api/v1/mini-app/warranty-attachments/1/download` *(spec khai)* | **401** | Tồn tại, được bảo vệ đúng |

**405 chứ không phải 404** là chẩn đoán còn chính xác hơn: route tồn tại cho `DELETE`, nên `GET` của client **không bao giờ chạy được**. Chức năng tải tệp đính kèm bảo hành trên Mini App cũ **đang hỏng thật**.

### 4b.4 Envelope lỗi thật — 401 nguyên văn

```json
{
  "success": false,
  "message": "Chưa đăng nhập hoặc phiên đăng nhập đã hết hạn.",
  "error_code": "UNAUTHENTICATED",
  "errors": [],
  "error": { "code": "UNAUTHENTICATED", "details": [] },
  "meta": { "request_id": "db4b7ad6-…", "timestamp": "2026-09-05T17:09:13+07:00" }
}
```

🔑 Server trả **CẢ HAI** `error_code` (cấp cao nhất) **và** `error.code` (lồng). Đây chính là lý do `extractErrorCode` của app phải chịu được nhiều dạng — thứ tự `error_code → code → error.code` port từ Mini App cũ **nay đã được xác nhận là đúng**.

Phản hồi **thành công** để `error_code: null` và `message: null` — app phải không hiểu nhầm `null` thành chuỗi. Đã có test.

### 4b.5 Khoá kết luận bằng test

`__tests__/wmsContract.test.ts` — **9 ca**, dùng **fixture nguyên văn** thu từ staging, không phải mock tự nghĩ:

| Nhóm | Kiểm chứng |
|---|---|
| Envelope | Đọc đúng `error_code` · đọc đúng message tiếng Việt · `null` không bị hiểu nhầm · `meta.request_id` là UUID |
| Đường xử lý 401 | Phân loại `kind: 'auth'` → thông điệp cho thủ kho **không lộ** `UNAUTHENTICATED` hay `401` → hàng đợi đánh dấu **`failed`** (không phải `unknown`, vì server đã trả lời rõ là chưa ghi gì) |

> ❗ Test này **không gọi mạng**. Nó chạy fixture đã thu qua tầng phân tích thật. Nếu server đổi envelope, test sẽ đỏ.

---

## 4c. 🔴 RỦI RO TÍCH HỢP MỚI — Cloudflare chặn client theo chữ ký

### 4c.1 Phát hiện

Khi người dùng chạy script contract test bằng Python, server trả:

```json
{
  "status": 403,
  "error_code": 1010,
  "error_name": "browser_signature_banned",
  "title": "Error 1010: Access denied",
  "detail": "The site owner has blocked access based on your browser's signature."
}
```

**Không phải lỗi xác thực.** Cloudflare chặn ngay trước khi request tới ứng dụng, dựa trên `User-Agent`.

| Client | `User-Agent` | Kết quả |
|---|---|:--:|
| `urllib` mặc định | `Python-urllib/3.x` | ❌ **403 Error 1010** |
| Có khai tên công cụ | `wms-contract-test/1.0` | ✅ qua được |

### 4c.2 Vì sao đây là rủi ro cho app React Native

Mini App cũ chạy trong **WebView của Zalo** → mang chữ ký trình duyệt → Cloudflare cho qua.

App React Native gọi API bằng `fetch`, trên Android đi qua **OkHttp** với `User-Agent` dạng `okhttp/4.x`. **Chưa ai kiểm chứng Cloudflare có chặn chữ ký đó không.**

| Nếu bị chặn | Hậu quả |
|---|---|
| Toàn bộ lời gọi API | **403 ngay khi cài lên máy thủ kho** |
| Triệu chứng người dùng thấy | Giống hệt lỗi đăng nhập / mất mạng |
| Khả năng truy nguyên | **Rất khó** — 403 của Cloudflare không giống 401 của ứng dụng |

### 4c.3 🔴 Việc phải làm trước khi phát hành

| # | Việc | Ai làm |
|:--:|---|---|
| 1 | Hỏi chủ sở hữu hạ tầng: **quy tắc Cloudflare đang chặn những chữ ký nào?** | 👤 Người dùng |
| 2 | **Thêm ngoại lệ** cho chữ ký của app native trên cả staging và production | 👤 Quản trị Cloudflare |
| 3 | Đặt `User-Agent` cố định, nhận dạng được cho app — ví dụ `WMSHoaNam-Android/<version>` | Prompt 4 |
| 4 | Phân biệt **403 Cloudflare** với **401 ứng dụng** trong `AppError`, để thủ kho thấy thông điệp đúng | Prompt 4 |

> ⚠️ **Không giải quyết bằng cách giả mạo `User-Agent` của trình duyệt.** Cách đúng là allowlist ở tầng Cloudflare, và app khai đúng danh tính của nó.

> 📌 Việc app hiện chưa gọi endpoint nghiệp vụ nào che mất rủi ro này. Nó sẽ chỉ lộ ra khi Prompt 4 đấu nối API thật — lúc đó nếu chưa xử lý thì **mọi màn hình đều hỏng cùng lúc**.

---

## 4d. 🔴 PHÁT HIỆN BẢO MẬT — origin lộ ra ngoài, Cloudflare bị vô hiệu

### 4d.1 Hai hostname, cùng một ứng dụng

Người dùng cung cấp thêm `khohoanamdev.lptech.info.vn` ngày 2026-09-05.

| Hostname | `Server` header | Vai trò |
|---|---|---|
| `khohoanamdev.bigk.click` | **cloudflare** | Qua CDN/WAF |
| `khohoanamdev.lptech.info.vn` | **nginx/1.18.0 (Ubuntu)** | **Origin trực tiếp** |

Cùng một ứng dụng: spec tải từ hai nơi **giống hệt nhau 277 path / 340 operation**, chỉ chênh 4 byte đúng bằng độ dài khác nhau của tên miền trong trường `servers`.

### 4d.2 Bằng chứng Cloudflare bị bỏ qua hoàn toàn

Cùng một `User-Agent` (mặc định của Python — thứ Cloudflare chặn):

| Endpoint | Qua Cloudflare | Origin trực tiếp |
|---|:--:|:--:|
| `/api/v1/health` | **403** *(Error 1010)* | **200** |
| `/api/v1/auth/me` | **403** *(Error 1010)* | **401** *(hành vi đúng của ứng dụng)* |

### 4d.3 Hệ quả

Mọi lớp bảo vệ Cloudflare **đang không có tác dụng** với bất kỳ ai biết tên miền origin:

| Bị vô hiệu | Hậu quả |
|---|---|
| WAF | Không lọc được request độc hại |
| Rate limiting | Không chặn được dò mật khẩu / quét endpoint |
| Bot protection | Chính là thứ vừa bị bỏ qua ở §4d.2 |
| Chống DDoS | Origin nhận tải trực tiếp |
| Ẩn IP gốc | IP máy chủ lộ qua DNS của tên miền origin |

⚠️ API này có `POST /api/v1/auth/login`. Không có rate limiting nghĩa là **dò mật khẩu không bị giới hạn**.

### 4d.4 Việc cần làm

| # | Việc | Ai làm |
|:--:|---|---|
| 1 | Xác nhận `lptech.info.vn` **có chủ đích** hay là lộ ngoài ý muốn | 👤 Quản trị hạ tầng |
| 2 | Nếu ngoài ý muốn: **chặn truy cập trực tiếp vào origin** — chỉ cho IP Cloudflare qua firewall, hoặc dùng Cloudflare Tunnel | 👤 Quản trị hạ tầng |
| 3 | Kiểm tra **production có cùng lỗ hổng này không** | 👤 Quản trị hạ tầng |
| 4 | Sau khi bịt: **allowlist chữ ký app native trên Cloudflare** — nếu không app sẽ 403 toàn bộ (§4c) | 👤 Quản trị Cloudflare |

> 🔴 **Mục 2 và mục 4 phải làm cùng lúc.** Bịt origin mà chưa allowlist app thì app mất đường vào; allowlist mà không bịt origin thì lỗ hổng vẫn còn.

### 4d.5 Dùng origin trực tiếp cho contract test — chỉ là biện pháp tạm

Contract test hiện chạy được qua `lptech.info.vn` vì nó không bị Cloudflare chặn. **Đây là tận dụng một lỗ hổng, không phải giải pháp.**

Khi mục 2 được làm, contract test sẽ phải đi qua Cloudflare — lúc đó câu hỏi allowlist ở §4c trở thành **bắt buộc**, không còn là tuỳ chọn.

---

## 4e. ✅ Contract test **CÓ ĐĂNG NHẬP** — người dùng tự chạy 2026-09-05

> **Ai chạy:** người dùng, trên máy của họ, bằng `wms-contract-auth.py`.
> Tôi không đăng nhập bằng mật khẩu người dùng — script đọc `WMS_EMAIL`/`WMS_PASSWORD`
> từ biến môi trường, không in mật khẩu, không in token.
> **Chỉ GET** sau khi đăng nhập; không một request ghi nào.

### 4e.1 Đăng nhập hoạt động

| Mục | Kết quả |
|---|---|
| `POST /api/v1/auth/login` | **HTTP 200**, 559 ms |
| Trường chứa token | **`access_token`** |
| Độ dài | 392 ký tự |
| Dạng | bắt đầu `eyJ0eX…` → **JWT** (khớp `bearerAuth` spec khai) |

Đây là lần đầu tiên **tên trường token được xác định bằng phản hồi thật**. Khoảng
trống 3 trong §4 (*client chấp nhận ≥8 vị trí khác nhau cho token*) nay biết được
đâu là vị trí đúng: `data.access_token`.

### 4e.2 Mười một endpoint GET — **11/11 trả HTTP 200 với token**

| Endpoint | ms | Envelope |
|---|---|---|
| `/auth/me` | 180 | `{data, meta, success}` |
| `/warehouses` | 480 | `{data, links, meta, success}` |
| `/products?per_page=1` | 518 | `{data, links, meta, success}` |
| `/defects?per_page=1` | 179 | `{data, links, meta, success}` |
| `/inventory/balances?per_page=1` | 257 | `{data, links, meta, success}` |
| `/scan/events?per_page=1` | 277 | `{data, links, meta, success}` |
| `/mini-app/inbound-documents?per_page=1` | 212 | `{data, links, meta, success}` |
| `/mini-app/outbound-documents?per_page=1` | 223 | `{data, links, meta, success}` |
| `/mini-app/printer-configs` | 210 | `{data, links, meta, success}` (8 bản ghi) |
| `/mini-app/warranty-cases?per_page=1` | 229 | `{data, links, meta, success}` |
| `/mini-app/products?per_page=1` | 201 | `{data, meta, success}` |

Trước đây (§4b) 11 endpoint này chỉ chứng minh được là **tồn tại** (401 chứ không
404). Nay chứng minh được là **gọi được và trả dữ liệu**.

### 4e.3 Envelope thành công có **hai biến thể** — chưa từng ghi nhận

```
có phân trang  → { data, links, meta, success }
không phân trang → { data, meta, success }
```

Khớp mô tả trong `ApiSuccessEnvelope`: *"`links` chỉ có khi phân trang"*.

⚠️ Lưu ý cho tầng đọc lỗi: phản hồi **thành công có token** *không* chứa
`message`/`error_code`/`errors` — khác với `/public/config` (§4b.1) vốn trả
`error_code: null`, `errors: null`. `extractErrorCode` xử lý đúng cả hai vì
trường thiếu và trường `null` đều cho `undefined` — đã có test khoá (`wmsContract.test.ts`).

### 4e.4 🔴 **KHÔNG có header `ETag`** — và đây là vấn đề chặn

Header phản hồi thật của `GET /mini-app/inbound-documents?per_page=1`:

```json
{"Vary": "Origin", "Cache-Control": "no-store, private", "X-Request-ID": "2f091999-…"}
```

**Không có `ETag`.** Đối chiếu lại spec thì đây không phải sự cố mà là khoảng
trống thật trong tài liệu:

| Bằng chứng trong spec | Số liệu |
|---|---|
| Operation **khai báo thật** `responses.*.headers.ETag` | **1 / 340** — chỉ `POST /api/v1/inbound-documents/{id}/scan` |
| Operation nhắc `ETag` nhưng chỉ trong câu văn `description` | 12 |
| **GET** nào khai `ETag` trong response header | **0** |
| Schema nào khai property `version` | **0** (chỉ `HealthPayload`, là version ứng dụng — không liên quan) |
| `data` của `ApiSuccessEnvelope` | `nullable: true`, **không khai cấu trúc** |

Trong khi đó `If-Match` là **bắt buộc trên 62 operation** (13 nữa là tuỳ chọn):

| Method | Số operation yêu cầu `If-Match` |
|---|---|
| POST | 54 |
| PATCH | 19 |
| DELETE | 2 |
| **Tổng** | **75** (62 bắt buộc + 13 tuỳ chọn) |

Và schema của header là:

```json
{"type": "integer", "minimum": 0}
```

→ **`If-Match` ở API này là một SỐ NGUYÊN, không phải entity-tag có nháy kép**
như RFC 9110 quy định. Client phải gửi `If-Match: 3`, không phải `If-Match: "3"`.
Đây là sai lệch so với chuẩn HTTP; ghi lại để không ai "sửa cho đúng chuẩn" rồi
nhận 412.

**Vấn đề chặn:** 62 endpoint đòi một số nguyên `version`, nhưng
**không tài liệu nào nói client lấy số đó ở đâu**, và endpoint danh sách không
trả `ETag`. Spec chỉ nói *"client re-fetch"* mà không nói re-fetch xong thì đọc
trường nào.

Ba khả năng, chưa cái nào được kiểm chứng:

1. `version` nằm trong **thân** phản hồi (`data.version`) — khả năng cao nhất, vì spec
   nói *"optimistic locking theo **cột** version của resource"*, nghĩa là một cột DB
   thường được serialize ra JSON;
2. `ETag` **chỉ** trả ở endpoint chi tiết `GET /{id}`, không trả ở danh sách;
3. `ETag` chỉ trả ở phản hồi **ghi** — nghĩa là không thể ghi lần đầu nếu chưa từng ghi.

Nếu là (3) thì có mâu thuẫn logic và phải hỏi chủ backend.

**Cách đóng:** script `wms-version-probe.py` (scratchpad) gọi **GET chi tiết**
một bản ghi mỗi loại và in **tên trường** của `data` cùng toàn bộ header. Chỉ GET,
không in giá trị nghiệp vụ.

### 4e.5 `X-Request-ID` là header, không chỉ là `meta.request_id`

Trước nay chỉ thấy `meta.request_id` trong thân phản hồi. Nay xác nhận cùng giá
trị đó cũng nằm ở **header `X-Request-ID`** → đọc được kể cả khi thân phản hồi
không phải JSON (ví dụ trang lỗi Cloudflare). Nên log header này trong `api/client.ts`
để tra cứu khi hỗ trợ.

### 4e.6 Những gì lần chạy này **KHÔNG** chứng minh

| Không chứng minh | Vì sao |
|---|---|
| Idempotency-Key hoạt động | Chỉ kiểm được bằng request **ghi** — bị `GATE_01 §11` #4 và #6 cấm |
| `If-Match` / 412 / 428 hoạt động | Như trên |
| TTL và cách refresh token | Chỉ biết token dài 392 ký tự; **chưa giải mã**, chưa gọi refresh |
| 5xx có rollback không | Chỉ backend trả lời được — mục 10 `USER-ACTION-REQUIRED.md` |
| Envelope lỗi 4xx/5xx khác 401 | Chưa endpoint nào trả mã khác trong lần chạy này |


---

## 4f. ✅ **ĐÓNG mục 12** — `version` nằm trong thân phản hồi, không phải `ETag`

> Người dùng chạy `wms-version-probe.py` ngày 2026-09-05. Chỉ GET. Script chỉ in
> **tên trường**, không in giá trị nghiệp vụ.

### 4f.1 Câu trả lời

Cả ba loại tài liệu đều mang trường **`version`** ngay trong `data`:

| Loại | `version` ở danh sách | `version` ở chi tiết | `ETag` header |
|---|:--:|:--:|:--:|
| Phiếu nhập | `2` | `2` | **KHÔNG** |
| Phiếu xuất | `2` | `2` | **KHÔNG** |
| Bảo hành | `4` | *(không gọi được — xem 4f.4)* | — |

⇒ Client lấy `data.version` rồi gửi `If-Match: <số đó>`.

**Xác nhận thêm:** `ETag` **không** trả về kể cả ở endpoint **chi tiết**. Vậy
`data.version` là nguồn **duy nhất**. Câu *"ETag = version"* trong 12 mô tả của
spec chỉ đúng về mặt ngữ nghĩa, **không đúng về mặt truyền tải** — header đó không
tồn tại trong phản hồi thật.

### 4f.2 ⚠️ Mức độ chắc chắn — đọc kỹ trước khi dùng

| Đã chứng minh | Chưa chứng minh |
|---|---|
| Trường `version` **tồn tại**, kiểu số nguyên, trong `data` của cả ba loại | Server **chấp nhận** đúng số đó trong `If-Match` |
| `ETag` **không** được trả về ở cả list lẫn detail | Gửi sai số thì **thật sự** trả 412 |
| `If-Match` khai kiểu `{"type":"integer"}` | Thiếu header thì **thật sự** trả 428 |

Cột phải chỉ kiểm được bằng **request ghi** — `GATE_01 §11` #4 đang cấm. Suy luận
"`data.version` chính là thứ `If-Match` cần" là **rất mạnh** (spec nói *"optimistic
locking theo **cột** version của resource"*, và resource có đúng một cột tên
`version` kiểu số nguyên) nhưng **vẫn là suy luận**, chưa phải kiểm chứng.

### 4f.3 🔴 Spec THIẾU ba trường mà server thật có trả

| Trường | Spec nhắc | Ý nghĩa suy ra |
|---|:--:|---|
| `create_idempotency_key` | **0 lần** | Server **lưu** idempotency key lên chính tài liệu ⇒ idempotency là thật và bền, không phải cache tạm |
| `retention_until` | **0 lần** | Server đã có khái niệm **hạn lưu trữ** cho hồ sơ bảo hành |
| `legal_hold_flag` | **0 lần** | Có cơ chế **giữ hồ sơ vì lý do pháp lý**, chặn xoá |

⇒ Spec **không đầy đủ** so với API thật. Không được coi spec là nguồn chân lý duy
nhất khi sinh types.

**`retention_until` + `legal_hold_flag` ảnh hưởng trực tiếp tới câu hỏi đang chờ
bạn duyệt ở `USER-ACTION-REQUIRED.md §0b`** (giữ dữ liệu local bao lâu). Chính sách
dọn dữ liệu trên máy **không được** xoá sớm hơn hạn server đang giữ, và **không
được** xoá bản ghi đang bị `legal_hold_flag`. Xem §0b đã cập nhật.

### 4f.4 🔴 Bảo hành dùng khoá khác — `warranty_case_id`, **không có** `id`

Phiếu nhập và phiếu xuất có `id` (UUID, ví dụ `c725221e-…`). Bản ghi bảo hành
**không có trường `id`** — nó dùng `warranty_case_id` **và** `warranty_case_code`.

⇒ Không viết được hàm dùng chung kiểu `getId(record)`. Tầng API phải xử lý bảo
hành như một trường hợp riêng. Đây là lý do script không gọi được GET chi tiết bảo
hành — nó tìm `id` và không thấy.

### 4f.5 Phản hồi **chi tiết** có thêm trường mà danh sách không có

| Loại | Trường chỉ có ở chi tiết |
|---|---|
| Phiếu nhập | `status_history` |
| Phiếu xuất | `status_history`, `item_matches`, `movements` |

⇒ **Không được** coi phần tử trong danh sách là tài liệu đầy đủ. Màn hình chi tiết
phải gọi riêng, không tái dùng dữ liệu danh sách.

### 4f.6 Server tự tính tiến độ — client **không** được tính lại

Danh sách đã trả sẵn: `expected_total_qty`, `scanned_total_qty`, `remaining_qty`,
`progress_percent`, `ready_for_post` / `ready_for_issue`, và `mini_app_status`
(**tách riêng** khỏi `status` canonical).

Spec xác nhận: *"Mỗi document có expected_total_qty, scanned_total_qty,
remaining_qty, progress_percent, ready_for_post, mini_app_status"*.

⇒ Prompt 4 phải **hiển thị** các giá trị này, **không** tự cộng từ danh sách scan.
Hai nguồn sự thật cho cùng một con số là lỗi chờ xảy ra.

### 4f.7 `id` là UUID, không phải số nguyên

`c725221e-b87e-41b7-a81a-ffbd9b859ab3`. Types sinh ra phải dùng `string`.

---

## 4g. 🔑 Câu hỏi 5xx đã có câu trả lời **bằng văn bản** — nhưng chưa đổi hành vi

Rà lại spec sau khi có kết quả trên:

| Kiểm tra | Kết quả |
|---|---|
| Operation khai response `500` | **339 / 340** |
| Trong đó mô tả có chữ *"rollback"* | **339 / 339** — nguyên văn *"Lỗi hệ thống ngoài dự kiến; giao dịch đã được rollback"* |
| Mô tả 500 **không** nhắc rollback | **0** |

Một endpoint còn trả cờ máy đọc được: `committed=false`, `partial_write=false`,
`retryable=true`, kèm header `Retry-After`.

Đây là **trả lời bằng văn bản** cho mục 10 `USER-ACTION-REQUIRED.md`.

### 4g.1 Vì sao `HTTP_5XX_POLICY` **vẫn giữ `unknown`**

1. Lời hứa rollback chỉ áp dụng khi client **nhận được** HTTP 500. Timeout, đứt
   mạng, 502/503/504 của reverse proxy → client không biết server đã commit chưa.
2. Đây là **tài liệu**, chưa phải **kiểm chứng**. `GATE_WMS §5` đòi cả hai. Kiểm
   chứng đòi cố tình gây 5xx bằng request ghi — `GATE_01 §11` #4 đang cấm.
3. Đổi sang `failed` là quyết định **nghiệp vụ về tồn kho**. Người dùng chọn.

### 4g.2 Khi mục 10 đóng, cách sửa ĐÚNG

**Không** đổi hằng số thành `'failed'` cho mọi 5xx. Mà **tách hai trường hợp**:

| Tình huống | Trạng thái | Vì sao |
|---|---|---|
| Nhận được **500 từ chính WMS** | `failed` — gửi lại được | Spec cam kết đã rollback |
| **502 / 503 / 504** từ proxy · timeout · đứt mạng | giữ `unknown` | Không biết request có tới server không |

Đã ghi nhận cách sửa này ngay trong chú thích `src/sync/syncEngine.ts`, để người
sửa sau không đổi nhầm cả cụm.


---

## 4h. ✅ **ĐÓNG mục 5** — cơ chế phiên đăng nhập, có `refresh` và **trượt hạn**

> 🔍 **Nguồn kiểm chứng: NGƯỜI DÙNG, không phải tôi.** Mã nguồn WMS backend
> **không nằm trong repository này** (`backend/Modules/` không tồn tại, không tìm
> thấy `CurrentBaselineWarrantyController`). Mọi số liệu ở §4h và §4i do người
> dùng đo trực tiếp trên staging và đối chiếu mã nguồn WMS ở nơi khác, ngày
> 2026-09-05. Tôi ghi lại nguyên vẹn và **không tự xác nhận lại được**.

### 4h.1 Quyết định đã chốt

Người dùng chọn nhánh **"tự gia hạn ngầm"**: thủ kho **không bao giờ** thấy màn
đăng nhập giữa ca.

Điểm khiến nhánh này khả thi: `POST /api/v1/auth/refresh` là **route public**,
không gắn `auth:api` (`Modules/Auth/routes/api.php:19`) ⇒ gọi được **cả khi
access token đã chết**.

### 4h.2 Số đo thật (tài khoản `warehouse-keeper-01@gmail.com`)

| | |
|---|---|
| `access_token` | JWT HS256, 373–376 ký tự, claims `iss,iat,exp,nbf,jti,sub,prv` |
| `expires_in` | **trả kèm mọi phản hồi** ⇒ app không decode JWT, không đoán |
| `refresh_token` | 86 ký tự base64url (64 byte ngẫu nhiên) — **không** phải JWT |
| Cookie `wms_refresh_token` | HttpOnly, Max-Age 1 209 600 (14 ngày), path `/api/v1/auth` — dành cho **browser**; app native dùng JSON body |

### 4h.3 🔴 TTL — chỗ dễ thiết kế sai nhất

| Nguồn | `JWT_TTL` | Ghi chú |
|---|---|---|
| `.env.example` (**hợp đồng**) | `60` → **60 phút** | ← thiết kế theo con số này |
| `.env` dev hiện tại | `43200` → **30 ngày** | đo được `exp − iat = 720.00 giờ`. Comment tại `.env:86`: *"HOÀN TÁC: đặt lại JWT_TTL=60"* — nới tạm cho đợt quét |
| `REFRESH_TOKEN_TTL_MINUTES` | `20160` → **14 ngày** | giống nhau ở **cả** `.env` và `.env.example` ⇒ đây là con số thật |

⇒ **Cấm hard-code TTL.** Lấy `expires_in` lúc chạy làm **nguồn duy nhất**.
Thiết kế theo 30 ngày là thiết kế theo một giá trị tạm sắp bị hoàn tác.

### 4h.4 Rotation — đã test thật, không đọc code suông

- `refresh` trả về **cả** access lẫn refresh mới; token cũ bị `revoked_at` ngay.
- Dùng lại token đã thu hồi → `401 UNAUTHENTICATED` **và huỷ sạch mọi refresh
  token của người dùng đó** (`RefreshTokenService::rotate → revokeAllForUser`).
- Mỗi lần rotate lại cấp `expires_at = now + 14 ngày` ⇒ **phiên trượt**: mở app
  ≥ 1 lần / 14 ngày thì không bao giờ phải đăng nhập lại.

### 4h.5 🔴 Ba ràng buộc bắt buộc — đã hiện thực và khoá bằng test

| # | Ràng buộc | Hỏng thì sao | Nơi cưỡng chế |
|:--:|---|---|---|
| 1 | **Single-flight refresh** | Hai request cùng 401 → cùng refresh → lượt hai là *replay* → **đá thủ kho khỏi mọi thiết bị giữa lúc đang cầm hàng** | `tokenRefresh.ts` — mọi bên gọi dùng chung một promise |
| 2 | **401 → gia hạn đúng 1 lượt → gửi lại đúng 1 lần** | Máy chủ **không phân biệt** "hết hạn" với "sai token": cả hai đều `401 UNAUTHENTICATED`, không có `WWW-Authenticate` (`bootstrap/app.php:87-97`) | `client.ts` — cờ `retried` chặn vòng lặp |
| 3 | **Gia hạn chủ động ở ~20% TTL, TUYỆT ĐỐI không polling** | Rate limit `auth-refresh` = **30 lần/phút theo IP**; cả kho NAT chung một IP ⇒ mọi máy quét chia nhau quota | `PROACTIVE_REFRESH_RATIO = 0.2`, sàn `MIN_REFRESH_LEAD_MS` |

### 4h.6 Ràng buộc thứ tư tôi bổ sung — app chết giữa lúc gia hạn

Ba ràng buộc trên xử lý được đồng thời **trong một tiến trình**. Còn một lỗ: app
bị kill đúng lúc lượt gia hạn đang bay thì máy chủ **có thể** đã thu hồi token cũ
trong khi máy chưa kịp lưu token mới. Lần mở sau đem token cũ đi dùng = replay =
huỷ sạch phiên trên **mọi** thiết bị.

Xử lý: ghi dấu `auth.refresh.inflight` xuống đĩa **trước khi gửi**; lúc khởi
động, thấy dấu còn sót thì **xoá phiên và ép đăng nhập lại một lần** thay vì thử
token cũ. Cùng nguyên tắc với `outbox.recoverAfterRestart()`: *đã gửi đi thì
không được mặc định là chưa gửi.*

### 4h.7 Đồng hồ máy chủ

Máy quét Android rẻ chạy sai giờ vài ngày là chuyện thường; so sai thì hoặc xoá
dữ liệu sớm, hoặc giữ quá hạn, hoặc gia hạn token sai lúc. Mọi phản hồi đều có
`meta.timestamp` (ISO +07:00) ⇒ `serverClock.ts` ghi nhận độ lệch từ **mọi** phản
hồi, kể cả phản hồi lỗi, và `serverNow()` là nguồn thời gian duy nhất cho mọi so
sánh hạn.

### 4h.8 ⚠️ Còn mở — hỏi DevOps

**UAT/production sẽ đặt `JWT_TTL` bao nhiêu?** Giữ 30 ngày "cho tiện" nghĩa là
access token bị lộ **sống 30 ngày**, mà blacklist chỉ chặn được token đã logout.
Khuyến nghị của người dùng: hoàn tác về **60**.

---

## 4i. 🔧 **SỬA GIẢ ĐỊNH SAI CỦA TÔI** — `retention_until` gần như luôn NULL

> Tôi viết ở §4f.3 rằng `retention_until` chi phối chính sách dọn dữ liệu local.
> Người dùng kiểm chứng và chỉ ra **hai chỗ tôi sai**. Ghi lại nguyên vẹn.

### 4i.1 Quy tắc thật (`CurrentBaselineWarrantyController.php:476,505-507`)

- Chốt **tại thời điểm ĐÓNG hồ sơ**, không phải lúc tạo.
- "Đóng" = `RETURNED` **hoặc** `CANCELLED` (`TERMINAL_STATUSES:48`).
  **`COMPLETED` KHÔNG phải trạng thái đóng** ⇒ chưa có mốc.
- `PII_RETENTION_YEARS = 5` (SRS §13.8), có test khoá hằng số.
- Job `warranty:purge-pii` chạy **03:10 hằng ngày** (`routes/console.php:82`),
  lọc `retention_until <= now() AND legal_hold_flag NULL/false`, 500 bản/lượt,
  idempotent.
- **Purge = ẩn danh, KHÔNG xoá**: `customer_name`/`customer_phone` →
  `[ANONYMIZED]`, `customer_address` → `NULL`, `manual_product_description` →
  `[ANONYMIZED]`, tệp đính kèm xoá vật lý + `status='DELETED'`.
  Case/event/defect/movement **giữ nguyên**.

### 4i.2 ❌ Sai thứ nhất — trường này gần như luôn NULL

Seeder `INSERT` thẳng vào bảng với trạng thái đã đóng, **không đi qua đường API**
nên không chốt mốc ⇒ `warranty:purge-pii` không đụng case nào. Trên môi trường
thật, chỉ case đóng **qua API sau bản vá** mới có mốc.

⇒ **App không được giả định trường này luôn có giá trị.**

`legal_hold_flag`: grep toàn repo — chỉ `false` lúc tạo, `true` duy nhất trong 1
tệp test. **Không endpoint nào set được** — đó là thao tác DB thủ công của ops
khi pháp lý yêu cầu. **App chỉ đọc.**

### 4i.3 ❌ Sai thứ hai — thủ kho KHÔNG nhìn thấy PII thật

`warranty.pii.view` chỉ có ở **ADMIN** và **WAREHOUSE_MANAGER**.
**WAREHOUSE_KEEPER có `warranty.manage` nhưng KHÔNG có `pii.view`.**

⇒ Nếu mini app chạy bằng tài khoản thủ kho thì **cache local không hề chứa PII**.
§0b tụt từ **bài toán tuân thủ** xuống **bài toán bộ nhớ**.

### 4i.4 ✅ Chính sách local suy ra được — không phải chọn số

**Trần cứng:** máy không được giữ lâu hơn máy chủ ⇒
`TTL_local = min(TTL kỹ thuật, retention_until)`, trừ legal hold.

| Dữ liệu local | Quy tắc |
|---|---|
| Hồ sơ đã cache (PII đã che) | TTL kỹ thuật tuỳ ý / LRU theo dung lượng — **không** ràng buộc pháp lý |
| Case có `retention_until` đã quá hạn | Xoá cache ngay — máy chủ sắp/đã ẩn danh |
| Case `legal_hold_flag = true` | **Không tự xoá**, đặc biệt không xoá bản ghi chưa đồng bộ |
| Draft / hàng đợi offline chưa đồng bộ | **Không xoá theo bất kỳ TTL nào** cho tới khi sync thành công |
| Nếu app chạy bằng tài khoản **có** `pii.view` | **Không ghi PII xuống đĩa**; chỉ giữ trong RAM của phiên |

`retention_until`, `legal_hold_flag`, `closed_at`, `pii_masked` **đều có sẵn ở cả
list lẫn detail** của `/api/v1/mini-app/warranty-cases` ⇒ app không cần gọi thêm gì.

**Dùng giờ máy chủ, không dùng giờ máy quét** — xem §4h.7.

### 4i.5 ⚠️ Còn mở — hỏi BA, mã nguồn không trả lời được

**Không có endpoint/webhook nào báo "case X vừa bị ẩn danh".** App chỉ biết khi
refetch và thấy `[ANONYMIZED]`. Cần BA quyết: app hiển thị thế nào cho hồ sơ đã
bị ẩn danh, và có cần chủ động refetch định kỳ không.

---

## 4j. ✅ Cloudflare đã allowlist — đo thật, và **hai điểm lệch với mô tả**

> Quản trị hạ tầng báo hoàn tất cấu hình ngày 2026-09-05. Tôi kiểm chứng bằng
> GET không kèm credential trên `khohoanamdev.bigk.click`. Read-only, không
> chạm dữ liệu nghiệp vụ.

### 4j.1 ✅ Chuỗi app gửi ĐI QUA ĐƯỢC

| User-Agent | HTTP | Ai trả lời |
|---|:--:|---|
| **`WMSHoaNam-Android/1.0`** ← app gửi thật | **401** | ứng dụng ✅ |
| `WMSHoaNam-Android/1.0.0` ← hạ tầng đã test | 401 | ứng dụng |
| `okhttp/4.12.0` | 401 | ứng dụng |
| `curl/8.5.0` | 401 | ứng dụng |
| UA trình duyệt (Chrome giả) | 401 | ứng dụng |
| **chuỗi rỗng** | 401 | ứng dụng |
| `Python-urllib/3.12` | **403** | **Cloudflare** ❌ |
| *không gửi UA* | **403** | **Cloudflare** ❌ |

**401 là kết quả MONG ĐỢI** — nghĩa là request đi hết Cloudflare, tới tận ứng
dụng, và ứng dụng từ chối vì chưa đăng nhập. Bằng chứng phân biệt: phản hồi 401
mang `x-powered-by: PHP/8.3.33`, `x-request-id`, và thân tiếng Việt của WMS.

⚠️ Một rủi ro đã loại: hạ tầng test `1.0.0`, nhưng app gửi `1.0` (theo
`versionName` trong `build.gradle`). Đã kiểm riêng — **cả hai đều qua**, rule
khớp theo tiền tố đúng như mô tả.

### 4j.2 ❌ Lệch thứ nhất — **không có** header `Cf-Mitigated`

Hạ tầng mô tả: *"client không thuộc allowlist vẫn nhận 403 kèm
`Cf-Mitigated: challenge`"*.

Header thật của phản hồi 403:

```
CF-RAY: a3655321af89fe05-SIN
Server: cloudflare
Content-Type: application/json; charset=utf-8
```

**Không có `Cf-Mitigated`.** Không có cả `x-request-id`.

Thân phản hồi (nguyên văn, rút gọn):

```json
{"title":"Error 1010: Access denied","status":403,
 "detail":"The site owner has blocked access based on your browser's signature.",
 "error_code":1010,"error_name":"browser_signature_banned","ray_id":"a3655321af89fe05"}
```

**Đây là lỗi trong bản hiện thực đầu tiên của tôi.** Tôi viết `isEdgeBlocked()`
dựa vào mô tả của hạ tầng — chỉ dò `Cf-Mitigated`. Với phản hồi thật, hàm đó trả
`false`, app sẽ phân loại thành `http` và hiển thị *"Yêu cầu không hợp lệ"* thay
vì *"báo quản trị hệ thống"*. Đã sửa trước khi phát hành.

**Ba dấu hiệu thật, xét theo thứ tự tin cậy:**

| # | Dấu hiệu | Vì sao chắc |
|:--:|---|---|
| 1 | `Cf-Mitigated` có mặt | giữ lại phòng khi rule challenge kích hoạt |
| 2 | `error_code` kiểu **SỐ** (1010), hoặc có `error_name`/`ray_id` | ứng dụng luôn dùng `error_code` kiểu **CHUỖI** (`"UNAUTHENTICATED"`) ⇒ không lẫn được |
| 3 | **vắng** header `x-request-id` | ứng dụng gắn header này vào mọi phản hồi; Cloudflare thì không. Dự phòng cho trường hợp Cloudflare trả HTML |

Vì sao phân biệt được là quan trọng: ứng dụng **cũng** trả 403 khi thiếu quyền —
ví dụ thủ kho gọi endpoint PII (§4i.3). Nhầm hai thứ này là bảo thủ kho gọi
quản trị hạ tầng một cách vô ích.

### 4j.3 ❌ Lệch thứ hai — rule hẹp hơn nhiều so với mô tả

Hạ tầng mô tả rule là Managed Challenge với **mọi** client ngoài allowlist. Thực
tế chỉ `Python-urllib` và *không gửi UA* bị chặn. `okhttp`, `curl`, UA trình
duyệt, và cả **chuỗi rỗng** đều qua.

Hai hệ quả:

1. **Tin tốt cho rủi ro đã nêu ở §4c:** kể cả nếu React Native không giữ được
   header `User-Agent` và OkHttp gửi mặc định `okhttp/4.x`, app **vẫn** qua
   được. Rủi ro "403 toàn bộ ngay khi cài lên máy thủ kho" đã hạ mức đáng kể.
2. **Tin xấu cho bảo mật:** rule này không chặn được gì đáng kể. Ai đặt UA rỗng
   hay `curl` cũng vào được. Nó chặn đúng một chữ ký mặc định của thư viện.
   Nếu mục tiêu là chống bot/dò mật khẩu thì rule hiện tại **không đạt** — cần
   rate limiting trên `POST /auth/login`, không phải lọc User-Agent.

### 4j.4 ✅ **ĐÃ kiểm chứng trên máy Android thật** — 2026-09-05

> Thiết bị: **Xiaomi 12 Pro** (`2206122SC`), Android **13**, bản debug nạp JS qua
> Metro. `adb` chạy từ **Windows** — WSL không thấy USB vì ở network namespace riêng.

**Câu hỏi cần trả lời:** React Native trên Android có thật sự gửi header
`User-Agent` do app đặt, hay OkHttp ghi đè bằng `okhttp/4.x`?

**Vì sao probe qua Cloudflare KHÔNG trả lời được câu này:** theo §4j.3, `okhttp`
mặc định **cũng** qua được. Cả hai trường hợp đều ra 401 ⇒ không phân biệt được.

**Cách kiểm dứt khoát:** dựng một máy chủ echo **cục bộ** chỉ lắng nghe
`127.0.0.1:8000`, nối vào máy bằng `adb reverse tcp:8000 tcp:8000`, rồi chọn môi
trường *"Máy cục bộ"* trong màn Chẩn đoán và bấm probe. Máy chủ in ra header
**thật sự nhận được**.

Kết quả nguyên văn:

```
GET /api/v1/mini-app/inbound-documents?per_page=1
  >>> User-Agent: 'WMSHoaNam-Android/1.0'
  --- toan bo header ---
      accept: application/json
      user-agent: WMSHoaNam-Android/1.0
      Host: 127.0.0.1:8000
      Connection: Keep-Alive
      Accept-Encoding: gzip
```

⇒ **OkHttp KHÔNG ghi đè.** Chuỗi app đặt đi tới đích nguyên vẹn. Rủi ro nêu ở
§4c.2 — *"app React Native dùng OkHttp, chưa ai kiểm chứng"* — nay **đã đóng**.

OkHttp tự thêm `Connection: Keep-Alive`, `Accept-Encoding: gzip`, và ở request
thứ hai thêm `If-Modified-Since` (cache HTTP của nó). Với WMS thật thì cache này
không kích hoạt vì máy chủ trả `Cache-Control: no-store, private`.

**Probe qua mạng thật, trên chính thiết bị đó:**

| Môi trường | Kết quả hiển thị |
|---|---|
| WMS qua Cloudflare | `✅ Qua được Cloudflare, tới tận ứng dụng — HTTP 401 … UA: WMSHoaNam-Android/1.0` |
| WMS origin trực tiếp | `✅ Tới được ứng dụng (host này KHÔNG qua Cloudflare) — HTTP 401 … UA: WMSHoaNam-Android/1.0` |

### 4j.4b 🔧 Một lỗi màn Chẩn đoán phát hiện ngay lúc kiểm chứng

Bản đầu của probe ghi **"Qua Cloudflare"** bất kể môi trường nào đang chọn — kể
cả khi trỏ vào `127.0.0.1`. Chứng kiến tận mắt trên máy: probe tới host origin
trực tiếp (vốn **không** qua Cloudflare) vẫn báo *"✅ Qua Cloudflare"*.

Đây đúng loại thông tin sai lệch làm mất hàng giờ dò lỗi nhầm chỗ.

Đã sửa: thêm cờ `AppEnvironment.behindEdgeProxy` — **đường mạng đã kiểm chứng**,
tách hẳn khỏi `environmentClassVerified` (lớp môi trường còn đang tranh cãi).
Probe nay nói đúng cho từng host, như bảng trên.

### 4j.5 🔴 Mâu thuẫn MỚI — lớp môi trường

| Ai nói | `khohoanamdev.bigk.click` | `khohoanamdev.lptech.info.vn` |
|---|---|---|
| **Người dùng** (2026-09-05) | **STAGING** | — |
| **Quản trị hạ tầng** (2026-09-05, muộn hơn) | **Production** | **DEV/TEST** |

Hai lời khai loại trừ nhau. `GATE_01 §11` #8 cấm tôi tự phân loại môi trường, nên
`environmentClassVerified` **giữ `false`** cho cả hai host, và mục 3 Gate WMS
(vốn đã đóng dựa trên lời khai của người dùng) **phải mở lại**.

Vì sao chuyện này quan trọng chứ không phải chi tiết chữ nghĩa:

1. Nếu `bigk.click` là **production** thì mọi chỗ tài liệu gọi nó là "staging"
   đều sai, và `GATE_WMS §5` — vốn đòi contract test chạy trên **staging** —
   **chưa được thoả**, vì chưa ai chỉ ra đâu là staging.
2. Contract test có token ngày 2026-09-05 chạy vào `lptech.info.vn`, mà hạ tầng
   nay nói đó là **DEV/TEST**. Đây là tin **tốt** — nghĩa là phép thử đó không
   chạm production. Nhưng nó cũng nghĩa là kết quả ấy **không** đại diện cho
   production.
3. `lptech.info.vn` **vẫn đi thẳng origin, không qua Cloudflare** — hạ tầng xác
   nhận và coi là chủ đích cho DEV/TEST. Phát hiện §4d vì thế **không phải lỗ
   hổng "cùng một ứng dụng lộ hai đường"** như tôi đã viết, mà là hai môi trường
   khác nhau. §4d cần đọc lại dưới ánh sáng này.

---

## 4k. ✅ Bốn quyết định chốt 2026-09-05 — đã hiện thực

### 4k.1 🔒 Chính sách 5xx — **an toàn**, người dùng quyết

Nguyên văn quyết định:

> `500`, `502`, `503`, `504`, timeout và mất kết nối sau khi gửi mutation **đều
> mặc định là `unknown`**. Timeout và lỗi gateway **vẫn luôn** là `unknown` vì
> client không biết request đã đến và được xử lý tới đâu.

Người dùng biết spec cam kết rollback (§4g) và **vẫn chọn `unknown`** — vì cam
kết ấy chỉ áp dụng khi app **nhận được** 500.

**Thông điệp hiển thị** (nguyên văn, cấm diễn đạt lại):

> *"Chưa xác định máy chủ đã ghi nhận hay chưa. Vui lòng đồng bộ/đối chiếu trước
> khi gửi lại."*

**Bốn điều kiện để được nới cho RIÊNG `500`:**

| # | Điều kiện |
|:--:|---|
| 1 | Backend chứng minh giao dịch **rollback toàn bộ** |
| 2 | **Không có side effect ngoài transaction** (email, webhook, job đã đẩy…) |
| 3 | **Idempotency hoạt động đúng** — kiểm chứng, không phải chỉ có tài liệu |
| 4 | **Đã có integration test xác nhận** |

`502`/`503`/`504`, timeout, mất kết nối: **vĩnh viễn `unknown`**, không điều kiện
nào mở được.

**Hai quy tắc kèm theo khi gửi lại:**

> Không tự tạo Idempotency-Key mới. Khi retry phải dùng lại **đúng khoá cũ**.

⇒ `OutboxRecord.idempotencyKey` sinh **một lần lúc TẠO** bản ghi, không phải lúc
gửi. Sinh lúc gửi thì mỗi lần thử lại mang khoá khác ⇒ máy chủ coi là hai request
⇒ **hai phiếu nhập cho cùng một lô hàng**. Có 6 test khoá điều này, gồm cả bài
"khoá sống sót qua khởi động lại app".

⚠️ Khoá mới chỉ được **lưu**, chưa được **gửi**: `GATE_01 §11` #6 vẫn cấm header
`Idempotency-Key`, và `api/client.ts` vẫn cưỡng chế lệnh cấm đó.

**Sửa thêm một phân loại sai:** `blocked_by_edge` (Cloudflare chặn) trước rơi vào
nhánh mặc định `unknown`. Sai — request **chưa từng tới ứng dụng** nên không có
gì để ghi trùng ⇒ đổi sang **`pending`**. Xếp nhầm là bắt thủ kho đi đối chiếu
một phiếu mà máy chủ chưa hề nhận.

### 4k.2 ✅ **ĐÓNG mục 16** — `JWT_TTL` đã là 60 phút ở cả hai môi trường

> DevOps: *"Đã kiểm tra runtime. Blue/Production và Green/DEV-TEST đều đang
> `JWT_TTL=60` phút; không cần hoàn tác hay deploy lại. Refresh token vẫn theo
> TTL riêng."*

Giá trị `43200` (30 ngày) đọc trong `.env` **không phải giá trị đang chạy**. Thiết
kế của app — lấy `expires_in` lúc chạy làm nguồn duy nhất — **đúng ngay từ đầu**
và không phải sửa gì.

🔴 **Phát sinh cho mục 3 Gate WMS:** DevOps chỉ nêu **hai** môi trường —
Blue/Production và Green/DEV-TEST. **Không có staging.** Mà `GATE_WMS §5` điều 3
đòi *"contract test chạy thật trên staging"*. Điều kiện đó nay **không thoả được
theo nghĩa đen** vì staging không tồn tại. Cần người dùng quyết: đổi tiêu chí
sang DEV-TEST, hay yêu cầu dựng staging.

### 4k.3 ✅ **ĐÓNG mục 17** — hồ sơ hết hạn lưu trữ

> BA: hồ sơ bảo hành hết retention **vẫn giữ mã hồ sơ, trạng thái và lịch sử
> nghiệp vụ**; PII bị ẩn/xoá, file đính kèm bị gỡ.

| Điểm | Nội dung |
|---|---|
| API **chưa có** cờ `pii_anonymized` | app phải tự nhận ra qua giá trị `[ANONYMIZED]` |
| Frontend chưa có luồng hiển thị riêng | Prompt 4 phải dựng |
| **UI chốt** | *"Thông tin khách hàng đã được ẩn danh theo chính sách lưu trữ"* |
| Thao tác phải **ẩn** | liên hệ khách · tải file đính kèm |
| **Refetch** | khi mở màn hình · khi app quay lại foreground · khi người dùng làm mới |
| **Cấm** | polling liên tục |

⇒ Yêu cầu cho Prompt 4, chưa hiện thực vì chưa có màn nghiệp vụ nào.

### 4k.4 ✅ **ĐÓNG §0b câu 2–3** — chu kỳ dọn và ngưỡng cảnh báo

**Scheduler phía máy chủ đang chạy** (do người dùng cung cấp):

| Việc | Lịch |
|---|---|
| `audit:reconcile` | mỗi **5 phút** |
| dọn file lỗi import | **02:15** hằng ngày |
| ẩn danh PII bảo hành | **03:10** hằng ngày |

**Ngưỡng cảnh báo** — người dùng đề xuất cho `audit_outbox` phía máy chủ:

| Mức | Điều kiện |
|---|---|
| Warning | `>= 200` qua **2 chu kỳ liên tiếp** (10 phút) |
| Critical | đạt **500**, hoặc tiếp tục tăng |
| `failed_jobs` | cảnh báo **ngay từ bản ghi đầu tiên** |

Áp cùng hình dạng cho hàng đợi **trên máy** để hai bên đọc giống nhau:
`UNSENT_WARNING_THRESHOLD = 200`, thêm `UNSENT_CRITICAL_THRESHOLD = 500`. Cả hai
chỉ **ghi log cảnh báo**, tuyệt đối không kích hoạt xoá — `GATE_01 §3`.

⚠️ **Một phần câu 2 chưa khớp.** Câu hỏi gốc là *chu kỳ chạy dọn **trên máy***
(mỗi lần mở app · hằng ngày · hay chỉ khi bấm). Câu trả lời mô tả scheduler
**phía máy chủ** — hai thứ khác nhau: app không chạy lúc 03:10. `pruneSynced`
vì thế **vẫn chưa được gọi tự động**, và dữ liệu local vẫn giữ nguyên toàn bộ.
Cần một câu trả lời riêng cho phía máy.

---

## 5. Tiến độ Gate WMS sau khi có spec

| # | Hạng mục | Trước | Sau |
|:--:|---|:--:|:--:|
| 1 | Chủ sở hữu 42 endpoint | ⬜ | ⬜ |
| 2 | **OpenAPI/Swagger chính thức** | ⬜ | ⚠️ **có spec, chưa có ký duyệt** |
| 3 | **Phân loại môi trường** | ⬜ | ✅ **staging — người dùng xác nhận** |
| 4 | Base URL từng môi trường | ⬜ | ⚠️ có staging, thiếu dev/prod |
| 5 | Cơ chế authentication | ⬜ | ⚠️ **JWT bearer** — thiếu TTL và cách refresh |
| 6 | Tài khoản test | ⬜ | ⬜ |
| 7 | **Idempotency phía server** | ⬜ | ⚠️ **có văn bản**, chưa kiểm chứng staging |
| 8 | **Duplicate / conflict** | ⬜ | ⚠️ **có văn bản** (409/412/428), chưa kiểm chứng |
| 9 | **Error schema** | ⬜ | ⚠️ **147 mã lỗi**, cần xác nhận trường chuẩn |
| 10 | `/api/*` public có chủ đích không | ⬜ | ⬜ |
| 11 | Contract test với staging | ⬜ | ⚠️ **đã chạy phần ĐỌC** (§4b) — 11/11 endpoint tồn tại, envelope khớp. 🔴 Phần **GHI** chưa chạy được, cần tài khoản test |

**1/11 đóng hẳn · 7/11 tiến triển đáng kể · 3/11 chưa động tới.**

---

## 6. Việc làm được ngay, không cần Gate PASS

Cả bốn việc dưới đây nằm trong phạm vi [GATE_01 §4](gates/GATE_01.md) cho phép — *"sinh types/interfaces · API adapter · mock server · contract test phía client"*:

| # | Việc |
|:--:|---|
| 1 | Sinh TypeScript types từ spec thật, thay các interface đang đoán |
| 2 | Dựng API adapter đúng contract cho Prompt 4 |
| 3 | ~~Contract test đọc (GET) trên staging~~ | ✅ **XONG** — §4b |
| 4 | Sửa đường dẫn `warranty-attachments` thiếu `/download` |

> ⚠️ Bản spec 2,4 MB hiện lưu ở thư mục scratchpad **ngoài repository**. Chưa đưa vào Git vì kích thước lớn — cần người dùng quyết định.
