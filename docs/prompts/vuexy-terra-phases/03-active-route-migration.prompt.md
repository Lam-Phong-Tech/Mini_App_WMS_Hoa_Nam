# PHASE 3/5 — Migrate toàn bộ active business routes sang X

Bạn là Lead Frontend Architect và Senior Product Designer, làm việc trong:

`C:\laragon\www\zalo_mini_app\bachhoa`

## Cổng vào bắt buộc

1. Đọc `docs/vuexy-miniapp-progress.md`.
2. Chỉ được chạy nếu có cả `P1_AUDIT: PASS` và `P2_FOUNDATION: PASS`.
3. Nếu thiếu một marker, không sửa code; trả lời `P3_ROUTES: BLOCKED` và dừng.
4. Đọc `git status`, `docs/ui-system-x-vuexy.md`, `src/app/routes.tsx` và các primitive đã hoàn thành ở phase 2.

## Mục tiêu phase

Migrate tất cả màn hình thực sự reachable từ `src/app/routes.tsx` sang component và token X. Không xử lý page legacy không reachable, trừ dependency dùng chung.

Đây là UI/UX migration, không phải nghiệp vụ rewrite. Phải giữ nguyên API, payload, error code mapping, permission, auth, session/store, camera behavior và destination sau mỗi action.

## Thứ tự nhóm bắt buộc

Thực hiện tuần tự và cập nhật checkpoint ngắn trong progress file sau mỗi nhóm. Nếu một nhóm có regression nghiêm trọng chưa sửa được, dừng phase; không tiếp tục nhóm sau.

1. Receipt:
   - create/document context;
   - scanner/manual khi dùng cho receipt;
   - review;
   - success.
2. Outbound:
   - document context/detail;
   - scanner/manual;
   - review;
   - success.
3. Scan shared flow:
   - ScannerPage;
   - ManualCodePage;
   - ScanResultPage;
   - ScanHistoryPage.
4. Approval:
   - queue;
   - inbound/outbound detail và approve/reject state.
5. Warranty:
   - list;
   - receive;
   - detail, timeline, form và media state.
6. Profile, NotFound và RouteErrorFallback.

Chỉ dùng danh sách trên để định hướng. Route thực tế trong `src/app/routes.tsx` mới là source of truth.

## Quy tắc UI/UX

- Mobile-first, margin ngang 16px.
- KPI ngắn 2 cột; form, list, review, timeline và business card 1 cột.
- Không đưa sidebar desktop vào Mini App.
- Mỗi màn chỉ có một primary CTA nổi bật.
- Sticky CTA không che content, keyboard hoặc safe area.
- Scanner được phép fullscreen; các màn khác không khóa body scroll.
- Dense table chuyển thành card/list mobile hoặc vùng scroll có chủ đích.
- Status chip dùng semantic color X và label nghiệp vụ hiện có.
- Validation/helper/error đặt cạnh field hoặc item liên quan.
- Loading initial dùng skeleton theo hình dạng.
- Nếu có cached data, giữ nó trong background refresh.
- Empty state phải giải thích và có next action phù hợp.
- Error item-level phải gắn đúng item và giữ khả năng retry/sửa/xóa/quét lại.
- Không thêm chart, decoration hoặc feature không có giá trị nghiệp vụ.
- Không sao chép asset/source Vuexy và không cài UI framework mới.

## Quy tắc component

- Tái sử dụng primitive phase 2; không quay lại hard-coded theme cũ.
- Chỉ tạo component mới nếu có ít nhất hai use case.
- Component mới phải có semantic HTML, accessibility, disabled/loading/error state, touch target >=44px và token X.
- Không mass-rewrite file chỉ để đổi formatting.
- Không đổi public component API nếu có thể mở rộng tương thích.

## Kiểm chứng theo nhóm

Sau mỗi nhóm:

- chạy targeted type/build check;
- render route representative ở 320 và 390px;
- kiểm tra loading, error, empty, disabled, success và navigation outcome;
- kiểm tra horizontal overflow, clipping, sticky CTA, safe-area và keyboard;
- kiểm tra không phát sinh duplicate API call hoặc effect loop;
- ghi file đã sửa và kết quả vào progress file.

Cuối phase chạy type check/build toàn frontend nếu khả thi.

## Gate PASS

Dùng marker:

`P3_ROUTES: PASS|FAIL|BLOCKED`

Chỉ ghi PASS khi:

- mọi route active đã được migrate hoặc đã được chứng minh không cần thay đổi;
- mọi nhóm nghiệp vụ có checkpoint validation;
- không còn pha trộn rõ rệt theme xanh/radius lớn cũ trên active route;
- loading/error/empty/success/disabled state nhất quán;
- không có regression mới về business flow, API, permission, store hoặc navigation;
- visual đã được render và inspect;
- type/build không có lỗi mới.

Nếu bất kỳ active route nào chưa đạt, không đánh PASS. Ghi FAIL/BLOCKED với route và bằng chứng cụ thể. Không tự chạy file 04.

## Kết thúc phase

Trả lời tiếng Việt, dẫn đầu bằng `P3_ROUTES: ...`, tóm tắt nhóm đã migrate, validation và route/blocker còn lại. Dừng tại đây.

