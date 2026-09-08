# 04 — Nguồn thiết kế chuẩn (design source of truth)

> **Đầu vào `[ĐƯỜNG_DẪN_FILE_THIẾT_KẾ]` của Prompt 4 — nay đã có.**
>
> Tệp: `C:\laragon\www\zalo_mini_app\bachhoa\output\pdf\Anh_thuc_te_cac_man_Mini_App_WMS_Hoa_Nam.pdf`
> 49 trang · **47 ảnh chụp thật** · viewport **333 × 698** · người dùng cung cấp 2026-09-06.
>
> Đây **không phải mockup**. Là ảnh chụp trực tiếp bản đang chạy. Vì vậy nó là
> **chuẩn** theo nguyên tắc #6 của Prompt 4: *"Không sửa 'đẹp hơn' theo sở thích
> cá nhân nếu khác thiết kế chuẩn."*

Điều kiện chụp do người dùng ghi trong tệp (trang 2), giữ nguyên văn để biết ảnh
nào phản ánh trạng thái thật, ảnh nào là trạng thái rỗng do dữ liệu:

- Không cấp quyền camera, **không gửi/duyệt/xoá dữ liệu WMS** khi chụp.
- Hai phiếu nháp local chỉ tạo để chụp màn scanner và kiểm tra; **nút gửi WMS vẫn khoá**.
- Tại thời điểm chụp, **API trả về 0 phiếu chờ duyệt** ⇒ chưa có ảnh danh sách duyệt có dữ liệu.
- Hồ sơ bảo hành đang mở không có tệp đính kèm ⇒ ảnh media thể hiện đúng trạng thái 0 ảnh / 0 video.

---

## 1. Bốn mươi bảy ảnh theo nhóm

| Nhóm | Ảnh | Trang PDF |
|---|:--:|:--:|
| Đăng nhập và phiên | 10 | 3–12 |
| Trang chủ | 2 | 13–14 |
| Tra cứu và quét mã | 5 | 15–19 |
| Nhập kho | 7 | 20–26 |
| Xuất kho | 11 | 27–37 |
| Duyệt và lịch sử | 3 | 38–40 |
| Bảo hành | 8 | 41–48 |
| Fallback | 1 | 49 |

### 1.1 Danh mục đầy đủ

| # | Tên ảnh | Trang | Ghi chú quan trọng |
|:--:|---|:--:|---|
| 01 | Danh mục màn xác thực | 3 | Màn index nội bộ, liệt kê 10 trạng thái auth |
| 02 | Đăng nhập — form | 4 | Email + Mật khẩu, nút *Hiện*; chân trang `Môi trường development · v1.0.0` |
| 03 | Đăng nhập — lỗi nhập thiếu | 5 | Viền đỏ + *"Vui lòng nhập email."* / *"…mật khẩu."* dưới từng ô |
| 04 | Xác thực — đang xử lý | 6 | Nút thành *"⟳ Đang xử lý…"* (disabled) + banner xanh *"Đang xác thực tài khoản"* |
| 05 | Xác thực — đăng nhập thất bại | 7 | Banner **đỏ** *"Không thể đăng nhập / Sai tài khoản hoặc mật khẩu."*, nút đổi thành **"Thử lại"** |
| 06 | Xác thực — phiên hết hạn | 8 | Icon đồng hồ cam, *"Dữ liệu chưa gửi không được tự động gửi lại."*, nút *Đăng nhập lại* |
| 07 | Xác thực — không có quyền | 9 | Icon khiên đỏ, *Về trang chủ* (primary) + *Quay lại* (text) |
| 08 | Cá nhân — tài khoản và kết nối | 10 | Nhóm `TÀI KHOẢN` / `KẾT NỐI WMS`, hàng nhãn-trái giá-trị-phải |
| 09 | Cá nhân — phiên và bảo mật | 11 | `PHIÊN & BẢO MẬT`; nút **Đăng xuất** viền đỏ; link *Xem auth screens* |
| 10 | Xác nhận đăng xuất | 12 | **Bottom sheet** nền mờ, có thanh kéo; *Đăng xuất* (đỏ) / *Huỷ* |
| 11 | Trang chủ — tổng quan | 13 | 2 StatCard, lưới 2×2 tác vụ, thẻ *Duyệt phiếu* có badge |
| 12 | Trang chủ — sản phẩm đã duyệt | 14 | Danh sách + *Xem tất cả*; badge xanh *✓ Thành công* |
| 13 | Quét mã — sẵn sàng mở camera | 15 | Nền tối, khung ngắm 4 góc, card trắng đè lên; thanh dưới *Nhập tay / Đổi phiếu* |
| 14 | Tra cứu — hộp nhập mã thủ công | 16 | **Modal** trên nền quét mờ, nút ✕ tròn |
| 15 | Nhập mã thủ công — màn riêng | 17 | Mã QR/Barcode + Ghi chú tuỳ chọn; *Huỷ* / *Xác nhận* |
| 16 | Tra cứu — chi tiết sản phẩm | 18 | Banner xanh lá *"…không làm thay đổi tồn kho."*; hàng có nút copy; ô trống hiện `—` |
| 17 | Tra cứu — công dụng và mô tả | 19 | *"Backend chưa khai báo…"*; *Trang chủ* / *Quét mã khác* |
| 18 | Nhập kho — tạo phiếu | 20 | **Stepper 4 bước**; banner xanh + banner cam; nút *TIẾP TỤC QUÉT* **disabled** |
| 19 | Nhập kho — máy quét | 21 | Header có badge *0 MÃ* |
| 20 | Nhập kho — kiểm tra trước ghi nhận | 22 | `IN-04`; 2 StatCard; banner cam *"Chưa có mã quét"*; *"Vuốt trái để xoá"* |
| 21 | Chi tiết phiếu nhập — tổng hợp | 23 | Dữ liệu thật `PN-COV-P00060`, 8 mã, 1 SKU; banner xanh lá *"Phiếu đã phê duyệt"* |
| 22 | Chi tiết phiếu nhập — SKU và trạng thái | 24 | Card SKU; nút *Đã ghi nhận* disabled + *Quay lại lịch sử* |
| 23 | Kết quả nhập kho | 25 | Vòng tròn ✓ xanh; bảng tóm tắt 4 hàng |
| 24 | Kết quả nhập kho — thao tác | 26 | Banner tím *"Chưa tăng tồn kho"*; *TRANG CHỦ* / *NHẬP KHO TIẾP* |
| 25 | Xuất kho — thông tin phiếu | 27 | Badge tròn *TẠO MỚI*; banner xanh *"Không nhập SKU ở bước này"* |
| 26 | Xuất kho — địa chỉ và số lượng | 28 | Phường/Xã **disabled** cho tới khi chọn tỉnh; *Tạo phiên và bắt đầu quét* |
| 27 | Xuất kho — lỗi validation | 29 | Banner đỏ tổng + viền đỏ + thông báo dưới **từng** ô |
| 28 | Xuất kho — máy quét | 30 | Badge *0/1*; thanh dưới *Nhập tay / Đổi phiếu* |
| 29 | Xuất kho — kiểm tra trước ghi nhận | 31 | `OUT-RECORD`; thanh tiến độ; banner cam *"Chưa đủ số lượng"*; nút xác nhận disabled |
| 30 | Xuất kho — danh sách chờ quét | 32 | Card *Dòng #1 · Chờ quét mã* viền **đứt nét** |
| 31 | Chi tiết phiếu xuất — thông tin | 33 | `OUT-04`; badge *Đã post*; thanh tiến độ đầy; hàng SĐT trống hiện `—` |
| 32 | Chi tiết phiếu xuất — danh sách mã | 34 | Card lồng: dòng → mã serial + badge *Đã quét* + thời gian |
| 33 | Chi tiết phiếu xuất — cuối màn | 35 | Banner cam *"Phiếu xuất đang chờ duyệt"*; *Tạo phiên xuất mới* |
| 34 | Kết quả xuất kho | 36 | *"Đã gửi duyệt phiếu xuất"* |
| 35 | Kết quả xuất kho — thao tác | 37 | Banner cam *"Chưa trừ tồn kho"*; *TRANG CHỦ* / *XUẤT KHO TIẾP* |
| 36 | Duyệt phiếu nhập — trạng thái hiện tại | 38 | 2 tab đếm số; banner *"Tồn kho cập nhật sau Post"* có ⓘ; **empty state** |
| 37 | Duyệt phiếu xuất — trạng thái hiện tại | 39 | Như trên + nút *Tạo phiếu xuất* trong empty state |
| 38 | Lịch sử chứng từ | 40 | Ô tìm; **2 hàng filter chip cuộn ngang** có thanh cuộn; card có thanh tiến độ |
| 39 | Bảo hành — danh sách tiếp nhận | 41 | 2 StatCard; 3 nút hành động; **5 tab cuộn ngang** |
| 40 | Bảo hành — các hồ sơ đã tiếp nhận | 42 | 🔴 Ảnh chụp bằng tài khoản **có** quyền PII: hiện `Hoàng Văn Nam`, `0912021098` **không che** |
| 41 | Bảo hành — tạo hồ sơ mất mã | 43 | **Stepper 3 bước**; badge xanh lá *Nhập/quét mã* |
| 42 | Bảo hành — chọn bệnh lỗi | 44 | Ô tìm + **danh sách checkbox có cuộn riêng**; mã `DEF-006`, `DEF-013` |
| 43 | Bảo hành — mô tả và phụ kiện | 45 | *Lý do thiếu mã* readonly = *Mất tem/mã*; *Tạo hồ sơ bảo hành* |
| 44 | Bảo hành — chi tiết hồ sơ | 46 | **Stepper 4 bước**; badge cam `RECEIVED` |
| 45 | Bảo hành — chuyển trạng thái và timeline | 47 | *Kiểm tra* / **Huỷ** (đỏ); Timeline; *"Ghi chú bắt buộc khi Hoàn tất, Trả khách hoặc Huỷ"* |
| 46 | Bảo hành — ảnh và video | 48 | Giới hạn **JPG/PNG/WEBP ≤ 10MB**, **MP4/MOV/WEBM ≤ 300MB và 5 phút**; badge `0/10 ảnh · 0/2 video` |
| 47 | Fallback — không tìm thấy màn hình | 49 | Banner cam *"Đường dẫn không hợp lệ"*; *Về trang chủ* |

---

## 2. 🔴 Ba phát hiện từ chính bộ ảnh

### 2.1 Ảnh 40 chụp bằng tài khoản **có** quyền PII

Ảnh 40 hiện `Hoàng Văn Nam · 0912021098` **không che**. Trong khi khảo sát ngày
2026-09-05 bằng tài khoản **thủ kho**, cùng màn đó hiện `H*** V*** N*** · ******372`
([04-screen-survey.md §3.3](04-screen-survey.md)).

⇒ Xác nhận lần nữa: **cùng một màn hình hiển thị khác nhau theo vai**. Port màn
này phải xử lý cả hai dạng, và **không** được hard-code định dạng che.

### 2.2 Ảnh 36–37 xác nhận V-01 là lỗi thật

Trang 2 ghi *"API trả về 0 phiếu chờ duyệt"*, và ảnh 36/37 hiện `Phiếu nhập · 0`,
`Phiếu xuất · 0`. Nhưng ảnh 11 (trang chủ, **cùng đợt chụp**) hiện **`Chờ duyệt: 5`**.

⇒ **V-01 không phải do thiếu dữ liệu.** Hai màn đọc hai nguồn khác nhau và lệch
nhau ngay trong cùng một phiên. Lỗi thật, phải sửa ở Prompt 4.

### 2.3 Ảnh 01 là màn nội bộ, không phải nghiệp vụ

*"Danh mục màn xác thực"* liệt kê 10 trạng thái auth để chụp ảnh. Cùng loại với
link *"Xem auth screens"* ở ảnh 09. Đây là **công cụ nội bộ**, cần người dùng xác
nhận có port sang app mới hay không (mặc định: **không**, vì app mới đã có màn
Chẩn đoán riêng).

---

## 3. Design tokens rút ra từ ảnh

| Vai trò | Giá trị quan sát | Dùng ở |
|---|---|---|
| Primary | tím `#6C5CE7`-ish | nút chính, tab đang chọn, badge, stepper active |
| Primary nhạt | tím rất nhạt | nền badge, nền icon ô vuông, nền tab đang chọn |
| Success | xanh lá | banner "đã phê duyệt", badge *Hoàn tất* / *Đã quét* / *Thành công* |
| Warning | cam | banner "chưa đủ / chưa tăng tồn", badge `RECEIVED`, icon đồng hồ |
| Danger | đỏ | banner lỗi, viền ô lỗi, nút *Đăng xuất* / *Huỷ* |
| Info | xanh dương nhạt | banner giải thích nghiệp vụ |
| Nền trang | xám rất nhạt | toàn app |
| Nền thẻ | trắng, bo góc lớn, đổ bóng nhẹ | mọi card |
| Nền màn quét | **tối** | chỉ màn scanner |

**Bốn màu banner là hệ thống có chủ đích**, không phải trang trí:
xanh dương = giải thích nghiệp vụ · cam = điều kiện chưa đủ · xanh lá = đã xong ·
đỏ = lỗi. Port phải giữ đúng ngữ nghĩa này.

---

## 4. Component còn thiếu trong app mới

Đã có: `Page` · `Box` · `Text` · `Button` · `Input` · `List`.

| Component | Xuất hiện ở ảnh | Bắt buộc |
|---|---|:--:|
| **Banner** (4 sắc thái) | gần như mọi màn | 🔴 |
| **Stepper** (3 và 4 bước) | 18, 20, 21, 25, 29, 41, 44 | 🔴 |
| **StatCard** | 11, 20, 21, 39 | 🔴 |
| **Badge / Chip** trạng thái | 12, 19, 21, 28, 31, 32, 44 | 🔴 |
| **DefinitionRow** (nhãn ↔ giá trị, hỗ trợ `—` và nút copy) | 08, 09, 16, 23, 31, 34, 44 | 🔴 |
| **BottomNav** 5 tab | mọi màn gốc | 🔴 |
| **AppHeader** (back + eyebrow + tiêu đề) | mọi màn con | 🔴 |
| **FilterChipRow** cuộn ngang | 38, 39 | 🔴 |
| **EmptyState** | 36, 37, 46 | 🔴 |
| **Sheet / Dialog** | 10, 14 | 🔴 |
| **Select** | 25, 26, 41, 46 | 🔴 |
| **SearchInput** | 38, 42 | 🟠 |
| **Checkbox list** có cuộn riêng | 42 | 🟠 |
| **ProgressBar** | 29, 31, 38 | 🟠 |
| **Timeline** | 45 | 🟠 |
| **ScannerFrame** overlay | 13, 19, 28 | 🟠 |
| **Skeleton** | (thấy khi chạy thật, không có trong ảnh) | 🟠 |

---

## 5. Ràng buộc còn mở khi viết tài liệu này

🔴 **Mâu thuẫn Prompt 4 ↔ GATE_WMS chưa được gỡ.** Prompt 4 đòi *"tất cả luồng đã
kết nối implementation thật"* và cấm dữ liệu giả; `GATE_WMS §2b.3` #2 cấm đấu nối
endpoint nghiệp vụ trong Prompt 4. Ba phương án A/B/C đã trình bày, **chưa có
quyết định**.

Trong lúc chờ, phần **không** phụ thuộc quyết định đó vẫn làm được và đang được
làm trước: bộ component, khung màn hình, điều hướng, state và validation.
