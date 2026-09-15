# Changes — Prompt 06 Tra cứu

- Đọc board `04_tra_cuu.png` trực tiếp tại revision Designer đã khóa.
- Đổi màn Tra cứu thành bố cục nhập mã trực tiếp, header nghiệp vụ và card
  thông tin/tồn theo những field API thực trả.
- Đổi lối tắt Home từ mở camera bắt buộc sang vào thẳng Tra cứu; camera vẫn là
  CTA tùy chọn trên chính màn này.
- Thêm loading có hủy. Mỗi lookup nhận `AbortSignal`; request cũ không thể ghi
  đè kết quả mã mới.
- Tách input rỗng, mã không tìm thấy (4xx), lỗi mạng/quyền và hủy request.
- `inventoryLookup` truyền cancellation xuống cả trace và catalogue GET.
- Không thêm endpoint, không thêm package, không gọi record/Post/mutation.
- Thêm regression cho input trống, đảo thứ tự response, hủy request, 4xx và
  lỗi network. Cập nhật assertion màn cũ theo ô tra cứu trực tiếp của board.
- Kiểm thử đọc NFC thật trên Xiaomi: thẻ đã resolve thành item `DF1234-01` /
  SKU `DF1234`; các trường SKU name, bảo hành và lần xuất gần nhất được WMS
  trả rỗng nên UI giữ `—`, không suy diễn.
- Sửa adapter trace để đọc `resolved_object.sku_name` (BE trả thật khi lookup
  SKU). NFC lookup dùng GET trace bằng sku_code để bù tên SKU khi resolve-tag
  chỉ trả mã; tên SKU không còn bị bỏ trống nếu WMS đã có dữ liệu.
