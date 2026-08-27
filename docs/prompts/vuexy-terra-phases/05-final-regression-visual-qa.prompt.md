# PHASE 5/5 — Full regression, visual QA và nghiệm thu cuối

Bạn là Principal Frontend Reviewer, Product Designer và QA Engineer, làm việc trong:

`C:\laragon\www\zalo_mini_app\bachhoa`

## Cổng vào bắt buộc

1. Đọc `docs/vuexy-miniapp-progress.md`.
2. Chỉ được chạy khi có đủ:
   - `P1_AUDIT: PASS`
   - `P2_FOUNDATION: PASS`
   - `P3_ROUTES: PASS`
   - `P4_PERFORMANCE: PASS`
3. Nếu thiếu marker, không thực hiện final QA hoặc sửa code; trả lời `P5_QA: BLOCKED` và dừng.
4. Đọc lại `git status`, active routes, baseline X và toàn bộ validation evidence từ progress file.

## Mục tiêu phase

Thực hiện nghiệm thu end-to-end. Được phép sửa các defect frontend trong phạm vi Vuexy migration/performance được phát hiện trong QA, sau đó phải chạy lại kiểm chứng liên quan. Không được mở rộng sang feature mới hoặc thay đổi nghiệp vụ.

## 1. Functional regression matrix

Kiểm tra các luồng active theo code và mock/dev environment khả dụng:

- Auth: loading, login, validation, permission, session, logout và failure.
- Home: cached dashboard, refresh, KPI, action navigation và approved product list.
- Receipt: create/context → scan/manual → review → submit → success.
- Outbound: context/detail → scan/manual → review → submit → success.
- Scanner: permission, init, pause/resume, retry, camera cleanup và error state.
- History/result: list, detail, empty, error và retry.
- Approval: inbound/outbound queue, detail, approve/reject, permission và local refresh.
- Warranty: list, receive, detail, timeline, media, transition và validation.
- Profile, NotFound và RouteErrorFallback.

Không giả lập API success nếu môi trường không cho phép. Khi không kiểm tra được live backend, xác minh code path, mock/fixtures hiện có và nêu giới hạn.

## 2. Visual QA matrix

Render và inspect tối thiểu ở:

- 320px
- 360px
- 390px
- 430px
- 768px

Kiểm tra:

- Vuexy X color, typography, spacing, radius và shadow nhất quán;
- không còn theme xanh/radius lớn cũ trên active route;
- KPI 2 cột và content card 1 cột trên mobile;
- header, bottom navigation, modal, sheet và sticky CTA;
- safe-area top/bottom;
- bàn phím không che field/CTA;
- vertical scrolling và không có horizontal page overflow ngoài vùng cố ý;
- text clipping, long Vietnamese content, empty/loading/error/success state;
- focus-visible, contrast, semantic HTML, aria label và touch target >=44px;
- reduced-motion;
- skeleton không gây layout shift đáng kể;
- ảnh/media không méo, không nhảy layout.

Mọi visual defect phát hiện phải được sửa và render lại trước khi PASS.

## 3. Performance và technical verification

- Chạy `npx tsc --noEmit`.
- Chạy production build Vite/ZMP phù hợp.
- Kiểm tra console errors/warnings liên quan thay đổi.
- Xác nhận route chunks và ZXing split vẫn đúng sau các fix QA.
- Kiểm tra direct navigation, nested route refresh và client navigation.
- Kiểm tra duplicate API call, event/timer/media cleanup và stale loading state.
- Kiểm tra working tree để bảo đảm không có file ngoài phạm vi bị reset/xóa.

## 4. Final scope audit

Đối chiếu lại với `src/app/routes.tsx`:

- mọi active route đã được cover;
- page legacy không reachable không bị refactor vô ích;
- API endpoint/payload/permission/auth/store/navigation semantics không đổi;
- không có dependency UI/animation/chart nặng được thêm trái yêu cầu;
- không có Vuexy proprietary asset/source bị sao chép;
- không commit, push hoặc deploy.

## Gate nghiệm thu cuối

Cập nhật `docs/vuexy-miniapp-progress.md` với validation cuối, giới hạn kiểm thử và marker:

`P5_QA: PASS|FAIL|BLOCKED`

Chỉ ghi PASS khi:

- bốn prerequisite phase vẫn PASS;
- mọi active route có functional/visual evidence phù hợp;
- mọi defect mới trong phạm vi đã được sửa và retest;
- type/build không có lỗi mới;
- code splitting/lazy loading không regression;
- không có business/API/permission regression được phát hiện;
- các điểm không thể kiểm tra trên Zalo device/backend thật được nêu rõ, không bị che giấu.

Nếu còn defect trong phạm vi hoặc thiếu evidence bắt buộc, ghi FAIL/BLOCKED, không tuyên bố hoàn tất.

## Final output

Trả lời tiếng Việt và dẫn đầu bằng `P5_QA: PASS`, `FAIL` hoặc `BLOCKED`.

Nếu PASS, báo cáo ngắn gọn:

1. Outcome đã hoàn thành.
2. Design system/component đã chuẩn hóa.
3. Active routes đã migrate.
4. Lazy loading và bundle split đã triển khai.
5. File chính đã thay đổi.
6. Type/build/smoke/visual validation và kết quả.
7. Điểm chưa thể xác minh trên thiết bị Zalo thật.
8. Rủi ro còn lại, nếu có.

Không liệt kê nhật ký tool call, không lặp lại toàn bộ kế hoạch và không deploy/commit.

