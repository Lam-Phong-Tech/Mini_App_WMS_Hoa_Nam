# PHASE 2/5 — Design foundation, UI primitives, App shell và Home/Auth

Bạn là Lead Frontend Architect và Senior Product Designer, làm việc trong:

`C:\laragon\www\zalo_mini_app\bachhoa`

## Cổng vào bắt buộc

1. Đọc `docs/vuexy-miniapp-progress.md` trước mọi thay đổi.
2. Chỉ được chạy phase này nếu file chứa chính xác `P1_AUDIT: PASS`.
3. Nếu marker thiếu hoặc là `FAIL/BLOCKED`, không sửa code. Trả lời `P2_FOUNDATION: BLOCKED — prerequisite P1_AUDIT chưa PASS` và dừng.
4. Đọc lại `git status`; bảo toàn toàn bộ thay đổi người dùng đã ghi trong progress file.

## Mục tiêu phase

Xây nền Vuexy-inspired X và chứng minh nó hoạt động trên UI primitive, App shell, bottom navigation, Auth và Home trước khi nhân rộng sang các route nghiệp vụ.

Không sửa API endpoint, payload, auth flow, permission, store, service hoặc navigation outcome.

## Baseline thiết kế bắt buộc

- background: `#F8F7FA`
- surface: `#FFFFFF`
- primary: `#7367F0`
- primary soft: `#EFEDFF`
- main text: `rgba(47, 43, 61, 0.78)`
- strong text: `#2F2B3D`
- muted text: `rgba(47, 43, 61, 0.42)`
- divider: `rgba(47, 43, 61, 0.12)`
- success: `#28C76F`
- danger: `#EA5455`
- warning: `#FF9F43`
- info: `#00CFE8`
- card radius: `6–8px`
- modal/sheet mobile top radius: `16–20px`
- card shadow: `0 4px 18px rgba(47, 43, 61, 0.10)`
- mobile spacing: `4, 8, 12, 16, 24, 32px`
- body typography khoảng `15px/22px`
- Public Sans nếu có thể đóng gói an toàn; nếu không dùng system fallback. Không dùng Google Fonts `@import` render-blocking.

## Motion contract

- fast: 120–150ms
- normal: 180–250ms
- sheet/collapse: không quá 300ms
- easing: `cubic-bezier(0.4, 0, 0.2, 1)`
- ưu tiên opacity, transform, background-color, border-color và shadow nhẹ;
- không dùng animation trang trí toàn trang, blur liên tục, shadow lớn hoặc stagger dài;
- bổ sung `prefers-reduced-motion`;
- touch target tối thiểu 44px và focus-visible rõ.

## Phạm vi triển khai

1. Chuẩn hóa CSS variables và Tailwind mapping. Không duy trì hai hệ token cạnh tranh.
2. Ưu tiên nâng cấp component hiện có thay vì tạo design system song song:
   - `PageContainer`;
   - `WmsCard`, `WmsPageHeader`, `WmsModal`, `WmsInput/WmsField`;
   - `AppButton`;
   - `KpiCard`;
   - `ActionCard`;
   - `StatusBadge`;
   - `LoadingState`;
   - `EmptyState`.
3. Chỉ thêm primitive mới khi có ít nhất hai use case thực tế, ví dụ SectionCard, ListRow, Skeleton, StickyActionBar hoặc RouteSkeleton.
4. Restyle App shell và bottom navigation theo X, nhưng giữ nguyên route, label và behavior.
5. Migrate Auth và Home sang foundation mới.
6. KPI Home dùng surface trắng và semantic accent; không dùng gradient phủ toàn card.
7. KPI mobile 2 cột; nội dung nghiệp vụ 1 cột; margin ngang 16px.
8. Giữ safe area, `100dvh` cùng fallback, scrolling và bottom-nav padding.
9. Loading initial dùng skeleton đúng hình dạng; background refresh không được khóa/flash toàn màn hình.
10. Không cài MUI, ApexCharts, Framer Motion hoặc UI framework mới.

## Kiểm chứng bắt buộc

- Chạy targeted type check/build sau thay đổi.
- Render local App shell, Auth và Home.
- Kiểm tra ít nhất viewport 320, 390 và 768px.
- Kiểm tra safe-area, bottom navigation, clipping, horizontal overflow, focus, pressed/disabled/loading/error/empty state.
- Kiểm tra console error và xác nhận business handler/service call không bị thay đổi.
- Nếu visual chưa đạt, sửa và render lại trước khi đánh PASS.

## Cập nhật progress và Gate PASS

Cập nhật `docs/vuexy-miniapp-progress.md` với file đã sửa, quyết định, validation, screenshot/visual observation và lỗi còn lại.

Dùng marker:

`P2_FOUNDATION: PASS|FAIL|BLOCKED`

Chỉ ghi PASS khi:

- token X là nguồn sự thật duy nhất cho phần đã migrate;
- primitive chính đã đồng bộ;
- App shell, bottom nav, Auth và Home render đúng;
- không còn gradient/radius/theme cũ rõ rệt trên các màn phase này;
- reduced motion, focus và touch target đạt yêu cầu;
- type/build không có lỗi mới;
- không đổi business logic/API/auth/navigation semantics.

Nếu không đạt, ghi FAIL/BLOCKED và dừng. Không tự chạy file 03.

## Kết thúc phase

Trả lời tiếng Việt, dẫn đầu bằng trạng thái marker, liệt kê ngắn file chính, validation và blocker. Dừng tại đây.

