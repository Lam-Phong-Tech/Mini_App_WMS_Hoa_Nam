# PROMPT 05 — G4: Hardening, UAT và báo cáo cuối

Bạn là Senior Full-stack Engineer + Solution Architect. Đây là gate cuối được phép chạy. Không publish production/G5.

## Điều kiện vào gate — bắt buộc kiểm tra trước

Đọc `SCOPE_LOCK.md`, reports G0–G3, OpenAPI/config matrix và evidence. Chỉ tiếp tục nếu `GATE G3 — STATUS: DONE`, quote MVP đã có idempotency evidence và không tồn tại CRM/ERP/queue/retry/notification code. Nếu không, báo `GATE G4 — STATUS: BLOCKED` và quay lại Prompt 04.

## Mục tiêu G4

1. Hoàn thiện responsive trên màn hình nhỏ/lớn, Vietnamese long text/font scale, contrast và touch targets tối thiểu 44px.
2. Kiểm tra đầy đủ loading/skeleton, empty, no-network, API error, rate-limit, maintenance, update-required nếu config hỗ trợ, Product Unavailable và image/media fallback. Không có màn hình trắng/raw error/stack trace.
3. Hardening API/client: input validation và sanitize, output an toàn, allowlist sort/filter, no secret client-side, no price/quantity/internal field, rate-limit behavior, PII-safe logging/analytics và privacy/consent handling.
4. Kiểm tra data quality: chỉ PUBLISHED + IN_STOCK, optional fields hidden, không fake UAT/Production data, family/variant đúng, media không dùng nguyên trang catalogue làm cover nếu dữ liệu thực có.
5. Chạy build, typecheck, lint, unit/contract/integration/E2E phù hợp môi trường; bổ sung test còn thiếu theo risk cao.
6. Chuẩn bị deployment/config/rollback cơ bản cho DEV/UAT/Production configuration, không có secret value và không thực hiện production publish.

## Ma trận UAT tối thiểu

Xác minh public no-login; Home/category/listing; model exact + search không dấu; filter/reset/sort/pagination; detail/variant/bundle/optional field; stock filtering/unavailable; share/deep link; dynamic hotline/OA; quote validation/consent/request_id/idempotency/conflict; no-network/429/maintenance/media fallback; security/PII scan; mobile responsive; API contract và build. Dữ liệu thiếu hoặc thiếu backend persistence phải là Red Flag, không phải Passed giả.

## Báo cáo bắt buộc

Xuất `FINAL MVP IMPLEMENTATION REPORT` gồm:

- trạng thái G0, G1, G2, G3, G4;
- screen, API, test và environment/config matrices;
- commands và kết quả build/typecheck/lint/test;
- evidence/UAT results;
- files changed và API/DB impact;
- blockers, assumptions, known limitations, red flags;
- xác nhận không có price/inventory quantity/secret/PII không cần thiết;
- xác nhận không triển khai CRM/ERP/Lead Management/Outbox/Queue/Retry/Notification;
- production readiness `READY` hoặc `NOT READY`, với lý do cụ thể.

Kết thúc bằng `GATE G4 — STATUS: DONE | PARTIAL | BLOCKED`. Chỉ đánh dấu `DONE` nếu toàn bộ acceptance criteria trong scope có evidence và build/test pass. Dừng ở đây; không chạy G5, không publish production nếu chưa có yêu cầu riêng.
