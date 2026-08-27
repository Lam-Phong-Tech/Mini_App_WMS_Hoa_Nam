# PHASE 4/5 — Lazy loading, code splitting và performance cho Zalo WebView

Bạn là Frontend Performance Engineer kiêm React Architect, làm việc trong:

`C:\laragon\www\zalo_mini_app\bachhoa`

## Cổng vào bắt buộc

1. Đọc `docs/vuexy-miniapp-progress.md`.
2. Chỉ được chạy nếu có `P1_AUDIT: PASS`, `P2_FOUNDATION: PASS` và `P3_ROUTES: PASS`.
3. Nếu thiếu marker, không sửa code; trả lời `P4_PERFORMANCE: BLOCKED` và dừng.
4. Đọc baseline bundle observation từ phase 1 và validation phase 3 trước khi chọn chiến lược split.

## Mục tiêu phase

Tối ưu thời gian tải, chi phí bộ nhớ và perceived performance mà không làm đổi business behavior hoặc làm App shell/Home kém ổn định.

## 1. Route-level code splitting

- Giữ App shell, AuthGate, error boundary và phần Home thực sự cần thiết trong critical path.
- Lazy-load các page còn lại theo route hoặc nhóm route hợp lý.
- Suspense boundary không được remount App shell, bottom navigation hoặc làm mất cached data.
- Route fallback dùng skeleton phù hợp, không dùng spinner toàn màn hình chung.
- ScannerPage phải ở chunk riêng.
- Kiểm tra dependency graph để `@zxing/browser` không nằm trong initial chunk.
- Nếu route split chưa đủ, dynamic-import scanner adapter khi scanner bắt đầu khởi tạo.
- Không tạo quá nhiều micro-chunk nhỏ gây request overhead.
- Xác nhận dynamic-import URL vẫn hoạt động với `base: ""`, `getBasePath()` và zmp-vite-plugin.

## 2. Image và media

- Ảnh/media dưới fold: `loading="lazy"`, `decoding="async"` khi phù hợp.
- Khai báo width/height hoặc aspect-ratio để tránh CLS.
- Không lazy logo, avatar hoặc critical image trong first viewport nếu UX xấu đi.
- Warranty thumbnail dùng kích thước cố định và `object-fit: cover`.
- Chỉ tải viewer/module/media nặng khi người dùng mở.
- Cleanup camera stream, listener, timer, object URL và media resource khi unmount.

## 3. Data loading

- Tận dụng React Query cache và stale-while-revalidate.
- Giữ cached data khi background refetch.
- Skeleton chỉ dùng cho initial data chưa tồn tại.
- Không biến background refresh thành full-screen loading.
- Pagination/infinite loading cho danh sách dài khi code hiện tại có khả năng hỗ trợ; không tự đổi API contract.
- Không phát sinh duplicate request do Suspense, remount, Strict Mode hoặc effect dependency.

## 4. Prefetch có điều kiện

- Chỉ prefetch route có xác suất truy cập cao sau khi Home ổn định.
- Dùng idle time hoặc user intent khi có lợi ích đo được.
- Tôn trọng `navigator.connection.saveData` và kết nối chậm nếu API tồn tại.
- Có fallback khi `requestIdleCallback` hoặc Network Information API không tồn tại.
- Không prefetch camera/ZXing, warranty media hoặc route nặng vô điều kiện.

## 5. Performance guardrails

- Không thêm bundle analyzer dependency; dùng output Vite, manifest hoặc file-size inspection hiện có.
- Không thêm MUI, charting library hoặc animation framework.
- Ưu tiên CSS opacity/transform; hạn chế backdrop blur và effect tốn GPU trên Android WebView.
- Không làm mất support cho browser target hiện có; progressive enhancement cho API mới.
- Không đổi camera permission flow hoặc khởi tạo camera trước user intent.

## Kiểm chứng bắt buộc

1. Chạy production build và ghi:
   - initial entry chunk;
   - route chunks;
   - chunk chứa ZXing;
   - các asset lớn;
   - so sánh với baseline phase 1 khi có thể.
2. Chứng minh initial graph không kéo ZXing và non-critical route không cần thiết.
3. Smoke test direct navigation và client navigation tới các lazy route.
4. Kiểm tra route error/Suspense fallback và refresh tại nested URL.
5. Kiểm tra Home/Auth first load, Scanner first open, Approval, Receipt, Outbound và Warranty.
6. Kiểm tra cache không flash trắng, không duplicate request và không camera/media leak.
7. Chạy type check/build và phân biệt baseline error với lỗi mới.

## Gate PASS

Cập nhật progress file và dùng marker:

`P4_PERFORMANCE: PASS|FAIL|BLOCKED`

Chỉ ghi PASS khi:

- route split tồn tại và hoạt động;
- ZXing không nằm trong initial chunk;
- lazy route có skeleton/error behavior đúng;
- image/media critical và non-critical được phân loại đúng;
- cached data không bị thay bằng full-screen loading khi refetch;
- không có duplicate request/leak mới;
- direct/client navigation hoạt động với ZMP base path;
- type/build không có lỗi mới;
- progress file có bằng chứng bundle trước/sau hoặc lý do chính xác nếu baseline không khả dụng.

Nếu không chứng minh được một tiêu chí, ghi FAIL/BLOCKED; không đánh PASS theo suy đoán. Không tự chạy file 05.

## Kết thúc phase

Trả lời tiếng Việt, dẫn đầu bằng `P4_PERFORMANCE: ...`, nêu chunk/lazy-loading outcome, validation và blocker. Dừng tại đây.

