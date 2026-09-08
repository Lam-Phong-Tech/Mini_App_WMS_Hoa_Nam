# GATE — WMS API Integration

| | |
|---|---|
| **Mã Gate** | `GATE_WMS_API_INTEGRATION` |
| **Trạng thái** | 🚧 **BLOCKED** — **6/18 hạng mục đóng**, 9 tiến triển, 3 chưa động<br>🆕 2026-09-05: có spec OpenAPI thật · auth đã đóng · Cloudflare đã allowlist · chính sách 5xx đã chốt<br>🔴 2026-09-05: **mục 3 (lớp môi trường) MỞ LẠI** vì ba lời khai mâu thuẫn |
| **Tạo ngày** | 2026-09-04 |
| **Nguồn** | Tách khỏi `GATE_01` theo Change Control 2026-09-04<br>🆕 Nhận thêm **ĐK6 của `GATE_03`** theo Change Control 2026-09-05 |
| **Chặn** | ❌ Phát hành production · ❌ Gọi WMS production · ❌ Đấu nối endpoint nghiệp vụ |
| **Không chặn** | ✅ `PROMPT_01` · ✅ `PROMPT_02` · ✅ `PROMPT_03` (trừ ĐK6) · ✅ sinh types, adapter, mock server, contract test phía client<br>⚠️ Hàng đợi đồng bộ **đã được nới** cho phép xây ở mức cơ chế — [GATE_01 §0b](GATE_01.md) |

---

## 1. Vì sao Gate này tồn tại

`GATE_01` quyết định kiến trúc, không chứng nhận API production. Việc xác minh contract, môi trường và xác thực phụ thuộc chủ sở hữu WMS API bên ngoài repository, nên được tách ra đây.

---

## 2. Hai nhóm API đã chốt (Q9)

### Nhóm A — Backend trong repository (12 endpoint)

| | |
|---|---|
| Nguồn | Route + Controller **thật trong repo** — xem [01-api-inventory.md §1](../01-api-inventory.md) |
| Nhãn | `DRAFT_DERIVED_FROM_SOURCE` |
| Tệp | [backend-mini-api.draft.yaml](../openapi/backend-mini-api.draft.yaml) |
| Được dùng làm | **Nguồn implementation đã xác minh** |
| ❌ Không được | Coi là production contract khi chưa có chủ sở hữu API xác nhận |

### Nhóm B — WMS ngoài repository (~42 endpoint)

| | |
|---|---|
| Nguồn | **Chỉ** call-site ở frontend |
| Nhãn | **`CLIENT_EXPECTED_CONTRACT`** |
| Tệp | [wms-external-api.draft.yaml](../openapi/wms-external-api.draft.yaml) |

**✅ Được dùng để:**

| # | Mục đích cho phép |
|:--:|---|
| 1 | Sinh types / interfaces |
| 2 | Tạo API adapter |
| 3 | Tạo mock server / fixtures |
| 4 | Viết contract test **phía client** |

**❌ Không được:**

| # | Cấm |
|:--:|---|
| 1 | Coi là bằng chứng server thực sự hỗ trợ endpoint, payload, idempotency hoặc conflict handling |
| 2 | Gọi mutation thật |
| 3 | Triển khai offline mutation |
| 4 | Retry request ghi dữ liệu |
| 5 | Post Receipt / Post Issue khi chưa PASS Gate này |
| 6 | Sử dụng credential hoặc token từ source |

---

## 2b. 🆕 Tiếp nhận ĐK6 của GATE_03 — Change Control 2026-09-05

### 2b.1 Sự việc

`GATE_03` đạt **8/9** điều kiện. Điều kiện còn lại:

> **ĐK6** — *"API mapping khớp mã nguồn cũ hoặc contract chính thức"*

Điều kiện này **không thể đóng bằng nỗ lực phía client**: nó phụ thuộc hoàn toàn vào việc chủ sở hữu WMS giao contract chính thức. Giữ nó trong `GATE_03` sẽ chặn Prompt 4 vô thời hạn vì một lý do nằm ngoài tầm kiểm soát của đội phát triển.

Người dùng chọn **tách ĐK6 sang Gate này**, đúng tiền lệ Change Control 2026-09-04 đã áp dụng cho Q4/Q5/Q9 của `GATE_01`.

### 2b.2 Phần nào đã xong, phần nào chuyển sang đây

| Hạng mục | Trạng thái | Thuộc Gate nào |
|---|:--:|---|
| Chuẩn hoá lỗi mạng/timeout/HTTP/nghiệp vụ | ✅ **xong**, 22 test | `GATE_03` |
| Timeout, huỷ request khi unmount | ✅ **xong** | `GATE_03` |
| Redact token khỏi log | ✅ **xong** | `GATE_03` |
| Không CORS proxy, không tắt TLS | ✅ **xong** | `GATE_03` |
| Port regex phân tích payload từ Mini App cũ | ✅ **xong** | `GATE_03` |
| **Đấu nối ~42 endpoint nghiệp vụ** | 🔴 **chưa** | **Gate này** |
| **Đối chiếu payload/response với server thật** | 🔴 **chưa** | **Gate này** |
| **Xác thực và môi trường thật** | 🔴 **chưa** | **Gate này** |

### 2b.3 🔴 Ràng buộc mới do việc tách này sinh ra

| # | Cấm cho tới khi Gate này PASS |
|:--:|---|
| 1 | Tuyên bố *"API mapping đã hoàn tất"* hoặc *"đồng bộ hoạt động với backend"* |
| 2 | Đấu nối bất kỳ endpoint nghiệp vụ nào trong Prompt 4 |
| 3 | Thay `gateBlockedSender` bằng bộ gửi thật |
| 4 | Bật `wmsGateApproved: true` cho bất kỳ môi trường nào |

> ✅ Việc tách này **không** rút ngắn Gate này. Toàn bộ hạng mục ở §3 vẫn bắt buộc xác nhận trước production.

---

## 2c. 🔓 Change Control 2026-09-05 — nới ngoại lệ HẸP cho ba đường auth

### 2c.1 Sự việc

Người dùng chọn nhánh **"tự gia hạn ngầm"** cho phiên đăng nhập (§4h.1). Nhánh
đó **bắt buộc** app gọi được `POST /api/v1/auth/refresh`. Nhưng `GATE_01 §11` #4
đang chặn **mọi** method khác GET/HEAD tới môi trường WMS.

### 2c.2 Phạm vi nới — và phạm vi KHÔNG nới

| | |
|---|---|
| **Được miễn** | `POST /api/v1/auth/login` · `/api/v1/auth/refresh` · `/api/v1/auth/logout` |
| **Vì sao được** | Không đụng tồn kho, không tạo/sửa phiếu, không ghi scan — **không phải mutation nghiệp vụ** |
| **KHÔNG được miễn** | Mọi endpoint nghiệp vụ. `GATE_01 §11` #4 còn nguyên hiệu lực |
| **Cách so khớp** | **Tuyệt đối**, cố ý không dùng tiền tố — chặn `/auth/refresh/../inbound-documents` |
| **Nơi cưỡng chế** | `src/api/client.ts` → `GATE_EXEMPT_AUTH_PATHS` |
| **Test khoá** | `apiClient.test.ts` — *"POST tới endpoint nghiệp vụ VẪN bị chặn"* |

### 2c.3 Ràng buộc kèm theo

| # | Cấm |
|:--:|---|
| 1 | Thêm bất kỳ đường nào vào `GATE_EXEMPT_AUTH_PATHS` mà **không** có mục Change Control mới ở đây |
| 2 | Đổi cách so khớp từ tuyệt đối sang tiền tố hoặc regex |
| 3 | Coi ngoại lệ này là tiền lệ để nới cho endpoint nghiệp vụ |
| 4 | Tự gửi lại request **ghi** sau khi gia hạn — chỉ method an toàn mới được gửi lại (§4h.5 ràng buộc 2) |

---

## 2d. 🔓 Change Control 2026-09-06 — cho đấu endpoint **ĐỌC** trong Prompt 4

### 2d.1 Mâu thuẫn buộc phải xử lý

Prompt 4 và Gate này loại trừ nhau:

| Nguồn | Đòi hỏi |
|---|---|
| Prompt 4 — nguyên tắc #4 | *"Không dùng dữ liệu giả, placeholder, TODO hoặc màn hình demo để thay thế."* |
| Prompt 4 — nguyên tắc #5 | *"Không khai man rằng một màn hình hoàn thành nếu chưa kết nối API/storage/scanner thật."* |
| Prompt 4 — điều kiện Gate 04 | *"**Tất cả luồng đã kết nối implementation thật**."* |
| **`§2b.3` #2** (Gate này) | *"Đấu nối bất kỳ endpoint nghiệp vụ nào **trong Prompt 4**"* — **CẤM** |

Không thể cùng đúng. Ba phương án đã trình bày cho người dùng.

### 2d.2 Quyết định

> **Người dùng chọn phương án A, ngày 2026-09-06.**

| | |
|---|---|
| **Được nới** | Đấu nối endpoint nghiệp vụ **CHỈ VỚI method an toàn** — `GET` và `HEAD` |
| **KHÔNG nới** | Mọi endpoint **GHI**: `POST` · `PUT` · `PATCH` · `DELETE`. Cấm nguyên vẹn |
| **Vì sao an toàn** | Đọc đã được kiểm chứng trên staging ngày 2026-09-05 ([§4b](../03-api-contract-delta.md), [§4e](../03-api-contract-delta.md)): 11/11 endpoint GET trả 200, không thay đổi dữ liệu nào |
| **Vì sao đủ cho Prompt 4** | Màn hình hiển thị **dữ liệu thật** ⇒ thoả nguyên tắc #4. Luồng ghi vẫn là ngoại lệ có văn bản, đúng như Gate 04 cho phép (*"hoặc có ngoại lệ do tôi phê duyệt bằng văn bản"*) |

### 2d.3 Cưỡng chế bằng code, không bằng kỷ luật

Lệnh cấm ghi **đã** nằm trong đường thực thi từ Prompt 2 và **không đổi**:

```ts
// src/api/client.ts
if (
  !SAFE_METHODS.has(method) &&            // chỉ GET/HEAD lọt qua
  !environment.wmsGateApproved &&         // vẫn false ở mọi môi trường
  !isGateExemptAuthPath(options.path)     // ba đường auth, §2c
) { throw AppError('blocked_by_gate') }
```

⇒ Nới lần này **không sửa một dòng nào** trong chốt chặn. Nó chỉ gỡ một lệnh cấm
**trên giấy** vốn nghiêm hơn lệnh cấm trong code.

### 2d.4 Ràng buộc còn nguyên sau khi nới

| # | Vẫn CẤM |
|:--:|---|
| 1 | Gọi bất kỳ endpoint **ghi** nào — kể cả trên DEV/TEST |
| 2 | Thay `gateBlockedSender` bằng bộ gửi thật (`§2b.3` #3) |
| 3 | Bật `wmsGateApproved: true` cho bất kỳ môi trường nào (`§2b.3` #4) |
| 4 | Gắn header `Idempotency-Key` (`GATE_01 §11` #6) |
| 5 | Gửi header `If-Match` — chưa kiểm chứng, xem mục 12 |
| 6 | Tuyên bố *"API mapping đã hoàn tất"* (`§2b.3` #1) |
| 7 | Coi Prompt 4 PASS là bằng chứng Gate này PASS |

### 2d.5 Hệ quả phải ghi vào Gate 04

Khi Prompt 4 xin duyệt, `GATE_04` **bắt buộc** ghi rõ: *"Luồng ghi (tạo phiếu,
ghi nhận, duyệt, post) dựng xong UI và state nhưng **chưa đấu backend**, theo
ngoại lệ được phê duyệt tại `GATE_WMS §2d`."* Không được để trống chỗ này.

---

## 2e. 🔓 Change Control 2026-09-06 — cho đấu **hai** thao tác GHI của luồng nhập kho

### 2e.1 Sự việc

Ngày 2026-09-06 người dùng cung cấp contract đầy đủ luồng nhập kho (9 endpoint,
`03-api-mapping.md`) và yêu cầu *"kiểm tra và đưa vào app thực tế"*.

Đối chiếu xong, tôi tách yêu cầu đó thành **ba** đề nghị riêng vì rủi ro khác
nhau hẳn nhau, rồi hỏi lại. Người dùng trả lời nguyên văn:

> **"duyệt A và B, chưa duyệt C"**

### 2e.2 Phạm vi nới

| | Thao tác | Rủi ro thật | Trạng thái |
|:--:|---|---|:--:|
| **A** | `POST /api/v1/mini-app/inbound/resolve-code` | **Thấp.** Spec khẳng định *"KHÔNG tạo document, KHÔNG tạo scan evidence, KHÔNG tạo movement và KHÔNG đổi tồn"* — POST chỉ vì cần body, không vì có tác dụng phụ | ✅ **DUYỆT** |
| **B** | `POST /api/v1/mini-app/inbound/record` | **Trung bình.** Tạo phiếu WMS ở trạng thái chờ duyệt. Tồn kho **chưa** đổi. Có `Idempotency-Key` nên gửi trùng không sinh phiếu trùng | ✅ **DUYỆT** |
| **C** | `POST /api/v1/mini-app/inbound-documents/{id}/post-receipt` | **Cao.** *"Stock mutation cuối của luồng Mini App… sau thành công document=POSTED và tồn kho mới tăng"* | 🔴 **KHÔNG DUYỆT** |

### 2e.3 Vì sao C bị giữ lại — hai lý do còn treo

1. **Mục 3 bảng dưới đang 🔴 MỞ LẠI.** Ba lời khai mâu thuẫn về host nào là
   production. Phát lệnh **tăng tồn kho thật** trong khi chưa biết chắc đang nói
   chuyện với môi trường nào là rủi ro không cần phải nhận lúc này.
2. **Mục 12 bảng dưới.** `post-receipt` bắt buộc có `If-Match`, mà chưa ai kiểm
   chứng máy chủ chấp nhận giá trị nào. Gửi sai thì ăn `412 STALE_VERSION`.

⇒ Mở C đòi **một Change Control mới**, sau khi mục 3 và mục 12 đóng.

### 2e.4 Cưỡng chế bằng code, không bằng kỷ luật

Cách **không** làm: bật `environment.wmsGateApproved = true`. Cờ đó mở **toàn bộ
175 endpoint ghi**, trong đó có `DELETE /api/v1/roles/{id}`. Người dùng duyệt
**hai** thao tác, không duyệt 175 cái. ⇒ Cờ vẫn `false`.

Đường đi duy nhất là một **danh sách trắng** ở [`src/api/writeGate.ts`](../../apps/wms-mobile/src/api/writeGate.ts):

| Cơ chế | Chi tiết |
|---|---|
| Khoá theo **cặp `METHOD` + đường dẫn** | `DELETE /inbound/record` vẫn bị chặn. Bản đầu của tôi chỉ so đường dẫn ⇒ để hở; đã sửa cùng ngày |
| **Khớp tuyệt đối**, không tiền tố | `/inbound/record/../../roles/1` không lọt |
| `Idempotency-Key` nới cho **đúng B** | `resolve-code` không được gửi (spec không khai header này cho nó); quên truyền method ⇒ vẫn cấm |
| `If-Match` **không ngoại lệ nào** | `allowsIfMatch()` luôn trả `false` cho mọi thao tác |

### 2e.5 Bằng chứng

| Tệp test | Số test | Canh điều gì |
|---|:--:|---|
| `__tests__/apiClient.test.ts` → `describe('GATE_WMS §2e…')` | 24 | cổng ở tầng HTTP; nhóm 🔴 canh riêng `post-receipt` với **mọi `{id}`** |
| `__tests__/inboundWrite.test.ts` | 29 | payload đúng contract; khoá idempotency **không đổi qua các lần gửi lại**; `post-receipt` không có hàm nào gọi |
| `__tests__/inboundFlow.test.tsx` → `describe('§2e…')` | 2 | bộ gửi mặc định **có** gửi phiếu nhập, luồng chưa duyệt **vẫn** rơi về bộ chặn |

Ai thêm C mà không có Change Control mới thì các test này đỏ.

Toàn bộ: `npx tsc --noEmit` sạch · `npx eslint .` sạch · **418/418 test qua**
(2026-09-06).

### 2e.5b Đã đấu những gì

| Thành phần | Tệp |
|---|---|
| Danh sách trắng thao tác ghi | `src/api/writeGate.ts` |
| Lớp gọi hai endpoint | `src/services/wms/inboundWrite.ts` |
| Bộ gửi hàng đợi | `src/sync/inboundSender.ts` — bọc `gateBlockedSender`, chỉ nhận `INBOUND_RECEIPT_DRAFT` |
| Bộ gửi mặc định của app | `src/sync/bootstrap.ts#defaultSender` |
| Ô chọn **kho nhận** (contract đòi `dst_warehouse_id`) | `src/features/inbound/useWarehouses.ts` + `InboundCreateScreen.tsx` |
| Nguồn quét (`scan_source`) | `src/scanner/scanPayload.ts#ScanSource` → `BusinessScanScreen` → `inboundDraft` |

🔧 Hai khoảng trống phát hiện khi đấu nối, đã vá: bản port đầu **không có ô chọn
kho** (phiếu dựng ra không bao giờ gửi được) và **đánh mất `scan_source`** (màn
quét phân biệt được camera với gõ tay nhưng không chuyển tiếp).

### 2e.6 Ràng buộc còn nguyên sau khi nới

- `GATE_01 §11` #4 — mọi endpoint ghi **ngoài** A và B vẫn bị chặn.
- `GATE_01 §11` #6 — `Idempotency-Key` vẫn cấm ở mọi nơi trừ B.
- Mục 12 — `If-Match` vẫn cấm tuyệt đối.
- `§2b.3` — không tự retry request ghi; 5xx vẫn vào `unknown` theo quyết định
  2026-09-05.

---

## 2f. 🔓 Change Control 2026-09-06 — duyệt **C** (`post-receipt`) sau khi mục 3 đóng

### 2f.1 Bằng chứng khiến mục 3 đóng được

Hạ tầng cung cấp bảng tách tier. Điểm quyết định: hai tier **không chỉ khác tên
miền** mà khác cả cổng Nginx, stack và database.

| Tier | Domain API | Nginx đích | Stack | Database |
|---|---|---|---|---|
| `dev-test` | `khohoanamdev.lptech.info.vn` | `127.0.0.1:18082` | Green | `wms_hoanam_green` |
| `customer-production` | `khohoanamdev.bigk.click` | `127.0.0.1:18081` | Blue | `wms_hoanam_blue` |

⇒ Bản DEV/TEST trỏ Green, nên `post-receipt` ở đó **chỉ đổi `wms_hoanam_green`**;
nó không có đường nào chạm tồn kho khách hàng. Đây là điều lật được lý do thứ
nhất từng khiến tôi giữ C lại.

**Nguồn của hiểu nhầm cũ đã được truy ra:** Green ghi `staging` trong `.env`
nhưng Laravel runtime chạy `production`. Hai khái niệm bị trộn — *chế độ chạy
của framework* và *tier triển khai*. Nay tách hẳn: cả hai stack chạy
production-like, tier nằm ở `WMS_DEPLOYMENT_TIER`.

### 2f.2 Quyết định

> **"Duyệt C"** — người dùng, 2026-09-06.

`POST /api/v1/mini-app/inbound-documents/{id}/post-receipt` được duyệt. Đây là
**stock mutation cuối**: sau thành công `document=POSTED` và **tồn kho tăng
thật**, không hoàn tác bằng cách bấm lại.

### 2f.3 Sáu bước bắt buộc — và chỗ cưỡng chế từng bước

| # | Yêu cầu | Cưỡng chế ở đâu |
|:--:|---|---|
| 1 | Bản DEV/TEST chỉ dùng `lptech.info.vn` | `config/env.ts` + `config/buildProfile.ts` (hằng số biên dịch) |
| 2 | App mở ⇒ gọi `/api/v1/health`; chỉ bật quét khi header đúng | `app/AppShell.tsx` gọi `checkDeploymentTier`; `BusinessScanScreen` khoá camera **và** lối nhập tay |
| 3 | Kiểm header **lần nữa** trước `post-receipt` | `inboundWrite.ts#postReceipt` gọi `requireTierForWrite`, luôn ra mạng, **không** dùng kết quả cũ |
| 4 | Thiếu/khác ⇒ khoá ghi, báo *"Sai môi trường"*, **không retry** | `AppError` kind mới `wrong_environment` → `syncEngine` xếp `failed` (không phải `pending`) |
| 5 | Bản Customer chỉ dùng `bigk.click`, kỳ vọng `customer-production` | `ENVIRONMENTS['customer-production'].expectedTier` |
| 6 | **Không** menu/toggle đổi URL; tách build profile | `setCurrentEnvironment` **đã xoá hẳn**; nút đổi môi trường gỡ khỏi màn Chẩn đoán |

### 2f.4 Vì sao hỏi máy chủ thay vì tin hằng số của chính app

App **biết** nó nhắm tier nào, nhưng đó là điều nó tự khai. Chỉ đọc hằng số của
mình thì một bản dựng trỏ nhầm host vẫn tự tin là đúng — vòng lặp tự xác nhận,
không phải kiểm chứng. Chỉ **máy chủ đang trả lời** mới nói được nó là stack nào.

Cùng lý do đó, **thiếu header bị xử như sai tier**: "không biết đang nói chuyện
với ai" và "biết là sai" đáng bị chặn như nhau khi thứ sắp xảy ra là lệnh tăng
tồn kho.

### 2f.5 Header `X-WMS-Client-Tier` — khoá chiều còn lại

App gửi header này trên **mọi** request (`api/client.ts`). Backend chưa có
middleware bắt buộc nó — người dùng ghi rõ 2026-09-06. Gửi trước để khi
middleware bật lên thì khoá được **hai chiều**: app tự chặn khi máy chủ sai
tier, và máy chủ trả `409 ENVIRONMENT_MISMATCH` khi client sai tier.

🟡 **Việc còn lại của phía BE.** Một chiều vẫn hở: một bản dựng cũ không gửi
header sẽ đi lọt.

### 2f.6 Hai chỗ cố ý KHÔNG sao chép từ client Mini App đang chạy

| Client cũ làm | Vì sao không port |
|---|---|
| `Idempotency-Key: generateClientScanId()` — sinh **mới mỗi lần** gọi `post-receipt` (`receipt-flow.service.ts:911`) | Trái quy tắc người dùng chốt 2026-09-05: *"khi retry phải dùng lại đúng Idempotency-Key cũ."* App mới suy khoá từ **mã phiếu** nên ổn định qua mọi lần bấm lại, kể cả sau khi khởi động lại |
| `If-Match` rơi về `"1"` khi thiếu version (`:747`) | `If-Match: 1` gửi lên phiếu đã sang version 3 là hoặc bị từ chối, hoặc ghi đè mất thay đổi người khác. App mới **dừng lại và nói ra** — đó là cả điểm tồn tại của kiểm soát lạc quan |

### 2f.7 Bằng chứng

| Tệp test | Số test | Canh điều gì |
|---|:--:|---|
| `__tests__/tierCheck.test.ts` | 23 | sáu bước bắt buộc; **mọi** trạng thái không rõ ràng đều chặn |
| `__tests__/postReceipt.test.ts` | 18 | không Post khi máy chủ chưa sẵn sàng; không Post trước xác nhận; khoá idempotency ổn định |
| `__tests__/inboundWrite.test.ts` | 37 | payload; kiểm tier **trước** khi gửi; không rơi về version "1" |
| `__tests__/apiClient.test.ts` | 63 | khớp đường dẫn theo **từng đoạn**; `If-Match` chỉ đúng một thao tác |
| `__tests__/inboundFlow.test.tsx` | 36 | sai môi trường ⇒ khoá quét **và** khoá nhập tay |

Toàn bộ: `npx tsc --noEmit` sạch · `npx eslint .` sạch · **484/484 test qua**
(2026-09-06).

⚠️ **Chưa chạy thật.** Chưa có `post-receipt` nào gửi lên máy chủ. Mục 12 chỉ
đóng hẳn sau lần Post thật đầu tiên.

### 2f.8 Ràng buộc còn nguyên

- `GATE_01 §11` #4 — mọi endpoint ghi **ngoài** ba thao tác nhập kho vẫn bị chặn.
  `post-issue` của luồng **xuất** kho **chưa** được duyệt.
- `GATE_01 §11` #6 — `Idempotency-Key` vẫn cấm ngoài `record` và `post-receipt`.
- `If-Match` vẫn cấm ngoài `post-receipt`.
- `wmsGateApproved` vẫn `false` ở **cả hai** môi trường.
- `§2b.3` — không tự retry request ghi.

---

## 2g. 🔓 Change Control 2026-09-06 — duyệt **D và E** của luồng xuất kho

### 2g.1 Quyết định

> **"duyệt D và E, chưa duyệt F"** — người dùng, 2026-09-06.

| | Thao tác | Rủi ro | Trạng thái |
|:--:|---|---|:--:|
| **D** | `POST /api/v1/mini-app/outbound/resolve-code` | **thấp** — chỉ hỏi mã là gì và có xuất được không; không tạo gì, không đổi tồn | ✅ **DUYỆT** |
| **E** | `POST /api/v1/mini-app/outbound/record` | **trung bình** — tạo phiếu xuất chờ duyệt; tồn kho **chưa** giảm | ✅ **DUYỆT** |
| **F** | `POST /api/v1/mini-app/outbound-documents/{id}/post-issue` | **cao** — **giảm tồn kho thật** | 🔴 **KHÔNG DUYỆT** |

### 2g.2 Vì sao F nguy hiểm theo chiều khó thấy hơn C

`post-receipt` (đã duyệt ở `§2f`) và `post-issue` đối xứng nhau, nhưng hậu quả
khi nhầm thì không:

| | Post nhầm | Phát hiện thế nào |
|---|---|---|
| **Nhập** | tồn **dư** ra so với thực tế | lần đếm nào cũng thấy thừa hàng |
| **Xuất** | tồn **thiếu** đi trong khi hàng vẫn trên kệ | sổ và kho lệch nhau **im lặng** tới kỳ kiểm kê |

⇒ Giữ F lại là quyết định đúng, không phải thận trọng thừa.

### 2g.3 Cưỡng chế

Danh sách trắng ở `api/writeGate.ts` nay có **năm** thao tác. `post-issue` cố ý
**vắng mặt**, và `services/wms/outboundWrite.ts` **không có hàm nào** gọi nó —
không phải hàm bị khoá sau một cờ, mà là không tồn tại.

`If-Match` vẫn **chỉ** mở cho `post-receipt`. `Idempotency-Key` nay mở cho ba
thao tác: `inbound/record`, `post-receipt`, `outbound/record`.

### 2g.4 Chuỗi bộ gửi — thêm mắt xích có tên, không nới điều kiện

```
outbound → inbound → gateBlockedSender
```

Mỗi bộ chỉ nhận đúng `kind` nó biết rồi uỷ quyền phần còn lại. Bảo hành rơi tới
cuối chuỗi và vẫn bị chặn kèm lý do nói ra được. Bảng đầy đủ ở
`sync/bootstrap.ts#defaultSender` — một tệp là thấy đủ cái gì được gửi đi.

### 2g.5 Vì sao D **không** có preflight tier

`post-receipt` có, vì nó đổi tồn. `resolve-code` thì không — và đó là quyết
định có lý do: nó chạy **một lần cho mỗi mã quét**. Thêm một request
`/api/v1/health` cho mỗi mã là nhân đôi lưu lượng ở đúng chỗ mạng kho yếu nhất.

Màn quét đã bị khoá theo tier ở tầng trên (`§2f.3` mục 2), nên không có đường
nào tới `resolve-code` mà chưa qua kiểm tier.

### 2g.6 Kiểm mã lúc quét — thiết kế và lý do

Mô tả luồng xuất đòi *"App chặn mã trùng và mã WMS trả về không đủ điều kiện
xuất"*. Cách làm:

| Bước | Vì sao không làm khác |
|---|---|
| Mã vào danh sách ở trạng thái `checking` **trước**, rồi mới gọi mạng | Chặn máy quét cho tới khi mạng trả lời nghĩa là phiếu 200 mã phải chờ 200 lượt round-trip nối tiếp |
| Mã trùng **không** gọi mạng | Chốt chống trùng cục bộ chạy trước — không tốn request cho thứ đã biết là thừa |
| Mã bị từ chối **ở lại danh sách** kèm lý do | Xoá lặng thì thủ kho nghe tiếng bíp nhưng thấy con số không tăng, và không biết làm gì với kiện hàng đang cầm |
| Tiến độ đếm mã **được chấp nhận** | Badge `2/2` khi có một mã bị từ chối là con số nói dối ở chỗ thủ kho tin nhất |
| Mã `checking` **vẫn tính** vào tiến độ | Nếu không, tiến độ tụt lùi mỗi lần mạng chậm và thủ kho quét thừa để bù |
| Không cho ghi nhận khi còn `checking` | Gửi phiếu mà chính app cũng chưa biết có hợp lệ không |
| Payload **chỉ** mang mã được chấp nhận | Spec: lỗi một item rollback toàn bộ transaction |
| Mất mạng ⇒ lý do ghi *"Chưa kiểm tra được với WMS"* | Không phải *"mã hỏng"*. Thủ kho cần biết là quét lại sau, chứ không phải bỏ kiện hàng ra |

**Thiếu hẳn `eligible_for_outbound` ⇒ coi là KHÔNG được xuất.** Máy chủ chưa nói
được thì client không thay nó quyết định; với thao tác lấy hàng ra khỏi kho,
"không biết" phải xử như "không được".

### 2g.7 Bằng chứng

| Tệp test | Số test | Canh điều gì |
|---|:--:|---|
| `__tests__/outboundWrite.test.ts` | 34 | payload đúng contract; khoá idempotency ổn định; nhóm 🔴 canh riêng `post-issue` với **mọi `{id}`** |
| `__tests__/outboundFlow.test.tsx` | 57 | mã bị từ chối không tính tiến độ, không vào payload, vẫn ở lại kèm lý do |
| `__tests__/outboundGeo.test.tsx` | 23 | màn Kiểm tra nói **đúng** trạng thái từng mã; token WMS không rời khỏi WMS |

Toàn bộ: `npx tsc --noEmit` sạch · `npx eslint .` sạch · **573/573 test qua**
(2026-09-06).

⚠️ **Chưa chạy thật.** Chưa có `resolve-code` hay `record` nào của luồng xuất
gửi lên máy chủ.

### 2g.8 Ràng buộc còn nguyên

- 🔴 `post-issue` — **chưa duyệt**, và nó là bước duy nhất làm giảm tồn kho.
- `GATE_01 §11` #4 — **172 endpoint ghi** còn lại vẫn bị chặn, gồm cả
  `outbound-documents/{id}/scan`, `unmatch`, và toàn bộ luồng bảo hành.
- `If-Match` chỉ mở cho `post-receipt`.
- `wmsGateApproved` vẫn `false` ở cả hai môi trường.

---

## 2h. 🔓 Change Control 2026-09-06 — duyệt **F** (`post-issue`)

### 2h.1 Quyết định

> **"duyệt F"** — người dùng, 2026-09-06.

`POST /api/v1/mini-app/outbound-documents/{id}/post-issue` được duyệt. Đây là
lệnh **giảm tồn kho thật**.

⇒ Toàn bộ luồng nhập và luồng xuất đã đấu **tới tận lệnh đổi tồn kho**. Danh
sách trắng nay có **sáu** thao tác; 170 endpoint ghi còn lại vẫn chặn.

### 2h.2 🔧 Bản kiểm kê spec của tôi SAI về header

`openapi/wms-external-api.draft.yaml:128` khai `post-issue` chỉ có
`Idempotency-Key`. **Sai.** Mã Mini App đang chạy gửi **cả `If-Match`**
(`scan.service.ts:1747-1748`). Mô tả của người dùng đúng, bản kiểm kê thiếu.

Ghi lại vì nó đổi kết luận: nếu tin bản kiểm kê thì app sẽ gửi thiếu `If-Match`,
và theo spec `§5` thì thiếu header đó ăn **`428`** — một lỗi chỉ lộ ra lúc chạy
thật, ở đúng thao tác nguy hiểm nhất.

⇒ `allowsIfMatch` nay mở cho **hai** thao tác, và đó đúng là hai lệnh đổi tồn.

### 2h.3 Hai lệnh đổi tồn kho — ràng buộc chung

`post-receipt` và `post-issue` là **hai thao tác duy nhất** trong danh sách
trắng đổi tồn kho thật. Cả hai, và chỉ hai, mang thêm ba ràng buộc:

| Ràng buộc | Vì sao |
|---|---|
| **Preflight tier ngay trước khi gửi** | Sai stack ⇒ đổi tồn nhầm môi trường |
| **`version` bắt buộc**, không mặc định | `If-Match` sai ⇒ `412`, hoặc ghi đè mất thay đổi người khác |
| **Hộp xác nhận nêu số lượng** | Không hoàn tác được bằng cách bấm lại |

⚠️ Client Mini App đang chạy vi phạm cả ba: nó không kiểm tier, gọi
`normalizeIfMatch()` mà **không kiểm kết quả** (nên gửi `If-Match: undefined`
khi thiếu version), và rơi về `generateClientScanId()` cho `Idempotency-Key`
(khoá mới mỗi lần thử lại). Không port chỗ nào trong ba chỗ đó.

### 2h.4 Duyệt hàng loạt — theo đúng quy trình đã mô tả

| Bước | Cách làm | Vì sao không làm khác |
|---|---|---|
| `GET /outbound-documents/{id}` trước **mỗi** lần Post | lấy `version` mới nhất | Danh sách là ảnh chụp lúc tải; gửi version cũ thì ăn `412`, hoặc ghi đè mất thay đổi người khác |
| Chạy **tuần tự**, không song song | một phiếu xong mới sang phiếu sau | Bắn 20 lệnh giảm tồn cùng lúc thì khi hỏng giữa chừng không ai nói được cái nào đã đi |
| **Kết quả một phần** là trạng thái hợp lệ | phiếu xong là xong, phiếu lỗi ở lại ô chọn | Coi cả mẻ là "thất bại" rồi cho bấm lại sẽ gửi lần hai những phiếu đã giảm tồn thật |
| Câu tóm tắt nêu **cả hai** con số | *"Đã xuất 8 phiếu, 2 phiếu lỗi"* | *"Có lỗi xảy ra"* giấu mất việc tồn kho của 8 phiếu kia đã giảm |
| Chỉ `ready_for_issue === true` mới chọn được | máy chủ tính | Client không tự suy từ `scanned >= expected`: điều kiện đủ còn phụ thuộc giữ chỗ tồn, quyền, trạng thái item |

### 2h.5 🐞 Một lỗi im lặng bộ test bắt được

Bản đầu của `usePostIssue.confirm()` lấy danh sách phiếu bằng cách gán biến
**bên trong một `setState` updater** rồi dùng ngay sau đó. React không chạy
updater đồng bộ tại chỗ gọi, nên hàng đợi luôn rỗng và **không phiếu nào được
gửi** — trong khi giao diện vẫn chạy hết luồng như bình thường.

Không exception, không log, chỉ là không có gì xảy ra. Đúng loại lỗi mà chạy tay
một lần sẽ không thấy. Đã sửa: đọc thẳng từ `state.selected`.

### 2h.6 Bằng chứng

| Tệp test | Số test | Canh điều gì |
|---|:--:|---|
| `__tests__/postIssue.test.ts` | 23 | tuần tự + đọc lại version + kết quả một phần + khoá idempotency ổn định |
| `__tests__/outboundWrite.test.ts` | 41 | khớp đường dẫn theo đoạn; không gửi khi thiếu version; kiểm tier **trước** khi gửi |
| `__tests__/apiClient.test.ts` | 64 | `If-Match` đúng **hai** thao tác; `Idempotency-Key` đúng **bốn** |

Toàn bộ: `npx tsc --noEmit` sạch · `npx eslint .` sạch · **614/614 test qua**
(2026-09-06).

⚠️ **Chưa chạy thật.** Chưa có `post-issue` nào gửi lên máy chủ.

### 2h.7 Ràng buộc còn nguyên

- `GATE_01 §11` #4 — **170 endpoint ghi** còn lại vẫn bị chặn:
  `outbound-documents/{id}/scan`, `unmatch`, packing-labels, và toàn bộ luồng
  **bảo hành**.
- `Idempotency-Key` chỉ mở cho bốn thao tác; `If-Match` chỉ hai.
- `wmsGateApproved` vẫn `false` ở cả hai môi trường.
- `§2b.3` — không tự retry request ghi.

---

## 2i. 🔓 Change Control 2026-09-06 — duyệt **G, H, I, J** của luồng bảo hành

### 2i.1 Quyết định

> **"duyệt G, H, I và J, chưa duyệt K"** — người dùng, 2026-09-06.

| | Thao tác | Rủi ro | Trạng thái |
|:--:|---|---|:--:|
| **G** | `POST warranty/resolve-code` | **thấp** — chỉ hỏi mã | ✅ **DUYỆT** |
| **H** | `POST warranty-cases` | **trung bình** — tạo hồ sơ, lưu **PII khách hàng** | ✅ **DUYỆT** |
| **I** | `POST warranty-cases/{id}/status` | **trung bình** — vòng đời hồ sơ; **không** đụng tồn kho | ✅ **DUYỆT** |
| **J** | `POST warranty-cases/{id}/attachments` | **trung bình** — `multipart`, ảnh/video khách hàng | ✅ **DUYỆT** |
| **K** | `DELETE warranty-attachments/{id}` | **cao theo kiểu khác** — xoá vĩnh viễn | 🔴 **KHÔNG DUYỆT** |

⇒ Danh sách trắng nay có **mười** thao tác. **Chưa method `DELETE` nào** được mở
— có test canh riêng điều đó trên mọi đường, kể cả đường đã duyệt cho `POST`.

### 2i.2 Bảo hành khác nhập/xuất ở hai điểm

1. **Không có lệnh đổi tồn kho**, nên **không** thao tác nào cần preflight tier
   — cái đó dành riêng cho `post-receipt` và `post-issue`.
2. **Chạm dữ liệu cá nhân khách hàng** (tên, điện thoại, địa chỉ, ảnh hiện
   trạng). Sáu thao tác kho hàng chỉ chạm hàng hoá.

`If-Match` vẫn dùng cho **I** dù nó không đụng tồn: hai người cùng mở một hồ sơ
là chuyện thường, và ghi đè *Kết quả kiểm tra* của nhau thì mất hẳn phần hồ sơ
kỹ thuật — thứ không dựng lại được.

### 2i.3 🔴 Hai hạn chế thật của phạm vi này

| Hạn chế | Hệ quả nhìn thấy được |
|---|---|
| **K chưa duyệt** | Tải nhầm ảnh lên thì **không gỡ ra được từ app**. Màn hình phải nói ra thay vì có một nút xoá không hoạt động |
| **Không có thư viện chọn ảnh/video** | `GATE_01 §11` #2 cấm tự thêm module native. Tầng tải lên đã viết và test được, nhưng nối với nút *"Chọn ảnh"* thật thì cần duyệt thêm một module — xem `USER-ACTION-REQUIRED` #26 |

**J không có `Idempotency-Key`** (spec không khai cho endpoint này) ⇒ gửi trùng
sẽ tạo **hai bản ghi file**. Giao diện phải tự chống bấm hai lần; ở tầng dưới
không có gì đỡ.

### 2i.4 🔧 Hai kết luận cũ của tôi được sửa

| Hồ sơ cũ ghi | Thực tế |
|---|---|
| §4b.3: `warranty-attachments/{id}` trả **405** ⇒ đường tải file *"không bao giờ chạy được"* | **Sai — đo nhầm đường.** Có hai đường: `{id}` cho `DELETE`, `{id}/download` cho `GET` (`warranty-flow.service.ts:301-311`). 405 chỉ nói *"method này không đúng cho đường này"* |
| Bản kiểm kê: segment chuyển trạng thái *"CHƯA XÁC ĐỊNH"* | Là `/status` (`warranty-flow.service.ts:311`) |

### 2i.5 🔴 Một lỗi thật trong app RN, đã sửa

App dùng `INSPECTING`, WMS dùng **`CHECKING`**. Tab *Kiểm tra* gọi
`?status=INSPECTING` ⇒ **luôn rỗng hoặc 422** — cùng loại lỗi đã bắt được trên
máy thật ở luồng xuất kho. Cùng đợt: thêm tab `CANCELLED` còn thiếu, và thay hai
nút cứng *Kiểm tra*/*Huỷ* bằng nút sinh từ **đồ thị trạng thái**.

Cũng tách đúng hai trường bản trước gộp làm một: `confirmed_defect` (*"kiểm tra
ra bệnh gì"*) và `note` (*"vì sao chuyển trạng thái"*).

### 2i.6 🐞 Hai lỗi của Mini App — KHÔNG port sang

1. **Luồng "mất mã" đánh rơi `accessories_received` và `received_condition`.**
   `createWarrantyCase` gửi chúng ở **cả hai** nhánh. Hồ sơ tạm là loại hay có
   tranh chấp nhất — mất thông tin phụ kiện ở đúng đó là mất nó ở chỗ cần nhất.
2. **Timeline và danh sách file: lỗi tải bị biến thành danh sách rỗng.**
   Timeline rỗng trông y hệt *"hồ sơ chưa có xử lý nào"* — với hồ sơ đang Sửa
   chữa thì đó là điều không thể đúng. `fetchWarrantyEvents` để lỗi nổi lên.

### 2i.7 Bằng chứng

| Tệp test | Số test | Canh điều gì |
|---|:--:|---|
| `__tests__/warrantyWrite.test.ts` | 43 | nhóm 🔴 canh riêng K và **mọi** method `DELETE`; payload hai nhánh; `multipart` đúng một thao tác |
| `__tests__/warrantyFlow.test.tsx` | 47 | đồ thị trạng thái, không nhảy cóc; `CHECKING` chứ không `INSPECTING`; hai trường ghi chú tách bạch |

Toàn bộ: `npx tsc --noEmit` sạch · `npx eslint .` sạch · **675/675 test qua**
(2026-09-06).

⚠️ **Chưa chạy thật.** Chưa có request ghi nào của bất kỳ luồng nào gửi lên máy
chủ.

### 2i.8 Ràng buộc còn nguyên

- 🔴 **K chưa duyệt**, và **không method `DELETE` nào** được mở.
- `GATE_01 §11` #4 — **166 endpoint ghi** còn lại vẫn bị chặn.
- `Idempotency-Key` sáu thao tác; `If-Match` ba; `multipart` một.
- `wmsGateApproved` vẫn `false` ở cả hai môi trường.

---

## 2j. 🔓 Change Control 2026-09-06 — thêm module native chọn ảnh

### 2j.1 Quyết định

> **"duyệt thêm thư viện chọn ảnh đi"** — người dùng, 2026-09-06.

`GATE_01 §11` #2 cấm tự thêm module native của bên thứ ba. Đây là ngoại lệ được
duyệt cho **một** thư viện: `react-native-image-picker@8.2.1`, ghim đúng phiên
bản (`--save-exact`).

Không có nó thì phần **J** (`POST warranty-cases/{id}/attachments`) tuy đã đấu
xong tầng gọi vẫn **không dùng được** — không có đường nào để người dùng chọn
file. Đó là ảnh 46, ảnh duy nhất trong 47 ảnh chưa có màn.

### 2j.2 ✅ Không thêm quyền nào — và đó là kết quả kiểm chứng, không phải may

`AndroidManifest.xml` cố ý **gỡ** `READ_EXTERNAL_STORAGE` và
`WRITE_EXTERNAL_STORAGE` bằng `tools:node="remove"`, kèm ghi chú:

> *"⚠️ Nếu sau này nghiệp vụ cần chụp ảnh hiện trạng hàng hoá thì phải bỏ hai
> dòng `tools:node="remove"` này, KHÔNG lách bằng cách khác."*

Nghiệp vụ **đã** cần. Nhưng kiểm chứng trước khi đụng vào cho kết quả khác:

| Kiểm | Kết quả |
|---|---|
| Manifest của thư viện | **không khai quyền nào** — chỉ một `FileProvider` |
| Cách chọn ảnh | `PickVisualMedia` (`ImagePickerModuleImpl.java:27,139-152`) — photo picker Android, **API 33+ không đòi quyền** |
| `checkSelfPermission` / `READ_MEDIA_*` trong module | **không có dòng nào** |
| Chụp ảnh mới | dùng `CAMERA`, đã khai sẵn cho máy quét |

⇒ **Hai dòng `tools:node="remove"` giữ nguyên.** Khôi phục chúng "cho chắc" là
thêm quyền thừa vào bản rà soát bảo mật — đúng thứ ghi chú cũ muốn tránh. Với
`targetSdk 36`, Android còn bỏ qua chúng cho media.

Có test khoá điều này: manifest **không được** xuất hiện `READ_MEDIA_IMAGES` /
`READ_MEDIA_VIDEO`, và manifest thư viện **không được** có `uses-permission`.

### 2j.3 Ba quyết định trong lớp bọc

| Quyết định | Vì sao |
|---|---|
| `includeBase64: false` | Một video 300MB thành chuỗi base64 sẽ ăn hết bộ nhớ rồi app chết **trước khi** tải được gì |
| `saveToPhotos: false` | Ảnh hiện trạng hàng hoá là **dữ liệu nghiệp vụ**, không phải ảnh cá nhân của thủ kho |
| Kiểm giới hạn **cộng dồn** trong một lần chọn | Đã có 8 ảnh, chọn thêm 3 ⇒ hai ảnh đầu hợp lệ, ảnh thứ ba vượt trần. Kiểm từng ảnh với cùng `counts` ban đầu sẽ cho cả ba qua |

Chọn được nhưng có tệp hỏng ⇒ **giữ phần hợp lệ** (`partial`), không bỏ hết:
chọn 5 ảnh mà 1 quá nặng thì 4 ảnh kia vẫn dùng được.

### 2j.4 🔴 Hệ quả của việc K chưa duyệt

Tách bạch hai danh sách:

| Danh sách | Bỏ được không |
|---|---|
| **Chờ tải** (đã chọn, chưa gửi) | ✅ bỏ thoải mái |
| **Đã tải lên** | ❌ **không** — `DELETE` chưa duyệt |

Cho bỏ ở danh sách chờ là chỗ **duy nhất còn cứu được**: người dùng nhìn lại
trước khi bấm Tải lên, thay vì phát hiện sau khi đã gửi.

Tải **tuần tự**, tệp hỏng ở lại hàng chờ để thử lại. ⚠️ Không có
`Idempotency-Key` (spec không khai) ⇒ gửi trùng tạo **hai bản ghi file**; chống
bấm hai lần bằng cờ `uploading` ở tầng giao diện.

### 2j.5 Bằng chứng

`__tests__/attachmentPicker.test.ts` — **23 test**, gồm nhóm 🔒 khoá việc
**không thêm quyền nào**. Module native được mock ở `jest.setup.js` và mock đó
**ném lỗi nếu bị gọi thật** — mọi test đều phải tiêm bản giả.

⚠️ **Bắt buộc dựng lại APK.** Thêm module native nghĩa là bản đang cài trên máy
đã cũ: JS sẽ gọi một module không có trong binary và crash.

---

## 3. Hạng mục bắt buộc xác nhận

| # | Hạng mục | Bằng chứng cần có | Kết quả |
|:--:|---|---|:--:|
| 1 | **Chủ sở hữu 42 endpoint** | Tên đội/người chịu trách nhiệm | ⬜ |
| 2 | **OpenAPI/Swagger/Postman chính thức** hoặc contract được chủ sở hữu **ký duyệt** | File hoặc văn bản ký duyệt | ⚠️ **Có spec** `WMS_HoaNam API v2.0.0`, OpenAPI 3.0.0, 277 path / 340 operation. **Chưa có ký duyệt** |
| 3 | **Môi trường** development / staging / production | Xác nhận bằng văn bản | ✅ **ĐÓNG 2026-09-06** — hạ tầng cung cấp bảng tách **hai** tier theo cổng Nginx + stack + database (xem §2f.1). Không còn "staging": `WMS_DEPLOYMENT_TIER` ∈ {`dev-test`, `customer-production`}. `APP_ENV` từng gây hiểu nhầm đã được tách khỏi khái niệm tier |
| 4 | **Base URL từng môi trường** | Danh sách URL | ✅ **ĐÓNG 2026-09-06** — `dev-test` → `khohoanamdev.lptech.info.vn` (Green, `:18082`, `wms_hoanam_green`, không qua Cloudflare); `customer-production` → `khohoanamdev.bigk.click` (Blue, `:18081`, `wms_hoanam_blue`, sau Cloudflare) |
| 5 | **Cơ chế authentication** | Loại token (JWT/opaque), TTL, refresh | ✅ **ĐÓNG 2026-09-05** — JWT HS256 ở `access_token`; `expires_in` trả kèm mọi phản hồi; `refresh_token` 86 ký tự, route `POST /auth/refresh` **public**; TTL hợp đồng **60 phút**, refresh **14 ngày trượt**. Rotation thu hồi token cũ ngay; replay huỷ sạch phiên. [§4h](../03-api-contract-delta.md) · TTL runtime đã xác nhận ở mục 17 |
| 6 | **Tài khoản test** qua kênh an toàn | Cấp qua trình quản lý mật khẩu / kênh nội bộ | ⚠️ Đã có tài khoản **`warehouse-keeper-01@gmail.com`** đúng vai thủ kho (dùng để đo §4h). 🔴 Mật khẩu tài khoản **admin** dùng lần trước **đã lộ trong hội thoại → phải đổi** |
| 7 | **Idempotency phía server** | Server có xử lý `Idempotency-Key` không, ngữ nghĩa thế nào | ⚠️ **CÓ — 48 endpoint.** Spec ghi: *8–100 ký tự · cùng key+payload → replay · cùng key khác payload → **409** · sai độ dài → **422***. 🔴 **Chưa kiểm chứng trên staging** |
| 8 | **Duplicate / conflict handling** | Tiêu chí phát hiện trùng, mã trả về khi xung đột, ngữ nghĩa `If-Match` | ⚠️ **CÓ — `If-Match` trên 75 endpoint.** Optimistic locking theo cột `version`: thiếu header → **428 PRECONDITION_REQUIRED**, sai version → **412 STALE_VERSION**. 🔴 **Chưa kiểm chứng** |
| 9 | **Error schema** | Danh mục `error_code` đầy đủ; trường chuẩn là `error_code`, `code` hay `error.code` | ⚠️ **147 mã lỗi** khai trong spec; 339/340 operation khai đủ 400/401/403/404/409/412/422/428/500. Envelope **lỗi 401 thật** mang **cả** `error_code` lẫn `error.code` ([§4b.4](../03-api-contract-delta.md)); envelope **thành công thật** có 2 biến thể `{data,links,meta,success}` / `{data,meta,success}` ([§4e.3](../03-api-contract-delta.md)). 🔴 **Chưa thấy envelope của 4xx/5xx khác 401** |
| 10 | **CORS và `/api/*` public** — có chủ đích hay không | Xác nhận từ chủ sở hữu hệ thống | ⬜ |
| 11 | **Contract test với staging** | Kết quả chạy thật trên staging | ⚠️ **Phần ĐỌC đã xong** — người dùng chạy `wms-contract-auth.py` 2026-09-05: đăng nhập 200, **11/11 GET → 200** ([§4e.2](../03-api-contract-delta.md)). 🔴 **Phần GHI chưa và sẽ không chạy** khi `GATE_01 §11` #4 còn hiệu lực |
| 12 | **Nguồn của `version` cho `If-Match`** | Client đọc số nguyên `version` ở trường nào, và server chấp nhận định dạng nào | ✅✅ **ĐÓNG HẲN 2026-09-06 — đo thật trên máy.** Nguồn: `data.version` (đóng 2026-09-05). **Định dạng: số trần, không dấu nháy** — `POST outbound-documents/{id}/post-issue` với `If-Match: 4` **thành công**, không lỗi. Đây là lần Post Issue thật đầu tiên; xem `04-live-run-report.md` |
| 13 | 🆕 **Bảo hành dùng khoá khác** | Trường khoá chính của `warranty-cases` | 🔴 **Bản ghi bảo hành KHÔNG có `id`** — dùng `warranty_case_id` + `warranty_case_code`. Phiếu nhập/xuất dùng `id` (UUID). Tầng API **không viết được hàm dùng chung**. [§4f.4](../03-api-contract-delta.md) |
| 14 | 🆕 **Spec thiếu trường so với API thật** | Spec có đầy đủ không | 🔴 **Không.** `create_idempotency_key`, `retention_until`, `legal_hold_flag` server **có trả** nhưng spec nhắc **0 lần**. Không được coi spec là nguồn chân lý duy nhất khi sinh types. [§4f.3](../03-api-contract-delta.md) |
| 15 | **5xx có rollback không** | Xác nhận bằng văn bản + kiểm chứng | ✅ **ĐÓNG bằng QUYẾT ĐỊNH 2026-09-05** — người dùng chọn **chính sách an toàn**: 500/502/503/504/timeout/mất kết nối đều `unknown`, bất kể spec cam kết rollback. Kèm 4 điều kiện để nới riêng cho 500 và quy tắc dùng lại đúng Idempotency-Key. Đã hiện thực + test. [§4k.1](../03-api-contract-delta.md) |
| 16 | 🆕 **Cloudflare allowlist cho app native** | UA app qua được biên | ✅ **ĐÓNG 2026-09-05** — UA `WMSHoaNam-Android/1.0` đo thật trên `bigk.click` → **401 từ ứng dụng** (qua biên). ⚠️ Hai điểm mô tả của hạ tầng không khớp phép đo, xem [§4j.2–4j.3](../03-api-contract-delta.md). ✅ **Đã kiểm trên Xiaomi 12 Pro / Android 13** — echo server cục bộ chứng minh OkHttp **không** ghi đè UA; probe qua mạng thật → 401 từ ứng dụng ở cả hai host. [§4j.4](../03-api-contract-delta.md) |
| 17 | 🆕 **TTL runtime của JWT** | Giá trị đang chạy, không phải trong .env | ✅ **ĐÓNG 2026-09-05**, cập nhật 2026-09-06 — DEV/TEST **tạm nâng lên 24 giờ**, refresh token giữ 14 ngày. App đọc `expires_in` từ phản hồi nên không cần sửa mã; xem `auth/tokenRefresh.ts` |
| 18 | 🆕 **Hành vi sau khi hết hạn lưu trữ PII** | Cách hiển thị + cách phát hiện | ✅ **ĐÓNG 2026-09-05** — BA chốt UI và chính sách refetch. API **chưa có** cờ `pii_anonymized` ⇒ app tự nhận qua `[ANONYMIZED]`. Yêu cầu cho Prompt 4. [§4k.3](../03-api-contract-delta.md) |

📋 Mẫu thư gửi chủ sở hữu WMS: [USER-ACTION-REQUIRED.md §3.2](../../../USER-ACTION-REQUIRED.md)

📊 Báo cáo đối chiếu spec thật vs giả định client: [03-api-contract-delta.md](../03-api-contract-delta.md)

---

## 4. Khoảng trống đã biết (từ audit `GATE_01`)

| # | Phát hiện | Nguồn |
|:--:|---|---|
| 1 | **Không tồn tại tài liệu API nào** cho WMS — đã tìm toàn ổ đĩa kể cả bản backup `.tmp/` | [01-api-inventory.md §4](../01-api-inventory.md) |
| 2 | **Không có bằng chứng** server hỗ trợ `Idempotency-Key`, duplicate detection hay conflict handling | [01-api-inventory.md §5.2](../01-api-inventory.md) |
| 3 | Client chấp nhận **≥8 vị trí** khác nhau cho token và **5 vị trí** cho user ⇒ contract thật chưa từng được biết rõ | [01-api-inventory.md §3.2](../01-api-inventory.md) |
| 4 | Client đọc mã lỗi từ **cả 3 trường** khác nhau ⇒ shape lỗi không nhất quán | `api-client.ts:319-322` |
| 5 | Môi trường `khohoanamdev.bigk.click` **chưa xác nhận** là dev/staging/prod | — |
| 6 | `client_scan_id` unique ở DB **không phải** server-side idempotency | [01-api-inventory.md §5.1](../01-api-inventory.md) |
| 7 | Phát hiện bảo mật **B-01** trên `mini.lptech.info.vn` — chỉ báo cáo, không khai thác | [01-backend-audit.md §4](../01-backend-audit.md) |

---

## 5. Điều kiện PASS

| # | Điều kiện |
|:--:|---|
| 1 | 11 hạng mục §3 đều có bằng chứng |
| 2 | Contract chính thức được chủ sở hữu ký duyệt, đối chiếu xong với `wms-external-api.draft.yaml` |
| 3 | Contract test chạy **thật trên staging**, không phải mock |
| 4 | Hành vi idempotency + conflict được xác nhận bằng văn bản **và** kiểm chứng trên staging |
| 5 | Tài khoản test hoạt động, cấp qua kênh an toàn |
| 6 | Chỉ khi đó `wms-external-api.draft.yaml` mới được đổi nhãn khỏi `CLIENT_EXPECTED_CONTRACT` |

---

## 6. Trạng thái hiện tại

> ⚠️ **Sửa lỗi 2026-09-05.** Bản trước của mục này ghi *"Chưa từng gọi bất kỳ
> endpoint WMS nào trong dự án này"*. Câu đó **nay đã sai**: ngày 2026-09-05
> đã chạy contract test **đọc** trên staging (không token ở §4b, có token ở §4e).
> Giữ lại nguyên văn câu cũ ở đây để không xoá dấu vết một tuyên bố đã lỗi thời.

| Hạng mục | Trạng thái |
|---|---|
| Contract chính thức | ⚠️ **Có spec** OpenAPI 3.0.0 (277 path / 340 operation) — **chưa được chủ sở hữu ký duyệt** |
| Môi trường | ✅ staging xác nhận bằng văn bản (người dùng, 2026-09-05) |
| Base URL | ⚠️ 2 hostname cùng trỏ 1 ứng dụng; origin lộ ra ngoài — [§4d](../03-api-contract-delta.md) |
| Tài khoản test | ⛔ Chưa cấp qua kênh an toàn (mật khẩu admin đã lộ trong hội thoại — **cần đổi**) |
| Idempotency phía server | ⚠️ Spec tài liệu hoá 48 endpoint — ⛔ **chưa kiểm chứng** (cần request ghi) |
| Conflict handling | ⚠️ Spec tài liệu hoá 75 endpoint — ⛔ **chưa kiểm chứng** (cần request ghi) |
| Nguồn `version` cho `If-Match` | 🔴 **MỞ — chặn mọi endpoint ghi** (mục 12 §3) |
| Contract test — phần **ĐỌC** | ✅ **Đã chạy thật**: đăng nhập 200 · 11/11 GET → 200 |
| Contract test — phần **GHI** | ⛔ **Chưa chạy, và sẽ không chạy** khi `GATE_01 §11` #4 còn hiệu lực |
| Inventory 42 endpoint | ✅ Đã lập từ call-site (`CLIENT_EXPECTED_CONTRACT`) |

### 6.1 Ranh giới của những gì đã chạy

**Đã làm:** đăng nhập (do *người dùng* chạy script trên máy họ) và **chỉ GET**.

**Chưa làm và không tự ý làm:** không một request ghi nào — 134 POST, 31 PATCH,
8 DELETE, 2 PUT trong spec đều **chưa từng được gọi**. Trong số đó có
`DELETE /api/v1/roles/{id}`, `DELETE /api/v1/users/{id}/permissions/{permissionId}`,
`POST …/post-receipt` (thay đổi tồn kho thật) và `POST …/reversals`.

**Tôi không đăng nhập bằng mật khẩu của người dùng.** Script đọc credential từ
biến môi trường trên máy người dùng; mật khẩu và token không đi qua hội thoại này.

### 6.2 Đường tới PASS — còn thiếu gì

| Còn mở | Ai trả lời được |
|---|---|
| Nguồn của `version` (mục 12) | chủ backend WMS — hoặc `wms-version-probe.py` trả lời được phần lớn |
| TTL và refresh token (mục 5) | chủ backend WMS |
| Chủ sở hữu endpoint (mục 1) | người dùng |
| Tài khoản **chỉ đọc** (mục 6) | người dùng / quản trị |
| `/api/*` public có chủ đích không (mục 10) | quản trị hệ thống |
| Ký duyệt contract (mục 2) | chủ sở hữu WMS |
| Kiểm chứng idempotency + conflict (mục 7, 8) | **cần request ghi** ⇒ chỉ sau khi có môi trường được phép ghi và có phê duyệt bằng văn bản |
