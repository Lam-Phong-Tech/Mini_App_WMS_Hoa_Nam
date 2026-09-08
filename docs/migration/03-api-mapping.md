# 03 — API mapping

**Commit nguồn:** `663114aff6804e50b77b88e05dda9f9c784d6fff`
**Phạm vi:** Prompt 3 §E (API client).

> Tài liệu này **không lặp lại** inventory endpoint. Nguồn duy nhất cho danh sách endpoint là [01-api-inventory.md](01-api-inventory.md) — Nhóm A (12 endpoint có controller thật) và Nhóm B (~42 endpoint suy từ call-site, nhãn `CLIENT_EXPECTED_CONTRACT`).

---

## 1. Quyết định: giữ `fetch`, KHÔNG chuyển sang Axios

Prompt 3 §E ghi *"Chuyển các request Zalo/Web hiện tại sang Dio hoặc Axios"*. Khi được hỏi, người dùng chọn **"Giữ `fetch`"** (2026-09-05).

| Yêu cầu Prompt 3 §E | `fetch` client hiện tại đáp ứng thế nào |
|---|---|
| Interceptor | ⚠️ **Tương đương, không phải cơ chế đăng ký được.** `fetch` không có API interceptor; mọi request đi qua **một** hàm `request()` tập trung: gắn `Authorization`, chặn header cấm, chặn theo Gate, ghi log |
| Timeout | ✅ `AbortController` + `setTimeout`, cấu hình theo môi trường |
| Huỷ request khi unmount | ✅ nhận `signal` từ bên ngoài, **phân biệt được** `cancelled` với `timeout` |
| Map lỗi mạng / timeout / HTTP / nghiệp vụ | ✅ `AppError` — 9 `kind`, xem §2 |
| Redact token khỏi log | ✅ `logger.ts:20` che `authorization\|token\|password\|secret\|api-key\|cookie\|session\|credential\|otp\|pin`; `:69` che cả query string |
| Không CORS proxy, không tắt bảo mật | ✅ 0 kết quả khi quét; cleartext chỉ bật ở bản debug qua manifest placeholder của RN gradle plugin |

**Lý do giữ `fetch`:** client hiện tại đã đủ mọi năng lực §E và có **22 test** bảo vệ. Thêm Axios là thêm một dependency mà không thêm năng lực nào, đổi lại phải viết lại toàn bộ 22 test đó.

📄 [`src/api/client.ts`](../../apps/wms-mobile/src/api/client.ts)

---

## 2. Bảng map lỗi

| Tình huống | `AppError.kind` | HTTP | Thông điệp người dùng |
|---|---|:--:|---|
| Không gọi được máy chủ | `network` | — | *"Không có kết nối mạng…"* |
| Quá thời gian chờ | `timeout` | — | *"Máy chủ phản hồi quá lâu…"* |
| Bên gọi huỷ | `cancelled` | — | *"Yêu cầu đã bị huỷ."* |
| Phản hồi không phải JSON hợp lệ | `parse` | 2xx | *"Máy chủ trả về dữ liệu không đọc được."* |
| Phiên hết hạn | `auth` | 401 | *"Phiên đăng nhập đã hết hạn…"* |
| Lỗi HTTP khác | `http` | 4xx/5xx | 5xx → *"Máy chủ đang gặp sự cố…"* · 4xx → *"Yêu cầu không hợp lệ."* |
| Môi trường chưa có base URL | `config` | — | *"Ứng dụng chưa được cấu hình máy chủ…"* |
| Bị chốt chặn Gate | `blocked_by_gate` | — | nguyên văn lý do chặn |
| Còn lại | `unknown` | — | *"Đã xảy ra lỗi…"* |

Mã lỗi nghiệp vụ đọc theo **cả ba dạng** mà Mini App cũ gặp: `error_code` · `code` · `error.code` — giữ nguyên hành vi client cũ, không phát minh dạng mới.

📄 [`src/errors/AppError.ts`](../../apps/wms-mobile/src/errors/AppError.ts)

---

## 3. 🔴 Endpoint nghiệp vụ — CHƯA đấu nối lời nào

| Nhóm | Số endpoint | Đã đấu nối vào app RN? |
|---|:--:|:--:|
| A — `backend/` (có controller thật) | 12 | ❌ **Không** |
| B — WMS ngoài (từ call-site) | ~42 | ❌ **Không** |

**Chưa một endpoint nghiệp vụ nào được gọi từ app RN.** Lý do:

1. `GATE_WMS_API_INTEGRATION` **vẫn BLOCKED** — chưa có contract chính thức.
2. GATE_01 §11 điều 4 **vẫn cấm** gọi mutation thật lên WMS.
3. Prompt 3 §E đòi giữ *"semantics **đã xác minh**"* — Nhóm B chưa từng đối chiếu với server thật.

Việc đấu nối thuộc **Prompt 4**, sau khi Gate WMS PASS.

### 3.1 Chốt chặn đang cưỡng chế điều đó

| Chốt | Cưỡng chế ở đâu | Test |
|---|---|:--:|
| Cấm mọi method ngoài GET/HEAD khi `wmsGateApproved === false` — **không gọi `fetch`** | `client.ts` | 6 ca |
| Cấm header `Idempotency-Key` ở mọi đường | `FORBIDDEN_HEADERS` + `assertNoForbiddenHeaders()` | 3 ca |
| Không có cơ chế retry nào trong client | `client.ts` — không tồn tại | 1 ca |
| `environmentClassVerified: false` cho `khohoanamdev.bigk.click` | `env.ts` | 2 ca |

Cả ba môi trường hiện đều `wmsGateApproved: false`, có test khẳng định điều đó không bị đổi lén.

---

## 4. Bộ gửi của hàng đợi offline

`gateBlockedSender` ném `blocked_by_gate` thay vì gọi mạng — xem [03-offline-sync.md §4](03-offline-sync.md).

> ❗ Đây là **từ chối thẳng thắn có thể quan sát được**, không phải mock giả vờ thành công. Bản ghi quay về `pending` kèm lý do; **không bao giờ** bị đánh dấu `synced` sai sự thật.

---

## 5. Zalo SDK — không còn chỗ nào

| Kiểm tra trong `apps/wms-mobile/` | Kết quả |
|---|:--:|
| `grep -rn "zmp-sdk" src/` | **0** |
| `grep -rn "zmp-ui" src/` | **0** |
| `grep -rn "scanQRCode" src/` | **0** |
| `grep -rn "localStorage\|sessionStorage" src/` | **0** |

App RN **không có một dòng phụ thuộc Zalo nào**. Mini App cũ ở `src/` vẫn giữ nguyên — GATE_01 Q6 chốt *"chỉ sửa UI/UX trên app mới"*.


---

## 🆕 Contract luồng NHẬP KHO đầy đủ — người dùng cung cấp 2026-09-06

> Đã đối chiếu **8/8 endpoint đều có trong spec** `WMS_HoaNam API v2.0.0`.

| Bước | Endpoint | Method | Trạng thái sau `GATE_WMS §2e` (2026-09-06) |
|---|---|:--:|---|
| Lấy kho nhận | `/api/v1/warehouses?status=ACTIVE&per_page=50` | GET | ✅ **đã đấu** — `features/inbound/useWarehouses.ts` |
| Resolve từng mã | `/api/v1/mini-app/inbound/resolve-code` | **POST** | ✅ **DUYỆT (A)** — `services/wms/inboundWrite.ts#resolveCode` |
| Đối chiếu SKU | `/api/v1/products?status=ACTIVE&per_page=20&keyword=…` | GET | ✅ được phép |
| Ghi nhận cả lô | `/api/v1/mini-app/inbound/record` | **POST** | ✅ **DUYỆT (B)** — `inboundWrite.ts#record` + `sync/inboundSender.ts` |
| Chi tiết phiếu | `/api/v1/mini-app/inbound-documents/{id}` | GET | ✅ được phép |
| Mã trong phiếu | `/api/v1/mini-app/inbound-documents/{id}/scan-entries?status=ACTIVE&per_page=200` | GET | ✅ được phép |
| Danh sách chờ duyệt | `/api/v1/mini-app/inbound-documents?status=WAITING_APPROVAL&per_page=10` | GET | ✅ đã dùng |
| **Post Receipt** | `/api/v1/mini-app/inbound-documents/{id}/post-receipt` | **POST** | ✅ **DUYỆT (C) 2026-09-06** — `inboundWrite.ts#postReceipt` + `approvals/usePostReceipt.ts`. Đòi preflight tier ngay trước khi gửi |
| Lịch sử | `/api/v1/mini-app/inbound-documents?per_page=25` | GET | ✅ đã dùng |

### Payload ba endpoint ghi — trích nguyên từ spec

```
POST /api/v1/mini-app/inbound/resolve-code
  body: warehouse_id* , raw_code*
  spec: "chỉ resolve SKU/item identity, KHÔNG tạo document, KHÔNG tạo scan
         evidence, KHÔNG tạo movement và KHÔNG đổi tồn"

POST /api/v1/mini-app/inbound/record
  header: Idempotency-Key
  body: name* , dst_warehouse_id* , expected_total_qty* , items* [raw_code, scan_source]
        , doc_date , note
  spec: "validate toàn batch, chống duplicate, group theo SKU, tạo receipt +
         lines + toàn bộ scan evidence trong MỘT DB transaction. Lỗi bất kỳ
         item nào sẽ rollback toàn bộ."

POST /api/v1/mini-app/inbound-documents/{id}/post-receipt
  header: If-Match , Idempotency-Key
  spec: "stock mutation cuối của luồng Mini App. Chỉ SCANNING full-scan mới
         được Post. Sau thành công document=POSTED và tồn kho mới tăng."
```

### Ba lệnh cấm — trạng thái sau `§2e`

| Lệnh cấm | Nguồn | Còn chặn gì |
|---|---|---|
| Không gọi endpoint **ghi** | `GATE_WMS §2d`, nới bởi `§2e` + `§2f` | 🔴 **172 endpoint ghi còn lại**, gồm cả `post-issue` của luồng xuất |
| Không gắn header **`Idempotency-Key`** | `GATE_01 §11` #6 — cưỡng chế trong `api/client.ts` | 🔴 mọi nơi **trừ** `record` và `post-receipt` |
| Không gửi **`If-Match`** | Gate WMS mục 12 | 🔴 mọi nơi **trừ** `post-receipt` |

⇒ Luồng nhập kho đã đấu **đủ ba bước**, tới tận lệnh tăng tồn. Luồng **xuất**
kho và bảo hành vẫn chưa có endpoint ghi nào được duyệt.

🔒 Riêng `post-receipt` còn một chốt nữa không endpoint nào khác có: **preflight
tier**. Nó gọi lại `GET /api/v1/health` ngay trước khi gửi và từ chối nếu header
`X-WMS-Deployment-Tier` không khớp bản dựng — xem `GATE_WMS §2f.3`.

`resolve-code` là trường hợp riêng: nó là **POST nhưng spec khẳng định không
thay đổi gì** — cùng loại lý do đã dùng để miễn ba đường auth ở `§2c`.

### Nơi cưỡng chế

| Lớp | Tệp | Vai trò |
|:--:|---|---|
| 1 | `apps/wms-mobile/src/services/wms/tierCheck.ts` | đang nói chuyện với **sai stack** |
| 2 | `apps/wms-mobile/src/api/client.ts` | chặn mọi method khác GET/HEAD |
| 3 | `apps/wms-mobile/src/api/writeGate.ts` | danh sách trắng theo cặp `METHOD` + đường dẫn, khớp **từng đoạn** |
| 4 | `apps/wms-mobile/src/services/wms/inboundWrite.ts` | chốt ngay tại tầng nghiệp vụ |

Lớp 1 khác hẳn ba lớp kia: ba lớp dưới hỏi *"thao tác này có được phép không"*,
còn nó hỏi *"ta đang nói chuyện với ai"*. Một câu hỏi về quyền, một câu hỏi về
sự thật — và chỉ máy chủ trả lời được câu thứ hai.

Bằng chứng: **484/484 test qua** (2026-09-06); chi tiết ở `GATE_WMS §2f.7`.


---

## 🆕 Contract luồng XUẤT KHO — người dùng cung cấp 2026-09-06

> Đã đối chiếu với `src/services/scan.service.ts` của Mini App đang chạy.

### Nguyên tắc luồng

Phiên tạo **tạm trên máy** trước; chỉ tạo phiếu thật trên WMS khi bấm *"Xác nhận
ghi nhận"* sau khi quét đủ mã. Giống hệt luồng nhập — và khác hẳn nhánh
`POST /outbound-documents` (tạo draft) vốn **có trong service nhưng không màn
nào gọi**.

| Bước | Endpoint | Method | Trạng thái trong app RN |
|---|---|:--:|---|
| Lấy kho mặc định | `/api/v1/warehouses?status=ACTIVE&per_page=50` | GET | ✅ **đã đấu** — `useWarehouses`, chọn sẵn kho đầu tiên |
| Chọn Tỉnh/Thành | `https://provinces.open-api.vn/api/v2/` | GET | ✅ **đã đấu** — `services/geo/provinces.ts`, cache 24h |
| Chọn Phường/Xã | `…/api/v2/p/{provinceCode}?depth=2` | GET | ✅ **đã đấu** — chỉ gọi sau khi chọn tỉnh |
| Kiểm tra từng mã | `/api/v1/mini-app/outbound/resolve-code` | **POST** | ✅ **DUYỆT (D) 2026-09-06** — `outboundWrite.ts#resolveOutboundCode`, chạy mỗi lần quét |
| Ghi nhận cả lô | `/api/v1/mini-app/outbound/record` | **POST** | ✅ **DUYỆT (E) 2026-09-06** — `outboundWrite.ts#recordOutbound` + `sync/outboundSender.ts` |
| Chi tiết phiếu | `/api/v1/mini-app/outbound-documents/{id}` | GET | ✅ được phép |
| Danh sách phiếu | `/api/v1/mini-app/outbound-documents?…` | GET | ✅ **đã đấu** |
| **Post Issue** | `/api/v1/mini-app/outbound-documents/{id}/post-issue` | **POST** | ✅ **DUYỆT (F) 2026-09-06** — `outboundWrite.ts#postIssue` + `approvals/usePostIssue.ts` (duyệt hàng loạt) |

### 🔴 Hai lệnh đổi tồn kho — ràng buộc riêng

`post-receipt` và `post-issue` là **hai thao tác duy nhất** trong danh sách
trắng đổi tồn kho thật. Cả hai mang thêm ba ràng buộc mà bốn thao tác kia không
có: **preflight tier ngay trước khi gửi**, **`version` bắt buộc** (không mặc
định), và **hộp xác nhận nêu số lượng**.

Hậu quả khi nhầm không đối xứng:

| | Post nhầm | Phát hiện thế nào |
|---|---|---|
| **Nhập** | tồn **dư** ra | lần đếm nào cũng thấy thừa hàng |
| **Xuất** | tồn **thiếu** đi trong khi hàng vẫn trên kệ | sổ và kho lệch nhau **im lặng** tới kỳ kiểm kê |

🔧 **Bản kiểm kê spec của tôi khai thiếu `If-Match` cho `post-issue`**
(`openapi/wms-external-api.draft.yaml:128`). Mã đang chạy gửi cả hai header
(`scan.service.ts:1747-1748`) — mô tả người dùng đúng. Tin bản kiểm kê thì app
sẽ ăn `428` ở đúng thao tác nguy hiểm nhất.

Xem `GATE_WMS §2h`.

### ✅ Đã sửa nhờ mô tả này

| Việc | Trước | Sau |
|---|---|---|
| **Lọc phiếu xuất chờ duyệt** | `?status=SCANNING` + lọc bù ở client ⇒ lọt phiếu **đang quét dở**, số đếm cao hơn thực tế | `?ready_for_post=true&ready_for_issue=true` — máy chủ lọc, không lọc bù. **Đóng câu hỏi 18** |
| **Xoá từng mã** ở màn kiểm tra | ❌ chưa có (bạn tự đánh dấu *"chưa đạt"*) | ✅ vuốt trái để xoá, kèm `accessibilityAction` cho TalkBack |
| **Kho xuất** | ❌ không có trong form ⇒ phiếu không gửi được | ✅ chọn sẵn kho đầu, chặn ở bước 1 nếu thiếu |
| **Số điện thoại** | chỉ kiểm rỗng | ✅ đúng 10 số, đầu 03/05/07/08/09; lọc ký tự lạ lúc gõ |
| **Số lượng** | không có trần | ✅ 1–1000 |
| **`scan_source`** | ❌ mất khi rời màn quét | ✅ giữ tới payload |
| **Nhóm đối tượng** | mã tự đặt `DAI_LY` | ✅ enum thật, gộp vào `note` đúng định dạng app cũ |

### 🟡 Hai rủi ro đã ghi vào `USER-ACTION-REQUIRED.md`

- **Mục 21** — `recipient_type` gộp vào `note` ⇒ không thống kê theo nhóm được.
- **Mục 22** — `provinces.open-api.vn` là dịch vụ ngoài, không SLA, mà Tỉnh và
  Phường là trường **bắt buộc**.

### 🔒 Token WMS không rời khỏi WMS

`services/geo/provinces.ts` dùng `fetch` **trần**, không header xác thực nào.
Gọi dịch vụ bên thứ ba qua `apiClient` sẽ gửi bearer token kho hàng sang một máy
chủ không liên quan. Có test quét mã nguồn khoá điều này
(`__tests__/outboundGeo.test.tsx`).


---

## 🆕 Contract luồng BẢO HÀNH — người dùng cung cấp 2026-09-06

> Đã đối chiếu với `src/services/warranty-flow.service.ts` và
> `src/pages/WarrantyDetailPage/index.tsx` của Mini App đang chạy.

**Không có "duyệt hàng loạt".** Bảo hành là workflow trạng thái **từng hồ sơ**,
không phải lệnh đổi tồn kho như Post Issue. Đây là khác biệt kiến trúc, không
phải tính năng còn thiếu.

| Phần UI | Endpoint | Method | Trạng thái trong app RN |
|---|---|:--:|---|
| Quét/nhập mã bảo hành | `/api/v1/mini-app/warranty/resolve-code` | **POST** | ✅ **DUYỆT (G)** — `warrantyWrite.ts#resolveWarrantyCode` |
| Danh mục lỗi | `/api/v1/defects?status=ACTIVE&per_page=100` | GET | ⚠️ được phép, nhưng **403 với vai Thủ kho** |
| Tỉnh/Phường | `provinces.open-api.vn` | GET | ✅ đã đấu (dùng chung luồng xuất) |
| Tạo hồ sơ | `/api/v1/mini-app/warranty-cases` | **POST** | ✅ **DUYỆT (H)** — `createWarrantyCase`; gửi phụ kiện ở **cả hai** nhánh |
| Danh sách hồ sơ | `/api/v1/mini-app/warranty-cases?status=…` | GET | ✅ đã đấu |
| Chi tiết | `/api/v1/mini-app/warranty-cases/{id}` | GET | ✅ đã đấu |
| Timeline | `/api/v1/mini-app/warranty-cases/{id}/events` | GET | ✅ **đã đấu** — `fetchWarrantyEvents` |
| Chuyển trạng thái | `/api/v1/mini-app/warranty-cases/{id}/status` | **POST** | ✅ **DUYỆT (I)** — `updateWarrantyStatus` + `useWarrantyTransition` |
| Danh sách file | `/api/v1/mini-app/warranty-cases/{id}/attachments` | GET | ✅ **đã đấu** |
| Tải file lên | `/api/v1/mini-app/warranty-cases/{id}/attachments` | **POST** | ✅ **DUYỆT (J)** — `uploadWarrantyAttachment`. ⚠️ **chưa có đường CHỌN file** (mục 26) |
| Xem/tải file | `/api/v1/mini-app/warranty-attachments/{id}/download` | GET | ✅ **đã đấu** |
| Xoá file | `/api/v1/mini-app/warranty-attachments/{id}` | **DELETE** | 🔴 **KHÔNG DUYỆT (K)** — xoá vĩnh viễn. **Chưa method `DELETE` nào** được mở |

### 🔧 Hai kết luận cũ của tôi được sửa nhờ mô tả này

| Hồ sơ cũ ghi | Thực tế |
|---|---|
| §4b.3: `warranty-attachments/{id}` trả **405** ⇒ đường tải file của client cũ *"không bao giờ chạy được"* | **Sai — tôi đo nhầm đường.** Có **hai** đường: `{id}` cho `DELETE`, `{id}/download` cho `GET`. 405 chỉ nói *"method này không đúng cho đường này"*, không nói gì về đường khác |
| `openapi/…draft.yaml:138`: segment chuyển trạng thái *"CHƯA XÁC ĐỊNH"* | Là `/status` (`warranty-flow.service.ts:311`) |

### 🔴 Một lỗi thật trong app RN, đã sửa

App dùng `INSPECTING`, WMS dùng **`CHECKING`**. Tab *Kiểm tra* gọi
`?status=INSPECTING` ⇒ **luôn rỗng, hoặc 422** — đúng loại lỗi đã bắt được trên
máy thật ở luồng xuất kho. Đã sửa, thêm tab `CANCELLED` còn thiếu, và thay hai
nút cứng *Kiểm tra*/*Huỷ* bằng nút sinh từ **đồ thị trạng thái**.

Cũng đã tách đúng hai trường mà bản trước gộp làm một:
`confirmed_defect` (*"kiểm tra ra bệnh gì"*, bắt buộc khi `CHECKING →
REPAIRING|COMPLETED`) và `note` (*"vì sao chuyển trạng thái"*, bắt buộc khi
đóng hồ sơ).

### 🐞 Hai lỗi của Mini App — KHÔNG port sang

1. **Luồng "mất mã" đánh rơi `accessories_received` và `received_condition`** —
   hàm chuẩn hoá payload chỉ giữ chúng ở nhánh có `item_code`. Hồ sơ tạm vì vậy
   mất thông tin phụ kiện, đúng loại hồ sơ hay có tranh chấp nhất.
2. **Timeline và danh sách file: lỗi tải bị biến thành danh sách rỗng.**
   Timeline rỗng trông y hệt *"hồ sơ chưa có xử lý nào"* — với hồ sơ đang Sửa
   chữa thì đó là điều không thể đúng. `fetchWarrantyEvents` để lỗi nổi lên.
