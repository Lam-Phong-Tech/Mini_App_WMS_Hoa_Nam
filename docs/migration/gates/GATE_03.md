# GATE 03 — Scanner, API, lưu trữ và đồng bộ offline

| | |
|---|---|
| **Trạng thái** | ✅ **PASS** |
| **Token** | ✅ **Đã phát hành** — xem §7 |
| **Ngày nghiệm thu** | 2026-09-05 — người dùng gửi `APPROVE_GATE_03` |
| **Điều kiện** | **8/8 trong phạm vi Gate** · ĐK6 hoãn sang Gate WMS |
| **Gate trước** | `GATE_02_PASS\|sha=663114aff6804e50b77b88e05dda9f9c784d6fff\|target=ANDROID_REACT_NATIVE\|build=f87d1c42f406ed107033f67bf35789e7ed491e43425aa0b5f4c00f291788ba77` |
| **Commit nguồn** | `663114aff6804e50b77b88e05dda9f9c784d6fff` — khớp `HEAD`, `src/` **0 thay đổi** |
| **BUILD_ID** | `b2b6ae51390670fec876bdea852dbebb9b6650936b429cc5cf78ddefd28ee2c1` — 185.043.499 byte |
| **Change Control** | **2026-09-05** — ĐK6 tách sang [`GATE_WMS_API_INTEGRATION`](GATE_WMS_API_INTEGRATION.md) (§0) |
| **⚠️ Cảnh báo** | **Duyệt Gate này ≠ sẵn sàng production** — xem §6 |

> 🔴 **ĐỌC KỸ PHẠM VI TRƯỚC KHI DÙNG GATE NÀY LÀM CĂN CỨ — xem §0c.**
>
> Người dùng nêu phản đối trước khi duyệt: *"chưa có luồng hay giao diện gì vào app cả"* — **đúng sự thật**.
> Gate này **KHÔNG** chứng nhận giao diện nghiệp vụ. Xem §0c để biết chính xác cái gì được duyệt.

---

## 0. Change Control 2026-09-05 — tách ĐK6 sang Gate WMS

### 0.1 Sự việc

`GATE_03` đạt 8/9. Điều kiện còn lại — **ĐK6**, *"API mapping khớp mã nguồn cũ hoặc contract chính thức"* — **không thể đóng bằng nỗ lực phía client**: nó phụ thuộc hoàn toàn vào việc chủ sở hữu WMS giao contract chính thức, mà `GATE_WMS_API_INTEGRATION` vẫn BLOCKED.

Giữ ĐK6 trong `GATE_03` sẽ chặn Prompt 4 vô thời hạn vì một lý do nằm ngoài tầm kiểm soát của đội phát triển.

### 0.2 Quyết định của người dùng

Tách **ĐK6** sang [`GATE_WMS_API_INTEGRATION`](GATE_WMS_API_INTEGRATION.md) — đúng tiền lệ Change Control 2026-09-04 đã áp dụng cho Q4/Q5/Q9 của `GATE_01`.

### 0.3 Phạm vi `GATE_03` sau khi tách

> **Gate chứng nhận scanner, storage và cơ chế đồng bộ phía client.**
> **KHÔNG phải** Gate chứng nhận API nghiệp vụ, **KHÔNG phải** Gate chứng nhận PDA thật.

| Phần | Thuộc Gate nào |
|---|---|
| Camera scanner, keyboard wedge parser | `GATE_03` ✅ |
| Storage, schema, migration | `GATE_03` ✅ |
| Hàng đợi offline, máy trạng thái, chống trùng | `GATE_03` ✅ |
| Tầng client HTTP: lỗi, timeout, huỷ, redact | `GATE_03` ✅ |
| **Đấu nối ~42 endpoint nghiệp vụ** | → `GATE_WMS_API_INTEGRATION` |
| **Đối chiếu payload/response với server thật** | → `GATE_WMS_API_INTEGRATION` |
| **Đầu quét phần cứng, hậu tố PDA thật** | → `GATE_PDA_HARDWARE_CERTIFICATION` |

### 0.4 🔴 Việc tách KHÔNG rút ngắn gì

Bốn điều cấm mới ghi tại [`GATE_WMS_API_INTEGRATION` §2b.3](GATE_WMS_API_INTEGRATION.md), có hiệu lực tới khi Gate đó PASS:

1. Cấm tuyên bố *"API mapping đã hoàn tất"* hoặc *"đồng bộ hoạt động với backend"*
2. Cấm đấu nối bất kỳ endpoint nghiệp vụ nào ở Prompt 4
3. Cấm thay `gateBlockedSender` bằng bộ gửi thật
4. Cấm bật `wmsGateApproved: true` cho bất kỳ môi trường nào

---

## 0c. 🔴 Phạm vi thực tế của việc duyệt Gate này

### 0c.1 Phản đối của người dùng trước khi duyệt

> *"chưa được — hiện chưa có luồng hay giao diện gì vào app cả"* — 2026-09-05

**Phản đối này đúng sự thật.** Số liệu kiểm chứng bằng lệnh cùng ngày:

| | App RN | Mini App cũ |
|---|:--:|:--:|
| Màn hình | **3** — đều là màn chẩn đoán | **17 màn nghiệp vụ** |
| Route | 3 | 22 |
| **Màn nghiệp vụ** | **0** | 17 |

Ba màn hiện có: `DiagnosticsScreen` · `ScanTestScreen` · `CameraScanScreen`. **Không có** Home, nhập kho, xuất kho, bảo hành, duyệt phiếu.

### 0c.2 Vì sao vẫn duyệt

Prompt 3 đặt mục tiêu là *"thay thế phụ thuộc Zalo về scanner, API và storage"* và cấm *"tự triển khai Prompt 4"*. Danh sách đầu ra bắt buộc không có màn hình nghiệp vụ nào — đó là phạm vi **Prompt 4**.

Người dùng chọn **"Duyệt Gate 03 theo đúng phạm vi đã ghi"**, rồi sang Prompt 4 làm toàn bộ màn nghiệp vụ.

### 0c.3 ✅ Gate này chứng nhận gì

| Hạng mục | Mức kiểm chứng |
|---|---|
| Camera scanner | Đọc **19 mã QR thật** trên điện thoại Android, 0 trùng |
| Keyboard wedge parser | 20 ca test |
| Storage + schema + migration | 15 ca test, chạy thật trên máy |
| Hàng đợi offline + chống trùng | 27 ca test, tồn tại qua restart |
| Tầng client HTTP | 22 ca test + **9 ca contract test dùng phản hồi thật từ staging** |

### 0c.4 ❌ Gate này KHÔNG chứng nhận gì

| Hạng mục | Trạng thái |
|---|---|
| **Giao diện nghiệp vụ** | **0/17 màn** — thuộc Prompt 4 |
| **Luồng nghiệp vụ chạy được đầu-cuối** | **chưa có** |
| Endpoint nghiệp vụ đã đấu nối | **0/42** — ĐK6 hoãn sang Gate WMS |
| Đầu quét PDA phần cứng | **chưa thử lần nào** |
| Đồng bộ chạy với backend thật | **chưa** |

### 0c.5 ⚠️ Một yêu cầu Prompt 3 chưa đóng được vì thiếu giao diện

Prompt 3 §B mục 7 — *"Giữ focus hợp lý mà không làm hỏng form"* — vẫn ở mức **⚠️ chưa kiểm chứng**, vì **chưa có form nghiệp vụ nào để thử**. Ghi tại [03-scanner-design.md §1.2](../03-scanner-design.md).

Phải đóng ở Prompt 4 khi có form thật.

---

## 1. Điều kiện khởi động Prompt 3

| ĐK | Nội dung | Kết quả |
|:--:|---|---|
| 1 | Gate 01 và Gate 02 đều PASS | ✅ cả hai `PASS` |
| 2 | Token, commit SHA, build ID khớp | ✅ SHA khớp `HEAD`; APK sha256 khớp `BUILD_ID` từng byte |
| 3 | Smoke build nền móng trước khi sửa | ✅ `tsc` 0 · `eslint` 0 · `jest` 62/62 (trước khi sửa) |
| 4 | Có đủ thông tin thiết bị / suffix / contract / auth / quy tắc đồng bộ | 🔴 **thiếu 3/5** — xem §2 |
| 5 | Không tự đặt quy tắc xung đột hoặc idempotency | ✅ đã **dừng và hỏi**, người dùng chốt — xem §3 |

## 2. Ba dữ liệu bắt buộc còn thiếu

| Dữ liệu | Trạng thái | Hệ quả |
|---|:--:|---|
| `[MODEL_PDA]` | 🔴 trống | Không tích hợp Broadcast Intent / SDK hãng (§11 điều 2 cấm) |
| `[CHẾ_ĐỘ_SCANNER]` + hậu tố thật | 🔴 trống | Parser giữ suffix **cấu hình được**; `Enter` chỉ là mặc định local (§11 điều 3) |
| API contract chính thức + authentication | 🔴 trống | **Chưa đấu nối endpoint nghiệp vụ nào** |

Cả ba đều nằm sau hai Gate **vẫn BLOCKED**: `GATE_PDA_HARDWARE_CERTIFICATION` và `GATE_WMS_API_INTEGRATION`.

---

## 3. Ba quyết định người dùng chốt 2026-09-05

Tôi **dừng và hỏi** đúng theo điều kiện khởi động, không tự quyết:

| # | Câu hỏi | Người dùng chốt |
|:--:|---|---|
| 1 | Phạm vi Prompt 3 khi §D bị GATE_01 chặn | **Gỡ ràng buộc GATE_01 để làm §D** → ghi Change Control tại [GATE_01 §0b](GATE_01.md) |
| 2 | Idempotency | **Chống trùng phía client, KHÔNG tự retry.** Timeout → `unknown`, dừng, người dùng tự kiểm tra WMS |
| 3 | Xung đột | **Không bao giờ tự giải quyết.** Đánh dấu `conflict`, giữ nguyên dữ liệu local |
| 4 | Axios | **Giữ `fetch`** |
| 5 | `react-native-vision-camera` | **Duyệt** → nhưng v5 **chỉ quét mã trên iOS**, không dùng được (§4b) |
| 6 | Thư viện thay thế | **`react-native-camera-kit@18.0.1`** |

---

## 4. Đối chiếu 9 điều kiện Gate 03

| # | Điều kiện | Trạng thái | Bằng chứng |
|:--:|---|:--:|---|
| 1 | Không còn chỗ gọi Zalo SDK trong phạm vi đã chuyển đổi | ✅ **ĐẠT** | `grep -rniE "zmp-sdk\|zmp-ui\|zalo\|scanQRCode" src/` → **0** |
| 2 | **Camera scanner hoạt động trong môi trường có thể kiểm tra** | ✅ **ĐẠT** | **Đã đọc 19 mã QR thật** trên Xiaomi 12 Pro / Android 13, **0 trùng**, 119/138 callback bị chặn, 1,3 s/kiện. 10/10 yêu cầu §A, **36 ca test**. Xem §4d |
| 3 | Keyboard scanner parser có test | ✅ **ĐẠT** | **20 ca**, `__tests__/keyboardWedge.test.ts` |
| 4 | Offline queue tồn tại qua restart | ✅ **ĐẠT** | Test *"tồn tại qua restart"* + *"bản kẹt syncing → unknown"*. Ghi thẳng MMKV, không có bộ đệm RAM nào mất được |
| 5 | Retry và chống gửi trùng có test | ✅ **ĐẠT** | R1 = **không có retry tự động** → test *"một lần syncAll chỉ gửi mỗi bản đúng một lần"*. Chống trùng 2 lớp, có test song song thật |
| 6 | API mapping khớp mã nguồn cũ hoặc contract chính thức | 🔀 **`DEFERRED_TO_GATE_WMS_API_INTEGRATION`** | Tầng client (lỗi, timeout, huỷ, redact, port regex payload) khớp mã nguồn cũ và có **22 test** → phần trong tầm kiểm soát đã xong. Phần **đấu nối endpoint nghiệp vụ** tách sang Gate WMS theo §0 |
| 7 | Không dữ liệu giả / secret / tắt bảo mật | ✅ **ĐẠT** | 0 TODO · 0 mock (chỗ duy nhất nhắc "mock" là câu ghi chú *"không phải mock"*) · 0 secret · 0 chỗ tắt TLS |
| 8 | Phân biệt rõ emulator / điện thoại thật / PDA thật | ✅ **ĐẠT** | [03-device-test-matrix.md](../03-device-test-matrix.md) — 3 cột riêng, cột PDA **trống hoàn toàn** |
| 9 | Không còn lỗi bắt buộc chưa xử lý | ✅ **ĐẠT** | `tsc` exit 0 · `eslint` exit 0 (**0 lỗi 0 cảnh báo**) · `jest` **149/149** exit 0 |

**Kết quả: 8/8 điều kiện trong phạm vi Gate này ĐẠT · ĐK6 hoãn sang Gate WMS → `READY_FOR_USER_APPROVAL`.**

---

## 4b. 🔴 vision-camera bạn duyệt KHÔNG dùng được — phát hiện 2026-09-05

Người dùng duyệt `react-native-vision-camera`. Tôi cài **5.2.3** rồi phát hiện **quét mã của nó chỉ chạy trên iOS**:

| Kiểm chứng trong `node_modules` | Kết quả |
|---|---|
| `android/.../nitro/camera/outputs/` | **rỗng** |
| File Kotlin cho `ObjectOutput` / `ScannedObject` | **0 / 29 file `Hybrid*.kt`** |
| File Swift tương ứng trên iOS | đủ 3 file |
| Chú thích trong `CameraObjectOutput.nitro.d.ts` | `@platform iOS` |

Nitrogen **có** sinh binding C++ cho Android nhưng **không có hiện thực Kotlin** đứng sau. Dự án chỉ Android (GATE_01 Q2) → vô dụng.

Prompt 3 §A vốn viết *"ưu tiên vision-camera **nếu tương thích**"*. Tôi **không tự đổi thư viện** mà trình 3 phương án; người dùng chọn **`react-native-camera-kit@18.0.1`**. `vision-camera` và `nitro-image` đã gỡ.

## 4c. Gỡ hai quyền thừa do thư viện khai

Soi APK sau khi build thấy có `READ_EXTERNAL_STORAGE` và `WRITE_EXTERNAL_STORAGE` mà tôi không hề khai. Truy ra `react-native-camera-kit/android/src/main/AndroidManifest.xml` khai sẵn cho tính năng **chụp ảnh** — thứ app này **không dùng** (`capture()` không được gọi ở đâu).

Đã gỡ bằng `tools:node="remove"`. Kiểm chứng lại trên APK mới:

| Quyền | Trước | Sau |
|---|:--:|:--:|
| `READ_EXTERNAL_STORAGE` | ❌ có | ✅ **đã gỡ** |
| `WRITE_EXTERNAL_STORAGE` | ❌ có | ✅ **đã gỡ** |
| `CAMERA` | ✅ | ✅ |
| `RECORD_AUDIO` | không xin | không xin |

`SYSTEM_ALERT_WINDOW` và `ACCESS_LOCAL_NETWORK` còn lại đến từ manifest **debug** của React Native (dev menu + Metro) — bản release không có.

---

## 4d. ✅ Camera — kiểm chứng trên thiết bị thật, 2026-09-05

Thiết bị: **Xiaomi 2206122SC (12 Pro) · Android 13 · arm64-v8a**. Đọc kết quả bằng `adb shell uiautomator dump`.

| Chỉ số | Giá trị |
|---|---|
| Mã QR đọc được | **19** |
| **ITEM bị trùng** | **0** |
| Callback bị chặn | **119** — 86% của 138 |
| Kiện khoá cả phiên | 19 (khớp đúng số nhận) |
| Mã không có `ITEM=` | **0** |
| Tốc độ | 16 kiện / 21 s ≈ **1,3 s mỗi kiện** |

### 4d.1 Bốn lỗi phát hiện khi thử máy thật, đều là lỗi của tôi

| # | Triệu chứng người dùng báo | Nguyên nhân | Sửa |
|:--:|---|---|---|
| 1 | *"quét rất lâu"* | Tôi bật `showFrame`, tưởng chỉ vẽ khung. `CKCamera.kt` **lọc bỏ mọi mã ngoài ô khung** | Bỏ `showFrame` |
| 2 | *"quét rất lâu"* | `scanThrottleDelay` mặc định thư viện là **2000 ms** | Hạ xuống 150 ms |
| 3 | *"bị mờ"* | Không truyền `focusMode` | `focusMode="on"` + `resetFocusWhenMotionDetected` + khung xem cao 460px |
| 4 | *"số lượng nhảy loạn và có trùng"* | Guard chỉ nhớ **một mã cuối**; chuỗi xen kẽ `A B A B` vô hiệu hoá nó | Mỗi mã một cửa sổ riêng trong `Map` |

Mỗi lỗi có **test hồi quy** ghi rõ triệu chứng và ngày phát hiện.

### 4d.2 Chống trùng theo `ITEM` — người dùng xác nhận nghiệp vụ

> *"Thực tế mọi hàng đều có mã item riêng. Trong mã QR có cả SKU và mã item riêng."* — 2026-09-05

Khoá chống trùng là **`ITEM`**, không phải SKU hay chuỗi thô:

| Loại mã | Phạm vi chặn | Lý do |
|---|---|---|
| Có `ITEM=` | **cả phiên** | Một ITEM = một kiện vật lý; quét lại luôn là thao tác thừa |
| Không có `ITEM=` | chỉ **1,5 s** | Hai lần quét có thể là **hai kiện khác nhau cùng loại** — chặn cả phiên sẽ **làm mất hàng** |

Kiểm chứng bằng dữ liệu thật trong `docs/inventory-qr-export-2026-08-23/payloads.txt`: SKU `HN-PRD-SEED-001` có **4 ITEM khác nhau** → test khẳng định **đếm đủ 4, không báo trùng**.

Regex phân tích payload **port nguyên văn** từ Mini App cũ, không tự chế:
[`scan.service.ts:1163`](../../../src/services/scan.service.ts) · [`ScannerPage:1219`](../../../src/pages/ScannerPage/index.tsx) · [`receipt-flow.service.ts:1757`](../../../src/services/receipt-flow.service.ts) · [`normalizeScanCode.ts`](../../../src/utils/normalizeScanCode.ts)

### 4d.3 Chưa kiểm chứng

| Hạng mục | Trạng thái |
|---|:--:|
| Đèn flash | ⏳ chưa thử |
| Thu hồi quyền lúc app chạy nền | ⏳ chưa thử |
| **Camera trên PDA thật** | ❌ **chưa có máy nào** |

---

## 5. Đã làm được gì

### 5.1 Module mới

| Tệp | Vai trò |
|---|---|
| `src/storage/schema.ts` | Schema version + migration runner |
| `src/storage/repository.ts` | Repository abstraction, ghi nguyên tử một khoá/bản ghi |
| `src/sync/types.ts` | Máy trạng thái outbox — 6 trạng thái |
| `src/sync/outbox.ts` | Hàng đợi bền vững, khôi phục sau restart, dọn dữ liệu an toàn |
| `src/sync/syncEngine.ts` | Phân loại lỗi, single-flight, đồng bộ thủ công |
| `src/sync/bootstrap.ts` | Khởi tạo tầng dữ liệu + bộ gửi từ chối thẳng thắn |
| `src/sync/useOutbox.ts` | Hook đưa trạng thái lên UI |
| `src/scanner/cameraFormats.ts` | 🆕 Map 8 định dạng ↔ camera-kit, không để tầng nghiệp vụ biết tên thư viện |
| `src/scanner/cameraScanGuard.ts` | 🆕 Chống callback trùng của camera |
| `src/scanner/cameraPermission.ts` | 🆕 Máy trạng thái quyền 5 nhánh |
| `src/scanner/useCameraPermission.ts` | 🆕 Hook + kiểm tra lại khi app về tiền cảnh |
| `src/features/scan/CameraScanScreen.tsx` | 🆕 Màn quét camera |

Sửa: `src/app/App.tsx` (migration + khôi phục lúc mở app) · `DiagnosticsScreen.tsx` (thẻ "Hàng đợi offline" + nút sang màn camera) · `navigation/` (route `CameraScan`) · `AndroidManifest.xml` (thêm `CAMERA`, gỡ 2 quyền bộ nhớ — §4c)

### 5.2 Test

| Suite | Ca | Ghi chú |
|---|:--:|---|
| `cameraScan.test.ts` | **36** | 🆕 |
| `outboxSync.test.ts` | **27** | 🆕 |
| `apiClient.test.ts` | 22 | |
| `wmsContract.test.ts` | **9** | 🆕 contract test dùng fixture thật từ staging |
| `keyboardWedge.test.ts` | 20 | |
| `foundation.test.ts` | 19 | |
| `storageMigration.test.ts` | **15** | 🆕 |
| `App.test.tsx` | 1 | |
| **Tổng** | **149** | trước Prompt 3: **62** → **+87** |

### 5.3 Hai quy tắc được cưỡng chế bằng code, không bằng kỷ luật

| Quy tắc | Cưỡng chế ở đâu | Test |
|---|---|:--:|
| **R1** không tự retry | Không tồn tại timer/backoff/listener nào gọi đồng bộ; `syncAll` chỉ chạy từ hành động người dùng | 3 ca |
| **R1** chống trùng | `syncing` ghi xuống đĩa trước khi gửi + `Set` in-flight | 3 ca |
| **R2** không tự giải quyết xung đột | `conflict`/`unknown` bị loại khỏi `SENDABLE_STATES` | 3 ca |
| Không mất dữ liệu chưa gửi | `pruneSynced` chỉ đụng `synced` | 2 ca |

---

## 6. 🔴 Duyệt Gate này ≠ sẵn sàng production

| Khẳng định | Được phép nói? |
|---|:--:|
| "Camera đọc được mã QR trên điện thoại Android thật" | ✅ — 19 mã, 0 trùng, 2026-09-05 |
| "Parser đầu quét đúng theo 20 ca test" | ✅ |
| "Hàng đợi offline đúng theo 27 ca test, tồn tại qua restart" | ✅ |
| **"Đã tương thích PDA"** | ❌ **KHÔNG** — chưa có máy nào |
| **"Đầu quét phần cứng hoạt động"** | ❌ **KHÔNG** — chưa bắn thử lần nào |
| **"Camera đọc được mã trên PDA"** | ❌ **KHÔNG** — chưa có máy nào |
| **"API mapping đã hoàn tất"** | ❌ **KHÔNG** — ĐK6 hoãn sang Gate WMS |
| **"Đồng bộ hoạt động với backend"** | ❌ **KHÔNG** — chưa gọi endpoint nghiệp vụ nào |
| "Xung đột xử lý đúng" | ⚠️ **chỉ mức mô phỏng** — chưa server thật nào trả 409 |
| "Dữ liệu sống qua khi tắt app" | ⚠️ **chỉ mức mô phỏng** — chưa kill process thật |

### 6.1 Hai Gate bắt buộc PASS trước production

| Gate | Trạng thái | Chặn gì |
|---|:--:|---|
| `GATE_PDA_HARDWARE_CERTIFICATION` | 🚧 **BLOCKED** | Đầu quét phần cứng, hậu tố thật, tương thích model |
| `GATE_WMS_API_INTEGRATION` | 🚧 **BLOCKED** | Contract, xác thực, môi trường, **và nay cả ĐK6** |

---

## 7. Bước tiếp theo

### 7.1 ✅ Token

```
GATE_03_PASS|build=b2b6ae51390670fec876bdea852dbebb9b6650936b429cc5cf78ddefd28ee2c1|scanner=CAMERA+KEYBOARD_WEDGE|offline=MMKV
```

Phát hành 2026-09-05 sau khi người dùng gửi `APPROVE_GATE_03`.

#### Kiểm tra toàn vẹn trước khi phát hành

| Mục | Kết quả |
|---|:--:|
| `git rev-parse HEAD` vs SHA ghi trong Gate | ✅ khớp |
| `sha256sum app-debug.apk` vs `BUILD_ID` | ✅ khớp từng byte |
| `git diff HEAD -- src/` | ✅ rỗng — Mini App cũ không đổi |
| `GATE_02` | ✅ `PASS` |
| `tsc` · `eslint` · `jest` | ✅ 0 · 0 · **149/149** |

#### Giải nghĩa trường token

| Trường | Giá trị | Nghĩa |
|---|---|---|
| `build` | `b2b6ae51…` | sha256 APK debug thật, build bằng WSL2 |
| `scanner` | `CAMERA+KEYBOARD_WEDGE` | Hai nguồn quét đã hiện thực. ❌ **Không** bao gồm Broadcast Intent hay SDK hãng |
| `offline` | `MMKV` | Storage engine, không mã hoá — xem hạn chế đã biết |

### 7.2 Hai việc còn mở, KHÔNG chặn Gate này

| # | Việc | Trạng thái |
|:--:|---|---|
| 1 | **`HTTP_5XX_POLICY`** — cần backend xác nhận transaction có rollback toàn bộ khi 5xx không | 🔴 mở. Giữ `'unknown'` (an toàn). Đã ghi vào [USER-ACTION-REQUIRED §2 câu 10](../../../USER-ACTION-REQUIRED.md) và thư mẫu §3.2 câu 9b |
| 2 | **Chính sách dọn dữ liệu** — thời gian giữ, chu kỳ chạy, ngưỡng cảnh báo | 🔴 mở. `pruneSynced` **chưa được gọi tự động ở đâu**. Đã ghi vào [USER-ACTION-REQUIRED §0b](../../../USER-ACTION-REQUIRED.md) |

Cả hai đều ở **trạng thái an toàn mặc định**: không tự retry, không tự xoá dữ liệu. Bật sai còn nguy hiểm hơn để nguyên.

## 8. Vẫn giữ nguyên hiệu lực

`GATE_PDA_HARDWARE_CERTIFICATION` và `GATE_WMS_API_INTEGRATION` **chưa PASS**. Các điều cấm [GATE_01 §11](GATE_01.md) còn nguyên, **trừ** phần đã nới ở [§0b](GATE_01.md):

| Điều | Trạng thái |
|:--:|---|
| 4 — gọi mutation thật lên WMS production | 🔴 **VẪN CẤM** |
| 5 — offline mutation, retry request ghi | 🔓 nới ở mức **cơ chế** (§0b.2) |
| 6 — header `Idempotency-Key` | 🔴 **VẪN CẤM** (§0b.3) |
| 8 — tự xác định môi trường `khohoanamdev.bigk.click` | 🔴 **VẪN CẤM** |
| 1, 2, 3 — PDA, native module hãng, hard-code suffix | 🔴 **VẪN CẤM** |
| 13 — tạo/cấu hình dự án iOS | 🔴 **VẪN CẤM** |

---

## 9. Tài liệu bàn giao

| Tài liệu | Nội dung |
|---|---|
| [03-scanner-design.md](../03-scanner-design.md) | Kiến trúc wedge, đối chiếu 10 yêu cầu §B, lý do hoãn camera |
| [03-offline-sync.md](../03-offline-sync.md) | Schema/migration, máy trạng thái, phân loại lỗi, chống trùng |
| [03-api-mapping.md](../03-api-mapping.md) | Lý do giữ `fetch`, bảng map lỗi, chốt chặn đang cưỡng chế |
| [03-device-test-matrix.md](../03-device-test-matrix.md) | Ma trận 🟢U / 🔵P / 🟣D — cột PDA trống hoàn toàn |
