# Blockers — Prompt 03 Dialog cố định

Không còn blocker trong phạm vi dialog và nháp đã được người dùng chốt.

Các giới hạn vẫn giữ nguyên:

- Nháp `DRAFT`/`CANCELLED` được lưu trên thiết bị vì BE chưa xác nhận endpoint
  tạo nháp generic. Khi bấm ghi nhận, luồng vẫn dùng service `record` thật.
- `Kho tạm dừng` là thông báo không có chức năng liên hệ; màn hiển thị khi lần
  đọc kho thành công không có kho ACTIVE. Không có dữ liệu pause/contact giả.
- Camera/NFC phần cứng và các nghiệp vụ ca làm tiếp tục thuộc gate riêng.
