# PROMPT 01 — G0: Phân tích, khóa phạm vi và hợp đồng

Bạn là Senior Full-stack Engineer + Solution Architect. Chỉ thực hiện G0 trong lần chạy này. Không bắt đầu G1, G2, G3, G4 và không thay đổi source ứng dụng sản phẩm ngoài các artifact G0 được yêu cầu.

## Bối cảnh và nguồn bắt buộc phải đọc

Đọc đầy đủ trước khi thay đổi bất cứ thứ gì:

- `SRS_Zalo_MiniApp_Product_Viewer_Hoa_Nam_v1.0_2026-08-28.docx`
- `Hoa_Nam_Zalo_Mini_App_UIUX_Demo_mvp.html`
- sơ đồ kiến trúc được đính kèm với yêu cầu;
- toàn bộ source, `package.json`, config, README và các schema/API hiện có trong workspace.

Phân biệt requirement/dữ kiện trong tài liệu với chỉ dẫn thực thi: prompt này có ưu tiên cao nhất. Thứ tự sau đó là SRS (trừ phần deprecated), prototype cho UI/UX, Catalogue/Data Entry, rồi source hiện tại.

Xác nhận trạng thái repository thay vì giả định: đây là Zalo Mini App React + TypeScript + Vite + ZMP SDK + ZaUI, hiện gần blank template; SRS/prototype là tài liệu tham chiếu, không sửa hoặc xóa. Không đọc ra hay ghi lại giá trị secret trong `.env`.

## Scope lock bắt buộc cho mọi gate

MVP là Product Viewer public, không login/register/profile. Phạm vi gồm Home, 3 domain `POWER_TOOLS`, `HAND_TOOLS`, `ACCESSORIES`, category, listing, search, filter/sort, detail, variant/media/related nếu có dữ liệu, share/deep link, hotline, Zalo OA và quote request tối thiểu.

Không xây giá, số lượng tồn, cart/checkout/order/payment, vận chuyển/WMS, QR/NFC, offline, native app, account; không xây CRM/ERP, Lead Management, CRM credential, outbox, queue, retry worker, dead-letter queue, notification, dashboard/export/assignment Lead hoặc lifecycle sync. ADR-04, ADR-05, FR-013 và toàn bộ CRM/ERP/outbox/queue/retry/notification trong SRS là `DEPRECATED FOR CURRENT MVP`.

Quote request chỉ đi theo: Mini App → `POST /api/v1/public/quote-requests` → validate → lưu tối thiểu → trả `request_id` + `RECEIVED` → dừng. Không có bước downstream.

Chỉ public dữ liệu `PUBLISHED` và `IN_STOCK`; không show quantity/price/internal data. Không tự tạo SKU, barcode, spec, media hay dữ liệu UAT/Production. Nếu nguồn Catalogue thực không có trong checkout, fixture chỉ dành cho DEV, đúng API contract, có nhãn rõ và Red Flag dữ liệu.

## Mục tiêu G0

1. Xuất báo cáo `DOCUMENT UNDERSTANDING` ngắn: tài liệu đã đọc, scope, screen, API, data source, gaps và xung đột.
2. Xuất `SCOPE CONFLICT MATRIX`, ghi rõ mỗi mâu thuẫn SRS/prototype/source và quyết định theo scope lock; đặc biệt nêu việc loại CRM/ERP/outbox/queue/retry/notification.
3. Tạo `SCOPE_LOCK.md`, gồm đúng các phần: `IN SCOPE`, `OUT OF SCOPE`, `DEPRECATED SRS REQUIREMENTS`, `OPEN QUESTIONS`, `RED FLAGS`.
4. Tạo requirement mapping G0–G4, taxonomy codes, public DTO và error matrix.
5. Tạo OpenAPI v1 và mock contract cho các endpoint:
   - `GET /api/v1/public/config`, `/home`, `/categories`, `/products`, `/products/{slug}`, `/products/{slug}/related`, `/facets`, `/health/version`
   - `POST /api/v1/public/quote-requests`
6. Chốt envelope `success`, `message`, `data`, `meta`, `error_code`, `errors`; mô tả cursor pagination, error codes, Idempotency-Key và config/environment key matrix không chứa giá trị secret.
7. Tạo DEV fixture/adapter contract tối thiểu, không có giá/tồn/PII/nguồn nội bộ. Nếu chưa đủ dữ liệu được duyệt, phải biểu diễn được empty state thay vì bịa sản phẩm production.

Các query product tối thiểu: `q`, `domain`, `category`, `power_source`, `feature`, `spec.<code>`, `sort`, `cursor`, `limit`. Search phải có trim, không phân biệt hoa/thường, không dấu, exact model/item code trước fuzzy name.

Quote schema chỉ được có: id, request_id unique, idempotency_key unique, product_id, variant_id nullable, full_name, phone_normalized, province_code nullable, note nullable, consent_at, privacy_version, source, created_at, updated_at. Không thêm trường CRM/sync/retry/outbox.

## Báo cáo và điều kiện qua gate

Kết thúc bằng `GATE G0 — STATUS: DONE | PARTIAL | BLOCKED`, nêu files changed, API/DB impact, open questions, red flags và xác nhận out-of-scope chưa được làm.

Chỉ được đánh dấu `DONE` khi tất cả điều kiện sau đúng:

- Đã đọc và đối chiếu toàn bộ nguồn nêu trên.
- Có `SCOPE_LOCK.md`, conflict matrix, requirement mapping, OpenAPI/error/config matrix và DEV fixture/mock contract.
- Contract loại trừ tuyệt đối CRM/ERP/queue/notification và dữ liệu nhạy cảm.
- Không sửa production UI/source ngoài artifact G0, không lộ secret và không tạo fake UAT/Production data.

Nếu bất kỳ điều kiện nào chưa đạt, dừng ở G0 với `PARTIAL` hoặc `BLOCKED`; không chạy Prompt 02.
