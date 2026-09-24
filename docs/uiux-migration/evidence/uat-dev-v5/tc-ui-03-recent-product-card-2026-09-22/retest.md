# TC_UI_03 — Retest thẻ sản phẩm vừa xem

- Thời điểm: 2026-09-22 (Asia/Ho_Chi_Minh)
- Preview: `http://localhost:3111/home`
- Dữ liệu thao tác: Khoan búa dùng pin không chổi than DCZC02-26.

## Kết quả PASS

1. Sau khi mở chi tiết, sản phẩm xuất hiện tại khu vực **Sản phẩm vừa xem** với ảnh, mã, tên, trạng thái và thao tác đầy đủ.
2. Nhãn Sẵn hàng được đặt ở rail phía trên của vùng media; không che hoặc cắt ảnh sản phẩm.
3. Sau khi nhấn Lưu, thao tác đổi thành **Đã lưu**, icon tim được tô và nền chuyển xanh nhạt.
4. Thẻ sản phẩm giữ viền, khoảng đệm và ảnh `object-fit: contain`; không có nội dung đè lên ảnh.
