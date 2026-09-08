# 03 — Thiết kế Scanner

**Commit nguồn:** `663114aff6804e50b77b88e05dda9f9c784d6fff`
**Phạm vi:** Prompt 3 §A (camera) và §B (đầu quét kiểu bàn phím).

---

## 0. Trạng thái hai nguồn quét

| Nguồn | Trạng thái | Thư viện |
|---|:--:|---|
| **Keyboard Wedge** | ✅ **Đã hiện thực, 20 test** | không cần thư viện — parser tự viết |
| **Camera** | ✅ **Đã hiện thực, 21 test** | `react-native-camera-kit@18.0.1` |

> ❗ Không có file rỗng nào được tạo để lấp chỗ. Prompt 3 cấm *"tạo mock để tuyên bố scanner đã hoạt động"*.

---

## 1. §B — Đầu quét kiểu bàn phím

### 1.1 Kiến trúc

```
Thiết bị PDA bắn mã
        │  (giả lập bàn phím, ký tự rời rạc)
        ▼
KeyboardWedgeParser        ← buffer, suffix, timeout, lọc, chống trùng
        │
        ▼
KeyboardWedgeSource        ← hiện thực interface ScanSource chung
        │
        ▼
useKeyboardWedge()         ← gắn/tháo theo vòng đời màn hình
```

Tầng nghiệp vụ chỉ thấy `ScanSource`, **không biết** mã đến từ camera hay đầu quét — đúng ràng buộc GATE_01 Q4 *"scanner bắt buộc dùng abstraction/adapter, không phụ thuộc hãng"*.

📄 [`src/scanner/keyboardWedge.ts`](../../apps/wms-mobile/src/scanner/keyboardWedge.ts) · [`KeyboardWedgeSource.ts`](../../apps/wms-mobile/src/scanner/KeyboardWedgeSource.ts) · [`useKeyboardWedge.ts`](../../apps/wms-mobile/src/scanner/useKeyboardWedge.ts)

### 1.2 Đối chiếu 10 yêu cầu Prompt 3 §B

| # | Yêu cầu | Trạng thái | Ca test |
|:--:|---|:--:|---|
| 1 | Nhận phím theo thứ tự | ✅ | *"gom đúng thứ tự khi ký tự đến rời rạc"* |
| 2 | Buffer theo timeout **cấu hình được** | ✅ | *"tự kết thúc sau N ms im lặng"* · *"timeout = 0 nghĩa là tắt"* |
| 3 | Ký tự kết thúc Enter / Tab | ✅ | *"CRLF chỉ sinh đúng một sự kiện"* · *"nhận `\t`"* · *"dùng ký tự tuỳ chọn mà không sửa code"* |
| 4 | Phân biệt gõ tay với chuỗi scan | ⚠️ **một phần** | `minCodeLength` loại chuỗi quá ngắn (*"bỏ qua chuỗi ngắn hơn ngưỡng"*). **Phân biệt theo tốc độ gõ chưa làm** — cần đo trên PDA thật để biết ngưỡng |
| 5 | Loại ký tự điều khiển | ✅ | *"bỏ ký tự điều khiển"* · *"giữ nguyên ký tự in được ngoài ASCII"* (dấu tiếng Việt) |
| 6 | Chống xử lý hai lần | ✅ | *"suffix và timeout không thể cùng phát một lần quét"* · *"cửa sổ chống trùng"* |
| 7 | Giữ focus không hỏng form | ⚠️ **chưa kiểm chứng** | Parser không chiếm focus; nhưng chưa có form nghiệp vụ nào để thử |
| 8 | Vòng đời màn hình + điều hướng | ✅ | *"đổi trạng thái sẽ xoá buffer còn sót của màn trước"* |
| 9 | Bật/tắt theo từng màn hình | ✅ | `setEnabled()` — *"không nhận ký tự khi đang tắt"* |
| 10 | Không chặn bàn phím ảo / accessibility | ⚠️ **chưa kiểm chứng** | Cần thiết bị thật có đầu quét |

### 1.3 🔴 Hậu tố thật vẫn CHƯA biết

`DEFAULT_WEDGE_CONFIG` dùng `ENTER` làm mặc định **chỉ để chạy local và test**.

> ❌ **GATE_01 §11 điều 3 cấm** coi `Enter` là suffix của PDA production.
> Hậu tố thật thuộc `GATE_PDA_HARDWARE_CERTIFICATION` — Gate đó **vẫn BLOCKED**.

Parser đã hỗ trợ `ENTER` · `TAB` · custom, và timeout cấu hình được, nên khi biết hậu tố thật chỉ cần **đổi cấu hình, không sửa code**. Test *"Enter KHÔNG kết thúc chuỗi khi suffix cấu hình là ký tự khác"* bảo vệ đúng điều này.

### 1.4 Broadcast Intent / SDK hãng — KHÔNG làm

Prompt 3: *"chỉ tích hợp theo tài liệu/model đã được tôi xác nhận"*. Chưa có model nào được xác nhận (`[MODEL_PDA]` để trống), và **GATE_01 §11 điều 2 cấm** viết native module của hãng khi chưa có thiết bị/tài liệu.

---

## 2. §A — Camera

### 2.1 🔴 vision-camera KHÔNG dùng được — phát hiện 2026-09-05

Người dùng duyệt `react-native-vision-camera`. Sau khi cài **5.2.3** (bản mới nhất) tôi phát hiện nó **không quét mã được trên Android**:

| Kiểm chứng | Kết quả |
|---|---|
| `android/.../nitro/camera/outputs/` | **rỗng** |
| File Kotlin `Hybrid*.kt` cho ObjectOutput/ScannedObject | **0 / 29 file** |
| File Swift tương ứng trên iOS | `HybridCameraObjectOutput.swift` · `HybridScannedObject.swift` · `NativeScannedObject.swift` |
| Chú thích trong `CameraObjectOutput.nitro.d.ts` | `@platform iOS` |

Nitrogen **có** sinh binding C++ cho Android, nhưng **không có hiện thực Kotlin** đứng sau. Dự án ta **chỉ Android** (GATE_01 Q2) → v5 vô dụng ở đây.

Prompt 3 §A vốn đã lường trước: *"ưu tiên giải pháp dựa trên `react-native-vision-camera` **nếu tương thích**"*. Nó không tương thích.

### 2.2 Ba phương án đã trình, người dùng chọn camera-kit

| | vision-camera 5.2.3 | vision-camera 4.7.3 | **camera-kit 18.0.1** ✅ |
|---|:--:|:--:|:--:|
| Quét mã Android | ❌ không có | ✅ `CodeScannerPipeline.kt` | ✅ `barcode/BarcodeFrame.kt` |
| Nền quét | — | MLKit `barcode-scanning:17.3.0` | MLKit `barcode-scanning:17.3.0` |
| Phát hành | 2026-08-20 | **2025-09-02** *(trước RN 0.87 gần 1 năm)* | 2026-08-03 |
| Peer dependency | nitro-modules + nitro-image | reanimated · skia · worklets-core | **chỉ react + react-native** |

Người dùng chốt **`react-native-camera-kit@18.0.1`**. `react-native-vision-camera` và `react-native-nitro-image` đã được gỡ.

### 2.3 Đối chiếu 10 yêu cầu Prompt 3 §A

| # | Yêu cầu | Trạng thái | Hiện thực |
|:--:|---|:--:|---|
| 1 | Camera permission | ✅ | `PermissionsAndroid` — xem §2.4 |
| 2 | Trường hợp từ chối quyền | ✅ | `denied` → hiện nút "Xin quyền camera" |
| 3 | Mất quyền sau khi đã cấp | ✅ | `AppState` `active` → kiểm tra lại; `blocked` → chỉ đường vào Cài đặt |
| 4 | Pause/resume theo vòng đời | ✅ | `cameraActive = quyền && useIsFocused() && appActive` — **không render `<Camera>`** là thật sự nhả phần cứng |
| 5 | Torch | ✅ | `torchMode`, tự tắt khi rời màn để đỡ hao pin |
| 6 | Chặn callback trùng | ✅ | 2 lớp: `scanThrottleDelay={250}` ở native + `createScanGuard` ở JS |
| 7 | Chọn loại barcode cần thiết | ✅ | Đúng **8 định dạng** của Mini App cũ, không mở rộng |
| 8 | Loading / error / không có camera | ✅ | `checking` · `onError` · `unavailable` |
| 9 | Dừng camera khi rời màn | ✅ | như mục 4 |
| 10 | **Không lưu ảnh camera** | ✅ | **`capture()` không được gọi ở bất kỳ đâu** |

📄 [`src/features/scan/CameraScanScreen.tsx`](../../apps/wms-mobile/src/features/scan/CameraScanScreen.tsx)

### 2.4 Vì sao dùng `PermissionsAndroid` chứ không dùng API của camera-kit

`checkDeviceCameraAuthorizationStatus()` của camera-kit chỉ trả `boolean`, **không phân biệt** được "người dùng bấm Từ chối" (còn hỏi lại được) với "bấm Đừng hỏi lại" (phải vào Cài đặt).

Prompt 3 §A đòi hai tình huống đó là hai ca riêng. `PermissionsAndroid` có sẵn trong React Native trả về `granted | denied | never_ask_again` — đủ để tách. **Không thêm dependency nào.**

Giới hạn của Android cần nói rõ: chỉ `request()` mới cho biết `never_ask_again`; `check()` luôn trả `denied` cho cả hai. Vì vậy hook giữ lại trạng thái `blocked` thay vì để `check()` hạ nó xuống `denied` — nếu không, UI sẽ hiện nút "Xin quyền" mà bấm vào chẳng có gì xảy ra.

### 2.5 Chống trùng: camera ngược hẳn với đầu quét

| | Keyboard Wedge | Camera |
|---|:--:|:--:|
| Mặc định chống trùng | **TẮT** | **BẬT** (1500 ms) |
| Lý do | Đầu quét chỉ bắn một lần mỗi khi bóp cò. Chặn nhầm sẽ nuốt lần quét hợp lệ khi thủ kho cố ý quét lại | Camera đọc **liên tục** — một mã nằm yên trong khung hình sinh hàng chục callback mỗi giây |

Hai chi tiết trong `createScanGuard` có test bảo vệ:

- **Mã khác được nhận ngay**, không phải chờ hết cửa sổ — thủ kho quét liên tiếp nhiều thùng khác nhau không bị chặn.
- **Lần bị chặn KHÔNG dời mốc thời gian** — nếu dời, mã nằm yên trong khung hình sẽ bị chặn vĩnh viễn.

📄 [`src/scanner/cameraScanGuard.ts`](../../apps/wms-mobile/src/scanner/cameraScanGuard.ts)

### 2.6 Quyền Android đã thêm

```xml
<uses-permission android:name="android.permission.CAMERA" />
```

❌ **Không** xin `RECORD_AUDIO` — nghiệp vụ kho chỉ đọc mã, không quay tiếng.
✅ `uses-feature camera required="false"` do chính manifest của camera-kit khai và được merge vào — máy PDA không có camera vẫn cài được app.

---

## 3. Mức kiểm chứng hiện tại

| Mức | Keyboard Wedge | Camera |
|---|---|---|
| Unit test (Node) | ✅ **20 ca** | ✅ **21 ca** (định dạng, chống trùng, quyền) |
| Điện thoại Android thật | ⚠️ listener khởi động được | ⏳ chờ build lại rồi kiểm chứng |
| **Đầu quét phần cứng** | ❌ **CHƯA BẮN THỬ LẦN NÀO** | không áp dụng |
| **PDA thật** | ❌ **CHƯA CÓ MÁY NÀO** | ❌ **CHƯA CÓ MÁY NÀO** |

> 🔴 Không được nói *"đã tương thích PDA"*. Khung xem camera cần phần cứng nên **không test tự động được** — 21 ca ở trên chỉ phủ ba module logic thuần (`cameraFormats`, `cameraScanGuard`, `cameraPermission`).

Chi tiết: [03-device-test-matrix.md](03-device-test-matrix.md).
