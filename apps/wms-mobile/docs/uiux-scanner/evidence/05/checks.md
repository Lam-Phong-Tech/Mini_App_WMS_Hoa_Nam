# Checks — Prompt 05 Xuất kho

Run from `apps/wms-mobile`; revalidated on 2026-09-15.

| Check | Result | Evidence |
| --- | --- | --- |
| Gate 00–04 | PASS | Gate files parse as `PASS`; Gate 04 hash `fbd1e247d1f01110303a9a5362623b80a05db55662f751132ce0effe0ac0b8a9`. |
| Typecheck | PASS | `npm run typecheck`, exit 0. |
| Lint | PASS | `npm run lint`, exit 0; source/test scope has no error. |
| Full regression | PASS | `npm test -- --runInBand --silent`, 35 suites / 886 tests, exit 0. |
| Web build | PASS | `npm run build:web`, exit 0; Vite only reports existing chunk-size advisory. |
| Web smoke — form | PASS | Local `http://127.0.0.1:5175/`: thiếu trường hiển thị banner và lỗi từng ô; nhóm nhận, tỉnh và phường mở đúng; đổi tỉnh làm phường phụ thuộc lại. |
| Web smoke — create/scan | PASS | Form hợp lệ chuyển sang `Quét hàng xuất`; camera fallback hiển thị rõ `Could not start video source` khi trình duyệt không có thiết bị. |
| Android launch | PASS | APK debug cài trên Xiaomi `2206122SC` (serial `fbb9e686`); sau khi bật Metro và `adb reverse tcp:8081 tcp:8081`, app tải JS và hiển thị Home. Ảnh: `android-metro-launch.png`. |
| Android outbound entry | PASS | Chạm `Xuất kho` từ Home mở form `Thông tin xuất kho` trên thiết bị thật. Ảnh: `android-outbound-create.png`. |
| Outbox outcome mapping | PASS | `outboundFlow.test.tsx`: `synced→posted`, `pending→queued`, `failed→failed`, `conflict→conflict`, `unknown→unknown`. |
| Real outbound DEV E2E | PASS | Phiên admin resolve mã `DF12345-03` (SKU `DF12345`, “Máy mài điện”), sau đó `POST /api/v1/mini-app/outbound/record` thành công; phiếu `PX-20260914055046-RWYUUS` ở trạng thái chờ duyệt, chưa trừ tồn. Ảnh: `admin-e2e-record-result.png`. |
| Physical outbound camera | PASS | Xiaomi `2206122SC` mở màn Quét Xuất kho; Camera HAL ghi preview xấp xỉ 30 FPS, không có crash/bundle error. Phiên nháp được force-stop, mở lại và tiếp tục đúng màn Xuất kho. |
| Fixture visual đã chốt | PASS | Người dùng chốt ảnh mới nhất từ Xiaomi làm tiêu chí hoàn thiện Gate 05. Ảnh review thực tế `fixture-05-outbound-review-xiaomi-1440x3200.png`, SHA-256 `53B182116F24D0D03D62F01430A18D2BA5889D4124028A39B93A25F382D4AE0B`. Đây là acceptance fixture, không phải tuyên bố pixel-perfect với board composite của Designer. |
