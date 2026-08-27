# 9. Kế hoạch triển khai theo phase

| Phase | Tên | Deliverable |
|---|---|---|
| P1 | Phân tích & chốt thiết kế | ✅ Hoàn tất — bộ tài liệu `docs/design/`. MVP, ERD, API contract, permission matrix, error catalog, test plan đã khoá. |
| P2 | Khởi tạo backend | Migration theo [04-erd-database.md](04-erd-database.md), model, service layer (`PricingService`, `InventoryService`, `OrderStateMachine`), authentication JWT, middleware phân quyền theo [06-permission-error.md](06-permission-error.md). |
| P3 | Khởi tạo Zalo Mini App | Design system từ `src/tokens.js`, layout & bottom navigation, tích hợp API catalog/giỏ hàng. |
| P4 | Luồng lõi | Product, Category, Cart, Checkout, Order, Profile, Custom flower request — theo đúng state machine [03-state-machines.md](03-state-machines.md). |
| P5 | Vận hành mở rộng | Voucher, thông báo in-app, chat/OA, giao hàng nội bộ đầy đủ (gán người giao, cập nhật trạng thái). |
| P6 | Admin Portal | Quản lý sản phẩm/ảnh (quy trình duyệt), tồn kho theo kho/lô, đơn hàng, chi nhánh, báo cáo cơ bản, audit log. |
| P7 | Kiểm thử | Chạy đủ [08-test-plan.md](08-test-plan.md) — unit, integration, E2E; rà soát bảo mật (input validation, tính lại giá backend, rate limit). |
| P8 | Staging → Production | UAT với cấu hình thật (phí giao, khung giờ, tài khoản ngân hàng, chi nhánh thật), giám sát, backup, kiểm thử rollback. |

## Bắt đầu Phase 2

Theo quy tắc làm việc, mỗi lần chỉ triển khai một module. Ba lựa chọn khởi động Phase 2:

1. **Auth & phân quyền** — JWT qua Zalo, middleware role/branch scope, nền tảng cho mọi endpoint khác.
2. **Catalog & tồn kho** — migration/model cho `categories`, `products`, biến thể, `inventories` theo kho/lô.
3. **Order & Payment** — migration/model cho `orders`, `payments`, state machine service — phụ thuộc Catalog đã có model sản phẩm.

Khuyến nghị: bắt đầu từ **Auth & phân quyền**, vì mọi endpoint ở [05-api-contract.md](05-api-contract.md) đều yêu cầu middleware này, và **Catalog & tồn kho** vì Order/Payment phụ thuộc vào model sản phẩm đã tồn tại.
