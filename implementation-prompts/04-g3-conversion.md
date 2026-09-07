# PROMPT 04 — G3: Conversion MVP tối thiểu

Bạn là Senior Full-stack Engineer + Solution Architect. Chỉ chạy prompt này khi G2 đã hoàn tất.

## Điều kiện vào gate — bắt buộc kiểm tra trước

Đọc G2 report, `SCOPE_LOCK.md`, OpenAPI và chạy test/build liên quan. Chỉ tiếp tục nếu `GATE G2 — STATUS: DONE`, catalogue flow hoàn chỉnh và không có scope cấm đã lọt vào code. Nếu không, báo `GATE G3 — STATUS: BLOCKED` và quay lại Prompt 03.

## Scope chính xác

G3 chỉ gồm Share, Hotline, Zalo OA và Quote Request tối thiểu. Không được biến quote thành Lead Management.

Không tạo/kết nối CRM/ERP, CRM credential, outbox, queue, retry worker, lifecycle sync, notification/email, dashboard/export Lead. Tìm và loại mọi code mới cố tình thêm các phần này. ADR-04, ADR-05 và FR-013 của SRS vẫn là `DEPRECATED FOR CURRENT MVP`.

## Mục tiêu G3

1. Share/deep link đúng product slug và variant khi có, có fallback hợp lý nếu API Zalo không khả dụng. Không gửi PII vào analytics.
2. Hotline và OA lấy hoàn toàn từ Public Config; hotline dùng `tel:`; OA chỉ mở deep link OA đã cấu hình. Không hardcode số/URL/token.
3. Tạo Quote Request từ Product Detail với CTA chính sticky “Yêu cầu tư vấn/Báo giá”; Share/Chat/Gọi là action phụ.
4. Form có product/variant/model context read-only, `full_name`, `phone`, `province_code` optional, `note` tối đa 500, consent bắt buộc, privacy_version và source `ZALO_MINI_APP`.
5. Validate full_name 2–80, phone Việt Nam theo contract, note ≤500, consent=true và product/variant vẫn PUBLISHED + IN_STOCK. Hiển thị lỗi ngay dưới field.
6. Khi submit: tạo/giữ Idempotency-Key, disable nút, loading, chống double tap, retry timeout với cùng key, success chứa request_id + RECEIVED, xử lý PRODUCT_NOT_AVAILABLE/VALIDATION_ERROR/IDEMPOTENCY_CONFLICT/rate limit/network error thân thiện.
7. API/persistence tối thiểu chỉ dùng schema G0. Nếu chưa có backend/database hỗ trợ, hoàn thiện mock persistence và idempotency test đúng contract; ghi Red Flag rằng không thể xác nhận production persistence. Không giả vờ đã có system of record production.

## Test bắt buộc

Test: hotline/OA thay config không rebuild; quote required fields; phone/name/note validation; consent; happy path trả request_id; double tap chỉ một request; retry cùng key không trùng; cùng key/payload khác là conflict; product vừa unavailable; network/rate-limit/API error; không có CRM/ERP/queue/notification request hoặc module. Kiểm tra PII không nằm trong analytics/log không cần thiết.

## Báo cáo và điều kiện qua gate

Kết thúc bằng `GATE G3 — STATUS: DONE | PARTIAL | BLOCKED`, nêu files changed, API/DB impact, test/build/evidence, red flags, production limitation và xác nhận out-of-scope.

Chỉ `DONE` khi conversion flow đúng contract, idempotency có evidence, build/typecheck/lint/tests pass và chứng minh không có CRM/ERP/queue/retry/notification. Nếu chưa đạt, sửa G3 hoặc báo blocker; không chạy Prompt 05.
