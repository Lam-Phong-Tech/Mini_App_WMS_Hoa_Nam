# Hồ sơ thiết kế — Zalo Mini App Hoa Tươi

Tài liệu Phase 1 (phân tích & chốt thiết kế), khoá trước khi Phase 2 (khởi tạo backend) bắt đầu. Mọi quyết định trong bộ tài liệu này đã được xác nhận nghiệp vụ; thay đổi phạm vi sau mốc này phải ghi lại là một quyết định mới, không sửa ngầm vào các file dưới đây.

| # | Tài liệu | Nội dung |
|---|----------|----------|
| 1 | [01-business-analysis.md](01-business-analysis.md) | Mô hình kinh doanh, phạm vi MVP, P0/P1/P2, 10 quyết định nghiệp vụ đã chốt |
| 2 | [02-flows-sitemap.md](02-flows-sitemap.md) | Sitemap, user flow mua hoa |
| 3 | [03-state-machines.md](03-state-machines.md) | State machine đơn hàng, thanh toán, hoa theo yêu cầu |
| 4 | [04-erd-database.md](04-erd-database.md) | ERD theo 3 miền nghiệp vụ + database dictionary |
| 5 | [05-api-contract.md](05-api-contract.md) | Danh sách API theo domain |
| 6 | [06-permission-error.md](06-permission-error.md) | Permission matrix + error code catalog |
| 7 | [07-architecture.md](07-architecture.md) | Kiến trúc hệ thống, cấu trúc thư mục, deployment |
| 8 | [08-test-plan.md](08-test-plan.md) | Test plan theo luồng nghiệp vụ |
| 9 | [09-phase-plan.md](09-phase-plan.md) | Kế hoạch triển khai theo phase (P1–P8) |

## Trạng thái

Phase 1: **hoàn tất**. Đang chờ xác nhận module bắt đầu của Phase 2 — xem [09-phase-plan.md](09-phase-plan.md).

## Cấu hình thực tế cần chốt trước UAT

Không phải quyết định kiến trúc — chỉ là dữ liệu vận hành cần nhập trước khi UAT:

- Bảng phí từng khu vực (`shipping_zones.base_fee`, phụ phí)
- Danh sách khung giờ giao thực tế
- Tài khoản ngân hàng nhận chuyển khoản
- Danh sách chi nhánh/kho thật (thay seed 1 store – 1 branch – 1 warehouse)
- Nội dung OA và template ZNS
- Quy định thuế và xuất hoá đơn
