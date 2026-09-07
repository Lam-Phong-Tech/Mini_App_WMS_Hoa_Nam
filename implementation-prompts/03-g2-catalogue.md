# PROMPT 03 — G2: Catalogue trải nghiệm hoàn chỉnh

Bạn là Senior Full-stack Engineer + Solution Architect. Chỉ chạy prompt này khi G1 đã hoàn tất.

## Điều kiện vào gate — bắt buộc kiểm tra trước

Đọc report G1, `SCOPE_LOCK.md`, OpenAPI/DTO/fixtures và chạy lại các validation nền tảng cần thiết.

Chỉ tiếp tục nếu `GATE G1 — STATUS: DONE`, app shell build được, API/config boundary typed tồn tại và bottom navigation chỉ có Trang chủ/Danh mục/Liên hệ. Nếu không, báo `GATE G2 — STATUS: BLOCKED` và quay lại Prompt 02.

## Ràng buộc dữ liệu và UI không được vi phạm

Giữ Zalo Mini App mobile-first và bám prototype. Không thêm cart/order/account, giá, quantity, CRM/ERP/queue/notification. Chỉ render product `PUBLISHED` và `IN_STOCK`; card/detail tuyệt đối không lộ price, stock quantity, supplier/internal note/source path hoặc chuỗi `null`, `undefined`, `N/A`, dấu `-`/label rỗng.

Nếu dữ liệu Catalogue approved chưa có trong repo, chỉ dùng DEV fixture G0 theo contract hoặc empty state. Không tuyên bố fixture là dữ liệu UAT/Production và không phát minh SKU/barcode/spec/media.

## Mục tiêu G2

1. Hoàn thiện Home: brand/search, 3 domain, category chính, featured/recent sections chỉ khi API có dữ liệu, skeleton/empty/error/retry/pull-to-refresh.
2. Hoàn thiện Category và Product List: taxonomy domain → category → product family; mobile grid 2 cột, ảnh đồng tỷ lệ/object-fit contain, tên tối đa 2 dòng, model/mã chính, chip “Còn hàng”, lazy image, cursor pagination/infinite scroll và giữ state/back position.
3. Hoàn thiện Search: debounce hợp lý, trim, case-insensitive, Vietnamese diacritic-insensitive, exact model/item code ưu tiên, gợi ý khi empty; lịch sử local chỉ là P1 nếu có thời gian.
4. Hoàn thiện Filter/Sort bottom sheet: facets động theo API, category/power source/feature/filterable spec, apply/reset, số filter, giữ state. Sort: featured, updated_desc, name_asc.
5. Hoàn thiện Detail/Gallery: gallery, name/model/brand/category, description, feature, dynamic grouped specs, media/doc/video, package/bundle, compatibility, related products; section optional tự ẩn, value dài wrap đúng. Gallery có swipe/zoom/fallback theo khả năng platform.
6. Hoàn thiện variant: Hand Tools là một product family nhiều variant; Power Tools hỗ trợ Solo/Kit/pin/sạc/bundle. Variant unavailable không chọn được; chọn variant cập nhật context, media/spec/code nếu có.
7. Hoàn thiện Product Unavailable cho deep link cũ hoặc product không còn public, có related/Chat/Gọi nếu config hiện có; không raw 404/trang trắng.
8. Tích hợp mọi luồng vào API mock/BFF boundary đã chốt, không bypass bằng data hardcode trong component.

## Test bắt buộc

Test và lưu evidence cho: Home không section rỗng; 3 domain/category; exact model; không dấu; filter/reset/sort; cursor pagination không trùng; back state; optional hidden; variant/family/bundle; IN_STOCK visible; OUT_OF_STOCK/INACTIVE hidden; unavailable deep link; image fallback; responsive/mobile touch target.

## Báo cáo và điều kiện qua gate

Kết thúc bằng `GATE G2 — STATUS: DONE | PARTIAL | BLOCKED`, nêu files changed, API/DB impact, screen matrix, test/build result, evidence, red flags và out-of-scope confirmation.

Chỉ `DONE` khi tất cả catalogue screens hoạt động qua API boundary, toàn bộ tests trên pass, build/typecheck/lint vẫn pass, UI bám prototype và không có scope cấm. Nếu chưa đạt, tiếp tục G2 hoặc báo blocker; không chạy Prompt 04.
