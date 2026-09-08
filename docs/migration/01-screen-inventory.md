# 01 — Screen Inventory (Kiểm kê màn hình & luồng điều hướng)

**Commit khảo sát:** `663114aff6804e50b77b88e05dda9f9c784d6fff`
**Nguồn route duy nhất:** ✅ [src/app/routes.tsx](../../src/app/routes.tsx) — `createBrowserRouter`, `basename = getBasePath()`

> ⚠️ `src/router.tsx` **không được import ở bất kỳ đâu** (🔧 xác minh bằng phân tích đồ thị import, exit 0). Mọi route trong file đó là code chết — xem [01-source-audit.md §5](01-source-audit.md).

---

## 1. Cây điều hướng

```
/  (WarehouseApp shell — src/app/App.tsx)
│   ErrorBoundary: RouteErrorFallback (routes.tsx:341)
│
├── index                              → HomePage            [AuthGate, eager]
├── auth                               → AuthStatePage mode="flow"
├── auth/:mode                         → AuthStatePage (10 mode hợp lệ)
├── documents/RECEIPT                  → ReceiptCreatePage   [Protected, lazy]
├── documents/:context                 → DocumentContextPage [Protected, lazy]
├── scanner/:context                   → ScannerPage         [Protected, lazy, loading riêng]
├── manual/:context                    → ManualCodePage      [Protected, lazy]
├── result/:id                         → ScanResultPage      [Protected, lazy]
├── receipt-review/:receiptId          → ReceiptReviewPage   [Protected, lazy]
├── receipt-success/:receiptId         → ReceiptSuccessPage  [Protected, lazy]
├── outbound-review/:outboundId        → OutboundReviewPage  [Protected, lazy]
├── outbound-success/:documentId       → OutboundSuccessPage [Protected, lazy]
├── approvals                          → ApprovalQueuePage   [Protected, lazy]
├── approvals/outbound/:documentId     → OutboundDocumentDetailPage
├── history                            → ScanHistoryPage     [Protected, lazy]
├── history/OUTBOUND/:documentId       → OutboundDocumentDetailPage
├── history/outbound/:documentId       → OutboundDocumentDetailPage  (alias chữ thường)
├── warranty                           → WarrantyPage        [Protected, lazy]
├── warranty/receive                   → WarrantyReceivePage [Protected, lazy]
├── warranty/:caseId                   → WarrantyDetailPage  [Protected, lazy]
├── profile                            → ProfilePage         [Protected, lazy]
└── *                                  → NotFoundPage
```

**Tổng: 22 khai báo route → 18 page component riêng biệt** (+ `NotFoundPage` khai inline trong `routes.tsx`).

> 🔧 **Đính chính 2026-09-05:** bản trước ghi nhầm là **17**. Đếm lại bằng lệnh: `ls -d src/pages/*Page` → **18 thư mục, tất cả đều được route**; `routes.tsx` import 16 màn lazy + 2 màn eager (`HomePage`, `AuthStatePage`) = **18**. Danh sách tên trong tài liệu này vốn đã liệt kê đủ cả 18 — chỉ con số tổng sai.

`OutboundDocumentDetailPage` được gắn vào **3 route** khác nhau ✅ (routes.tsx:132, 164, 172) — hai alias `/history/OUTBOUND/...` và `/history/outbound/...` chỉ khác nhau chữ hoa/thường.

---

## 2. Thanh điều hướng dưới (bottom navigation)

✅ [src/app/App.tsx:9-19](../../src/app/App.tsx) — 5 mục:

| Nhãn | Đích | Icon |
|---|---|---|
| Trang chủ | `/` | `home` |
| Quét mã | `/scanner/INVENTORY_LOOKUP` | `scan` |
| Duyệt phiếu | `/approvals` | `list-check` |
| Lịch sử | `/history` | `history` |
| Cá nhân | `/profile` | `user` |

**Điều kiện ẩn thanh nav** ✅ (App.tsx:45-55): ẩn khi chưa có `staff` trong storage, hoặc pathname bắt đầu bằng `/auth`, `/documents`, `/scanner`, `/manual`, `/result`, `/receipt-review`, `/receipt-success`, `/outbound-review`, `/outbound-success`.

> ⚠️ Danh sách này **không bao gồm** `/warranty`, `/approvals/outbound`, `/history/OUTBOUND` → các màn chi tiết sâu vẫn hiện bottom nav. ❓ *Cần xác nhận:* đây là chủ ý hay thiếu sót.

---

## 3. Ma trận màn hình → tính năng → file nguồn

| # | Route | Page component | File | Dòng | Tính năng chính | Service phụ thuộc |
|---|---|---|---|---|---|---|
| 1 | `/` | HomePage | [src/pages/HomePage/index.tsx](../../src/pages/HomePage/index.tsx) | 242 | KPI (chờ duyệt / đã duyệt hôm nay), lưới 4 tác vụ kho, thẻ "Duyệt phiếu", danh sách sản phẩm đã duyệt | `useWarehouseDashboard`, `getApprovedProducts` |
| 2 | `/auth`, `/auth/:mode` | AuthStatePage | [src/pages/AuthStatePage/index.tsx](../../src/pages/AuthStatePage/index.tsx) | 547 | Form đăng nhập email/mật khẩu, 10 trạng thái phiên (§4) | `zalo-auth.service`, `use-zalo-auth` |
| 3 | `/documents/RECEIPT` | ReceiptCreatePage | [src/pages/ReceiptCreatePage/index.tsx](../../src/pages/ReceiptCreatePage/index.tsx) | 189 | Tạo phiếu nhập (chọn kho), sinh `Idempotency-Key` bền qua `useRef` | `receipt-flow.service` |
| 4 | `/documents/:context` | DocumentContextPage | [src/pages/DocumentContextPage/index.tsx](../../src/pages/DocumentContextPage/index.tsx) | 1017 | Tạo phiếu xuất nháp, chọn kho nguồn, nhập địa chỉ giao (tỉnh/phường VN) | `scan.service`, `vietnam-address.service`, `wms-context.service` |
| 5 | `/scanner/:context` | ScannerPage | [src/pages/ScannerPage/index.tsx](../../src/pages/ScannerPage/index.tsx) | **1559** | Quét camera trực tiếp, chống trùng, đèn flash, đổi camera, quét từ ảnh, nhập tay | `useBarcodeScanner`, `scanner-adapter`, `useScanRequest` |
| 6 | `/manual/:context` | ManualCodePage | [src/pages/ManualCodePage/index.tsx](../../src/pages/ManualCodePage/index.tsx) | 138 | Nhập mã thủ công (có `<form>` thật) | `useScanRequest` |
| 7 | `/result/:id` | ScanResultPage | [src/pages/ScanResultPage/index.tsx](../../src/pages/ScanResultPage/index.tsx) | 490 | Chi tiết sản phẩm sau quét: công dụng, hướng dẫn, thông số | `scan-session.store`, `getWmsProductDetail` |
| 8 | `/receipt-review/:receiptId` | ReceiptReviewPage | [src/pages/ReceiptReviewPage/index.tsx](../../src/pages/ReceiptReviewPage/index.tsx) | 567 | Kiểm tra phiếu nhập trước Post Receipt | `receipt-flow.service`, `receipt-session.store` |
| 9 | `/receipt-success/:receiptId` | ReceiptSuccessPage | [src/pages/ReceiptSuccessPage/index.tsx](../../src/pages/ReceiptSuccessPage/index.tsx) | 123 | Xác nhận nhập kho thành công | `receipt-flow.service` |
| 10 | `/outbound-review/:outboundId` | OutboundReviewPage | [src/pages/OutboundReviewPage/index.tsx](../../src/pages/OutboundReviewPage/index.tsx) | 373 | Xác nhận hàng xuất, kiểm tra đủ số lượng, quản lý `recordIdempotencyKey` | `scan.service`, `outbound-session.store` |
| 11 | `/outbound-success/:documentId` | OutboundSuccessPage | [src/pages/OutboundSuccessPage/index.tsx](../../src/pages/OutboundSuccessPage/index.tsx) | 151 | Kết quả xuất kho | `scan.service` |
| 12 | `/approvals` | ApprovalQueuePage | [src/pages/ApprovalQueuePage/index.tsx](../../src/pages/ApprovalQueuePage/index.tsx) | 922 | Hàng chờ duyệt theo folder (tab), duyệt hàng loạt, tải thêm | `receipt-flow.service`, `scan.service` |
| 13 | `/approvals/outbound/:documentId`, `/history/OUTBOUND/:documentId`, `/history/outbound/:documentId` | OutboundDocumentDetailPage | [src/pages/OutboundDocumentDetailPage/index.tsx](../../src/pages/OutboundDocumentDetailPage/index.tsx) | 455 | Chi tiết phiếu xuất, nhãn đóng gói, Post Issue, gỡ khớp | `scan.service` |
| 14 | `/history` | ScanHistoryPage | [src/pages/ScanHistoryPage/index.tsx](../../src/pages/ScanHistoryPage/index.tsx) | 669 | Lịch sử chứng từ nhập/xuất, xoá lịch sử cục bộ | `scan.service`, các session store |
| 15 | `/warranty` | WarrantyPage | [src/pages/WarrantyPage/index.tsx](../../src/pages/WarrantyPage/index.tsx) | 294 | Danh sách hồ sơ bảo hành theo trạng thái | `warranty-flow.service` |
| 16 | `/warranty/receive` | WarrantyReceivePage | [src/pages/WarrantyReceivePage/index.tsx](../../src/pages/WarrantyReceivePage/index.tsx) | 741 | Tạo hồ sơ bảo hành: giải mã mã, chọn lỗi, địa chỉ khách | `warranty-flow.service`, `vietnam-address.service` |
| 17 | `/warranty/:caseId` | WarrantyDetailPage | [src/pages/WarrantyDetailPage/index.tsx](../../src/pages/WarrantyDetailPage/index.tsx) | 1029 | Chi tiết hồ sơ, chuyển trạng thái, timeline, **upload ảnh/video** | `warranty-flow.service` |
| 18 | `/profile` | ProfilePage | [src/pages/ProfilePage/index.tsx](../../src/pages/ProfilePage/index.tsx) | 175 | Tài khoản, kết nối WMS, phiên & bảo mật, đăng xuất | `use-zalo-auth`, `device-info` |
| 19 | `*` | NotFoundPage | [src/app/routes.tsx:271](../../src/app/routes.tsx) | — | Màn 404 | — |

**Tổng dòng code của 18 page: 9.681 dòng** (đếm lại 2026-09-05). Ba màn nặng nhất: `ScannerPage` (1559), `WarrantyDetailPage` (1029), `DocumentContextPage` (1017).

---

## 4. 10 trạng thái của `AuthStatePage`

✅ [src/app/routes.tsx:230-241](../../src/app/routes.tsx) — `validAuthModes`:

| # | Mode | Ý nghĩa |
|---|---|---|
| 1 | `flow` | Mặc định (mode không hợp lệ cũng rơi về đây) |
| 2 | `login` | Form đăng nhập |
| 3 | `loading` | Đang xác thực |
| 4 | `validation` | Lỗi kiểm tra dữ liệu |
| 5 | `failed` | Đăng nhập thất bại |
| 6 | `session` | Phiên hết hạn (kích hoạt bởi HTTP 401) |
| 7 | `permission` | Không đủ quyền (kích hoạt bởi HTTP 403) |
| 8 | `logout-confirm` | Xác nhận đăng xuất |
| 9 | `logout-process` | Đang đăng xuất |
| 10 | `logged-out` | Đã đăng xuất |

`AuthGate` ✅ [src/app/AuthGate.tsx](../../src/app/AuthGate.tsx) chọn mode theo thứ tự: `isLoading` → `loading`; `securityMode === "session"` → `session`; `securityMode === "permission"` → `permission`; `!staff` → `login`; ngược lại render children.

---

## 5. Năm ngữ cảnh quét (`ScanContext`)

✅ [src/constants/scan.constants.ts:5-54](../../src/constants/scan.constants.ts) + ✅ [src/types/scan.types.ts:1-6](../../src/types/scan.types.ts)

| Context | Tiêu đề | Cần số lượng | Endpoint | Vào từ đâu |
|---|---|---|---|---|
| `RECEIPT` | Nhập kho | ✔ | `/api/v1/inbound-documents/{id}/scan` | Home → `/documents/RECEIPT` |
| `OUTBOUND` | Xuất kho | ✔ | `/api/v1/outbound-documents/{id}/scans` | Home → `/documents/OUTBOUND` |
| `WARRANTY_ITEM` | Tiếp nhận bảo hành | ✘ | `/api/v1/inventory/trace` | Home → `/warranty` |
| `WARRANTY_COMPONENT` | Xuất linh kiện bảo hành | ✔ | `/api/v1/warranty-component-issues/{id}/scans` | ⚠️ **không có lối vào từ UI** |
| `INVENTORY_LOOKUP` | Tra cứu sản phẩm | ✘ | `/api/v1/inventory/trace` | Home + bottom nav → `/scanner/INVENTORY_LOOKUP` |

> ⚠️ `ScanModeSelector` ✅ [src/components/ScanModeSelector/index.tsx:5-10](../../src/components/ScanModeSelector/index.tsx) chỉ hiển thị **4** context (`INVENTORY_LOOKUP`, `RECEIPT`, `OUTBOUND`, `WARRANTY_ITEM`). **`WARRANTY_COMPONENT` không có bất kỳ liên kết nào trong UI** — chỉ tới được bằng cách gõ URL trực tiếp.
> ❓ *Cần xác nhận:* luồng "xuất linh kiện bảo hành" là tính năng chưa hoàn thiện, đã bỏ, hay cố ý ẩn?

---

## 6. Bốn luồng nghiệp vụ kho (đã xác minh trong mã nguồn)

### 6.1 Nhập kho (Inbound / Receipt)
```
Home → /documents/RECEIPT (tạo phiếu, chọn kho)
     → /scanner/RECEIPT   (quét từng mã, tăng số lượng)
     → /receipt-review/:receiptId (kiểm tra)
     → Post Receipt  ⟹ mới thực sự tăng tồn
     → /receipt-success/:receiptId
```
Service: ✅ [src/services/receipt-flow.service.ts](../../src/services/receipt-flow.service.ts) (1871 dòng)
Ghi chú nghiệp vụ hiển thị trên UI: *"Chưa tăng tồn ở bước quét"* / *"Chỉ Post Receipt mới tăng tồn"* ✅ (ReceiptCreatePage:164, ReceiptReviewPage:287).

### 6.2 Xuất kho (Outbound)
```
Home → /documents/OUTBOUND (tạo phiếu nháp + địa chỉ giao)
     → /scanner/OUTBOUND   (quét theo phiếu, đối chiếu số lượng)
     → /outbound-review/:outboundId (xác nhận, có Idempotency-Key bền)
     → Post Issue ⟹ trừ tồn
     → /outbound-success/:documentId
```
Service: ✅ [src/services/scan.service.ts](../../src/services/scan.service.ts) (1963 dòng)
Ghi chú UI: *"Ghi nhận chưa trừ tồn"* ✅ (OutboundReviewPage:240).

### 6.3 Bảo hành (Warranty)
```
Home → /warranty (danh sách hồ sơ)
     → /warranty/receive (giải mã sản phẩm, chọn lỗi, địa chỉ khách)
     → /warranty/:caseId (timeline, chuyển trạng thái, upload ảnh/video)
```
Service: ✅ [src/services/warranty-flow.service.ts](../../src/services/warranty-flow.service.ts) (754 dòng)
**Là luồng duy nhất có upload file** (`postFormDataWithMeta`, timeout 10 phút cho video ✅ [vite.config.mts](../../vite.config.mts)).

### 6.4 Tra cứu tồn (Inventory lookup)
```
Home / bottom nav → /scanner/INVENTORY_LOOKUP → /result/:id
```
Không tạo chứng từ, chỉ đọc: `GET /api/v1/inventory/trace/{code}`.

### 6.5 Duyệt phiếu (Approval) — luồng ngang
```
Home → /approvals (tab folder) → duyệt đơn lẻ / hàng loạt
                                → /approvals/outbound/:documentId
```

> ⛔ **Không tìm thấy luồng "kiểm kho" (stock count / cycle count) hay "chuyển kho" (stock transfer) nào trong mã nguồn.** 🔧 Không có route, service, hay type nào tương ứng.
> ❓ *Cần xác nhận:* app mới có cần bổ sung hai luồng này không?

---

## 7. Component dùng chung (chỉ tính code sống)

### 7.1 Primitive UI — `src/components/ui/` (10 file)

| Component | File | Vai trò |
|---|---|---|
| `AppButton` | [Button.tsx](../../src/components/ui/Button.tsx) | Nút 4 biến thể; `disabled={disabled \|\| loading}` — chống double-submit |
| `Icon` | [Icon.tsx](../../src/components/ui/Icon.tsx) | **32 icon SVG inline** (không dùng icon font) |
| `KpiCard` | [KpiCard.tsx](../../src/components/ui/KpiCard.tsx) | Thẻ chỉ số |
| `ActionCard` | [ActionCard.tsx](../../src/components/ui/ActionCard.tsx) | Thẻ hành động điều hướng |
| `Page` | [Page.tsx](../../src/components/ui/Page.tsx) | Khung trang |
| `WmsModal` | [WmsModal.tsx](../../src/components/ui/WmsModal.tsx) | Modal qua `react-dom` portal, đóng bằng Escape |
| `WmsRuntime` | [WmsRuntime.tsx](../../src/components/ui/WmsRuntime.tsx) | `WmsCard`, `WmsNotice`, `WmsPageHeader`, `WmsField`, `WmsInput`, `WmsTextArea`, `WmsSelect`, `WmsChoiceControl` (dùng `forwardRef`) |
| `FlowSteps` | [FlowSteps.tsx](../../src/components/ui/FlowSteps.tsx) | Chỉ báo bước |
| `InfoRow` | [InfoRow.tsx](../../src/components/ui/InfoRow.tsx) | Hàng nhãn–giá trị |
| `LongTextValue` | [LongTextValue.tsx](../../src/components/ui/LongTextValue.tsx) | Văn bản dài + copy |

### 7.2 Component trạng thái & nghiệp vụ (7 file)

`EmptyState`, `ErrorState`, `LoadingState`, `QuantityInput`, `ScanModeSelector`, `ScanResultCard`, `StatusBadge`, `approval/ApprovalQueueUI`.

> ⚠️ `src/components/ScanHistoryList/index.tsx` **là orphan** — `ScanHistoryPage` tự render danh sách.

### 7.3 Hook (5 file sống)

`use-zalo-auth`, `useBarcodeScanner` (264 dòng), `useScanRequest`, `useWarehouseDashboard`. ⚠️ `hooks/useScanSession.ts` là orphan.

### 7.4 Store Zustand (3 file sống)

`scan-session.store.ts`, `receipt-session.store.ts` (211 dòng), `outbound-session.store.ts` (194 dòng). ⚠️ `stores/cart.store.tsx` là orphan.

---

## 8. Asset, icon, font

| Loại | Hiện trạng |
|---|---|
| **Icon** | ✅ 32 icon SVG inline trong 1 file [Icon.tsx](../../src/components/ui/Icon.tsx) — **không phụ thuộc icon font, port sang Flutter/RN dễ** |
| **Ảnh** | ⚠️ **12 file `src/static/*.png` đều chỉ được dùng bởi trang orphan** → không cần port |
| **Font** | ⚠️ `"Public Sans"` được khai báo ✅ [app.scss:70-71](../../src/css/app.scss) nhưng **không có `@font-face`, không có `<link>`, không có file font trong repo** (🔧 grep = 0 kết quả; `app-config.json` có `listCSS: []`). Xem lỗi D-02 |
| **Icon font ngoài ý muốn** | `zaui-icons` được nạp từ `zmp-ui/zaui.css` (🔧 `document.fonts` chỉ liệt kê `zaui-icons`) dù giao diện không dùng icon ZaUI |

---

## 9. Điều chưa kiểm tra được ở tài liệu này ⛔

1. **17/18 màn hình chưa được xem trực quan** — chỉ `AuthStatePage` (mode `login`) được render thật (🔧 @360×640 và @320×480). Các màn còn lại nằm sau `AuthGate`, cần tài khoản WMS hợp lệ.
2. Hành vi điều hướng back của Zalo WebView (nút back cứng Android) — chưa test.
3. Deep-link từ hệ thống WMS qua query param (`documentId`, `warehouse_id`, `wmsToken`…) ✅ [wms-link-context.ts:14-20](../../src/services/wms-link-context.ts) — chưa test end-to-end.
