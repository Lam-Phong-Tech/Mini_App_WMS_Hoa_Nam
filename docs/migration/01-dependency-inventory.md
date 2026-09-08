# 01 — Dependency Inventory (API · SDK · Storage · Thư viện cần thay thế)

**Commit khảo sát:** `663114aff6804e50b77b88e05dda9f9c784d6fff`

---

## 1. Bề mặt API backend WMS

**Base URL production:** `https://khohoanamdev.bigk.click` ✅ [.env](../../.env.example) (`VITE_WMS_API_BASE_URL`)
**Client HTTP:** `fetch` gốc, không dùng axios ✅ [src/services/api-client.ts](../../src/services/api-client.ts)

### 1.1 Xác thực (3 endpoint)

| Method | Path | File:line |
|---|---|---|
| POST | `/api/v1/auth/login` | ✅ zalo-auth.service.ts:88 |
| GET | `/api/v1/auth/me` | ✅ zalo-auth.service.ts:104 |
| POST | `/api/v1/auth/logout` | ✅ zalo-auth.service.ts:119 |

### 1.2 Nhập kho — Inbound (11 endpoint)

| Method | Path | File:line |
|---|---|---|
| POST | `/api/v1/inbound-documents` | ✅ receipt-flow.service.ts:750 |
| GET | `/api/v1/inbound-documents?per_page=50` | ✅ scan.service.ts:1409 |
| GET | `/api/v1/inbound-documents?{query}` | ✅ scan.service.ts:1456 |
| GET | `/api/v1/inbound-documents/{id}` | ✅ receipt-flow.service.ts:1055 · scan.service.ts:1144 |
| PATCH | `/api/v1/inbound-documents/{id}` | ✅ receipt-flow.service.ts:1329 (`patchInboundDocument`) |
| POST | `/api/v1/inbound-documents/{id}/scan` | ✅ receipt-flow.service.ts:797 · scan.service.ts:1090 |
| GET | `/api/v1/inbound-documents/{id}/scan-entries?status=ACTIVE&per_page=200` | ✅ receipt-flow.service.ts:559 |
| POST | `/api/v1/inbound-documents/{id}/post-receipt` | ✅ receipt-flow.service.ts:841, 916 |
| GET | `/api/v1/mini-app/inbound-documents?{query}` | ✅ scan.service.ts:1481 |
| POST | `/api/v1/mini-app/inbound/record` | ✅ receipt-flow.service.ts:705 |
| POST | `/api/v1/mini-app/inbound/resolve-code` | ✅ receipt-flow.service.ts:1068 |
| POST | `/api/v1/mini-app/inbound-documents/{id}/post-receipt` | ✅ receipt-flow.service.ts:902 |

### 1.3 Xuất kho — Outbound (11 endpoint, toàn bộ dưới `/mini-app`)

| Method | Path | File:line |
|---|---|---|
| GET | `/api/v1/mini-app/outbound-documents?{query}` | ✅ scan.service.ts:1509 |
| POST | `/api/v1/mini-app/outbound-documents` | ✅ scan.service.ts:1539 |
| GET | `/api/v1/mini-app/outbound-documents/{id}` | ✅ scan.service.ts:1154, 1620 |
| POST | `/api/v1/mini-app/outbound-documents/{id}/scan` | ✅ scan.service.ts:509 |
| GET | `/api/v1/mini-app/outbound-documents/{id}/packing-label` | ✅ scan.service.ts:1644 |
| POST | `/api/v1/mini-app/outbound-documents/{id}/packing-labels/{labelId}/{action}` | ✅ scan.service.ts:1702 |
| POST | `/api/v1/mini-app/outbound-documents/{id}/post-issue` | ✅ scan.service.ts:1741 |
| POST | `/api/v1/mini-app/outbound-documents/{id}/unmatch` | ✅ scan.service.ts:1774 |
| POST | `/api/v1/mini-app/outbound/resolve-code` | ✅ scan.service.ts:1563 |
| POST | `/api/v1/mini-app/outbound/record` | ✅ scan.service.ts:1586 |
| GET | `/api/v1/mini-app/printer-configs` | ✅ scan.service.ts:1718 |

### 1.4 Bảo hành — Warranty (10 endpoint)

Tiền tố `/api/v1/mini-app` ✅ warranty-flow.service.ts:152

| Method | Path | File:line |
|---|---|---|
| POST | `/api/v1/mini-app/warranty/resolve-code` | ✅ :165 |
| POST | `/api/v1/mini-app/warranty-cases` | ✅ :188 |
| GET | `/api/v1/mini-app/warranty-cases?{query}` | ✅ :222 |
| GET | `/api/v1/mini-app/warranty-cases/{caseId}` | ✅ :266 |
| POST/PATCH | `/api/v1/mini-app/warranty-cases/{caseId}/…` (đổi trạng thái) | ✅ :309 |
| GET | `/api/v1/mini-app/warranty-cases/{caseId}/…` (events) | ✅ :341 |
| GET | `/api/v1/mini-app/warranty-cases/{caseId}/…` (attachments) | ✅ :355 |
| POST | `/api/v1/mini-app/warranty-cases/{caseId}/…` (**upload multipart**) | ✅ :383 |
| GET | `/api/v1/mini-app/warranty-attachments/{id}` (**tải blob**) | ✅ :413, :439 |
| DELETE | `/api/v1/mini-app/warranty-attachments/{id}` | ✅ :428 |
| GET | `/api/v1/defects?{query}` | ✅ :246 |

### 1.5 Tồn kho, sản phẩm, kho, quét (7 endpoint)

| Method | Path | File:line |
|---|---|---|
| GET | `/api/v1/inventory/trace/{code}` | ✅ scan.service.ts:804 |
| GET | `/api/v1/inventory/balances?per_page=50` | ✅ scan.service.ts:1805 |
| GET | `/api/v1/products?{query}` | ✅ scan.service.ts:883 · receipt-flow.service.ts:267 |
| GET | `/api/v1/products/{productId}` | ✅ scan.service.ts:1793 |
| GET | `/api/v1/warehouses?status=ACTIVE&per_page=50` | ✅ receipt-flow.service.ts:239 · wms-context.service.ts:139 |
| POST | `/api/v1/scan/classify` | ✅ scan.service.ts:1024 · receipt-flow.service.ts:1093 |
| GET | `/api/v1/scan/events?per_page=50` | ✅ scan.service.ts:1838 |
| POST | `/api/v1/{resource}/{documentId}/{scanPath}` (dựng động) | ✅ scan.service.ts:937 |

> **Tổng cộng: ~42 endpoint riêng biệt** trên 6 nhóm nghiệp vụ.

### 1.6 ⛔ BLOCKER — không có hợp đồng API chính thức

**Không tồn tại file OpenAPI/Swagger/Postman nào cho backend WMS trong repository.**

- ✅ `docs/design/05-api-contract.md` mô tả API của **app bán hoa**, không liên quan — thư mục `docs/design/` **đã được xoá 2026-09-04** theo phê duyệt Q7 (xem [01-source-audit.md §8.2](01-source-audit.md) và [01-backend-audit.md §10](01-backend-audit.md)).
- ✅ [backend/routes/api.php](../../backend/routes/api.php) là **dịch vụ khác**, không có route `/v1/` nào (🔧 grep = 0 kết quả).

Shape request/response hiện chỉ suy ra được từ TypeScript interface trong `src/services/*.ts` và `src/types/`. **Không thể xác minh tính đầy đủ.**
❓ *Cần Q9:* tài liệu contract chính thức nằm ở đâu?

---

## 2. API bên thứ ba

| Dịch vụ | URL | Dùng ở đâu | Rủi ro |
|---|---|---|---|
| Provinces Open API (địa giới hành chính VN) | `https://provinces.open-api.vn/api/v2` ✅ [vietnam-address.service.ts:19](../../src/services/vietnam-address.service.ts) | `DocumentContextPage` (địa chỉ giao hàng), `WarrantyReceivePage` (địa chỉ khách) | **API cộng đồng miễn phí, không SLA.** Cache chỉ nằm **trong RAM** (TTL 24h ✅ dòng 20) → mất khi khởi động lại app. Nếu dịch vụ chết, hai màn hình mất chức năng chọn tỉnh/phường |

❓ *Cần xác nhận:* app mới nên **đóng gói sẵn dữ liệu tỉnh/phường** hay chuyển sang endpoint của WMS backend?

---

## 3. Zalo Mini App SDK — cần thay thế: **KHÔNG CÓ**

🔧 `grep -rn "zmp-sdk" src/` → 2 kết quả, **cả hai ở file orphan**:

| File | API | Trạng thái |
|---|---|---|
| `src/hooks/use-subcategory-visibility.ts:2` | `nativeStorage` | orphan |
| `src/pages/checkout/index.tsx:19` | `getPhoneNumber` | orphan |

🔧 `grep -rn "scanQRCode" src/` → **0 kết quả**.

> **Kết luận: code sống không gọi bất kỳ API Zalo SDK nào.** Không có `getUserInfo`, `getAccessToken`, `login`, `openWebview`, `getLocation`, `scanQRCode`, `nativeStorage`, `getSetting`, `openShareSheet`… Chi phí thay thế SDK khi migration ≈ 0.

---

## 4. ZaUI (`zmp-ui`) — cần thay thế: **2 component**

| Vị trí | Dùng | Thay bằng gì (khi migrate) |
|---|---|---|
| ✅ [src/app.tsx:3](../../src/app.tsx) | `App` | Widget gốc (`MaterialApp` / `NavigationContainer`) |
| ✅ [src/app.tsx:3](../../src/app.tsx) | `SnackbarProvider` | `ScaffoldMessenger` / thư viện toast RN |
| ✅ [src/index.ts:2](../../src/index.ts) | `import "zmp-ui/zaui.css"` | **Bỏ hẳn** |

22 lời gọi `zmp-ui` khác (`Button`, `Text`, `Spinner`, `Avatar`, `List`, `useSnackbar`) đều ở file **orphan** → không port.

**Chi phí đang phải trả:** 🔧 `zaui.css` = 120 826 bytes, chiếm **~70%** CSS đã build (172 191 bytes), chỉ để phục vụ 2 component.

---

## 5. Quét mã vạch — phần khó nhất của migration

### 5.1 Hiện trạng: **chỉ camera, không có phần cứng**

| Thành phần | Chi tiết |
|---|---|
| Thư viện | `@zxing/browser` 0.2.1 + `@zxing/library` 0.23.0 ✅ [scanner-adapter.ts:12-13](../../src/services/scanner-adapter.ts) |
| Kiến trúc | Interface `BarcodeScannerAdapter` ✅ (dòng 15-28) với 2 hiện thực: `MockScannerAdapter`, `BrowserCameraBarcodeAdapter` |
| Chọn adapter | ✅ `createBarcodeScannerAdapter()` (dòng 799) — trả mock nếu `VITE_SCAN_ADAPTER === "mock"` |
| Tối ưu | Có nhánh dùng `BarcodeDetector` gốc của trình duyệt khi khả dụng ✅ (`initializeNativeDetector`, dòng 603) |
| Kích thước | 🔧 Chunk ZXing = **491.99 kB thô / 129.60 kB gzip** — chunk lớn nhất; **được lazy-load** (chỉ tải khi vào `/scanner`) ✅ [route-modules.ts:22](../../src/app/route-modules.ts) |

**Định dạng hỗ trợ** ✅ (scanner-adapter.ts:235-253): `QR_CODE`, `CODE_128`, `CODE_39`, `CODE_93`, `EAN_13`, `EAN_8`, `UPC_A`, `UPC_E`.
Hint: `POSSIBLE_FORMATS` + `TRY_HARDER` ✅ (dòng 317-319).

**Năng lực camera:** `attachVideoElement`, `switchCamera`, `toggleTorch` (đèn flash), `scanImageFile` (quét từ ảnh trong thư viện), `pause`/`resume`.

**Mã lỗi camera chuẩn hoá** ✅ (`normalizeCameraError`, dòng 105): `CAMERA_PERMISSION_DENIED`, `CAMERA_IN_USE`, `CAMERA_PREVIEW_UNAVAILABLE`, `CAMERA_NOT_SUPPORTED`.

### 5.2 ⚠️ Máy quét phần cứng (keyboard wedge / broadcast intent): **CHƯA HIỆN THỰC**

🔧 `grep -rni "keydown|keypress|wedge|hardware|broadcast|intent|datawedge|honeywell|zebra|urovo|chainway" src/` → chỉ **2 kết quả, không liên quan**:

| File:line | Thực chất là gì |
|---|---|
| `src/components/ui/WmsModal.tsx:47,54` | Bắt phím **Escape** để đóng modal |
| `src/pages/AuthStatePage/index.tsx:300` | Bắt phím **Enter** ở ô mật khẩu để submit |

**`ScanMethod` có giá trị `"SCANNER"`** ✅ [scan.types.ts:8](../../src/types/scan.types.ts) nhưng **không có đường code nào tạo ra nó từ thiết bị thật**:

| Vị trí | Thực chất |
|---|---|
| `ScannerPage/index.tsx:254` | Chỉ là **chữ ký kiểu** của callback; 🔧 không có call-site nào truyền `"SCANNER"` |
| `scan.service.ts:502` | Nhánh **else** khi method không phải `MANUAL`/`CAMERA` |
| `scan.service.ts:1856` | Nhãn **mặc định** khi map lịch sử quét từ WMS về |

> **Kết luận: `"SCANNER"` chỉ là nhãn dữ liệu, không phải tích hợp phần cứng.** Toàn bộ hỗ trợ máy quét PDA (keyboard wedge, broadcast intent, SDK hãng) **phải viết mới hoàn toàn** ở app đích. Đây là hạng mục có khối lượng lớn nhất và phụ thuộc trực tiếp câu trả lời Q4/Q5.

---

## 6. Lưu trữ cục bộ (storage)

🔧 `grep -rn "localStorage|sessionStorage|nativeStorage|indexedDB" src/`

### 6.1 Bảng khoá lưu trữ (code sống)

| Khoá | Storage | File:line | Nội dung |
|---|---|---|---|
| `miniapp_warehouse_session_token` | `localStorage` | ✅ auth-session.service.ts:1 | JWT/session token |
| `miniapp_warehouse_session_expires_at` | `localStorage` | ✅ :2 | Thời điểm hết hạn |
| `miniapp_warehouse_session_started_at` | `localStorage` | ✅ :3 | Thời điểm bắt đầu |
| `miniapp_warehouse_staff` | `localStorage` | ✅ zalo-auth.service.ts:9 | Hồ sơ nhân viên (JSON) |
| `miniapp_wms_link_context` | `localStorage` **+** `sessionStorage` | ✅ wms-link-context.ts:3 | Ngữ cảnh deep-link |
| `miniapp_wms_access_token` | `sessionStorage` | ✅ wms-link-context.ts:4 | Access token WMS |
| Khoá phiên nhập | `localStorage` + `sessionStorage` | ✅ receipt-session.store.ts:182-204 | Phiên phiếu nhập đang dở |
| Khoá phiên xuất | `localStorage` + `sessionStorage` | ✅ outbound-session.store.ts:165-187 | Phiên phiếu xuất đang dở |
| Cache dashboard | `sessionStorage` | ✅ warehouse-dashboard-cache.ts:52-100 | Cache KPI theo `zaloUserId` |

### 6.2 Đặc điểm quan trọng cho migration

| Đặc điểm | Chi tiết | Hệ quả khi migrate |
|---|---|---|
| **API đồng bộ** | Toàn bộ dùng Web Storage (`getItem`/`setItem` trả về ngay) | ⚠️ Flutter (`SharedPreferences`) và React Native (`AsyncStorage`) đều **bất đồng bộ** → phải refactor mọi điểm đọc/ghi thành `async`, hoặc dùng `MMKV`/`Hive` (đồng bộ) |
| **Không có IndexedDB** | 🔧 0 kết quả | Không có dữ liệu lớn cần port |
| **Không có `nativeStorage` của Zalo** | Chỉ ở file orphan | Không phụ thuộc Zalo |
| **Ghi kép `localStorage` + `sessionStorage`** | ✅ receipt-session.store.ts:200-201 | Native chỉ có một tầng lưu trữ bền → phải quyết định lại ngữ nghĩa "session" |
| **Bọc try/catch phòng WebView chặn storage** | ✅ wms-link-context.ts:135-138 | Không còn cần thiết ở native |
| **Token dạng plaintext** | Xem [01-source-audit.md §7.4](01-source-audit.md) | ❓ Cân nhắc secure storage |

---

## 7. Offline & đồng bộ — **chưa có gì**

🔧 `grep -rn "navigator\.onLine|\"online\"|\"offline\"" src/` → **0 kết quả**.

| Khả năng | Hiện trạng |
|---|---|
| Phát hiện mất mạng | ❌ Không có |
| Hàng đợi thao tác offline (outbox) | ❌ Không có |
| Đồng bộ lại khi có mạng | ❌ Không có |
| Tự thử lại (retry/backoff) | ❌ Không có ở `api-client.ts` |
| Thông báo offline cho người dùng | ❌ Chỉ có 2 chuỗi *"kiểm tra kết nối mạng"* cho danh sách tỉnh/thành ✅ (DocumentContextPage:283, WarrantyReceivePage:93) |

**Ứng dụng hiện tại là online-only.** Cơ chế duy nhất giống offline là 3 Zustand store lưu phiên nhập/xuất đang dở vào Web Storage — nhưng **không có cơ chế gửi lại khi có mạng**.

### 7.1 `Idempotency-Key` — có, nhưng dùng chưa nhất quán ⚠️

Header `Idempotency-Key` được gửi ở nhiều endpoint ghi ✅ (18 vị trí).

| Cách dùng | Vị trí | Đánh giá |
|---|---|---|
| **Bền** — key lưu lại để thử lại dùng đúng key cũ | ✅ ReceiptCreatePage:25 (`useRef`), OutboundReviewPage:86-87 (`recordIdempotencyKey` trong store), receipt-flow.service.ts:1791 | ✅ Đúng |
| **Sinh mới tại chỗ** — `generateClientScanId()` gọi ngay trong lời gọi API | ✅ receipt-flow.service.ts:500, 754, 802, 848, 909, 923 · scan.service.ts:1695, 1748 · warranty-flow.service.ts:192, 318 | ⚠️ **Mỗi lần thử lại sinh key mới → mất tác dụng chống trùng** |

`generateClientScanId()` = `crypto.randomUUID()` ✅ [utils/generateClientScanId.ts](../../src/utils/generateClientScanId.ts) — luôn ngẫu nhiên.

> ❓ *Cần Q8:* quy tắc đồng bộ offline, xử lý bản ghi trùng và xung đột dữ liệu ở app mới?

---

## 8. Danh sách dependency npm → phân loại port

### 8.1 Phải thay thế (dùng bởi code sống)

| Package | Phiên bản | Vai trò | Tương đương Flutter | Tương đương React Native |
|---|---|---|---|---|
| `react` | 18.3.1 | UI runtime | Flutter widget | ✔ giữ nguyên |
| `react-dom` | 18.3.1 | DOM render + portal | — | ✔ (Modal) |
| `react-router-dom` | 7.11.0 | Routing | `go_router` | `react-navigation` |
| `zustand` | 5.0.9 | State (3 store) | `riverpod` / `provider` | ✔ giữ nguyên |
| `@zxing/browser` + `@zxing/library` | 0.2.1 / 0.23.0 | Quét mã | `mobile_scanner` | `vision-camera` + code scanner |
| `zmp-ui` | 1.11.14 | 2 component | Widget gốc | Component gốc |

### 8.2 Bỏ hẳn (chỉ phục vụ code chết)

| Package | Chỉ dùng ở |
|---|---|
| `@tanstack/react-query` | `src/lib/*` (orphan) |
| `clsx` | `src/utils/cn.tsx` (orphan) |
| `tailwind-merge` | `src/utils/cn.tsx` (orphan) |
| `zmp-sdk` | 2 file orphan |

### 8.3 Chỉ dùng lúc build

`vite`, `zmp-vite-plugin`, `@vitejs/plugin-react`, `tailwindcss`, `sass`, `postcss`, `autoprefixer`, `prettier`, `typescript`, `cross-env`.

### 8.4 ⚠️ Vấn đề dependency

| Vấn đề | Chi tiết |
|---|---|
| `@zxing/library` **chưa khai báo** | Được import trực tiếp ✅ scanner-adapter.ts:13 nhưng không có trong `dependencies` (🔧 xác minh). Chạy được nhờ transitive từ `@zxing/browser` (`package-lock.json:1911`) |
| `zmp-cli.json` sai | Khai báo `jotai` + `single-view`; thực tế Zustand + 22 route |
| `package.json` sai metadata | `name: "bachhoa"`, `description` mô tả app đặt món cà phê |

---

## 9. Hệ thống thiết kế & theming

| Thành phần | Chi tiết |
|---|---|
| Nguồn token thật | ✅ [src/css/app.scss](../../src/css/app.scss) — 1793 dòng, **281 biến `--wms-*`** |
| Tài liệu design | ✅ [docs/ui-system-x-vuexy.md](../../docs/ui-system-x-vuexy.md) — hệ "X" chuyển thể từ Vuexy |
| Màu chính | `--x-primary: #7367F0`, nền `#F8F7FA`, success `#28C76F`, danger `#EA5455`, warning `#FF9F43`, info `#00CFE8` ✅ |
| Font | `"Public Sans"` — **khai báo nhưng không ship** (xem lỗi D-02) |
| ⚠️ `src/tokens.js` | **Orphan** — token của template Bistro cũ, vẫn được `tailwind.config.js` spread vào theme nhưng UI thật dùng biến CSS |
| Safe area | 🔧 32 lần dùng `env(safe-area-inset-*)` trong code sống |
| Dark mode | `darkMode: ["class", '[zaui-theme="dark"]']` ✅ tailwind.config.js — ❓ *cần xác nhận* có thực sự hỗ trợ dark mode không |

---

## 10. Tóm tắt khối lượng thay thế

| Hạng mục | Số lượng | Độ khó |
|---|---|---|
| Endpoint API backend | ~42 | 🟡 Trung bình — cần contract chính thức (⛔ đang thiếu) |
| Zalo SDK API | **0** | 🟢 Không cần làm |
| ZaUI component | **2** | 🟢 Rất dễ |
| Khoá storage | 9 nhóm | 🟡 Trung bình — sync → async |
| Adapter quét camera | 1 interface, 2 hiện thực (805 dòng) | 🟡 Có sẵn abstraction tốt để port |
| **Tích hợp máy quét phần cứng PDA** | **0 → phải viết mới** | 🔴 **Cao — chưa đủ thông tin (Q4/Q5)** |
| **Tầng offline/đồng bộ** | **0 → phải viết mới** | 🔴 **Cao — chưa có quy tắc (Q8)** |
| Icon | 32 SVG inline | 🟢 Dễ |
| Ảnh tĩnh | 0 (12 file đều chết) | 🟢 Không cần làm |
| Test hồi quy | **0** | 🔴 **Không có lưới an toàn** |
