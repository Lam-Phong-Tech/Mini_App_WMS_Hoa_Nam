# 01 — Bảng kiểm tra thiết bị PDA (gỡ blocker Q4 & Q5)

**Mục đích:** thu thập đúng 7 nhóm thông tin cần thiết để thiết kế scanner adapter.
**Trạng thái:** ⏸️ **Chỉ lập tài liệu kiểm tra — CHƯA triển khai scanner.**

**Người thực hiện:** bạn hoặc nhà cung cấp thiết bị.
**Thời gian ước tính:** ~20 phút/model. **Làm riêng cho từng model PDA khác nhau.**

---

## Cách dùng

1. In hoặc mở tài liệu này trên máy tính.
2. Cầm PDA thật, làm lần lượt từ mục 1 → 7.
3. Điền vào cột **Kết quả**.
4. Gửi lại toàn bộ bảng đã điền.

> ⚠️ **Không cần cài ứng dụng gì.** Tất cả kiểm tra đều dùng **ứng dụng có sẵn** trên máy (Ghi chú/Notes, trình duyệt Chrome, Cài đặt).

---

## 1. Định danh thiết bị

| # | Cần lấy | Lấy ở đâu | Kết quả |
|:--:|---|---|---|
| 1.1 | **Nhà sản xuất** (Zebra, Honeywell, Urovo, Chainway, Seuic, Idata, Newland…) | Nhãn sau máy, hoặc *Cài đặt → Giới thiệu → Thiết bị* | `________________` |
| 1.2 | **Model chính xác** (ví dụ `TC21`, `EDA52`, `DT50`, `C72`) | Nhãn sau máy | `________________` |
| 1.3 | **Phiên bản Android** | *Cài đặt → Giới thiệu điện thoại → Phiên bản Android* | `________________` |
| 1.4 | **API level** (nếu hiện) | *Cài đặt → Giới thiệu → Bản dựng* | `________________` |
| 1.5 | **Số lượng máy đang dùng model này** | — | `________________` |

> 🔴 **QUAN TRỌNG:** nếu mục **1.3 nhỏ hơn Android 7.0**, hãy **dừng lại và báo ngay**. React Native 0.76+ yêu cầu tối thiểu Android 7.0 (API 24) — sẽ phải đánh giá lại nền tảng, không được tự hạ phiên bản.

---

## 2. Cơ chế scanner

| # | Cần lấy | Cách kiểm tra | Kết quả |
|:--:|---|---|---|
| 2.1 | Máy **có đầu quét laser/2D vật lý** không (nút quét cứng bên hông)? | Nhìn máy | ☐ Có ☐ Không |
| 2.2 | Có ứng dụng cấu hình scanner cài sẵn không? Tên là gì? | Xem danh sách ứng dụng. Ví dụ: **DataWedge** (Zebra), **Scanner Settings / Honeywell Settings** (Honeywell), **ScanSetting / Barcode Settings** (Urovo, Chainway, Idata) | `________________` |
| 2.3 | Trong ứng dụng đó, mục xuất dữ liệu (**Output** / **Data Output** / **Output Mode**) đang chọn gì? | Mở app ở 2.2 → tìm mục Output | ☐ Keyboard / Keystroke / Wedge<br>☐ Intent / Broadcast<br>☐ Clipboard<br>☐ Khác: `__________` |
| 2.4 | Nếu có chế độ **Intent**: `Intent action` là gì? | Trong mục Intent Output | `________________` |
| 2.5 | Nhà cung cấp có **SDK/AAR riêng** cho lập trình viên không? Có tài liệu không? | Hỏi nhà cung cấp | ☐ Có (xin link/file) ☐ Không |

---

## 3 & 4 & 5. Dữ liệu scanner xuất ra · Prefix/Suffix · Enter/Tab

> **Đây là phần quan trọng nhất.** Làm đúng theo thứ tự.

### Bài kiểm tra A — trong ứng dụng Ghi chú

1. Mở ứng dụng **Ghi chú (Notes)** có sẵn trên máy.
2. Tạo ghi chú mới, đặt con trỏ vào ô nhập.
3. **Bấm nút quét cứng**, quét mã vạch mẫu bất kỳ (ví dụ mã trên vỏ hộp).
4. Ghi lại chính xác những gì xuất hiện.

| # | Câu hỏi | Kết quả |
|:--:|---|---|
| 3.1 | Mã có xuất hiện trong ô nhập không? | ☐ Có ☐ Không |
| 3.2 | Chép **chính xác** nội dung xuất hiện (kể cả khoảng trắng) | `________________________________` |
| 4.1 | Có ký tự **thừa ở ĐẦU** mã không (prefix)? | ☐ Không ☐ Có: `__________` |
| 4.2 | Có ký tự **thừa ở CUỐI** mã không (suffix)? | ☐ Không ☐ Có: `__________` |
| 5.1 | Sau khi quét, con trỏ có **xuống dòng mới** không? | ☐ Có → suffix là **Enter** ☐ Không |
| 5.2 | Sau khi quét, con trỏ có **nhảy cách ra** (thụt ngang) không? | ☐ Có → suffix là **Tab** ☐ Không |
| 5.3 | Quét **2 mã liên tiếp**: chúng nằm trên cùng dòng hay 2 dòng? | ☐ Cùng dòng ☐ 2 dòng riêng |

### Bài kiểm tra B — trong trình duyệt (quan trọng cho app)

1. Mở **Chrome** trên PDA.
2. Vào trang bất kỳ có ô tìm kiếm (ví dụ `google.com`).
3. Chạm vào ô tìm kiếm để có con trỏ.
4. **Bấm nút quét cứng**, quét một mã.

| # | Câu hỏi | Kết quả |
|:--:|---|---|
| 3.3 | Mã có xuất hiện trong ô tìm kiếm không? | ☐ Có ☐ Không |
| 5.4 | Trang có **tự động submit/tìm kiếm** ngay sau khi quét không? | ☐ Có → xác nhận suffix là **Enter** ☐ Không |

> 📌 Nếu **3.1 và 3.3 đều "Có"** → máy đang chạy chế độ **Keyboard Wedge**. Đây là trường hợp dễ xử lý nhất.

---

## 6. Khả năng cấu hình scanner

| # | Câu hỏi | Kết quả |
|:--:|---|---|
| 6.1 | Có **đổi được** suffix (Enter ↔ Tab ↔ không có) trong app cấu hình không? | ☐ Có ☐ Không ☐ Không tìm thấy mục này |
| 6.2 | Có **đổi được** prefix không? | ☐ Có ☐ Không |
| 6.3 | Có **bật/tắt được** từng loại mã vạch (QR, Code 128, EAN-13…) không? | ☐ Có ☐ Không |
| 6.4 | Có giới hạn cấu hình **chỉ áp dụng cho một ứng dụng** cụ thể không? | ☐ Có ☐ Không |
| 6.5 | Cấu hình có **giữ nguyên sau khi khởi động lại** máy không? | ☐ Có ☐ Không |
| 6.6 | Các máy trong kho hiện đang cấu hình **giống nhau** hay mỗi máy một kiểu? | ☐ Giống nhau ☐ Khác nhau ☐ Không rõ |

---

## 7. Kết quả quét khi ứng dụng có / không có focus

> Phần này quyết định app phải bắt dữ liệu quét ở tầng nào.

| # | Tình huống | Cách làm | Kết quả |
|:--:|---|---|---|
| 7.1 | **Có focus** — con trỏ đang ở trong ô nhập | Mở Ghi chú, chạm vào ô nhập, quét | ☐ Nhận được mã ☐ Không |
| 7.2 | **Không focus** — mở app nhưng KHÔNG chạm vào ô nhập | Mở Ghi chú, **không** chạm ô nhập, quét | ☐ Nhận được mã ☐ Không ☐ Mã đi đâu đó khác |
| 7.3 | **Màn hình chính** — không mở app nào | Về màn hình chính, quét | ☐ Không có gì xảy ra ☐ Có thông báo ☐ Mở app nào đó |
| 7.4 | **Màn hình khoá** | Khoá máy, quét | ☐ Không có gì ☐ Có phản ứng: `__________` |
| 7.5 | **App chạy nền** | Mở Ghi chú → bấm Home → quét | ☐ Không có gì ☐ Có phản ứng: `__________` |

---

## Thông tin bổ sung nên hỏi nhà cung cấp

| # | Câu hỏi |
|:--:|---|
| 1 | Máy có được **root** hoặc dùng ROM tuỳ biến không? |
| 2 | Có chính sách MDM/khoá thiết bị nào giới hạn cài ứng dụng ngoài (sideload APK) không? |
| 3 | Có cho phép cài **APK ký nội bộ** (không qua Google Play) không? — liên quan trực tiếp Q10 |
| 4 | Google Play Services có được cài không? (ảnh hưởng một số thư viện camera) |
| 5 | Độ phân giải màn hình và kích thước màn hình (inch)? |
| 6 | Máy có camera sau không, bao nhiêu MP? (dự phòng khi quét bằng camera) |

---

## Sau khi điền xong

Gửi lại bảng đã điền. Từ đó tôi sẽ xác định được:

| Kết quả kiểm tra | Kết luận thiết kế |
|---|---|
| 3.1 + 3.3 đều Có | ✅ **Keyboard Wedge** — xử lý ở tầng JS/React Native, **không cần native module** |
| 2.3 = Intent/Broadcast | ⚠️ Cần **native module Kotlin** đọc Android broadcast |
| 2.5 = Có SDK riêng | ⚠️ Cần **native module Kotlin** bọc AAR của hãng — khối lượng lớn nhất |
| 5.1 hoặc 5.4 = Có | Suffix = **Enter** (`\n` hoặc `\r`) |
| 5.2 = Có | Suffix = **Tab** (`\t`) |
| 5.1, 5.2, 5.4 đều Không | **Không có suffix** — parser phải dựa vào timing giữa các ký tự |
| 6.1 = Có | ✅ Có thể chuẩn hoá suffix trên toàn bộ máy — giảm rủi ro |
| 7.2 = Nhận được mã | Có thể bắt sự kiện ở tầng toàn cục |
| 7.2 = Không | Bắt buộc phải có ô nhập ẩn giữ focus |

> ⏸️ **Cho tới khi có bảng này:** không chọn cơ chế, không viết native module cho bất kỳ hãng nào, không hard-code suffix, không tuyên bố tương thích hãng/model cụ thể. Phần tích hợp đầu quét vật lý đặt sau một abstraction/adapter.
>
> Kiến trúc scanner đã được chốt trong `GATE_01` (Q4/Q5 `PASS_FOR_ARCHITECTURE`). Bảng này phục vụ [`GATE_PDA_HARDWARE_CERTIFICATION`](gates/GATE_PDA_HARDWARE_CERTIFICATION.md), **bắt buộc PASS trước khi phát hành production**.
