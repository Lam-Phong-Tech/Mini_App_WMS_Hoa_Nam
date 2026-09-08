# 03 — Ma trận kiểm chứng thiết bị

**Ngày:** 2026-09-05
**Mục đích:** Prompt 3 đòi *"Phân biệt rõ kết quả emulator, điện thoại thật và PDA thật"* và *"Nếu không có thiết bị thật, ghi rõ các ca chỉ được mô phỏng."*

---

## 1. Ba mức kiểm chứng — định nghĩa

| Ký hiệu | Nghĩa |
|:--:|---|
| 🟢 **U** | **Unit test** trên Node — logic đúng theo đặc tả, không có phần cứng nào tham gia |
| 🔵 **P** | **Điện thoại Android thật** — Xiaomi 12 Pro, Android 13 (API 33), arm64-v8a |
| 🟣 **D** | **PDA thật có đầu quét phần cứng** — ❌ **CHƯA CÓ MÁY NÀO** |
| ⚪ **E** | Emulator — **không dùng lần nào**; mọi kết quả 🔵 đều từ máy thật |

> 🔴 **Cột 🟣 D trống hoàn toàn.** Không một dòng nào trong tài liệu này được phép đọc thành *"đã tương thích PDA"*.

---

## 2. Thiết bị đã dùng

| Mục | Giá trị |
|---|---|
| Máy | Xiaomi **2206122SC** (12 Pro) |
| Android | **13** — API **33** |
| ABI | `arm64-v8a` |
| Serial | `fbb9e686` |
| Kết nối | USB, `adb devices` → `device` |
| Emulator | **không dùng** |
| PDA | **không có** |

⚠️ Máy này là **điện thoại thường**, **không có đầu quét phần cứng**. Mọi kết luận về đầu quét chỉ ở mức phần mềm.

---

## 3. Ma trận

### 3.1 Scanner — keyboard wedge

| # | Ca | 🟢 U | 🔵 P | 🟣 D |
|:--:|---|:--:|:--:|:--:|
| 1 | Gom ký tự đúng thứ tự | ✅ | — | ❌ |
| 2 | Suffix `Enter` / `\r\n` sinh đúng một sự kiện | ✅ | — | ❌ |
| 3 | Suffix `Tab` | ✅ | — | ❌ |
| 4 | Suffix tuỳ chọn, không sửa code | ✅ | — | ❌ |
| 5 | Timeout kết thúc chuỗi cấu hình được | ✅ | — | ❌ |
| 6 | Loại ký tự điều khiển, giữ dấu tiếng Việt | ✅ | — | ❌ |
| 7 | Chống xử lý hai lần (suffix + timeout) | ✅ | — | ❌ |
| 8 | Bật/tắt listener theo màn hình | ✅ | ✅ *(hiện `running` trên `ScanTestScreen`)* | ❌ |
| 9 | **Đầu quét phần cứng bắn mã thật** | — | — | ❌ **CHƯA LÀM ĐƯỢC** |
| 10 | **Hậu tố thật của PDA** | — | — | ❌ **CHƯA BIẾT** |
| 11 | Không chặn bàn phím ảo / accessibility | — | — | ❌ |
| 12 | Giữ focus không hỏng form nghiệp vụ | — | — | ❌ *(chưa có form nghiệp vụ)* |

### 3.2 Scanner — camera

Thư viện: `react-native-camera-kit@18.0.1` (MLKit `barcode-scanning:17.3.0`).

| # | Ca | 🟢 U | 🔵 P | 🟣 D |
|:--:|---|:--:|:--:|:--:|
| 1 | Map đúng 8 định dạng Mini App cũ hỗ trợ | ✅ | — | ❌ |
| 2 | Không bật thêm định dạng ngoài danh sách | ✅ | — | ❌ |
| 3 | Map hai chiều nhất quán | ✅ | — | ❌ |
| 4 | Định dạng lạ trả `undefined`, không ném lỗi | ✅ | — | ❌ |
| 5 | Chặn cùng một mã trong cửa sổ chống trùng | ✅ | — | ❌ |
| 6 | Mã nằm yên trong khung hình **không bị chặn vĩnh viễn** | ✅ | — | ❌ |
| 7 | Mã khác được nhận ngay, không chờ hết cửa sổ | ✅ | — | ❌ |
| 8 | Diễn giải `granted`/`denied`/`never_ask_again` | ✅ | — | ❌ |
| 9 | Chỉ hiện nút xin quyền khi còn xin lại được | ✅ | — | ❌ |
| 10 | Backend lỗi → `unavailable`, không sập app | ✅ | — | ❌ |
| 11 | **Xin quyền camera thật, hộp thoại hệ thống hiện ra** | — | ✅ | ❌ |
| 12 | **Khung xem camera hiện hình** | — | ✅ | ❌ |
| 13 | **Đọc được mã QR thật** | — | ✅ **19 mã, 0 trùng** | ❌ |
| 14 | Bật/tắt đèn flash | — | ⏳ | ❌ |
| 15 | Camera nhả phần cứng khi rời màn | — | ✅ *(cờ "Camera đang bật" đổi theo)* | ❌ |
| 16 | Thu hồi quyền lúc app chạy nền → phát hiện được | — | ⏳ | ❌ |
| 17 | **Chống trùng theo ITEM trên máy thật** | ✅ | ✅ **119/138 callback bị chặn, 19/19 ITEM duy nhất** | ❌ |

#### Số liệu lần quét thật — 2026-09-05, Xiaomi 12 Pro

| Chỉ số | Giá trị |
|---|---|
| Mã nhận | **19** |
| ITEM bị trùng | **0** |
| Callback bị chặn | **119** (86% tổng 138) |
| Kiện khoá cả phiên | 19 |
| Mã không có `ITEM=` | **0** — xác nhận mọi mã production đều có ITEM |
| Tốc độ | 16 kiện / 21 giây ≈ **1,3 s mỗi kiện** |

Đọc bằng `adb shell uiautomator dump` (chỉ đọc cây giao diện, không cần quyền inject mà MIUI chặn).

> ⚠️ `⏳` = chưa thử. Cột 🟣 D vẫn **trống hoàn toàn**: chưa có PDA nào.

### 3.3 Storage & migration

| # | Ca | 🟢 U | 🔵 P | 🟣 D |
|:--:|---|:--:|:--:|:--:|
| 1 | Đọc/ghi/xoá bản ghi | ✅ | ✅ *(đổi môi trường ghi xuống MMKV thật)* | ❌ |
| 2 | Schema version, migration theo thứ tự | ✅ | ✅ *(màn chẩn đoán hiện `Schema dữ liệu: v1`)* | ❌ |
| 3 | Migration lỗi → dừng, không nâng version | ✅ | — | ❌ |
| 4 | App bị hạ cấp → không đụng dữ liệu | ✅ | — | ❌ |
| 5 | Bản ghi hỏng JSON không làm sập app | ✅ | — | ❌ |
| 6 | Hai collection không giẫm lên nhau | ✅ | — | ❌ |
| 7 | **Dữ liệu sống qua khi tắt app thật** | ✅ *(mô phỏng)* | ⚠️ **chưa kiểm chứng riêng** | ❌ |

### 3.4 Hàng đợi offline & đồng bộ

| # | Ca | 🟢 U | 🔵 P | 🟣 D |
|:--:|---|:--:|:--:|:--:|
| 1 | Enqueue → `pending` | ✅ | ✅ *(nút "Thêm bản ghi thử")* | ❌ |
| 2 | Hàng đợi tồn tại qua restart | ✅ | ⚠️ **chưa kiểm chứng riêng** | ❌ |
| 3 | Bản kẹt `syncing` → `unknown` sau restart | ✅ *(mô phỏng bằng dựng lại outbox)* | ❌ **chưa kill process thật** | ❌ |
| 4 | Offline → không gửi, không đánh dấu thất bại | ✅ | ⚠️ **chưa tắt wifi thật để thử** | ❌ |
| 5 | Có mạng lại → gửi được | ✅ | — | ❌ |
| 6 | Chống gửi trùng khi gọi song song | ✅ | — | ❌ |
| 7 | Timeout → `unknown`, không tự gửi lại | ✅ *(mô phỏng `AppError`)* | ❌ **chưa gặp timeout thật** | ❌ |
| 8 | Xung đột 409/412 → `conflict`, giữ dữ liệu local | ✅ *(mô phỏng)* | ❌ **chưa có server trả 409** | ❌ |
| 9 | Không tự retry | ✅ | ✅ *(bấm "Đồng bộ ngay" mới chạy)* | ❌ |
| 10 | Không xoá bản ghi chưa gửi khi dọn dữ liệu | ✅ | — | ❌ |
| 11 | Gửi theo thứ tự tạo | ✅ | — | ❌ |

### 3.5 API client

| # | Ca | 🟢 U | 🔵 P | 🟣 D |
|:--:|---|:--:|:--:|:--:|
| 1 | Chuẩn hoá 9 loại lỗi | ✅ | ✅ *(nút "Gửi thử GET /")* | ❌ |
| 2 | Timeout + huỷ request | ✅ | — | ❌ |
| 3 | Redact token khỏi log | ✅ | — | ❌ |
| 4 | Chặn header `Idempotency-Key` | ✅ | — | ❌ |
| 5 | Chặn mutation khi Gate chưa PASS | ✅ | ✅ *(nút "Kiểm tra chốt chặn POST")* | ❌ |
| 6 | **Gọi endpoint nghiệp vụ thật** | — | — | ❌ **CHƯA GỌI LẦN NÀO** |

---

## 4. Tổng kết trung thực

| Khẳng định | Được phép nói? |
|---|:--:|
| "Logic parser scanner đúng theo 20 ca test" | ✅ |
| "Hàng đợi offline đúng theo 27 ca test" | ✅ |
| "App chạy được trên điện thoại Android 13 thật" | ✅ |
| "Đã đọc/ghi MMKV thật trên máy thật" | ✅ |
| "Đã tương thích PDA" | ❌ **KHÔNG** — chưa có máy nào |
| "Đầu quét phần cứng hoạt động" | ❌ **KHÔNG** — chưa bắn thử lần nào |
| "Camera đọc được mã QR trên điện thoại Android thật" | ✅ — 19 mã, 0 trùng, 2026-09-05 |
| "Camera đọc được mã trên PDA" | ❌ **KHÔNG** — chưa có máy nào |
| "Đồng bộ hoạt động với backend" | ❌ **KHÔNG** — chưa gọi endpoint nghiệp vụ nào |
| "Xung đột được xử lý đúng" | ⚠️ **chỉ ở mức mô phỏng** — chưa server thật nào trả 409 |
| "Dữ liệu sống qua khi tắt app" | ⚠️ **chỉ ở mức mô phỏng** — chưa kill process thật để thử |

---

## 5. Việc cần thiết bị để đóng

| # | Việc | Cần gì |
|:--:|---|---|
| 1 | Bắn mã bằng đầu quét phần cứng, đo hậu tố thật | 👤 **1 máy PDA** → `GATE_PDA_HARDWARE_CERTIFICATION` |
| 2 | Đo tốc độ gõ để phân biệt gõ tay với scan | 👤 **1 máy PDA** |
| 3 | Kiểm chứng không chặn bàn phím ảo / accessibility | 👤 **1 máy PDA** |
| 4 | Timeout, 409, 5xx thật từ WMS | 👤 **Contract + tài khoản test** → `GATE_WMS_API_INTEGRATION` |
| 5 | Kill process giữa lúc gửi, kiểm chứng khôi phục | Làm được ngay khi có bộ gửi thật |
| 6 | Tắt wifi thật giữa chừng | Làm được ngay khi có bộ gửi thật |

📋 Bảng kiểm tra chi tiết cho nhà cung cấp PDA: [01-pda-verification-checklist.md](01-pda-verification-checklist.md)
