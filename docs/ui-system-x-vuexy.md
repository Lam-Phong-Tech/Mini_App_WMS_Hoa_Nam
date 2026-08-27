# X — Vuexy UX/UI System for WMS Mini App

`X` là ký hiệu tham chiếu cho hệ UX/UI được phân tích từ Vuexy CRM Dashboard và chuyển thể cho WMS Hoa Nam Mini App.

Khi có yêu cầu **“làm theo X”**, mặc định phải:

1. Giữ nguyên API, dữ liệu, permission và quy tắc nghiệp vụ đang có.
2. Chỉ thay đổi kiến trúc thông tin, component, trạng thái tương tác và giao diện.
3. Áp dụng các token, pattern và responsive rule trong tài liệu này.
4. Không sao chép dữ liệu demo, biểu đồ hoặc sidebar desktop vào Mini App nếu không phù hợp nghiệp vụ.

## 1. Tinh thần thiết kế

- Nền ứng dụng xám tím rất nhạt; nội dung chính nằm trong card trắng.
- Phân cấp theo thứ tự: tổng quan/KPI → hành động chính → danh sách công việc → chi tiết.
- Mỗi card chỉ phục vụ một mục đích; tránh lồng nhiều khung trắng và tránh viền dày.
- Dùng màu nhấn để thể hiện trạng thái và hành động, không phủ màu lên vùng nội dung lớn.
- Mật độ thông tin vừa phải, ưu tiên đọc nhanh và thao tác một tay trên điện thoại.
- Loading không khóa toàn màn hình nếu dữ liệu cũ vẫn dùng được; ưu tiên skeleton tại vùng đang tải.

## 2. Design tokens

### Màu

- `--x-bg: #F8F7FA` — nền ứng dụng.
- `--x-surface: #FFFFFF` — card, app bar, sheet.
- `--x-primary: #7367F0` — nút chính, tab active, mục điều hướng active.
- `--x-primary-soft: #EFEDFF` — nền icon/badge primary.
- `--x-text: rgba(47, 43, 61, 0.78)` — nội dung chính.
- `--x-text-strong: #2F2B3D` — tiêu đề và số liệu quan trọng.
- `--x-text-muted: rgba(47, 43, 61, 0.42)` — mô tả phụ.
- `--x-border: rgba(47, 43, 61, 0.12)` — divider/outline nhẹ.
- `--x-success: #28C76F` — hoàn tất, hợp lệ, tăng.
- `--x-danger: #EA5455` — lỗi, từ chối, giảm.
- `--x-warning: #FF9F43` — chờ xử lý/cảnh báo.
- `--x-info: #00CFE8` — thông tin/đang xử lý.

### Chữ

- Font: `Public Sans`, fallback về font hệ thống.
- Nội dung mặc định: `15px / 22px`, weight 400.
- Mô tả phụ: `13px / 20px`, weight 400.
- Tiêu đề card: `18px / 24px`, weight 500–600.
- Số liệu/KPI: `22px / 30px`, weight 500–600.
- Tiêu đề màn mobile: `20–22px`, weight 600–700.
- Không viết hoa toàn bộ đoạn dài; chỉ dùng uppercase cho eyebrow/chip ngắn.

### Khoảng cách và hình khối

- Thang khoảng cách: `4, 8, 12, 16, 24, 32px`.
- Khoảng cách giữa card: desktop `24px`, mobile `16px`.
- Padding card: desktop `24px`, mobile `16px`.
- Card radius chuẩn: `6–8px`; modal/bottom sheet mobile có thể `16–20px` ở cạnh trên.
- Card shadow: `0 4px 18px rgba(47, 43, 61, 0.10)`.
- Input/button: cao tối thiểu `44–48px`, radius `6–8px`.

## 3. Bố cục responsive

### Desktop/tablet lớn

- Sidebar cố định khoảng `260px`.
- Header sticky cao khoảng `80px`.
- Main content padding ngang `24px`.
- KPI xếp theo grid; card chi tiết dùng tỷ lệ 2/3 + 1/3 khi phù hợp.
- Danh sách nhiều cột dùng table; bộ lọc nằm trên table và luôn nhìn thấy.

### Mobile Mini App

- Bỏ sidebar; giữ app bar gọn và bottom navigation hiện có của Mini App.
- Margin màn hình `16px`.
- KPI ngắn được xếp 2 cột; card nghiệp vụ, form, danh sách và biểu đồ xếp 1 cột.
- Nút chính của bước tạo/quét/duyệt được sticky phía dưới nhưng không che nội dung hoặc safe area.
- Không khóa `body`/container làm mất khả năng cuộn, trừ màn camera thực sự fullscreen.
- Nội dung phải hoạt động đúng với `100dvh` và safe-area trên iOS/Android.

## 4. Component chuẩn X

- **App bar:** nền trắng, bóng nhẹ; có back/menu, tiêu đề hoặc search, các action ngắn và avatar/trạng thái.
- **KPI card:** label → khoảng thời gian/trạng thái phụ → số chính → biến động/chip; icon hoặc mini-chart chỉ là bổ trợ.
- **Section card:** tiêu đề + mô tả ngắn + menu ba chấm/action; nội dung chia bằng divider nhẹ.
- **Status chip:** nền nhạt, chữ đậm theo semantic color; không dùng cùng một màu cho mọi trạng thái.
- **Tabs:** active dùng primary, inactive trung tính; tab phải đổi dữ liệu tại chỗ, không điều hướng sai ngữ cảnh.
- **List row:** icon/avatar → tên chính → metadata → trạng thái/action; vùng bấm tối thiểu 44px.
- **Form:** label rõ, helper/error ngay dưới field; validation khi blur và khi submit; field phụ thuộc bị disable đến khi đủ điều kiện.
- **Primary action:** mỗi màn chỉ có một CTA chính nổi bật; action phụ dùng outline/text.
- **Empty state:** giải thích vì sao trống và đưa ra một hành động phù hợp.
- **Loading:** skeleton đúng hình dạng card/row; không ping toast lặp; không tải lại toàn màn hình khi refetch nền.
- **Error:** hiển thị `error_code` đã map thành nội dung dễ hiểu; lỗi dòng/item phải gắn đúng dòng và cho sửa/xóa/quét lại.

## 5. Luồng nghiệp vụ chuẩn X

### Tạo phiếu nhập/xuất

`Thông tin cơ bản → Quét liên tục → Kiểm tra và chỉnh sửa → Gửi duyệt → Màn thành công`

- Có step indicator ngắn ở đầu màn.
- Dữ liệu đã nhập/quét được giữ khi quay lại bước trước trong cùng phiên.
- Màn kiểm tra nhóm theo SKU, có tổng số lượng và khả năng xem/xóa mã lỗi.
- CTA gửi duyệt chỉ bật khi dữ liệu hợp lệ.
- Thành công phải đưa đúng về hàng đợi duyệt tương ứng, không nhảy sang lịch sử.

### Duyệt phiếu

`Hàng đợi đúng loại phiếu → Chi tiết → Kiểm tra dữ liệu/trạng thái → Duyệt hoặc từ chối → Cập nhật tại chỗ`

- Phiếu nhập và phiếu xuất là hai khu vực/tab rõ ràng.
- Danh sách hiển thị dữ liệu cache ngay, sau đó refetch nền.
- Tránh gọi API danh sách hai lần do mount/effect trùng.

### Bảo hành

`Nhận diện mã hoặc nhập tay → Thông tin khách/sản phẩm → Bệnh lỗi + media → Kiểm tra → Sửa chữa/hoàn tất → Trả khách`

- Timeline trạng thái luôn nhìn thấy trong chi tiết case.
- Chỉ hiện field bắt buộc cho transition sắp thực hiện.
- Ảnh/video dùng thumbnail cố định, `object-fit: cover`, lazy load và mở viewer khi bấm.

## 6. Quy tắc dùng ký hiệu X

- **“Làm màn A theo X”**: áp dụng X cho riêng màn A và các component trực tiếp của nó.
- **“Đồng bộ luồng B theo X”**: áp dụng X cho toàn bộ các bước của luồng B, bao gồm loading/error/success/responsive.
- **“Đồng bộ app theo X”**: xây token/component nền trước, sau đó migrate từng màn để tránh thay đổi rời rạc.
- Nếu yêu cầu mới xung đột với X, yêu cầu mới của người dùng được ưu tiên.

## 7. Những điều X không cho phép

- Card trong suốt làm lộ nền phía sau hoặc nhiều lớp card trắng lồng nhau.
- Bo góc quá lớn cho mọi thành phần.
- Spinner toàn màn hình cho tác vụ tải danh sách thông thường.
- Toast/error lặp liên tục do polling/refetch.
- CTA quan trọng nằm dưới vùng phải cuộn mới thấy.
- Điều hướng sau hành động sang sai phân hệ.
- Dùng local storage làm nguồn trạng thái nghiệp vụ thay cho backend WMS.

