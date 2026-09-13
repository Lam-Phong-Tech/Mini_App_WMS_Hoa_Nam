# Changes — Prompt 05 Xuất kho

- `OutboundFlow.tsx`: ánh xạ `syncEngine` thành năm kết quả rõ ràng: `posted`, `queued`, `failed`, `conflict`, `unknown`. Ngoại lệ không còn bị báo nhầm là đang chờ.
- `OutboundResultScreen.tsx`: tiêu đề, nội dung và nhãn trạng thái riêng cho từng kết quả; chỉ `posted` mới hiển thị thông tin tồn kho giảm sau Web Post Issue.
- `outboundFlow.test.tsx`: regression kiểm tra toàn bộ ánh xạ trạng thái outbox.
- Không thay đổi BE/API, không gọi Post Issue để trừ tồn trong kiểm thử.
