# 02 — Kiến trúc và nền móng ứng dụng React Native

**Phạm vi:** Prompt 2 — nền móng. **Chưa chuyển đổi màn hình nghiệp vụ nào.**
**Thư mục ứng dụng:** `apps/wms-mobile/`
**Commit nguồn đã khảo sát:** `663114aff6804e50b77b88e05dda9f9c784d6fff`

---

## 1. Nền tảng và công cụ

| Hạng mục | Giá trị | Nguồn xác minh |
|---|---|---|
| Framework | React Native **0.87.1** | `package.json` — bản `latest` lúc khởi tạo |
| Ngôn ngữ | TypeScript **5.9.x** (`typescript@^6.0.3` resolve) | `package.json` devDependencies |
| React | 19.2.3 | template RN 0.87.1 |
| Kiến trúc RN | **New Architecture** (mặc định từ 0.76+) | `MainApplication.kt` dùng `getDefaultReactHost` |
| Node | v24.19.0 | `node -v` trên máy build |
| Package manager | npm 11.17.0 | `npm -v` |
| JDK | OpenJDK **17.0.19** LTS | `java -version` |
| Android SDK | compileSdk 37 · targetSdk 36 · **minSdk 24** | `android/build.gradle` |
| Build tools | 37.0.0 · NDK 27.1.12297006 · Kotlin 2.2.0 | `android/build.gradle` |
| applicationId | **`vn.info.lptech.wmshoanam`** | người dùng cung cấp 2026-09-05 |
| Tên hiển thị | **Quản lý kho** | `app-config.json` gốc (`app.title`) — không tự đặt |

### 1.1 `minSdk 24` khớp đúng Q3

Template RN 0.87.1 đặt sẵn `minSdkVersion = 24`, trùng khớp ràng buộc GATE_01 Q3
(Android 7.0 / API 24). **Không phải chỉnh sửa gì.**

### 1.2 iOS đã được gỡ khỏi phạm vi

GATE_01 Q2: *"iOS không thuộc phạm vi hiện tại và không tính là cam kết dài hạn.
❌ Không thiết kế/build/test iOS."*

> ✅ **Tái xác nhận 2026-09-05** — người dùng: *"Không triển khai iOS. Phạm vi
> hiện tại chỉ gồm Android và máy PDA Android. Không tạo hoặc cấu hình dự án
> iOS."* Xem [GATE_01 §0](gates/GATE_01.md). Quyết định gỡ iOS ở mục này **vẫn
> đúng, không phải sửa**.

Vì vậy thư mục `ios/` và `Gemfile` do template sinh ra **đã bị xoá**, script
`npm run ios` cũng đã gỡ. Để tránh tình huống tồn tại một thư mục iOS không ai
build, không ai test, rồi bị hiểu nhầm là "có hỗ trợ iOS".

> Khôi phục khi nào cần: chạy lại `init` với cùng phiên bản rồi copy thư mục
> `ios/` sang. Không mất mát gì.

### 1.3 Một sai sót của CLI đã sửa

`@react-native-community/cli` sinh cây thư mục Kotlin sai khi package name không
bắt đầu bằng `com.`:

```
android/app/src/main/java/com/vn.info.lptech.wmshoanam/   ← CLI sinh ra (sai)
android/app/src/main/java/vn/info/lptech/wmshoanam/       ← đã sửa thành
```

Khai báo `package` bên trong hai file `.kt` vốn đã đúng; chỉ đường dẫn trên đĩa sai.

---

## 2. Cấu trúc module

13 nhóm mà Prompt 2 §2 yêu cầu, ánh xạ 1:1 sang thư mục:

| # | Nhóm yêu cầu | Thư mục | Được dùng bởi |
|:--:|---|---|---|
| 1 | App bootstrap | `src/app/` | `index.js` |
| 2 | Navigation | `src/navigation/` | `App.tsx` |
| 3 | Theme và design tokens | `src/theme/` | toàn bộ `src/ui/` |
| 4 | API client | `src/api/` | màn chẩn đoán |
| 5 | Authentication/session | `src/auth/` | `api/client.ts` |
| 6 | Error handling | `src/errors/` | `api/`, `app/` |
| 7 | Logging an toàn | `src/logging/` | `api/`, `errors/` |
| 8 | Storage abstraction | `src/storage/` | `config/`, `auth/` |
| 9 | Connectivity abstraction | `src/connectivity/` | màn chẩn đoán |
| 10 | Scanner abstraction | `src/scanner/` | màn kiểm tra đầu quét |
| 11 | Feature modules | `src/features/` | `navigation/` |
| 12 | Shared UI components | `src/ui/` | toàn bộ màn hình |
| 13 | Cấu hình theo môi trường | `src/config/` | `api/client.ts` |

> Prompt 2 §2 cấm "abstraction không được sử dụng". Cột **Được dùng bởi** ở trên
> là bằng chứng: không nhóm nào đứng một mình.

---

## 3. Ba lệnh cấm của GATE_01 được cưỡng chế bằng code

Đây là quyết định kiến trúc quan trọng nhất của Prompt 2. Các lệnh cấm ở
[GATE_01 §11](gates/GATE_01.md) không được để phụ thuộc vào trí nhớ lập trình
viên — chúng nằm trong đường thực thi và có test bảo vệ.

### 3.1 Rule 6 — cấm header `Idempotency-Key`

`src/api/client.ts` giữ danh sách `FORBIDDEN_HEADERS`. Mọi request đều đi qua
`assertNoForbiddenHeaders()`; đặt header này sẽ ném `AppError{kind:'blocked_by_gate'}`
**trước khi** chạm mạng.

Test: `__tests__/apiClient.test.ts` — 3 ca, gồm cả ca không phân biệt hoa thường.

### 3.2 Rule 4 — cấm mutation lên WMS khi Gate chưa PASS

Mỗi môi trường trong `src/config/env.ts` mang cờ `wmsGateApproved`. Client chặn
mọi method ngoài `GET`/`HEAD` khi cờ còn `false`, và **không gọi `fetch`**.

Hiện tại cả 3 môi trường đều `wmsGateApproved: false` — có test khẳng định điều đó.

### 3.3 Rule 8 — cấm tự xác định môi trường `khohoanamdev.bigk.click`

Môi trường `wms_dev_unverified` mang `environmentClassVerified: false`. Tên miền
có chữ "dev" nhưng **không được coi đó là bằng chứng**. Màn chẩn đoán hiển thị
nguyên trạng thái này cho người vận hành thấy.

### 3.4 Không tự retry

API client **không có** cơ chế retry nào. Test khẳng định lỗi mạng chỉ gọi
`fetch` đúng một lần. Điều này giữ đúng GATE_01 §3: không tự retry request ghi.

---

## 4. Tầng HTTP — vì sao giữ `fetch`

Prompt 2 §4 cho phép Axios *"nếu đã được duyệt"*. Chưa duyệt, nên **không thêm
dependency**. `fetch` của RN đã đủ cho các yêu cầu §4:

| Yêu cầu §4 | Hiện thực |
|---|---|
| Base URL theo environment | `config/env.ts` → `buildUrl()` |
| Interceptor | `createApiClient(deps)` — tiêm `log`, `getSession`, `fetchImpl` |
| Timeout | `AbortController` + `setTimeout`, mặc định theo môi trường |
| Huỷ request | nhận `AbortSignal` từ bên gọi, phân biệt với timeout |
| Parse lỗi | `extractErrorCode` đọc cả `error_code`, `code`, `error.code` |
| Logging an toàn | `logging/logger.ts` che token/header/query nhạy cảm |
| Không hard-code secret | không có chuỗi bí mật nào trong `src/` |
| Không tắt TLS | xem §6 |

---

## 5. Scanner — đúng đặc tả Q4 + Q5

Theo [01-scanner-architecture-requirements.md](01-scanner-architecture-requirements.md).

### 5.1 Đã làm

- `ScanSource` — interface chung, **port** từ `BarcodeScannerAdapter` của Mini App
  (spec §4 mục 4), bỏ các thành viên chỉ có trên web (`HTMLVideoElement`, `File`).
- `KeyboardWedgeParser` — đủ **8/8** khả năng bắt buộc của spec §3, có 19 test.
- `KeyboardWedgeSource` — hiện thực `ScanSource` cho đầu quét kiểu Wedge.
- `useKeyboardWedge` — bật/tắt listener theo màn hình (spec §3 mục 8).
- Giữ nguyên danh mục `SUPPORTED_BARCODE_FORMATS` (8 định dạng) và
  `CAMERA_ERROR_CODES` (4 mã) — spec §4 mục 3 và 5.

### 5.2 Hai bài học từ Mini App cũ đã được sửa

| Lỗi cũ | Cách xử lý ở app mới |
|---|---|
| `ScanMethod = "SCANNER"` chỉ là nhãn fallback, không nguồn nào sinh ra | `ScanSourceKind` do chính nguồn đặt; wedge trả `KEYBOARD_WEDGE` thật |
| Chống trùng hard-code 1800 ms → rủi ro R-06 chặn nhầm quét nhiều đơn vị cùng SKU | `dedupeWindowMs` cấu hình được, **mặc định `0` = tắt**; có test khẳng định |

### 5.3 ❌ CHƯA làm — nói rõ, không che

**Camera adapter chưa được hiện thực.** Spec §2 xếp camera là adapter bắt buộc,
nhưng:

- cần thêm dependency native (thư viện camera + giải mã mã vạch);
- **không có thiết bị hay emulator nào kết nối** để kiểm chứng;
- Prompt 2 cấm dùng hàm rỗng/mock để tuyên bố hoàn thành.

Vì vậy ở đây **không có** file `CameraSource.ts` rỗng. Hạng mục này thuộc Prompt 3.
Interface `ScanSource` đã sẵn sàng để nhận thêm nguồn mà không phải sửa tầng gọi.

**Không có native module của bất kỳ hãng nào** (GATE_01 §11 rule 2).

---

## 6. Bảo mật

| Hạng mục | Trạng thái |
|---|---|
| TLS | **Không tắt ở bất kỳ đâu.** Manifest dùng placeholder `usesCleartextTraffic`; RN gradle plugin đặt `true` cho **debug**, `false` cho **release** — xác minh tại `AgpConfiguratorUtils.kt:37,40` |
| Secret trong source | Không có. `src/` không chứa token, mật khẩu hay khoá nào |
| Keystore | **Chưa tạo.** GATE_01 Q10 giao khoá ký cho công ty; app đang dùng debug keystore mặc định của RN |
| Ghi log | Mọi context đi qua `redact()` trước khi ra console; `Authorization`, `token`, `password`, `cookie`, `api_key`… bị che |
| Quyền Android | Chỉ `INTERNET` — nguyên trạng template, chưa thêm quyền nào |

---

## 7. Hạn chế đã biết

Ghi lại đầy đủ thay vì để người sau phát hiện.

| # | Hạn chế | Ảnh hưởng | Xử lý ở đâu |
|:--:|---|---|---|
| 1 | **Storage chưa mã hoá.** MMKV nhận `encryptionKey` nhưng khoá phải sinh/giữ trong Android Keystore — chưa làm | Token phiên nằm dưới dạng thường trên máy | Prompt 3 |
| 2 | **Chưa có luồng đăng nhập.** `session.ts` chỉ giữ và phát tán phiên, không có `login()` | Chưa gọi được API cần xác thực | Chặn bởi `GATE_WMS_API_INTEGRATION` |
| 3 | **Camera adapter chưa có** (§5.3) | Chỉ quét được bằng đầu quét Wedge | Prompt 3 |
| 4 | **Font `Public Sans` chưa nhúng** | Dùng font hệ thống — đúng như spec cho phép fallback | Prompt 3 |
| 5 | **Chưa chạy trên thiết bị/emulator thật** | Chưa có bằng chứng chạy runtime | Cần máy thật |
| 6 | Chỉ có một bộ token sáng | Mini App nguồn cũng chỉ có một bộ; không tự bịa bảng màu tối | — |

---

## 8. Tài liệu liên quan

- [02-dependency-decisions.md](02-dependency-decisions.md) — lý do từng dependency
- [02-component-mapping.md](02-component-mapping.md) — ZaUI → RN, token → RN
- [02-build-runbook.md](02-build-runbook.md) — lệnh build/lint/test
- [gates/GATE_02.md](gates/GATE_02.md) — đối chiếu điều kiện Gate
