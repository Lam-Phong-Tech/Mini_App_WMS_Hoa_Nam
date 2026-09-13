# Blockers — Prompt 05

Gate 05 chưa thể PASS vì hai bằng chứng ngoài local chưa có trong lượt chạy:

1. Chưa thực hiện E2E ghi record Xuất kho trên DEV với tài khoản/quyền/kho test được cấp bảo mật. Đây là bước cần BA/QA xác nhận trước khi tạo phiếu thật; không được suy ra từ fixture hoặc test mock.
2. Chưa có ảnh so sánh board `03_xuat_kho.png` ở profile 390×844 CSS px, DPR 3, cùng fixture và diff định lượng. Local smoke chỉ xác nhận cấu trúc/tương tác.

Camera fallback trên browser là giới hạn môi trường (`Could not start video source`), không phải lỗi build. Gate 04 đã có bằng chứng camera thật cho scanner chung; cần một lượt E2E Xuất kho trên thiết bị nếu muốn đóng blocker này.
