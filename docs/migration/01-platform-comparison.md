# 01 — Platform Comparison: Flutter/Dart vs React Native/TypeScript

**Commit khảo sát:** `663114aff6804e50b77b88e05dda9f9c784d6fff`

> ✅ **QUYẾT ĐỊNH ĐÃ CHỐT (2026-09-04):** Người dùng chọn **React Native + TypeScript**, phạm vi **CHỈ Android**.
> Tài liệu này giữ nguyên phần phân tích so sánh làm hồ sơ lý do; phần §4 nay là **ràng buộc bắt buộc**, không còn là khuyến nghị.
>
> 🔧 **Sửa lỗi tài liệu 2026-09-05:** bản trước ghi nhầm phạm vi là "Android + iOS" ở 4 vị trí, mâu thuẫn với [GATE_01 Q2](gates/GATE_01.md). Người dùng tái xác nhận: *"Không triển khai iOS. Phạm vi hiện tại chỉ gồm Android và máy PDA Android. Không tạo hoặc cấu hình dự án iOS."* → đã sửa toàn bộ, xem [GATE_01 §0](gates/GATE_01.md).

---

## 0. Quyết định đã chốt và ràng buộc kèm theo

| Mục | Giá trị chốt |
|---|---|
| Nền tảng đích | **React Native + TypeScript** |
| Phạm vi OS | **CHỈ Android** (PDA Android + điện thoại Android) |
| Phạm vi sửa lỗi UI/UX | **Chỉ app mới** (Zalo Mini App hiện tại giữ nguyên) |

### Ràng buộc kỹ thuật bắt buộc phát sinh từ quyết định này

| # | Ràng buộc | Lý do |
|---|---|---|
| 1 | Dùng **React Native 0.76+ với New Architecture** | Bù tiêu chí hiệu năng danh sách (§2.6) — điểm yếu duy nhất đáng kể của RN trong so sánh này |
| 2 | Dùng **FlashList** (không dùng `FlatList`) cho mọi danh sách | Khắc phục D-06 (không virtualization) trên PDA cấu hình thấp |
| 3 | Dùng **`react-native-mmkv`** cho tầng key-value | Giữ API **đồng bộ** → port 9 nhóm khoá Web Storage 1:1, không phải refactor async toàn bộ (§2.5) |
| 4 | Chuẩn bị **native module Kotlin** cho máy quét PDA | ⏳ Khối lượng chưa xác định — phụ thuộc Q4 |
| 5 | Adapter máy quét phải **phân nhánh theo nguồn quét**, không theo OS | Chỉ có Android trong phạm vi. Hai nguồn cần hỗ trợ: **Camera** và **Keyboard Wedge** — xem [01-scanner-architecture-requirements.md](01-scanner-architecture-requirements.md) |
| 6 | Viết **characterization tests cho tầng service TypeScript hiện tại trước khi port** | D-07: không có test nào. Với RN, việc này chạy trực tiếp trên code hiện có nên rẻ — đây là biện pháp giảm rủi ro hiệu quả nhất |

### ⚠️ Rủi ro chưa gỡ — có thể buộc xem lại quyết định

> **React Native 0.76+ New Architecture yêu cầu Android API 24 (Android 7.0) trở lên.**
> **Q3 (phiên bản Android tối thiểu) chưa được trả lời.** Nếu PDA thực tế chạy **Android 5 hoặc 6**, lựa chọn React Native **không khả thi về mặt kỹ thuật** — Flutter (hỗ trợ xuống API 21) sẽ là lựa chọn duy nhất còn lại.
> **Phải xác nhận Q3 trước khi bắt đầu Giai đoạn 2.**

---

## 1. Điểm xuất phát: repository nói gì

Ba dữ kiện định hình toàn bộ so sánh này:

| Dữ kiện | Bằng chứng | Ý nghĩa |
|---|---|---|
| **Phụ thuộc nền tảng Zalo ≈ 0** | 🔧 `grep "zmp-sdk"` → 2 kết quả, cả hai orphan; `grep "scanQRCode"` → 0 kết quả; ZaUI chỉ 2 component | Không có "khoá cứng" vào Zalo cần tháo gỡ. Migration là **web → native**, không phải Zalo → native |
| **Một nửa mã nguồn là code chết** | 🔧 79/155 file orphan | Khối lượng port thực tế **chỉ ~76 file** |
| **Không có test nào** | 🔧 0 file test frontend | Không có lưới an toàn — **yếu tố này ảnh hưởng lựa chọn nhiều hơn cả cú pháp ngôn ngữ** |

**Khối lượng logic thực cần port:** ~20 900 dòng TypeScript trong code sống, tập trung ở:

| File | Dòng | Nội dung |
|---|---|---|
| `scan.service.ts` | 1 963 | Nghiệp vụ quét, nhập/xuất |
| `receipt-flow.service.ts` | 1 871 | Luồng nhập kho |
| `ScannerPage/index.tsx` | 1 559 | UI quét |
| `scanner-adapter.ts` | 805 | Trừu tượng hoá máy quét |
| `warranty-flow.service.ts` | 754 | Bảo hành |
| Còn lại (12 page + hook + store) | ~14 000 | UI & state |

---

## 2. So sánh theo 7 tiêu chí bắt buộc

### 2.1 Khả năng tái sử dụng logic React/TypeScript

| | Flutter/Dart | React Native/TypeScript |
|---|---|---|
| Service layer (~5 400 dòng `*.service.ts`) | ❌ **Viết lại 100%** sang Dart | ✅ **Dùng lại gần như nguyên vẹn** — chỉ là `fetch` + logic thuần |
| TypeScript types (`src/types/*.ts`) | ❌ Chuyển thủ công sang Dart class/freezed | ✅ **Copy nguyên** |
| Zustand store (3 file, 616 dòng) | ❌ Viết lại bằng Riverpod/Provider | ✅ **Zustand chạy được trên RN** |
| Hook (`useScanRequest`, `useBarcodeScanner`…) | ❌ Viết lại | ✅ Dùng lại phần logic, thay phần DOM |
| Component UI (Tailwind + SCSS, 281 biến CSS) | ❌ Viết lại bằng widget | ⚠️ Viết lại (RN không có CSS) nhưng **giữ cấu trúc component và JSX** |
| Icon (32 SVG inline) | ⚠️ Chuyển sang `flutter_svg`/`CustomPainter` | ⚠️ `react-native-svg` — chuyển gần như 1:1 |

**Ước lượng tái sử dụng:** React Native ≈ **40–50%** mã nguồn (toàn bộ service, type, store, logic hook). Flutter ≈ **0%** mã nguồn, chỉ tái sử dụng *thiết kế và kiến thức nghiệp vụ*.

> ⚠️ Lưu ý cân bằng: phần "viết lại" của Flutter đi kèm cơ hội dọn nợ kỹ thuật (D-05 idempotency, D-04 offline) một cách có hệ thống, thay vì bê nguyên thiết kế cũ sang.

---

### 2.2 Tương thích Android PDA và điện thoại

| | Flutter | React Native |
|---|---|---|
| Android tối thiểu | API 21 (Android 5.0) | API 24 (Android 7.0) với RN 0.76+ |
| PDA cũ (Android 7–9) | 🟢 Tốt — Flutter tự vẽ toàn bộ UI, không phụ thuộc widget hệ thống | 🟡 Chấp nhận được, nhưng RN mới dần bỏ Android cũ |
| Nhất quán giao diện giữa các hãng PDA | 🟢 **Rất tốt** — cùng engine Skia/Impeller, hiển thị giống hệt nhau | 🟡 Dùng view gốc → khác biệt nhẹ giữa các ROM tuỳ biến của hãng PDA |
| Kích thước APK | ~7–10 MB (release, 1 ABI) | ~8–15 MB (Hermes) |

⛔ **Chưa thể kết luận** — phụ thuộc hoàn toàn câu trả lời **Q3 (phiên bản Android tối thiểu)** và **Q4 (model PDA)**. Nếu đội vận hành đang dùng PDA Android 7 hoặc cũ hơn, cán cân nghiêng mạnh về **Flutter**.

---

### 2.3 Quét camera

| | Flutter | React Native |
|---|---|---|
| Thư viện chủ đạo | `mobile_scanner` (bọc Google ML Kit + AVFoundation) | `react-native-vision-camera` + `vision-camera-code-scanner`, hoặc `expo-camera` |
| Độ chín | 🟢 Rất chín, một package lo cả hai nền tảng | 🟢 Chín, nhưng cần ghép 2 package + cấu hình Frame Processor (Worklets) |
| So với ZXing hiện tại | Cả hai đều dùng **ML Kit** trên Android — **nhanh và chính xác hơn ZXing-JS đáng kể** | như bên cạnh |
| 8 định dạng đang dùng (QR, CODE_128/39/93, EAN_13/8, UPC_A/E) | 🟢 Hỗ trợ đủ | 🟢 Hỗ trợ đủ |
| Đèn flash, đổi camera, quét từ ảnh | 🟢 Có sẵn trong `mobile_scanner` | 🟢 Có, cần ghép thêm cho quét từ ảnh |

**Điểm thuận lợi lớn cho cả hai:** ✅ [scanner-adapter.ts:15-28](../../src/services/scanner-adapter.ts) đã định nghĩa sẵn interface `BarcodeScannerAdapter` với 11 phương thức. **Chỉ cần viết một hiện thực native mới cho interface này** — phần còn lại của app không phải sửa. Đây là tài sản kiến trúc quan trọng nhất của codebase hiện tại.

---

### 2.4 Máy quét phần cứng (keyboard wedge / broadcast intent / SDK hãng)

**Hiện trạng: chưa có gì.** 🔧 Xem [01-dependency-inventory.md §5.2](01-dependency-inventory.md) — `"SCANNER"` chỉ là nhãn dữ liệu, không có tích hợp thật.

| Cơ chế | Flutter | React Native |
|---|---|---|
| **Keyboard wedge** (máy quét giả lập bàn phím) | 🟢 `RawKeyboardListener` / `Focus` + `HardwareKeyboard` — API sẵn có, không cần plugin | 🟢 `TextInput` ẩn + `onKeyPress`, hoặc `KeyEvent` module — cũng khả thi, nhưng thường phải viết native module nhỏ để bắt phím toàn cục |
| **Broadcast Intent** (DataWedge của Zebra, Honeywell…) | 🟡 Cần viết **Platform Channel** (Kotlin) — chuẩn mực, tài liệu tốt | 🟡 Cần viết **Native Module** (Kotlin) — tương đương |
| **SDK riêng của hãng** (Urovo, Chainway, Seuic…) | 🟡 Platform Channel bọc AAR của hãng | 🟡 Native Module bọc AAR của hãng |
| Kinh nghiệm cộng đồng cho PDA kho | 🟢 Nhiều ví dụ Flutter + DataWedge | 🟡 Ít hơn một chút |

> ⛔ **Không thể đánh giá dứt điểm nếu chưa có Q4 và Q5.** Nếu PDA dùng **keyboard wedge thuần**, cả hai nền tảng đều dễ và không cần code native. Nếu phải dùng **SDK riêng của hãng**, cả hai đều cần viết cầu nối native với khối lượng tương đương — và **kỹ năng Kotlin trở thành yêu cầu bắt buộc bất kể chọn nền tảng nào**.

---

### 2.5 Offline storage và đồng bộ

**Hiện trạng:** ❌ Không có gì (D-04). 9 nhóm khoá Web Storage **đồng bộ** cần chuyển sang API **bất đồng bộ**.

| | Flutter | React Native |
|---|---|---|
| Key-value đơn giản | `shared_preferences` (async) | `AsyncStorage` (async) / **`react-native-mmkv` (đồng bộ!)** |
| CSDL cục bộ có truy vấn | 🟢 `drift` (SQL type-safe), `isar`, `sqflite` — **hệ sinh thái rất mạnh** | 🟡 `op-sqlite`, `WatermelonDB`, `realm` — tốt nhưng ít lựa chọn chín hơn |
| Hàng đợi đồng bộ (outbox) | 🟢 `drift` + `workmanager` cho tác vụ nền | 🟡 `react-native-background-fetch` — kém tin cậy hơn trên Android |
| Tác vụ nền khi app đóng | 🟢 **Tốt hơn rõ rệt** (`workmanager` bọc WorkManager của Android) | 🟡 Hạn chế hơn |
| Chuyển đổi từ code hiện tại | Phải viết lại mọi điểm đọc/ghi | ✅ **`react-native-mmkv` có API đồng bộ** → thay `localStorage` gần như 1:1, **không phải refactor sang async** |

**Đây là tiêu chí có hai mũi nhọn trái chiều:**
- **Ngắn hạn**, RN thắng nhờ MMKV giữ nguyên API đồng bộ → giảm rủi ro khi port 9 nhóm khoá.
- **Dài hạn**, Flutter thắng nhờ `drift` + `workmanager` để xây tầng đồng bộ offline nghiêm túc — thứ mà app **chắc chắn sẽ cần** (D-04).

---

### 2.6 Hiệu năng danh sách lớn

| | Flutter | React Native |
|---|---|---|
| Cơ chế | `ListView.builder` / `SliverList` — **virtualization mặc định, không cần nghĩ** | `FlatList` (cũ, hay giật) → `FlashList` của Shopify (tốt) → `LegendList` |
| Trên CPU yếu của PDA | 🟢 **Ổn định hơn** — không có cầu nối JS↔native khi cuộn | 🟡 New Architecture (Fabric) đã cải thiện nhiều, nhưng vẫn có chi phí JS |
| So với hiện tại (D-06: không virtualization) | Cả hai đều **cải thiện lớn** | như bên cạnh |

🟢 **Flutter nhỉnh hơn** ở tiêu chí này, đặc biệt với `per_page=200` ✅ (receipt-flow.service.ts:559) trên PDA cấu hình thấp.

---

### 2.7 Khả năng bảo trì của đội phát triển

| | Flutter | React Native |
|---|---|---|
| Kỹ năng hiện có của đội | ⛔ **Chưa biết** | ⛔ **Chưa biết** |
| Đường cong học tập từ React/TS | 🔴 Cao — ngôn ngữ mới (Dart), mô hình widget mới, tư duy layout mới | 🟢 Thấp — cùng React, cùng TypeScript, cùng JSX |
| Rủi ro khi không có test (D-07) | 🔴 **Rất cao** — viết lại 100% mà không có hồi quy | 🟡 Trung bình — port từng phần, service layer giữ nguyên nên ít nguy cơ sai lệch nghiệp vụ |
| Chia sẻ code với web trong tương lai | 🟡 Flutter Web (nặng, không tối ưu SEO) | 🟢 React Native Web / chia sẻ trực tiếp với Mini App hiện tại |
| Nếu vẫn phải duy trì Zalo Mini App song song | 🔴 Hai codebase, hai ngôn ngữ | 🟢 **Chia sẻ được service layer giữa Mini App và app native** |

> ❓ **Đây là tiêu chí quyết định nhất và tôi không có dữ liệu.** Cần biết đội có kinh nghiệm Dart/Flutter hay không.

---

### 2.8 Rủi ro plugin native và vòng đời ứng dụng

| | Flutter | React Native |
|---|---|---|
| Ổn định vòng đời plugin | 🟢 Plugin chính thức do team Flutter/Google bảo trì | 🟡 Phân mảnh hơn; New Architecture (0.76+) khiến một số thư viện cũ phải viết lại |
| Camera + quyền | 🟢 `permission_handler`, `mobile_scanner` — ổn định | 🟡 `vision-camera` mạnh nhưng đòi cấu hình kỹ hơn |
| Upload file lớn (video bảo hành, R-10) | 🟢 `dio` có progress + resume | 🟢 `react-native-blob-util` |
| Vòng đời app (pause/resume camera) | 🟢 `WidgetsBindingObserver` — rõ ràng | 🟡 `AppState` — đủ dùng |
| Nâng cấp phiên bản lớn | 🟢 Ít gãy | 🟡 Nâng cấp RN thường tốn công |

🟢 **Flutter ổn định hơn** ở tiêu chí này.

---

## 3. Bảng điểm tổng hợp

| # | Tiêu chí | Flutter | React Native | Nghiêng về |
|---|---|:---:|:---:|---|
| 1 | Tái sử dụng logic React/TS | 🔴 0% | 🟢 40–50% | **RN** (mạnh) |
| 2 | Tương thích Android PDA | 🟢 | 🟡 | **Flutter** ⛔ *chờ Q3/Q4* |
| 3 | Quét camera | 🟢 | 🟢 | Hoà |
| 4 | Máy quét phần cứng | 🟢 | 🟡 | Flutter (nhẹ) ⛔ *chờ Q4/Q5* |
| 5 | Offline storage & đồng bộ | 🟢 dài hạn | 🟢 ngắn hạn | Hoà (đánh đổi) |
| 6 | Hiệu năng danh sách lớn | 🟢 | 🟡 | **Flutter** |
| 7 | Bảo trì của đội | ⛔ | 🟢 nếu đội là React | **RN** ⛔ *chờ dữ liệu đội* |
| 8 | Rủi ro plugin & vòng đời | 🟢 | 🟡 | **Flutter** |

---

## 4. Khuyến nghị ban đầu — ✅ **đã được người dùng chốt ngày 2026-09-04**

> Phần dưới đây là khuyến nghị gốc kèm lý do, giữ lại làm hồ sơ quyết định. Kết quả: người dùng chọn đúng phương án 4.1.

### 4.1 Khuyến nghị chính: **React Native + TypeScript** — với hai điều kiện ✅ **ĐÃ CHỌN**

**Lý do:**

1. **Rủi ro lớn nhất của dự án này không phải hiệu năng, mà là mất đúng đắn nghiệp vụ.** Có ~5 400 dòng logic nghiệp vụ kho (`scan.service.ts`, `receipt-flow.service.ts`, `warranty-flow.service.ts`) với các quy tắc tinh vi — Post Receipt mới tăng tồn, ghi nhận chưa trừ tồn, phân loại mã, khớp dòng chứng từ — và **0 test bảo vệ** (D-07). Viết lại toàn bộ sang Dart mà không có hồi quy là rủi ro rất cao. RN cho phép **port nguyên tầng service và types**, giữ nguyên hành vi đã được kiểm chứng trong vận hành thật.
2. **Phụ thuộc Zalo ≈ 0** nghĩa là tầng service hiện tại là TypeScript thuần trên `fetch` — chạy được trên RN gần như không sửa.
3. `react-native-mmkv` giữ **API đồng bộ**, nên 9 nhóm khoá storage port được 1:1, không phải refactor async toàn bộ.
4. Nếu Zalo Mini App vẫn phải duy trì song song (rất có thể — đây là kênh vận hành hiện có), RN cho phép **dùng chung tầng service giữa hai sản phẩm**.

**Hai điều kiện bắt buộc:**
- ✅ Dùng **React Native 0.76+ với New Architecture** và **FlashList** cho mọi danh sách — để bù tiêu chí 6.
- ✅ Chấp nhận rằng **hỗ trợ máy quét PDA sẽ cần một native module Kotlin** — cần có người biết Kotlin trong đội.

### 4.2 Khi nào nên chọn **Flutter** thay thế

Chọn Flutter nếu **bất kỳ điều nào sau đây đúng** (chỉ người dùng mới trả lời được):

| Điều kiện | Vì sao đảo ngược khuyến nghị |
|---|---|
| Đội **đã có kinh nghiệm Flutter**, không có kinh nghiệm RN | Tiêu chí 7 đảo chiều — và đây là tiêu chí nặng nhất |
| PDA chạy **Android 5/6/7** | RN 0.76+ yêu cầu API 24; Flutter xuống tới API 21 |
| Danh sách thực tế **hàng nghìn dòng** trên PDA cấu hình thấp | Tiêu chí 6 trở nên quyết định |
| Offline-first là **yêu cầu hạng nhất** ngay từ đầu | `drift` + `workmanager` vượt trội cho outbox & sync nền |
| Chấp nhận **viết lại sạch** để dọn nợ kỹ thuật (D-04, D-05) | Viết lại có kiểm soát tốt hơn port kèm nợ |

### 4.3 Điều kiện tiên quyết — **đúng cho cả hai lựa chọn**

Bất kể chọn gì, **phải làm trước khi viết dòng code đầu tiên**:

1. ⛔ **Lấy hợp đồng API chính thức của WMS backend** (~42 endpoint). Hiện không có trong repo — đây là **blocker cứng**, xem [01-dependency-inventory.md §1.6](01-dependency-inventory.md).
2. 🔴 **Viết bộ test đặc tả (characterization tests) cho tầng service hiện tại trước khi port.** Đây là biện pháp giảm rủi ro hiệu quả nhất, và nó **rẻ hơn nhiều nếu chọn RN** (chạy trực tiếp trên code TypeScript hiện có).
3. ❓ **Chốt cơ chế máy quét PDA (Q4/Q5)** — ảnh hưởng trực tiếp tới việc có cần native module hay không.
4. ❓ **Chốt quy tắc đồng bộ offline (Q8)** — quyết định lựa chọn tầng lưu trữ, và đây là phần **hoàn toàn mới** (D-04).

---

## 5. Điều KHÔNG thể đánh giá ⛔

| # | Hạng mục | Trạng thái |
|---|---|---|
| 1 | Kỹ năng thực tế của đội | ⛔ Chưa có dữ liệu (không còn chặn — Q1 đã chốt) |
| 2 | Model PDA, cơ chế scanner, ký tự kết thúc | ⏳ **Vẫn chặn** — Q4, Q5 |
| 3 | Phiên bản Android tối thiểu | ✅ **Đã chốt** — Android 7.0 / API 24 (Q3). Xác minh trong hiện thực: `minSdkVersion = 24` ([apps/wms-mobile/android/build.gradle:4](../../apps/wms-mobile/android/build.gradle)) |
| 4 | Có cần iOS không | ✅ **Đã chốt: KHÔNG** (Q2) — người dùng tái xác nhận 2026-09-05, [GATE_01 §0.2](gates/GATE_01.md) |
| 5 | Khối lượng dữ liệu thật | ⛔ Cần đo hiệu năng với dữ liệu thật |
| 6 | Yêu cầu phát hành (APK/AAB/store/ký số) | ✅ **Đã chốt** — APK ký số, phát hành nội bộ, không Google Play, không iOS (Q10) |
