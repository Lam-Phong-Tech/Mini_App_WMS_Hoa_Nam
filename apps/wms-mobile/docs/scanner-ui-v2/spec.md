# Spec dẫn xuất — Gate 01 (chưa chốt)

## Scope đã chốt từ yêu cầu V3

- Nhập/xuất kho thông thường trên Scanner chỉ quét và hiển thị **Chờ Web duyệt**. App không có route/UI duyệt, từ chối hoặc Post các phiếu này.
- Home `Xem tất cả` mở Lịch sử.
- Xuất linh kiện bảo hành là ngoại lệ: `create → scan → Post` trực tiếp trên App; chỉ Post mới trừ tồn.
- Phiếu linh kiện dở phải giữ document id, version, mã đã scan và idempotency key Post; scan chưa xác minh phải dừng để Web đối chiếu.
- Kho xuất phải khóa từ lần quét đầu tiên, bền qua back/restart/xóa dòng.
- Lịch sử linh kiện Posted phải có tải thêm và chống trùng theo định danh ổn định.

## Điều không được coi là spec

- CSS của gallery, màu raster, giờ/pin, dữ liệu nhân sự, mã sản phẩm và các số lượng minh hoạ không phải dữ liệu production.
- Board không cấp animation duration/easing, typography/font file, viewport/DPR/font scale, hệ icon nguồn hoặc crop vùng app.
- `01_dialog_fixed.png` không là baseline Dialog hiện hành; dùng `01_dialog_header_aligned_v2.png`.

## Compatibility matrix — chưa quyết định (D01)

| Thành phần yêu cầu | Web | Android/PDA | Quyết định hiện tại |
| --- | --- | --- | --- |
| SmoothUI | Chưa cài; app web không dùng Tailwind | Không có adapter được chứng minh | BLOCKED, không đoán package. |
| Motion for React | Browser/HTML có khả năng dùng | Không tự tương thích React Native | BLOCKED. |
| GSAP | Có thể cho browser | Native adapter chưa chứng minh | BLOCKED. |
| Lenis | Web-scroll | Không áp dụng mặc định native | BLOCKED. |
| Locomotive Scroll | Web-scroll, cần tránh controller trùng Lenis | Không áp dụng mặc định native | BLOCKED. |
| TanStack Virtual | Cần adapter cho scroll element web | Native hiện có FlashList wrapper | BLOCKED. |

Gate 01 không cài thư viện chỉ để đủ tên. Cần xác nhận phạm vi “toàn hệ thống” là UX thống nhất với adapter theo platform hay bắt buộc mỗi thư viện chạy trực tiếp trên cả Web và Android/PDA.

## Điều kiện nghiệm thu chưa có

Thiết bị/OS/viewport/DPR/font scale, account/role test, fixture, API contract cho màn mới, ngưỡng performance, quy trình camera/NFC/PDA, và cách so sánh visual chưa được cung cấp. Vì thiếu các điều kiện này, “100%” không thể được đánh dấu PASS ở Gate 01.
