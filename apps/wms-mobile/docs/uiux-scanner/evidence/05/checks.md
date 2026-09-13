# Checks — Prompt 05 Xuất kho

Run from `apps/wms-mobile` on 2026-09-12.

| Check | Result | Evidence |
| --- | --- | --- |
| Gate 00–04 | PASS | Gate files parse as `PASS`; Gate 04 hash `fbd1e247d1f01110303a9a5362623b80a05db55662f751132ce0effe0ac0b8a9`. |
| Typecheck | PASS | `npm run typecheck`, exit 0. |
| Lint | PASS | `npm run lint`, exit 0; source/test scope has no error. |
| Full regression | PASS | `npm test -- --runInBand`, 33 suites / 874 tests, exit 0. |
| Web build | PASS | `npm run build:web`, exit 0; Vite only reports existing chunk-size advisory. |
| Web smoke — form | PASS | Local `http://127.0.0.1:5175/`: thiếu trường hiển thị banner và lỗi từng ô; nhóm nhận, tỉnh và phường mở đúng; đổi tỉnh làm phường phụ thuộc lại. |
| Web smoke — create/scan | PASS | Form hợp lệ chuyển sang `Quét hàng xuất`; camera fallback hiển thị rõ `Could not start video source` khi trình duyệt không có thiết bị. |
| Android launch | PASS | APK debug cài trên Xiaomi `2206122SC` (serial `fbb9e686`); sau khi bật Metro và `adb reverse tcp:8081 tcp:8081`, app tải JS và hiển thị Home. Ảnh: `android-metro-launch.png`. |
| Android outbound entry | PASS | Chạm `Xuất kho` từ Home mở form `Thông tin xuất kho` trên thiết bị thật. Ảnh: `android-outbound-create.png`. |
| Outbox outcome mapping | PASS | `outboundFlow.test.tsx`: `synced→posted`, `pending→queued`, `failed→failed`, `conflict→conflict`, `unknown→unknown`. |
| Real outbound DEV write | NOT_RUN | Không gửi record/Post Issue trên dữ liệu DEV trong lượt này để tránh tạo phiếu hoặc giảm tồn ngoài yêu cầu kiểm thử. |
| Physical outbound camera/NFC | NOT_RUN | Camera/NFC của thiết bị thật đã được chứng minh ở Gate 04 cho scanner chung; chưa có E2E Xuất kho với tài khoản/kho test riêng. |
| Pixel diff/motion evidence | NOT_RUN | Chưa có capture cùng fixture/viewport và diff định lượng cho board Xuất kho; không tuyên bố pixel-perfect. |
