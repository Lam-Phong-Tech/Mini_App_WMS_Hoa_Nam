# 01 — Source Audit (Giai đoạn 1)

> **Phạm vi:** chỉ khảo sát, kiểm kê, xác định phạm vi. Không viết lại ứng dụng, không chọn nền tảng đích, không sửa logic nghiệp vụ.

## Quy ước ký hiệu bằng chứng

| Ký hiệu | Ý nghĩa |
|---|---|
| ✅ | Đã xác minh bằng mã nguồn (có `file:line`) |
| 🔧 | Đã xác minh bằng lệnh chạy thực tế (có exit code) |
| ❓ | Nhận định — **cần người dùng xác nhận** |
| ⛔ | Chưa thể kiểm tra trong giai đoạn này |

---

## 1. Ảnh chụp trạng thái repository

| Mục | Giá trị | Bằng chứng |
|---|---|---|
| Remote | `https://github.com/Lam-Phong-Tech/Mini_App_WMS_Hoa_Nam.git` | 🔧 `git remote -v` (exit 0) |
| Branch | `main` | 🔧 `git rev-parse --abbrev-ref HEAD` (exit 0) |
| **Commit SHA khảo sát** | **`663114aff6804e50b77b88e05dda9f9c784d6fff`** | 🔧 `git rev-parse HEAD` (exit 0) |
| Short SHA | `663114a` | 🔧 `git rev-parse --short HEAD` (exit 0) |
| Working tree **tại thời điểm khảo sát 2026-09-04** | **Sạch** — không có file modified/untracked | 🔧 `git status --porcelain=v1` trả về rỗng (exit 0) |
| Working tree **hiện nay** | ⚠️ **Không còn sạch** — 2 modified · 10 deleted chưa commit · 13 untracked | 🔧 `git status --porcelain=v1` 2026-09-05 (exit 0). Nguyên nhân: xoá `docs/design/` (§6b GATE_01), retention hotfix ở `backend/`, và `apps/wms-mobile/` của Prompt 2. **`src/` vẫn 0 thay đổi** — `git diff --stat HEAD -- src/` rỗng, nên mọi kết luận khảo sát dưới đây còn nguyên hiệu lực |
| Số file tracked | 551 | 🔧 `git ls-files \| wc -l` (exit 0) |

3 commit gần nhất (🔧 `git log --oneline -5`, exit 0):

```
663114a feat: refine mini app approval and form flows
024fd14 fix app
b9d4d02 chore: initialize Mini App WMS source
```

> **Không có thay đổi nào của người dùng bị ghi đè.** Toàn bộ khảo sát chỉ đọc; build sản phẩm được ghi ra thư mục scratchpad ngoài repo, không ghi vào `www/`.

---

## 2. Các lệnh đã thực sự chạy

| # | Lệnh | Exit code | Kết quả |
|---|---|---|---|
| 1 | `git rev-parse HEAD` | 0 | `663114aff6804e50b77b88e05dda9f9c784d6fff` |
| 2 | `git status --porcelain=v1` | 0 | rỗng (clean) |
| 3 | `git ls-files \| wc -l` | 0 | `551` |
| 4 | `npx tsc --noEmit` | **0** | **Không có lỗi TypeScript** |
| 5 | `npx vite build --outDir <scratchpad>/dist --emptyOutDir` | **0** | built in 1m32s · 568 modules · 26 JS chunks · tổng 1.3 MB |
| 6 | `node reach.mjs` (script phân tích đồ thị import, tự viết trong scratchpad) | 0 | 76 file reachable / 79 file orphan |
| 7 | `npx vite --port 5199 --strictPort` | (chạy nền) | VITE v5.4.21 ready in 8954 ms |
| 8 | `curl http://localhost:5199/` | 0 | HTTP 200 — lần đầu 64.3s, sau khi warm 0.03s |
| 9 | `curl http://localhost:5199/src/index.ts` | 0 | HTTP 200 — lần đầu 114.8s, sau khi warm 0.08s |
| 10 | `wc -c` trên `node_modules/zmp-ui/zaui.css`, `src/css/app.scss`, CSS đã build | 0 | 120 826 / 39 146 / 172 191 bytes |
| 11 | Render thực tế trên trình duyệt @360×640 và @320×480 | — | Màn `Đăng nhập` render đúng (xem §7) |
| 12 | `document.fonts` introspection trong trang đang chạy | — | Chỉ `zaui-icons` được load; **không có webfont Public Sans** |

> ⛔ **Chưa chạy (frontend):** không có script `lint`, `test`, `typecheck` trong `package.json` ✅ [package.json](../../package.json).
>
> ✅ **Backend đã chạy được** (cập nhật 2026-09-04): PHP 8.3.30 + Composer 2.10 có sẵn, `backend/vendor/` tồn tại. `php artisan test` → baseline **5 passed**, sau retention hotfix **36 passed, exit 0**.

---

## 3. Phát hiện quan trọng nhất — `CLAUDE.md` đã lỗi thời

`CLAUDE.md` ở gốc repo mô tả dự án là **"ZaUI Bistro" — app đặt món ăn/cà phê**, và khẳng định `src/app.tsx` là "màn hình tracking độc lập, không render `router.tsx`".

**Cả hai điều này đều sai so với mã nguồn tại `663114a`:**

| `CLAUDE.md` nói | Thực tế đã xác minh |
|---|---|
| App đặt món "BachHoa", title `BachHoa` | ✅ `app-config.json:3` → `"title": "Quản lý kho"`, `template.name: "warehouse-scanner"` |
| `src/app.tsx` POST tracking event tới ngrok | ✅ [src/app.tsx:12](../../src/app.tsx) → render `<RouterProvider router={router}/>` với `router` từ `@/app/routes` |
| Router là `src/router.tsx` | ✅ Router thật là [src/app/routes.tsx](../../src/app/routes.tsx). `src/router.tsx` **không được import ở đâu cả** (🔧 grep + phân tích reachability) |
| State: Zustand cart + TanStack Query | ✅ Cart store & TanStack Query **đều là code chết** (§5) |

**Hệ quả:** không được dùng `CLAUDE.md` làm nguồn sự thật cho migration. ❓ *Cần xác nhận:* có cập nhật lại `CLAUDE.md` trong một giai đoạn sau không (ngoài phạm vi Giai đoạn 1).

---

## 4. Ngăn xếp công nghệ thực tế

| Lớp | Công nghệ | Phiên bản | Bằng chứng |
|---|---|---|---|
| UI runtime | React | 18.3.1 | ✅ package.json:26 |
| Router | react-router-dom | 7.11.0 | ✅ package.json:29 — `createBrowserRouter` |
| Build | Vite + `zmp-vite-plugin` | 5.2.13 / 1.1.6 | ✅ [vite.config.mts](../../vite.config.mts) |
| Ngôn ngữ | TypeScript `strict: true` | 5.7.3 | ✅ [tsconfig.json](../../tsconfig.json) |
| CSS | Tailwind 3.4.3 + SCSS | — | ✅ [tailwind.config.js](../../tailwind.config.js), [src/css/app.scss](../../src/css/app.scss) (1793 dòng, 281 biến `--wms-*`) |
| State | Zustand | 5.0.9 | ✅ 3 store: `scan-session`, `receipt-session`, `outbound-session` |
| Quét mã | `@zxing/browser` 0.2.1 + `@zxing/library` 0.23.0 | — | ✅ [src/services/scanner-adapter.ts:12-13](../../src/services/scanner-adapter.ts) |
| Zalo UI | `zmp-ui` | 1.11.14 | ✅ chỉ 2 component (§6) |
| Zalo SDK | `zmp-sdk` | 2.52.2 | ✅ **0 lời gọi trong code sống** (§6) |

> ⚠️ **Dependency chưa khai báo:** `@zxing/library` được `import` trực tiếp tại ✅ [src/services/scanner-adapter.ts:13](../../src/services/scanner-adapter.ts) nhưng **không có trong `dependencies` của `package.json`** (🔧 `grep -n zxing package.json` chỉ trả về `@zxing/browser`). Hiện chạy được vì nó là transitive dependency của `@zxing/browser` (🔧 xác minh trong `package-lock.json:1911`). Nếu `@zxing/browser` đổi cây phụ thuộc, build sẽ vỡ.

> ℹ️ `zmp-cli.json` khai báo `stateManagement: "jotai"` và `template: "single-view"` — ✅ **không khớp** thực tế (Zustand, multi-route). File này không được đọc lúc runtime.

---

## 5. Code chết — 79/155 file trong `src/` không reachable

🔧 Phân tích đồ thị import từ entry `src/index.ts` (script `reach.mjs`, exit 0): **76 file reachable, 79 file orphan.**

Toàn bộ cây "ZaUI Bistro" là code chết:

| Nhóm orphan | Ví dụ file | Số lượng |
|---|---|---|
| Router cũ | `src/router.tsx` | 1 |
| Trang bán hàng | `pages/home`, `menu`, `checkout`, `order`, `order-detail`, `order-success`, `product-detail`, `search`, `select-location`, `profile`, `custom-request/**` | 13 |
| Component bistro | `components/common/**` (25 file), `components/layout/**` (4 file) | 29 |
| Layer service mock | `services/product/**`, `services/category/**`, `services/order/**`, `services/custom-request/**` | 15 |
| TanStack Query | `lib/query-client.ts`, `lib/react-query-provider.tsx`, `lib/api-error.ts` | 3 |
| Cart | `stores/cart.store.tsx`, `types/cart.types.ts`, `utils/cart.ts`, `utils/order.ts`, `utils/product.ts` | 5 |
| Design tokens cũ | `src/tokens.js`, `src/constants/copy.ts`, `src/constants/api.ts` | 3 |
| Khác | `components/ScanHistoryList`, `hooks/useScanSession.ts`, `hooks/use-subcategory-visibility.ts`, `utils/cn.tsx`, `utils/format.ts`, `utils/formatDateTime.ts`, `utils/scroll-to.ts`, `global.d.ts` | 8 |

**Hệ quả cho migration:**
- ✅ `@tanstack/react-query`, `clsx`, `tailwind-merge`, `zustand`(cart), và **toàn bộ 12 file ảnh `src/static/*.png`** chỉ phục vụ code chết → **không cần port**.
- ⚠️ `docs/vuexy-miniapp-progress.md` (dòng "Stack thực tế") liệt kê **TanStack Query** là một phần stack đang chạy — ✅ điều này **sai**: `@tanstack/react-query` chỉ xuất hiện trong `src/lib/*` vốn orphan.
- ❓ *Cần xác nhận:* phạm vi migration **chỉ gồm 76 file reachable**, bỏ hoàn toàn 79 file orphan — đúng không?

---

## 6. Mức độ phụ thuộc nền tảng Zalo — **thấp bất ngờ**

Đây là phát hiện có ảnh hưởng lớn nhất tới chi phí migration.

### 6.1 Zalo Mini App SDK: **0 lời gọi trong code sống** ✅

🔧 `grep -rn "zmp-sdk" src/` trả về đúng **2 kết quả, cả hai đều ở file orphan**:

| File | Dòng | API | Trạng thái |
|---|---|---|---|
| `src/hooks/use-subcategory-visibility.ts` | 2, 29, 45, 101 | `nativeStorage` | **orphan** |
| `src/pages/checkout/index.tsx` | 19 | `getPhoneNumber` | **orphan** |

### 6.2 `api.scanQRCode`: **không tồn tại** ✅

🔧 `grep -rn "scanQRCode" src/` → **0 kết quả**.

Yêu cầu khảo sát đề cập "vị trí sử dụng `api.scanQRCode`". **Trong repository này không có lời gọi nào như vậy.** Ứng dụng quét mã hoàn toàn bằng **`@zxing/browser` + `getUserMedia`** trên video element ✅ [src/services/scanner-adapter.ts](../../src/services/scanner-adapter.ts), có nhánh dùng `BarcodeDetector` gốc của trình duyệt khi khả dụng ✅ (`initializeNativeDetector`, dòng 603).

### 6.3 ZaUI (`zmp-ui`) trong code sống: **2 component + 1 stylesheet** ✅

| Vị trí | Dùng gì |
|---|---|
| ✅ [src/app.tsx:3](../../src/app.tsx) | `App`, `SnackbarProvider` |
| ✅ [src/index.ts:2](../../src/index.ts) | `import "zmp-ui/zaui.css"` |

22 lời gọi `zmp-ui` khác (`Button`, `Text`, `Spinner`, `Avatar`, `List`, `useSnackbar`) đều nằm ở **file orphan**.

> **Chi phí kèm theo:** `zaui.css` nặng **120 826 bytes**, chiếm **~70% CSS đã build (172 191 bytes)** 🔧, chỉ để phục vụ 2 component. Toàn bộ giao diện thật do `src/css/app.scss` (39 146 bytes, 281 biến `--wms-*`) + Tailwind đảm nhiệm.

### 6.4 Kết luận phụ thuộc nền tảng

**Ứng dụng thực chất là một web app React thuần chạy trong WebView của Zalo.** Bề mặt API riêng của Zalo cần thay thế khi migration gần như bằng **không**:

| Hạng mục | Số lượng phải port |
|---|---|
| Zalo SDK API | **0** |
| ZaUI component | **2** (`App`, `SnackbarProvider` — đều có thể thay bằng widget gốc) |
| Zalo OAuth / getUserInfo / getAccessToken | **0** — xác thực bằng email + mật khẩu (§8) |

---

## 7. Xác thực & phiên

### 7.1 Cơ chế thật: **email + mật khẩu**, không phải Zalo OAuth ✅

Dù tên file là `zalo-auth.service.ts`, luồng xác thực là:

| Bước | Endpoint | Bằng chứng |
|---|---|---|
| Đăng nhập | `POST /api/v1/auth/login` với `{email, password}` | ✅ [src/services/zalo-auth.service.ts:88](../../src/services/zalo-auth.service.ts) |
| Lấy user hiện tại | `GET /api/v1/auth/me` | ✅ dòng 104 |
| Đăng xuất | `POST /api/v1/auth/logout` | ✅ dòng 119 |

### 7.2 Lưu trữ token

| Khoá | Storage | Bằng chứng |
|---|---|---|
| `miniapp_warehouse_session_token` | `localStorage` | ✅ [auth-session.service.ts:1,30](../../src/services/auth-session.service.ts) |
| `miniapp_warehouse_session_expires_at` | `localStorage` | ✅ dòng 2, 40 |
| `miniapp_warehouse_session_started_at` | `localStorage` | ✅ dòng 3, 33 |
| `miniapp_warehouse_staff` (hồ sơ nhân viên, JSON) | `localStorage` | ✅ [zalo-auth.service.ts:9,72](../../src/services/zalo-auth.service.ts) |
| `miniapp_wms_access_token` | `sessionStorage` | ✅ [wms-link-context.ts:4,133](../../src/services/wms-link-context.ts) |
| `miniapp_wms_link_context` | `localStorage` **và** `sessionStorage` | ✅ dòng 3, 123-130 |

Header gửi đi: `Authorization: Bearer <token>` ✅ [api-client.ts:282](../../src/services/api-client.ts) → `getMiniAuthHeaders()`.

Xử lý lỗi tập trung ✅ [api-client.ts:336-345](../../src/services/api-client.ts):
- HTTP **401** (trừ request login) → `notifyMiniSessionExpired()` → xoá token → màn `session`
- HTTP **403** (trừ request login) → `notifyMiniPermissionDenied()` → màn `permission`

### 7.3 Phân quyền phía client: **không có** ✅

🔧 `grep -rn "staff\.role|role ===|hasRole|allowedRoles" src/` → chỉ **1 kết quả** duy nhất là **hiển thị**, không phải kiểm soát:

```
src/pages/HomePage/index.tsx:44:  const staffRole = dashboard?.warehouse_staff.role || staff.role;
```

**Không có route nào, nút nào hay hành động nào bị chặn theo vai trò ở phía client.** Toàn bộ phân quyền do backend quyết định qua HTTP 403.

> ❓ *Cần xác nhận:* app mới có cần RBAC phía client (ẩn/hiện chức năng theo vai trò) không, hay giữ nguyên mô hình "server quyết định, client hiển thị lỗi 403"?

### 7.4 ⚠️ Token lưu dạng plaintext

Access token và hồ sơ nhân viên nằm trong `localStorage`/`sessionStorage` dạng chuỗi thuần. Trong WebView Zalo rủi ro thấp, nhưng khi chuyển sang app native, ❓ *cần xác nhận* có yêu cầu dùng secure storage (Keychain / Android Keystore / `flutter_secure_storage` / `react-native-keychain`) hay không.

---

## 8. Backend & hợp đồng API

### 8.1 ⚠️ `backend/` trong repo **KHÔNG phải** backend mà app đang gọi

| | Bề mặt API |
|---|---|
| **Frontend gọi** | `/api/v1/auth/*`, `/api/v1/inbound-documents/*`, `/api/v1/mini-app/*`, `/api/v1/inventory/*`, `/api/v1/products`, `/api/v1/warehouses`, `/api/v1/scan/*`, `/api/v1/defects` ✅ (§ [01-dependency-inventory.md](01-dependency-inventory.md)) |
| **`backend/` Laravel cung cấp** | `/api/zalo/login`, `/api/warehouse-scans/*`, `/api/receipts/{id}/scans`, `/api/outbounds/{id}/scans`, `/api/warranty/item-lookup`, `/api/component-issues/{id}/scans`, `/api/inventory/lookup-by-code` ✅ [backend/routes/api.php](../../backend/routes/api.php) |

🔧 `grep -rn "v1" backend/routes/ backend/app/Http/Controllers/` → **0 kết quả**. Backend đi kèm **không định nghĩa bất kỳ route `/v1/` nào**.

**Kết luận:** Mini App nói chuyện với một **WMS backend bên ngoài** tại `https://khohoanamdev.bigk.click` ✅ ([.env.example](../../.env.example), [vite.config.mts](../../vite.config.mts) proxy). Thư mục `backend/` là một dịch vụ phụ riêng biệt (webhook ZNS + scan store), ❓ *cần xác nhận vai trò của nó*.

> ⛔ **BLOCKER cho Giai đoạn 2:** **Không có tài liệu hợp đồng API (OpenAPI/Swagger) của WMS backend trong repository.** Toàn bộ hiểu biết về request/response hiện chỉ suy ra được từ TypeScript interface trong `src/services/*.ts`. Không thể xác minh tính đầy đủ/chính xác nếu không có spec chính thức.

### 8.2 ⚠️ `docs/design/` mô tả **một sản phẩm khác** — 🗑️ **ĐÃ XOÁ 2026-09-04**

> **Trạng thái:** thư mục này đã được xoá theo phê duyệt Q7 của người dùng ngày 2026-09-04. Chi tiết quy trình, danh sách file và bản ghi phục hồi tại [01-backend-audit.md §10](01-backend-audit.md).
> Phục hồi (nếu cần): `git checkout 663114aff6804e50b77b88e05dda9f9c784d6fff -- docs/design/`

Ghi nhận tại thời điểm khảo sát: 10 tài liệu trong `docs/design/` (`README.md`, `01-business-analysis.md` … `09-phase-plan.md`) là hồ sơ thiết kế của **"Zalo Mini App Hoa Tươi" — một app bán hoa** (✅ `docs/design/README.md:1` — *"Hồ sơ thiết kế — Zalo Mini App Hoa Tươi"*).

Ví dụ ✅ `docs/design/05-api-contract.md` định nghĩa `/v1/cart/items`, `/v1/custom-flower-requests`, actor `Florist`, `flower-types`. 🔧 `grep -rlin "hoa tươi|florist|flower" docs/design/` → khớp **7/10 file**; 3 file còn lại cũng thuần nội dung giỏ hàng/checkout/voucher, **0 từ khoá WMS**.

**Không được dùng `docs/design/` làm nguồn sự thật cho WMS.**

### 8.3 Tài liệu hợp lệ cho WMS

| File | Nội dung | Đánh giá |
|---|---|---|
| ✅ [docs/ui-system-x-vuexy.md](../../docs/ui-system-x-vuexy.md) (134 dòng) | Hệ design "X" chuyển thể từ Vuexy: token màu, typography, spacing | **Hợp lệ** — khớp URL thiết kế người dùng cung cấp |
| ✅ [docs/vuexy-miniapp-progress.md](../../docs/vuexy-miniapp-progress.md) (401 dòng) | Kiểm kê route đang chạy, dependency map | **Hợp lệ, đối chiếu độc lập khớp với khảo sát này** (trừ điểm TanStack Query ở §5) |

---

## 9. Biến môi trường

| Biến | Có trong `.env.example`? | Có trong `.env`? | Dùng ở đâu |
|---|---|---|---|
| `APP_ID` | ✅ | ✅ | ZMP CLI |
| `ZMP_TOKEN` | ✅ | ✅ | ZMP CLI |
| `VITE_API_BASE_URL` | ✅ | ✅ | ✅ api-client.ts:9 |
| `VITE_WMS_API_BASE_URL` | ✅ | ✅ | ✅ wms-link-context.ts:66,79 |
| `VITE_USE_SCAN_MOCK` | ✅ | ✅ | ✅ scan.service.ts:27 |
| `VITE_WMS_DEV_DIRECT` | ❌ **thiếu** | ❌ | ✅ wms-link-context.ts:64 |
| `VITE_WMS_DEV_PROXY_BASE_URL` | ❌ **thiếu** | ❌ | ✅ wms-link-context.ts:73 |
| `VITE_SCAN_ADAPTER` | ❌ **thiếu** | ❌ | ✅ scanner-adapter.ts:800 |
| `VITE_APP_VERSION` | ❌ **thiếu** | ❌ | ✅ constants/runtime.ts:3 |
| `VITE_RUNTIME_SHA` | ❌ **thiếu** | ❌ | ✅ constants/runtime.ts:5 |
| `VITE_BUILT_AT` | ❌ **thiếu** | ❌ | ✅ constants/runtime.ts:6 |

**6/11 biến môi trường không được tài liệu hoá** trong `.env.example` hay `RUN_ON_OTHER_MACHINE.md`. Xem lỗi cấu hình phát sinh tại [01-ui-ux-defects.md](01-ui-ux-defects.md) §D-01.

---

## 10. Kiểm thử

| Phạm vi | Kết quả |
|---|---|
| Frontend | 🔧 `find src -name "*.test.*" -o -name "*.spec.*"` → **0 file**. Không có test runner trong `package.json`. **Độ bao phủ = 0%** |
| Backend (`backend/`) | ✅ 3 file: `tests/Feature/ExampleTest.php`, `tests/Unit/ExampleTest.php` (stub mặc định Laravel), `tests/Feature/ZaloWebhookTest.php` (test thật duy nhất) |
| ✅ Đã chạy | `php artisan test` → **36 passed, 89 assertions, exit 0** (baseline trước hotfix: 5 passed) |

**Không có lưới an toàn hồi quy nào cho migration.** Đây là rủi ro cao nhất về mặt kỹ thuật.

---

## 11. Ma trận màn hình → tính năng → file nguồn

Xem chi tiết tại **[01-screen-inventory.md](01-screen-inventory.md)**.

Tóm tắt: **22 khai báo route** → **17 page component** + NotFound + AuthState (10 chế độ) · **5 ngữ cảnh quét** · **4 luồng nghiệp vụ** (Nhập kho, Xuất kho, Bảo hành, Tra cứu tồn) · **1 luồng duyệt phiếu**.

---

## 12. Điều chưa thể kiểm tra ⛔

| # | Hạng mục | Lý do |
|---|---|---|
| 1 | Hợp đồng API WMS thật | Không có spec trong repo; backend ở ngoài (`khohoanamdev.bigk.click`) |
| 2 | Toàn bộ màn hình sau đăng nhập | Cần tài khoản WMS hợp lệ; ở chế độ DEV base URL trỏ `http://localhost:2999` không có service chạy (xem D-01) |
| 3 | Hành vi trong WebView Zalo thật | Chỉ render được trên Chromium desktop; chưa chạy `zmp start` với App ID thật |
| 4 | Quét mã bằng camera thật | Cần thiết bị có camera + mã QR/barcode vật lý |
| 5 | Hành vi trên máy PDA | **Chưa biết model PDA** — chờ trả lời câu hỏi Q4 |
| 6 | Hiệu năng danh sách lớn | Cần dữ liệu thật với số lượng lớn |
| 7 | Backend `backend/` phục vụ HTTP được không | Bộ test chạy được, nhưng **chưa khởi động server HTTP** và chưa gọi endpoint nào |
| 8 | Focus tự động sau khi validate form | `requestAnimationFrame` bị treo khi pane trình duyệt ẩn → kết quả đo không tin cậy (xem R-07) |

---

## 13. Liên kết tài liệu

- [01-screen-inventory.md](01-screen-inventory.md) — ma trận màn hình/route/file
- [01-dependency-inventory.md](01-dependency-inventory.md) — API, SDK, storage, dependency cần thay thế
- [01-ui-ux-defects.md](01-ui-ux-defects.md) — lỗi UI đã xác minh + nguy cơ chưa xác minh
- [01-platform-comparison.md](01-platform-comparison.md) — Flutter vs React Native
- [gates/GATE_01.md](gates/GATE_01.md) — trạng thái cổng kiểm soát
