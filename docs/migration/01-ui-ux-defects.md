# 01 — UI/UX Defects & Risks

**Commit khảo sát:** `663114aff6804e50b77b88e05dda9f9c784d6fff`

## Mức độ xác minh

| Nhóm | Nghĩa |
|---|---|
| **D — Đã xác minh (Defect)** | Có bằng chứng cụ thể: `file:line`, kết quả lệnh, hoặc quan sát trực tiếp trên trình duyệt |
| **R — Nguy cơ cần xác minh (Risk)** | Có cơ sở trong mã nguồn nhưng **chưa chạy thực tế được** → **không khẳng định là lỗi** |

> ⚠️ **Giới hạn quan trọng của đợt khảo sát này:** chỉ **1/18 màn hình** (`AuthStatePage` chế độ `login`) được render và kiểm tra trực quan thật. **17 màn còn lại** nằm sau `AuthGate`, cần tài khoản WMS hợp lệ. **Mọi nhận định về 17 màn đó đều xếp vào nhóm R, không phải D.**

---

## PHẦN D — LỖI ĐÃ XÁC MINH

### D-01 · 🔴 Nghiêm trọng — Base URL chế độ DEV trỏ sai cổng, mọi lời gọi WMS thất bại khi chạy local

**Bằng chứng:**
```
src/services/wms-link-context.ts:72-75
  return (
    import.meta.env.VITE_WMS_DEV_PROXY_BASE_URL ||
    "http://localhost:2999/wms-api"
  );
```
- 🔧 `grep -rn "2999" README.md RUN_ON_OTHER_MACHINE.md vite.config.mts src/ docs/` → **chỉ 1 kết quả duy nhất là chính dòng hardcode trên**.
- ✅ [README.md:73](../../README.md) hướng dẫn mở `localhost:3000`.
- ✅ `VITE_WMS_DEV_PROXY_BASE_URL` **không có** trong [.env.example](../../.env.example), **không có** trong [.env](../../.env.example), **không được nhắc** trong [RUN_ON_OTHER_MACHINE.md](../../RUN_ON_OTHER_MACHINE.md).
- ✅ Proxy `/wms-api` được định nghĩa trong [vite.config.mts](../../vite.config.mts) **trên chính cổng dev server**, không phải 2999.

**Hệ quả:** Lập trình viên mới chạy `npm run start` (cổng 3000) → toàn bộ API WMS gọi sang `http://localhost:2999` → không có service nào lắng nghe → mọi request treo tới khi timeout 12 s ✅ ([api-client.ts:8](../../src/services/api-client.ts)).
🔧 Quan sát trực tiếp: khi chạy dev server ở cổng 5199, app không kết nối được backend.

**Cách khắc phục hiển nhiên:** đặt `VITE_WMS_DEV_PROXY_BASE_URL` hoặc `VITE_WMS_DEV_DIRECT=true` — nhưng cả hai đều **không được tài liệu hoá**.

---

### D-02 · 🟠 Font "Public Sans" được khai báo nhưng **không bao giờ được nạp**

**Bằng chứng:**
- ✅ [src/css/app.scss:70-71](../../src/css/app.scss) đặt `font-family: "Public Sans", system-ui, …`
- ✅ [docs/ui-system-x-vuexy.md](../../docs/ui-system-x-vuexy.md) §2 quy định *"Font: `Public Sans`"* là chuẩn thiết kế.
- 🔧 `grep -rn "@font-face|fonts.googleapis|fonts.gstatic|\.woff|\.ttf|<link" src/css/ index.html app-config.json` → **0 kết quả**.
- ✅ [app-config.json](../../app-config.json) có `"listCSS": []` — không nạp CSS ngoài.
- 🔧 Kiểm tra runtime trong trang đang chạy: `[...document.fonts].map(f=>f.family)` → **`["zaui-icons"]`** — chỉ có icon font của ZaUI, **không có Public Sans**.

**Hệ quả:** Trên thiết bị Android/PDA (không cài sẵn Public Sans), giao diện rơi về Roboto/system-ui. **Typography thực tế không khớp bản thiết kế Vuexy.**

> Ghi chú trung thực: trên máy khảo sát, `document.fonts.check('16px "Public Sans"')` trả về `true` vì **máy Windows này có sẵn font trong hệ điều hành**. Điều đó **không** áp dụng cho thiết bị Android mục tiêu.

---

### D-03 · 🟠 `zaui.css` chiếm ~70% CSS bundle chỉ để phục vụ 2 component

**Bằng chứng (🔧 `wc -c`):**

| File | Bytes |
|---|---|
| `node_modules/zmp-ui/zaui.css` | **120 826** |
| `src/css/app.scss` | 39 146 |
| CSS đã build (`assets/index-*.css`) | **172 191** |

✅ [src/index.ts:2](../../src/index.ts) import toàn bộ `zmp-ui/zaui.css`, trong khi ✅ [src/app.tsx:3](../../src/app.tsx) chỉ dùng `App` và `SnackbarProvider`. Toàn bộ giao diện thật do `app.scss` + Tailwind đảm nhiệm.

---

### D-04 · 🟠 Không có bất kỳ hỗ trợ offline nào

🔧 `grep -rn "navigator\.onLine|\"online\"|\"offline\"" src/` → **0 kết quả**.

| Khả năng | Có? |
|---|---|
| Phát hiện mất mạng | ❌ |
| Hàng đợi thao tác offline | ❌ |
| Tự đồng bộ lại | ❌ |
| Retry/backoff trong `api-client.ts` | ❌ |
| Trạng thái offline trên UI | ❌ (chỉ 2 chuỗi *"kiểm tra kết nối mạng"* cho danh sách tỉnh/thành ✅ DocumentContextPage:283, WarrantyReceivePage:93) |

**Với ứng dụng kho chạy trên PDA trong nhà kho — nơi sóng WiFi/4G thường chập chờn — đây là khoảng trống chức năng lớn nhất.**

---

### D-05 · 🟠 `Idempotency-Key` sinh mới tại chỗ → mất tác dụng khi thử lại

**Dùng đúng (key bền qua các lần thử lại):**
- ✅ [ReceiptCreatePage:25](../../src/pages/ReceiptCreatePage/index.tsx) — `useRef(generateClientScanId())`
- ✅ [OutboundReviewPage:86-87](../../src/pages/OutboundReviewPage/index.tsx) — `recordIdempotencyKey` lưu trong store
- ✅ [receipt-flow.service.ts:1791](../../src/services/receipt-flow.service.ts) — `getLocalReceiptRecordIdempotencyKey`

**Dùng sai (sinh mới mỗi lần gọi):** ✅ receipt-flow.service.ts:500, 754, 802, 848, 909, 923 · scan.service.ts:1695, 1748 · warranty-flow.service.ts:192, 318

`generateClientScanId()` = `crypto.randomUUID()` ✅ [utils/generateClientScanId.ts](../../src/utils/generateClientScanId.ts) → **luôn ngẫu nhiên**.

**Hệ quả:** Nếu request `post-receipt` / `post-issue` timeout rồi người dùng bấm lại, key mới được sinh → backend coi là thao tác mới → **nguy cơ ghi trùng phiếu / trùng tồn kho**.

---

### D-06 · 🟡 Không có virtualization cho danh sách dài

🔧 `grep -rn "react-window|react-virtual|virtuoso|IntersectionObserver" src/` → chỉ 1 kết quả ở `hooks/use-subcategory-visibility.ts` — **file orphan**.

Các màn render danh sách đầy đủ, không cửa sổ hoá: `ApprovalQueuePage` (922 dòng), `ScanHistoryPage` (669 dòng), `WarrantyPage`, `OutboundDocumentDetailPage`.
Backend trả `per_page=50`/`per_page=200` ✅ (receipt-flow.service.ts:559 dùng `per_page=200`).

→ Xem R-02 về ảnh hưởng hiệu năng thực tế (chưa đo được).

---

### D-07 · 🔴 Không có test frontend nào — độ bao phủ 0%

🔧 `find src -name "*.test.*" -o -name "*.spec.*"` → **0 file**. `package.json` không có script `test`/`lint`.
Backend chỉ có 3 file, trong đó 2 là stub mặc định Laravel ✅ [backend/tests/](../../backend/tests).

**Không có lưới an toàn hồi quy cho migration.**

---

### D-08 · 🟡 Ngữ cảnh `WARRANTY_COMPONENT` không có lối vào nào trên UI

✅ [scan.constants.ts:35-44](../../src/constants/scan.constants.ts) định nghĩa đầy đủ `WARRANTY_COMPONENT` (*"Xuất linh kiện bảo hành"*, endpoint `/api/v1/warranty-component-issues/{id}/scans`).
✅ [ScanModeSelector:5-10](../../src/components/ScanModeSelector/index.tsx) chỉ hiển thị 4 context, **không có `WARRANTY_COMPONENT`**.
🔧 Không tìm thấy `Link`/`navigate` nào trỏ tới context này.

→ Chỉ tới được bằng cách gõ URL trực tiếp. **Tính năng chết hoặc chưa hoàn thiện.**

---

### D-09 · 🟡 Form đăng nhập không phải `<form>` thật — phím Enter chỉ hoạt động ở ô mật khẩu

**Bằng chứng runtime** 🔧 (truy vấn DOM trên trang đang chạy):
```json
{ "hasForm": false,
  "btns": [ {"text":"Hiện","type":"button"}, {"text":"Đăng nhập","type":"button"} ] }
```
**Bằng chứng mã nguồn:** ✅ [AuthStatePage:300-302](../../src/pages/AuthStatePage/index.tsx) — `onKeyDown` bắt Enter **chỉ gắn trên ô mật khẩu**. Ô email ✅ (dòng 261-275) **không có** handler Enter.

**Hệ quả:** Nhấn Enter khi con trỏ ở ô **email** không làm gì cả. Trên PDA có bàn phím cứng — và đặc biệt khi máy quét gửi ký tự Enter — hành vi này không nhất quán.

> Đối chiếu: `ManualCodePage` **có** `<form onSubmit>` thật ✅ ([ManualCodePage:38, 137](../../src/pages/ManualCodePage/index.tsx)) → hai màn nhập liệu hành xử khác nhau.

---

### D-10 · 🟢 Thiếu `enterKeyHint` trên ô nhập

🔧 Truy vấn runtime: cả hai input trả `enterKeyHint: null`.
→ Bàn phím ảo hiển thị phím "return" chung chung thay vì "Go"/"Done"/"Next". Ảnh hưởng nhỏ nhưng dễ sửa.

✅ Điểm tốt: `inputMode="email"`, `autoComplete="email"`/`current-password`, `autoCapitalize="none"`, `autoCorrect="off"` đều đã được đặt đúng ✅ (AuthStatePage:262-273).

---

### D-11 · 🟡 Ô "Ghi chú" ở màn nhập mã thủ công bị **âm thầm bỏ đi**

✅ [ManualCodePage:33](../../src/pages/ManualCodePage/index.tsx) khai báo state `note`, render một `WmsTextArea` cho người dùng nhập.
✅ Nhưng lời gọi `submitCode({ code, quantity, method, context, documentId })` (dòng 53-59) **không gửi `note`**. Kiểu `SubmitCodeInput` ✅ ([useScanRequest.ts:21-27](../../src/hooks/useScanRequest.ts)) **không có trường `note`**.

Chính UI cũng thừa nhận: *"Ghi chú đang chỉ dùng cho UI phase này."*
→ **Người dùng nhập ghi chú và mất trắng.**

---

### D-12 · 🟡 Dependency `@zxing/library` chưa khai báo

✅ [scanner-adapter.ts:13](../../src/services/scanner-adapter.ts) `import { DecodeHintType } from "@zxing/library";`
🔧 `grep -n zxing package.json` → chỉ có `@zxing/browser`.
🔧 `package-lock.json:1911` xác nhận nó chỉ là transitive dependency.
→ Build sẽ vỡ nếu `@zxing/browser` đổi cây phụ thuộc.

---

### D-13 · 🟢 Route trùng lặp & thanh nav hiện ở màn chi tiết sâu

- ✅ [routes.tsx:164,172](../../src/app/routes.tsx) — hai alias `/history/OUTBOUND/:documentId` và `/history/outbound/:documentId` trỏ cùng component, chỉ khác chữ hoa/thường.
- ✅ [App.tsx:45-55](../../src/app/App.tsx) — danh sách ẩn bottom nav **không bao gồm** `/warranty`, `/approvals/outbound`, `/history/OUTBOUND` → các màn chi tiết sâu vẫn hiện thanh nav 5 mục.

---

### D-14 · 🟠 Tài liệu & metadata sai lệch nghiêm trọng

| Nguồn | Vấn đề |
|---|---|
| ✅ [CLAUDE.md](../../CLAUDE.md) | Mô tả app đặt món "ZaUI Bistro"; nói `app.tsx` không render router — **cả hai đều sai** |
| ✅ `docs/design/` (10 file) — 🗑️ **đã xoá 2026-09-04** | Hồ sơ thiết kế **app bán hoa tươi** — 🔧 grep khớp "hoa tươi/florist/flower" ở 7/10 file; 3 file còn lại cũng thuần nội dung bán hàng |
| ✅ [package.json](../../package.json) | `"name": "bachhoa"`, description mô tả app đặt món cà phê |
| ✅ [zmp-cli.json](../../zmp-cli.json) | `stateManagement: "jotai"`, `template: "single-view"` — thực tế Zustand + 22 route |
| ✅ [docs/vuexy-miniapp-progress.md](../../docs/vuexy-miniapp-progress.md) | Liệt kê **TanStack Query** trong "stack thực tế" — thực tế là code chết |

**Nguy cơ:** đội migration đọc nhầm tài liệu → thiết kế sai nghiệp vụ.

---

## PHẦN R — NGUY CƠ CẦN XÁC MINH (chưa khẳng định là lỗi)

### R-01 · Màn hình PDA nhỏ (≤ 320 px)
🔧 **Đã đo trên màn login @320×480:** `document.documentElement.scrollWidth === clientWidth === 320` → **không tràn ngang**; `scrollHeight === clientHeight === 480` → không tràn dọc. Nút cao 44 px (đạt ngưỡng chạm tối thiểu).
⛔ **16 màn còn lại chưa đo.** Các màn dày đặc dữ liệu (`ApprovalQueuePage`, `OutboundDocumentDetailPage`, `WarrantyDetailPage`) có bảng/lưới nhiều cột — **nguy cơ tràn ngang trên 320 px cần kiểm chứng**.
Layout dùng `max-w-md` (448 px) ✅ [App.tsx:60](../../src/app/App.tsx) → trên PDA hẹp sẽ co lại, chưa rõ có vỡ không.

### R-02 · Hiệu năng danh sách dài trên CPU yếu của PDA
Không có virtualization (D-06) + `per_page=200` ✅ (receipt-flow.service.ts:559). ⛔ Chưa đo được với dữ liệu thật. Trên PDA Android cấu hình thấp, render 200 hàng DOM cùng lúc **có thể** gây giật — cần đo.

### R-03 · Thời gian tải chunk ZXing trên mạng kho
🔧 Chunk quét mã = **491.99 kB thô / 129.60 kB gzip** — lớn nhất trong 26 chunk. ✅ Đã lazy-load đúng cách (chỉ tải khi vào `/scanner`).
⛔ Chưa đo thời gian tải thực trên 3G/4G yếu trong nhà kho. Nếu chậm, thao tác quét đầu tiên mỗi phiên sẽ bị trễ.

### R-04 · Luồng quyền camera trên PDA
✅ Có xử lý lỗi chuẩn hoá đầy đủ (`CAMERA_PERMISSION_DENIED`, `CAMERA_IN_USE`, `CAMERA_PREVIEW_UNAVAILABLE`, `CAMERA_NOT_SUPPORTED`) ✅ [scanner-adapter.ts:105-140](../../src/services/scanner-adapter.ts) và có warm-up ✅ [camera-permission.service.ts:84](../../src/services/camera-permission.service.ts).
⛔ Chưa test trên thiết bị thật; hành vi WebView Zalo với `getUserMedia` chưa xác minh.

### R-05 · Phản hồi trực quan khi đang gửi ở màn nhập mã thủ công
✅ **Chống double-submit ở tầng logic là CÓ và chắc chắn:** `useScanRequest` dùng `pendingKeysRef` (khoá theo `context:code` khi đang bay) ✅ [useScanRequest.ts:80-85](../../src/hooks/useScanRequest.ts) + debounce `SCAN_DEBOUNCE_MS = 1800` ✅ (dòng 87-92).
⚠️ Nhưng nút "Xác nhận" ✅ [ManualCodePage:137](../../src/pages/ManualCodePage/index.tsx) **không truyền prop `loading`** → không có spinner, không bị disable. Người dùng bấm lại sẽ nhận **thông báo lỗi** *"Mã này đang được xử lý"* thay vì thấy trạng thái đang tải.
⛔ Chưa xác minh trực quan (màn nằm sau `AuthGate`).

### R-06 · Debounce 1.8 s có thể chặn thao tác quét hợp lệ
✅ Khoá chống trùng dựa trên `dedupeKey = ${context}:${normalizedCode}` ✅ (useScanRequest.ts:76). Mã **khác nhau** không bị chặn — đúng.
⚠️ Nhưng khi nhân viên quét **nhiều đơn vị cùng một SKU liên tiếp**, các lần quét sau trong vòng 1.8 s sẽ bị từ chối là "trùng".
❓ *Cần xác nhận:* nghiệp vụ có tình huống quét lặp cùng mã liên tiếp không (hàng không theo serial)? Nếu có, 1.8 s là quá dài với máy quét PDA.

### R-07 · Focus sau khi validate phụ thuộc `requestAnimationFrame`
✅ [AuthStatePage:189-196](../../src/pages/AuthStatePage/index.tsx) đặt focus trong `window.requestAnimationFrame`.
⛔ **Không đo được đáng tin cậy:** trong môi trường khảo sát, pane trình duyệt bị ẩn nên rAF bị tạm dừng → hai lần đo cho kết quả mâu thuẫn (một lần focus vào ô mật khẩu, một lần không focus gì). **Không kết luận đây là lỗi.** Cần kiểm chứng trên thiết bị thật.

### R-08 · Bàn phím ảo che ô nhập
✅ Có dùng `wms-sticky-action` cho cụm nút dưới đáy ✅ (ManualCodePage:125) và 32 chỗ dùng `env(safe-area-inset-*)`.
⛔ Chưa test hành vi khi bàn phím ảo bật trên Android — đặc biệt ở `WarrantyReceivePage` (741 dòng, nhiều trường) và `DocumentContextPage` (1017 dòng).

### R-09 · Nút Back cứng của Android / điều hướng quay lại
✅ Các màn dùng `WmsPageHeader onBack={() => navigate(...)}`.
⛔ Chưa test tương tác với nút back vật lý của Android và ngăn xếp lịch sử của WebView Zalo. ✅ `app-config.json` đặt `"hideAndroidBottomNavigationBar": false`.

### R-10 · Upload video bảo hành trên mạng yếu
✅ Proxy đặt timeout 10 phút cho multipart ✅ [vite.config.mts](../../vite.config.mts), nhưng `api-client` mặc định chỉ **12 s** ✅ ([api-client.ts:8](../../src/services/api-client.ts)) — các lời gọi upload phải truyền `timeoutMs` riêng.
⛔ Chưa xác minh mọi đường upload đều truyền timeout dài; chưa test trên mạng yếu. Không có thanh tiến trình upload nào được tìm thấy.

### R-11 · Dark mode
✅ `tailwind.config.js` bật `darkMode: ["class", '[zaui-theme="dark"]']`; `app-config.json` khai báo `textColor.dark`.
⛔ Chưa xác minh có bộ biến `--wms-*` cho dark mode hay không, cũng chưa render thử.

---

## Tổng hợp

| Mức | Đã xác minh (D) | Nguy cơ (R) |
|---|---|---|
| 🔴 Nghiêm trọng | D-01, D-07 | — |
| 🟠 Cao | D-02, D-03, D-04, D-05, D-14 | R-02, R-03, R-06 |
| 🟡 Trung bình | D-06, D-08, D-09, D-11, D-12 | R-01, R-04, R-05, R-08, R-10 |
| 🟢 Thấp | D-10, D-13 | R-07, R-09, R-11 |

**14 lỗi đã xác minh · 11 nguy cơ cần kiểm chứng trên thiết bị thật.**

> ❓ **Câu hỏi Q6 cần trả lời:** các lỗi trên cần sửa ở **app mới**, ở **Zalo Mini App hiện tại**, hay **cả hai**? Nếu chỉ sửa ở app mới thì D-01/D-02/D-03 trở thành ghi chú lịch sử; nếu sửa cả hai thì cần một nhánh công việc riêng cho Mini App hiện hành.

---

## Điều KHÔNG kiểm tra được ⛔

1. **17/18 màn hình** — cần tài khoản WMS hợp lệ.
2. Hành vi trong WebView Zalo thật — chưa chạy `zmp start` với App ID thật.
3. Quét camera thật — cần thiết bị + mã vật lý.
4. Mọi hành vi trên PDA — **chưa biết model máy (Q4)**.
5. Hiệu năng với dữ liệu lớn thật.
6. Dark mode.
7. Khả năng tiếp cận (accessibility) ngoài vài thuộc tính `aria-*`/`role` quan sát được.
