# Retest — dữ liệu thực trên màn So sánh

- Thời điểm: 2026-09-22 (Asia/Ho_Chi_Minh)
- Môi trường: preview cục bộ `http://localhost:3111/home` (Mini App `http://localhost:3110/compare`)
- Dữ liệu đối chiếu: `DCPL04-8`, `DCPL16-162`, `DCPL165` — cùng danh mục Máy khoan & vặn vít.

## Kết quả PASS

1. Khu vực **Công dụng & đặc điểm** lấy mô tả công khai riêng của từng model và hiển thị các đặc điểm từ API.
2. Khu vực **Thông số kỹ thuật** lấy các thông số công khai theo từng model; đã xác nhận dòng `Trọng lượng` với các giá trị `0.9/0.7kg`, `0.9kg`, `1.1/1.4/0.8kg`.
3. Không còn hai thông báo placeholder “Chưa có thông tin công dụng…” và “Chưa có thông số…” khi API trả về dữ liệu.
4. Kiểm tra console trên preview: không có lỗi runtime.

Ảnh retest đã được chụp trực tiếp trên preview trong phiên kiểm thử này, tại vị trí khu vực Công dụng & đặc điểm và Thông số kỹ thuật.
