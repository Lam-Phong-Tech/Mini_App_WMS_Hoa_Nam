# 02 — Ánh xạ component và design token

Tài liệu này ghi lại **cái gì thay cho cái gì** khi chuyển từ ZaUI (Zalo Mini App)
sang React Native, và token CSS gốc trở thành gì trong app mới.

---

## 1. ZaUI → React Native

### 1.1 Component ZaUI thực sự được dùng trong Mini App

Xác minh bằng `grep "from \"zmp-ui\"" src/` — **45 lần import**, gồm 8 tên:

| ZaUI | Số nơi dùng | Thay bằng | Trạng thái |
|---|:--:|---|---|
| `Text` | nhiều nhất | `src/ui/Text.tsx` | ✅ đã có |
| `Button` | nhiều | `src/ui/Button.tsx` | ✅ đã có |
| `List` | 1 | `src/ui/List.tsx` (FlashList) | ✅ đã có |
| `Spinner` | 4 | `ActivityIndicator` của RN — đã dùng trong `Button` khi `loading` | ✅ đã có |
| `App` | 1 (`src/app.tsx`) | `src/app/App.tsx` + `NavigationContainer` | ✅ đã có |
| `SnackbarProvider` / `useSnackbar` | 6 | *(chưa có)* | ⬜ Prompt 3 |
| `Avatar` | 1 | *(chưa có)* | ⬜ Prompt 3 |

> `SnackbarProvider` và `Avatar` **chưa được dựng**. Chúng phục vụ màn hình nghiệp
> vụ, mà Prompt 2 chưa chuyển màn nghiệp vụ nào. Dựng trước sẽ là abstraction
> không được sử dụng — điều Prompt 2 §2 cấm.

### 1.2 Năm primitive Prompt 2 §3 yêu cầu

| Yêu cầu §3 | File | Hiện thực |
|---|---|---|
| `Page` → screen wrapper + `SafeAreaView` | `src/ui/Page.tsx` | `SafeAreaView` (safe-area-context) + `StatusBar` + tiêu đề/phụ đề + giới hạn bề rộng `contentMax` |
| `Box` → `View` | `src/ui/Box.tsx` | `View` + props `padding/paddingX/paddingY/gap/row/card/align/justify/flex` theo thang token |
| `Button` → `Pressable` chuẩn hoá | `src/ui/Button.tsx` | 3 biến thể `primary/secondary/danger`, trạng thái `disabled`/`loading`, `accessibilityRole="button"`, cao tối thiểu 44 |
| `List` → `FlatList`/`SectionList` | `src/ui/List.tsx` | **`FlashList`** — GATE_01 Q1 bắt buộc, ưu tiên hơn `FlatList` |
| `Input` → `TextInput` + wrapper validation | `src/ui/Input.tsx` | nhãn, helper text, trạng thái lỗi, viền đổi theo focus/lỗi, dùng nhóm token `--wms-field-*` |

Thêm `src/ui/Text.tsx` (ngoài §3) để mọi chữ đi qua thang typography, không rơi
vào `fontSize` tuỳ tiện.

---

## 2. Design token: CSS → React Native

Nguồn: khối `:root` trong `src/css/app.scss` — **44 token gốc + 10 alias tương
thích**. GATE_01 Q7 chốt đây là *"the only visual source of truth for migrated
WMS UI"*. Bổ sung typography từ `docs/ui-system-x-vuexy.md §2`.

Đích: `apps/wms-mobile/src/theme/tokens.ts`.

### 2.1 Màu — copy nguyên giá trị

| CSS | `tokens.ts` | Giá trị |
|---|---|---|
| `--wms-surface-canvas` | `colors.surfaceCanvas` | `#f8f7fa` |
| `--wms-surface` | `colors.surface` | `#ffffff` |
| `--wms-primary` | `colors.primary` | `#7367f0` |
| `--wms-primary-strong` | `colors.primaryStrong` | `#5e54d8` |
| `--wms-primary-soft` | `colors.primarySoft` | `#efedff` |
| `--wms-text-strong` | `colors.textStrong` | `#2f2b3d` |
| `--wms-text` | `colors.text` | `rgba(47, 43, 61, 0.78)` |
| `--wms-text-muted` | `colors.textMuted` | `rgba(47, 43, 61, 0.42)` |
| `--wms-divider` | `colors.divider` | `rgba(47, 43, 61, 0.12)` |
| `--wms-success` / `-soft` / `-text` | `colors.success*` | `#28c76f` · `rgba(40,199,111,.12)` · `#167a45` |
| `--wms-danger` / `-soft` / `-text` | `colors.danger*` | `#ea5455` · `rgba(234,84,85,.12)` · `#b52f3b` |
| `--wms-warning` / `-soft` / `-text` | `colors.warning*` | `#ff9f43` · `rgba(255,159,67,.14)` · `#98520e` |
| `--wms-info` / `-soft` / `-text` | `colors.info*` | `#00cfe8` · `rgba(0,207,232,.12)` · `#087c90` |

RN nhận chuỗi `rgba(...)` nên các token trong suốt giữ nguyên dạng, không phải quy đổi.

### 2.2 Ô nhập — nhóm `--wms-field-*`

`field.height 50` · `field.radius 8` · `field.paddingX 14` · `field.border`
`rgba(47,43,61,.2)` · `borderHover .34` · `borderFocus` = primary · `borderError`
= danger · `disabledBackground rgba(47,43,61,.05)` · `labelSize 12` · `helperSize 12`.

### 2.3 Bo góc, đổ bóng

| CSS | RN | Ghi chú |
|---|---|---|
| `--wms-radius-card: 8px` | `radius.card = 8` | |
| `--wms-radius-control` | `radius.control = 8` | |
| `--wms-radius-sheet: 18px` | `radius.sheet = 18` | |
| `--wms-shadow-card: 0 4px 18px rgba(47,43,61,.10)` | `elevation.card = 4` | ⚠️ **quy đổi, không phải copy** |
| `--wms-shadow-floating: 0 8px 24px rgba(47,43,61,.14)` | `elevation.floating = 8` | ⚠️ **quy đổi, không phải copy** |

> Android không dựng bóng theo `offset/blur/color` như CSS mà theo `elevation`.
> Quy tắc quy đổi ở đây: lấy **độ lệch dọc** của bóng gốc (4px → 4, 8px → 8).
> Đây là xấp xỉ có chủ đích, cần mắt người đối chiếu trên máy thật.

### 2.4 Typography — từ `ui-system-x-vuexy.md §2`

| Vai trò | RN | Nguồn |
|---|---|---|
| `body` | 15 / 22, weight 400 | "Nội dung mặc định: 15px / 22px" |
| `caption` | 13 / 20, weight 400 | "Mô tả phụ: 13px / 20px" |
| `cardTitle` | 18 / 24, weight 600 | "Tiêu đề card: 18px / 24px, weight 500–600" |
| `metric` | 22 / 30, weight 600 | "Số liệu/KPI: 22px / 30px" |
| `screenTitle` | 21 / 28, weight 700 | "Tiêu đề màn mobile: 20–22px, weight 600–700" |

> ⚠️ **Font `Public Sans` chưa được nhúng.** `typography.fontFamily = undefined`
> → dùng font hệ thống. Spec cho phép *"fallback về font hệ thống"*, nhưng chữ sẽ
> **không giống hệt** bản thiết kế cho tới khi nhúng file font (Prompt 3).

### 2.5 Spacing, vùng chạm, breakpoint

| Nhóm | Giá trị | Nguồn |
|---|---|---|
| `spacing` | `xs 4 · sm 8 · md 12 · lg 16 · xl 24 · xxl 32` | "Thang khoảng cách: 4, 8, 12, 16, 24, 32px" |
| `touchTarget` | `min 44 · comfortable 48` | "Input/button: cao tối thiểu 44–48px" |
| `breakpoints.contentMax` | `448` | `max-w-md` tại `App.tsx:60` của Mini App |
| `breakpoints.compact` | `360` | ngưỡng máy PDA màn hẹp; audit đã đo bố cục không tràn ở 320px |
| `motion` | `fast 140 · normal 220` | `--wms-motion-fast/normal` |

### 2.6 Token CSS **không** chuyển sang

| CSS | Vì sao bỏ |
|---|---|
| `--zaui-light-bottom-navigation-divider-color` | thuộc ZaUI, app mới không dùng ZaUI |
| `--wms-ease: cubic-bezier(.4,0,.2,1)` | RN dùng `Easing` của `Animated`; sẽ ánh xạ khi có animation đầu tiên (Prompt 3) |
| `--wms-focus-ring` | khái niệm focus ring của trình duyệt; Android dùng ripple/`pressed` state |
| 10 alias tương thích (`--wms-ink`, `--wms-navy`, `--wms-blue`…) | đều trỏ về token X đã có; giữ alias chỉ làm hai đường dẫn tới cùng một màu |

---

## 3. Scanner: interface cũ → mới

Spec §4 mục 4 yêu cầu **port** `BarcodeScannerAdapter` thay vì thiết kế lại.

| `BarcodeScannerAdapter` (Mini App) | `ScanSource` (app mới) | Ghi chú |
|---|---|---|
| `initialize()` · `start()` · `pause()` · `resume()` · `stop()` | giữ nguyên | |
| `isSupported()` · `isContinuous()` · `getName()` | giữ nguyên | |
| `switchCamera?()` · `toggleTorch?()` | giữ nguyên (tuỳ chọn) | |
| `attachVideoElement?(HTMLVideoElement)` | **bỏ** | DOM không tồn tại trong RN |
| `scanImageFile?(File)` | **bỏ** | `File` là API trình duyệt |
| — | **thêm** `getKind(): ScanSourceKind` | Sửa lỗi cũ: nguồn quét phải phản ánh nguồn thật (spec §4 mục 1) |

`ScanDetectedResult`: `detected_at` (snake_case) → `detectedAt` (camelCase, chuẩn
TypeScript), thêm trường `source`.
