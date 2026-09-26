# Bàn giao BE/QA — đồng bộ giao diện mẫu và Public Storefront 1.2.0

## Đã xác nhận từ BE

`GET /api/v1/public/config` đang trả thành công các dữ liệu FE cần:

| Trường | Giá trị xác nhận | Trạng thái FE |
| --- | --- | --- |
| `contact.hotline` | `098 636 6675` | Hiển thị hotline, copy và Gọi ngay |
| `support_hours.weekday` | `08:00–17:30` | Hiển thị Thứ Hai–Thứ Sáu |
| `support_hours.saturday` | `08:00–12:00` | Hiển thị Thứ Bảy |
| `privacy.url` | Có giá trị | FE dùng cho chính sách dữ liệu |
| `privacy.version` | `1.0.0` | Form Quote đã nhận version |
| `contact.zalo_oa_url` | `null` | Khớp trạng thái mẫu: Tạm thời chưa khả dụng |

`GET /api/v1/public/home` cho thấy catalogue live có 933 sản phẩm theo tổng domain. Đây là dữ liệu thật, khác với snapshot thiết kế 7 sản phẩm; không phải lỗi thiếu dữ liệu BE.

## Đối soát Public Storefront 1.2.0 — 2026-09-26

Đã đọc API public đang trả `contract_version: 1.2.0`.

| Hạng mục | API xác nhận | FE đã xử lý |
| --- | --- | --- |
| Phân trang | `data.page_info.total`, `next_cursor`, `has_more`, `limit`; ví dụ toàn catalogue là 933 | Products, Search và Related chỉ đọc `page_info`; không còn đọc cursor/tổng từ `meta`. Khi đổi query, filter hoặc sort, key cache/cursor được tách riêng nên không ghép dữ liệu truy vấn cũ. |
| Quote config | `data.quote_request.max_items: 20`, `max_quantity: 9999` | Giới hạn chọn/validate lấy từ config; khi không có config dùng mức an toàn 20. |
| Privacy | `data.privacy.version: 1.0.0` | Payload Quote luôn dùng phiên bản privacy này, không dùng `contract_version: 1.2.0`. |
| Retry Quote | BE định nghĩa 201 tạo mới, 200 replay cùng `data.request_id`, 409 khi cùng key nhưng khác payload | FE lưu nguyên payload đã validate và Idempotency-Key. Retry sau timeout gửi lại đúng object cũ, không sắp lại items, không đổi privacy version và không sinh key mới. |
| Mã yêu cầu | `data.request_id` | Màn xác nhận chỉ hiển thị `data.request_id`; `meta.request_id` không hiển thị cho khách. |
| Saved/Selection | Endpoint `ids[]` giữ contract riêng | FE không diễn giải `page_info` cho luồng `ids[]`. |

### Kiểm chứng FE cục bộ ở khung điện thoại 375 × 812

- `/products`: hiển thị **933 sản phẩm**; tải thêm từ 20 lên 40 cards và giữ tổng 933.
- Chuyển `domain=HAND_TOOLS&sort=name_asc`: danh sách được reset về 20 cards thuộc Dụng cụ cầm tay, tổng **521 sản phẩm**. Không còn cards từ truy vấn trước.
- Unit/type/lint: kiểm tra `page_info`, config quote, privacy version, 20/21 item, thứ tự items, retry cùng key/payload và HTTP 409.

## Việc BE cần xác nhận trước khi FE nghiệm thu Testing

| Ưu tiên | Yêu cầu | Điều kiện PASS |
| --- | --- | --- |
| P0 | Xác nhận BE commit `ed38f7e` đã lên **Testing** và cung cấp base URL Testing | FE không gửi Quote thật vào dev/live chỉ để kiểm thử. |
| P0 | Cấp một hoặc hai product ID test hợp lệ và dữ liệu liên hệ test không phải PII, hoặc một sandbox resettable | Có thể test 20/21 items và POST idempotency mà không tạo yêu cầu tư vấn thật. |
| P0 | Xác nhận test replay: POST mới 201, cùng key+payload trả 200 cùng `data.request_id`, cùng key+payload khác trả 409 | FE sẽ lưu ảnh mạng/UI kiểm chứng sau khi có môi trường Testing. |
| P1 | Bảo đảm Products, Search và Related đều trả `data.page_info` trên mọi cursor page | Gồm `total`, `next_cursor`, `has_more`, `limit`; `meta` chỉ giữ HTTP `request_id`. |
| P1 | Cung cấp scenario UAT snapshot 7 model/SKU có ảnh, thứ tự, trạng thái, category và totals cố định | Dữ liệu live 933 SKU không thể pixel-compare tuyệt đối với ảnh mẫu 7 model. Không thay catalogue live bằng dữ liệu mẫu. |

## BE/QA cần xác nhận hoặc bổ sung

| Ưu tiên | Yêu cầu | Lý do |
| --- | --- | --- |
| P1 | Cung cấp một **snapshot/scenario UAT cố định** cho Home, Categories, Products, Search, Compare và Detail | Pixel compare không thể dùng catalogue live 933 sản phẩm để khớp snapshot thiết kế gồm 7 model. Scenario cần giữ nguyên model, thứ tự, ảnh, trạng thái hàng, category và tổng số. |
| P1 | Xác nhận contract `POST /api/v1/public/quote-requests` trên môi trường Testing bằng dữ liệu test không phải PII | FE chưa gửi request thật trong audit để tránh tạo yêu cầu ngoài ý muốn. Cần đáp ứng idempotency, `consent: true`, `privacy_version`, tối đa 20 items và trả `RECEIVED` + `request_id`. |
| P2 | Quy ước dữ liệu `availability` cho UAT snapshot | Chỉ dùng `IN_STOCK` hoặc `PREORDER`; UI map thành Sẵn hàng/Đặt trước và icon tương ứng. |
| P2 | Quy ước `category.product_count` và `data.page_info` trong snapshot UAT | Các số hiển thị, progress `x / y` và pagination phụ thuộc trực tiếp các trường này; không dùng `meta.total` hoặc `meta.next_cursor`. |
| P3 | Cung cấp URL/ảnh mẫu cho Saved, Selection, Requests, Help, menu tiện ích, offline/system state | Không thể ký nhận pixel-perfect nếu không có canonical reference cho từng màn. |

## FE đã xử lý

- `npm start` mặc định chạy `backend-preview` để dùng dữ liệu public thật; mock chỉ chạy với `npm run start:dev-preview`.
- Đã cập nhật adapter/hook Quote theo Public Storefront 1.2.0: page info, quote limits, privacy version, retry và HTTP 409.
- UAT_Dev_v6 đã sửa các case UI 04–08, 16–18, 21 và kiểm tra lại trên 375×812.
- Contact, Quote, status product, gallery và empty category đã nhận/cập nhật cấu trúc theo mẫu.
