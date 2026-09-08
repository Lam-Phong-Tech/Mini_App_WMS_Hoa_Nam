# 02 — Quyết định dependency

**Nguyên tắc áp dụng** (Prompt 2): dependency mới phải có **mục đích**, **phiên bản
cố định**, và **tương thích** với phiên bản framework đã chọn. Không nâng cấp hay
đổi dependency không liên quan.

Tất cả gói bổ sung được cài bằng `npm install --save-exact` nên `package.json` ghi
**số phiên bản chính xác**, không có `^` hay `~`.

---

## 1. Dependency bổ sung — 7 gói

| Gói | Phiên bản | Vì sao cần | Ai bắt buộc |
|---|---|---|---|
| `@react-navigation/native` | `7.3.18` | Điều hướng — Prompt 2 §2 yêu cầu module Navigation | Người dùng chốt 2026-09-04 |
| `@react-navigation/native-stack` | `7.18.10` | Stack navigator dùng native primitive, mượt hơn JS stack trên PDA cấu hình thấp | kèm theo gói trên |
| `react-native-screens` | `4.27.0` | Peer bắt buộc của native-stack; giải phóng view của màn hình đã rời | kèm theo gói trên |
| `@shopify/flash-list` | `2.3.2` | **FlashList cho mọi danh sách** | **GATE_01 Q1** |
| `react-native-mmkv` | `4.3.2` | Storage **API đồng bộ** | **GATE_01 Q1** |
| `react-native-nitro-modules` | `0.37.1` | Peer bắt buộc của `react-native-mmkv@4` (Nitro) | kèm theo gói trên |
| `@react-native-community/netinfo` | `12.0.1` | Connectivity abstraction — Prompt 2 §2, phục vụ quy tắc offline GATE_01 §3 | Prompt 2 §2 |

| `react-native-safe-area-context` | `5.9.1` | Safe Area cho `Page` và `SafeAreaProvider` — Prompt 2 §3 | có sẵn trong template RN 0.87.1 |

### 1c. Dependency thêm ở Prompt 3 — 2026-09-05

| Gói | Phiên bản | Vì sao cần | Ai duyệt |
|---|---|---|---|
| `react-native-camera-kit` | **`18.0.1`** | Quét mã bằng camera — Prompt 3 §A. Dùng MLKit `barcode-scanning:17.3.0` trên Android | Người dùng chốt 2026-09-05 |

#### 🔴 Vì sao KHÔNG phải `react-native-vision-camera`

Prompt 3 §A ghi *"ưu tiên giải pháp dựa trên `react-native-vision-camera` **nếu tương thích**"*. Người dùng đã duyệt gói này, tôi cài **5.2.3** rồi phát hiện **nó không quét mã được trên Android**:

| Kiểm chứng trong `node_modules` | Kết quả |
|---|---|
| Thư mục `android/.../nitro/camera/outputs/` | **rỗng** |
| File Kotlin cho `ObjectOutput` / `ScannedObject` | **0 / 29 file `Hybrid*.kt`** |
| File Swift tương ứng trên iOS | có đủ 3 file |
| Chú thích trong `.d.ts` | `@platform iOS` |

Dự án **chỉ Android** (GATE_01 Q2) → v5 vô dụng. Ba phương án đã trình, người dùng chọn `camera-kit` vì: hiện đại nhất (08/2026), peer dependency **chỉ react + react-native**, và có quét mã Android thật. `react-native-vision-camera@5.2.3` cùng `react-native-nitro-image@0.15.2` **đã được gỡ**.

Chi tiết: [03-scanner-design.md §2.1–2.2](03-scanner-design.md).

> ℹ️ Quyền `PermissionsAndroid` dùng của chính React Native, **không thêm dependency** — lý do ở [03-scanner-design.md §2.4](03-scanner-design.md).

### 1b. Sửa dependency 2026-09-05

Đợt kiểm chứng lại phát hiện hai điểm chưa khớp nguyên tắc *"Dependency mới phải có mục đích, phiên bản cố định"* của Prompt 2. Người dùng phê duyệt, đã sửa:

| # | Gói | Trước | Sau | Lý do |
|:--:|---|---|---|---|
| **D-01** | `react-native-safe-area-context` | `"^5.5.2"` — dải caret, **bản cài thực tế đã trôi tới `5.9.1`** | `"5.9.1"` | Prompt 2 bắt buộc **phiên bản cố định**. Chỉ ghim lại đúng bản đang chạy, **không nâng cấp** |
| **D-02** | `@react-native/new-app-screen` | `"0.87.1"` trong `dependencies`, **0 call-site** | **đã gỡ** | Màn chào của template, đã thay bằng `RootNavigator`. Prompt 2 cấm dependency không có mục đích |

Sau khi sửa: `npm install` → *"removed 1 package"*, exit 0. `tsc` · `eslint` · `jest` (62/62) · `react-native bundle` đều exit 0. **Bundle production giống hệt từng byte** (1.347.571 byte) → chứng minh gói bị gỡ không đóng góp gì. Chi tiết: [GATE_02 §5b.7](gates/GATE_02.md).

> ❌ `npm install` báo `14 vulnerabilities (6 moderate, 8 high)` — **có sẵn từ trước**, không do thay đổi này. Không chạy `npm audit fix --force`: Prompt 2 cấm nâng cấp dependency không liên quan.

---

## 2. Vì sao MMKV, không phải AsyncStorage

GATE_01 Q1 ghi rõ: *"`react-native-mmkv` giữ API đồng bộ"*.

Lý do kỹ thuật đứng sau ràng buộc đó, ghi lại để người sau không "tối ưu" nhầm:
luồng quét mã đọc/ghi state ngay trong handler sự kiện bàn phím. `AsyncStorage`
buộc phải `await`; mỗi `await` mở một cửa sổ thời gian cho lần bắn mã kế tiếp
chen vào giữa, làm hỏng thứ tự. API đồng bộ loại bỏ hẳn lớp lỗi này.

**Hệ quả phải chấp nhận:** MMKV v4 là Nitro module (C++), nên:

- kéo theo `react-native-nitro-modules`;
- không nạp được trong môi trường Node của Jest → cần mock (xem §5);
- API v4 **khác v3**: tạo instance bằng `createMMKV({id})`, không phải `new MMKV()`;
  xoá khoá bằng `remove()`, không phải `delete()`.

---

## 3. Vì sao KHÔNG thêm Axios

Prompt 2 §4 nói: *"React Native: sử dụng Axios **nếu đã được duyệt**"*.

Chưa được duyệt — người dùng chốt **giữ `fetch`** ngày 2026-09-04. `fetch` của RN
đã đáp ứng đủ 8 yêu cầu §4 (xem [02-architecture.md §4](02-architecture.md)), nên
thêm Axios chỉ làm tăng kích thước bundle mà không đổi được năng lực nào.

---

## 4. Vì sao KHÔNG thêm các gói thường gặp khác

Ghi lại để tránh bị thêm vào theo quán tính:

| Gói | Vì sao không |
|---|---|
| `redux` / `zustand` / `jotai` | Prompt 2 §2: lựa chọn state management phải dựa trên GATE_01 hoặc được người dùng xác nhận. **Chưa có.** Nền móng hiện tại chưa cần state toàn cục |
| `react-native-gesture-handler` | `native-stack` không cần. Chưa màn hình nào dùng cử chỉ |
| `@tanstack/react-query` | Chưa gọi API nghiệp vụ nào; thêm bây giờ là abstraction không được dùng |
| `react-native-vision-camera` | Camera adapter thuộc Prompt 3 — chưa có thiết bị để kiểm chứng |
| `react-native-config` / `dotenv` | Cấu hình môi trường hiện là hằng số trong `src/config/env.ts` có kiểm soát Gate; đọc từ `.env` sẽ mở đường cho việc đặt URL production mà không qua Gate |
| SDK của Zebra / Honeywell / Urovo… | **GATE_01 §11 rule 2 cấm** khi chưa có thiết bị và tài liệu |

---

## 5. Mock chỉ dành cho Jest

Prompt 2 cấm dùng mock để tuyên bố hoàn thành. Hai mock dưới đây **chỉ thay tầng
native khi chạy test**, không thay thế hay che giấu tính năng nào:

| Mock | Lý do tồn tại |
|---|---|
| `__mocks__/react-native-mmkv.js` | MMKV v4 là module C++ phát hành dạng ESM, Node của Jest không nạp được |
| `__mocks__/@react-native-community/netinfo.js` | NetInfo cần tầng native; mock trả "chưa xác định" để test không phụ thuộc mạng thật |
| `jest.setup.js` → `react-native-safe-area-context/jest/mock` | Mock **chính thức của chính thư viện** |

Toàn bộ logic nền móng (`api`, `scanner`, `storage`, `config`, `logging`, `errors`)
được test bằng **hiện thực thật**, không mock.

> ⚠️ Lưu ý khi dùng mock chính thức của `react-native-safe-area-context`: nó đặt
> toàn bộ export dưới `default`, nên phải `require(...).default` thì named export
> mới hiện ra. Bỏ `.default` sẽ khiến `SafeAreaProvider` là `undefined` và App
> không dựng được.

---

## 6. Cảnh báo `npm audit`

`npm install` báo **15 lỗ hổng (6 moderate, 9 high)** — toàn bộ đến từ cây phụ
thuộc gián tiếp của công cụ build React Native 0.87.1, không phải từ 7 gói ở §1.

**Chưa xử lý, và cố ý chưa xử lý:** `npm audit fix --force` sẽ hạ/nâng phiên bản
trong cây RN, vi phạm nguyên tắc *"không nâng cấp hay thay đổi dependency không
liên quan"*. Đây là hạng mục cần quyết định riêng, không tự làm trong Prompt 2.
