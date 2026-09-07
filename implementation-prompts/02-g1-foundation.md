# PROMPT 02 — G1: Foundation

Bạn là Senior Full-stack Engineer + Solution Architect. Chỉ chạy prompt này khi G0 đã hoàn tất.

## Điều kiện vào gate — bắt buộc kiểm tra trước

Đọc các artifact G0, đặc biệt `SCOPE_LOCK.md`, conflict matrix, OpenAPI, config matrix và report G0.

Chỉ tiếp tục nếu report trước ghi `GATE G0 — STATUS: DONE` và kiểm tra được rằng:

- Scope lock có mục `DEPRECATED SRS REQUIREMENTS` nêu CRM/ERP/outbox/queue/retry/notification.
- API v1, DTO, errors, config keys và DEV mock contract đã tồn tại.
- Không có giá, quantity, cart/order/payment, login/profile hoặc Lead Management trong contract.

Nếu một điều kiện không đạt, không sửa code G1. Báo `GATE G1 — STATUS: BLOCKED`, nêu thiếu gì và quay lại chạy Prompt 01.

## Scope không được vi phạm

Đây là Zalo Mini App public React + TypeScript + Vite + ZMP SDK + ZaUI. Bám prototype HTML, mobile-first; không đổi framework, không refactor toàn repo, không thêm dependency nặng hoặc microservice không cần thiết. Không sửa/xóa SRS, prototype hay lộ `.env` secret.

Không có login/account, ecommerce, giá/tồn quantity hay CRM/ERP/queue/retry/notification. Public config, quote request tối thiểu và dữ liệu public-only phải tuân theo `SCOPE_LOCK.md`.

## Mục tiêu G1

1. Thay blank template bằng Mini App shell có routing, shared layout, navigation và state boundary phù hợp ZMP/ZaUI.
2. Thiết lập design tokens theo prototype, mobile-first và hỗ trợ tiếng Việt/font scale; bottom navigation chỉ có `Trang chủ`, `Danh mục`, `Liên hệ`.
3. Tạo nền tảng route/state cho Launch/Bootstrap, Home, Category, Product List, Search, Filter/Sort, Detail, Gallery, Quote Request, Contact và System States. Chưa cần hoàn thiện luồng catalogue ở G1.
4. Tạo API client, typed DTO/adapter, config service và mock/BFF boundary đúng OpenAPI G0. Config gồm hotline, OA, support hours, privacy URL, maintenance/feature flags; không hardcode giá trị vận hành hoặc secret.
5. Thiết lập handling cho loading, empty, no-network, API error, rate-limit, maintenance và unavailable mà không lộ raw error.
6. Bổ sung scripts build/typecheck/lint/test tối thiểu nếu repository hiện tại thiếu, theo toolchain hiện hữu và không phá `zmp start`/`zmp deploy`.
7. Viết test foundation tỷ lệ với thay đổi: routing/navigation, API envelope/adapter, config fallback và system-state boundary.

## Báo cáo và điều kiện qua gate

Kết thúc bằng `GATE G1 — STATUS: DONE | PARTIAL | BLOCKED`: scope đã làm, files changed, API/DB impact, screens, commands/test/build/evidence, red flags và out-of-scope confirmation.

Chỉ đánh dấu `DONE` khi:

- App build/typecheck/lint/test chạy thành công bằng script thực tế.
- Không còn màn “Hello world” làm shell chính; launch, navigation 3 mục và typed API/config boundary hoạt động với mock G0.
- Các state nền tảng có UI an toàn; không có secret, price, quantity, login hoặc CRM-related code.
- Prototype được dùng làm baseline, không bị thay bằng dashboard/ecommerce UI.

Nếu chưa đạt, sửa trong G1 đến khi đạt hoặc báo blocker. Chỉ khi `DONE` mới được chạy Prompt 03.
