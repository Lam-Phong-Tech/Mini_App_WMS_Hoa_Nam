# TC_UI_07 — Retest icon máy bay / Gửi yêu cầu đặt hàng

- Thời điểm: 2026-09-22 (Asia/Ho_Chi_Minh)
- Preview: `http://localhost:3111/home` → `http://localhost:3110/quote`

## Kết quả PASS

1. Icon máy bay mở trực tiếp route `/quote`, không đi qua màn Chọn sản phẩm quan tâm.
2. Màn đích có Quay lại, eyebrow, tiêu đề và mô tả đúng Expected Result.
3. Form có Họ và tên*, Số điện thoại* với placeholder, khối Sản phẩm của bạn và hướng dẫn chọn sản phẩm.
4. Bottom navigation vẫn hiển thị, tab Liên hệ được highlight trên route `/quote`.
5. `npm run typecheck` và `npm run lint` pass.
