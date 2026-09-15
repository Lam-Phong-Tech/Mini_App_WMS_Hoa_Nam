# State matrix — Prompt 06 Tra cứu

| State | Vào từ | Guard / dữ liệu | Hành động | Kết quả |
| --- | --- | --- | --- | --- |
| Sẵn sàng | Home CTA hoặc tab Quét mã | Không có mã; không gọi WMS | Nhập QR/barcode/serial/SKU hoặc mở camera/NFC | Loading hoặc camera |
| Loading | Có mã không rỗng | Một `AbortController` và id request mới nhất | Hủy, quét mã khác, Back | Request cũ bị abort/bỏ qua |
| Có kết quả | `GET inventory/trace/{code}` trả dữ liệu | Chỉ map field WMS trả: QR, SKU, item, serial, nhóm, đơn vị, kho, trạng thái | Sao chép, quét mã khác | Không tạo chứng từ/không đổi tồn |
| Không tìm thấy | WMS trả 4xx hoặc lookup trả `undefined` | Không suy ra lỗi mạng | Quét/nhập mã khác | Banner vàng, không giữ card cũ |
| Không kết nối / sai quyền | network, timeout, 5xx, edge, auth | Không kết luận mã hỏng | Thử lại hoặc Back | Banner đỏ, giữ phân biệt với not-found |
| NFC | Route `nfc-lookup` đã có | Chỉ mở khi AppShell truyền callback | Đọc UID qua module NFC | NfcLookupScreen; không suy item nếu WMS chưa resolve |

## Dữ liệu không được bịa

Board có panel tồn theo vị trí và lịch sử giao dịch. Contract hiện có chỉ xác
nhận trace/catalogue cho một mã; chưa có schema response đủ an toàn cho số tồn
theo vị trí hoặc lịch sử riêng item. Vì vậy UI ghi rõ gap này và không tự cộng,
suy diễn hay thêm endpoint.
