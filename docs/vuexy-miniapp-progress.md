# Vuexy X → WMS Mini App — Progress

## Objective và non-negotiables

Phase 1/5 khóa phạm vi refactor UX/UI theo design language **X** (Vuexy CRM được dùng làm tham chiếu thị giác, không sao chép source/asset/kiến trúc Next.js/MUI). Nguồn route đang chạy là `src/app/routes.tsx`; page legacy không reachable không thuộc migration, trừ primitive/dependency dùng chung.

- Không sửa implementation frontend, backend, API contract, quyền, business rule; không commit/push/deploy.
- Không reset/revert/checkout/clean/xóa file hoặc ghi đè thay đổi của người dùng.
- Chỉ file này được tạo trong Phase 1. Backdrop 82% + blur, safe area, ZMP runtime và scan camera là các ràng buộc phải giữ khi sang phase sau.

## Protected working-tree changes

Snapshot trước Phase 1 (`git status --short`): các file tracked modified phải được bảo vệ nguyên trạng gồm `.env.example`, `RUN_ON_OTHER_MACHINE.md`, `vite.config.mts`, toàn bộ app shell/router, WMS UI, auth, scanner, receipt/outbound/warranty pages/services/stores sau đây:

`src/app.tsx`, `src/app/App.tsx`, `src/app/AuthGate.tsx`, `src/app/routes.tsx`; `src/components/ScanModeSelector/index.tsx`, `src/components/ScanResultCard/index.tsx`, `src/components/common/cart-sheet.tsx`, `src/components/common/checkout-sheet.tsx`, `src/components/ui/ActionCard.tsx`, `src/components/ui/KpiCard.tsx`, `src/components/ui/Page.tsx`, `src/components/ui/WmsRuntime.tsx`; `src/constants/error-messages.ts`, `src/css/app.scss`; `src/hooks/use-zalo-auth.ts`, `src/hooks/useBarcodeScanner.ts`, `src/hooks/useWarehouseDashboard.ts`; `src/pages/{ApprovalQueuePage,AuthStatePage,DocumentContextPage,HomePage,OutboundDocumentDetailPage,OutboundReviewPage,ProfilePage,ReceiptCreatePage,ReceiptReviewPage,ReceiptSuccessPage,ScanHistoryPage,ScanResultPage,ScannerPage,WarrantyDetailPage,WarrantyPage,WarrantyReceivePage}/index.tsx`; `src/services/{api-client,auth-session.service,camera-permission.service,receipt-flow.service,scan.service,scanner-adapter,warranty-flow.service,wms-context.service,zalo-auth.service}.ts`; `src/stores/{outbound-session,receipt-session}.store.ts`; `src/types/scan.types.ts`.

Untracked cần bảo vệ: `docs/dongcheng-import/`, `docs/prompts/`, `docs/qr-test-codes-composite-91-120/`, `docs/ui-system-x-vuexy.md`, `scripts/generate-dongcheng-batch.py`, `src/components/ui/WmsModal.tsx`, `src/pages/OutboundSuccessPage/`, `src/services/vietnam-address.service.ts`, `src/utils/device-info.ts`.

Không có implementation file nào bị sửa trong Phase 1.

## Nguồn đã đọc

- Đọc toàn bộ `docs/ui-system-x-vuexy.md`.
- Đọc `package.json`, `vite.config.mts`, `zmp-cli.json`, `tailwind.config.js`, `src/tokens.js`, toàn bộ `src/css/app.scss`, `src/app.tsx`, app shell/auth/router và primitive UI/feedback/scan liên quan.
- Stack thực tế: React 18, React Router 7, Vite 5 + `zmp-vite-plugin`, Tailwind 3 + SCSS, ZMP SDK/UI, Zustand, TanStack Query và ZXing. `zmp-cli.json` còn mô tả template Jotai nhưng runtime WMS đang dùng Zustand.

## Active route inventory

| Nhóm | Route reachable | Màn hình/ý nghĩa |
| --- | --- | --- |
| Shell & auth | `/`, `/auth`, `/auth/:mode`, `*` | Home qua `AuthGate`; login/state; not-found/router fallback |
| Receipt | `/documents/RECEIPT`, `/receipt-review/:receiptId`, `/receipt-success/:receiptId` | Khởi tạo, kiểm tra và hoàn tất phiếu nhập |
| Outbound | `/documents/:context`, `/outbound-review/:outboundId`, `/outbound-success/:documentId` | Thông tin chứng từ, kiểm tra và kết quả xuất |
| Scan & manual | `/scanner/:context`, `/manual/:context`, `/result/:id` | Camera/ảnh, nhập tay, kết quả tra cứu/nghiệp vụ |
| Approval & history | `/approvals`, `/approvals/outbound/:documentId`, `/history`, `/history/OUTBOUND/:documentId`, `/history/outbound/:documentId` | Hàng chờ duyệt, chi tiết xuất, lịch sử |
| Warranty | `/warranty`, `/warranty/receive`, `/warranty/:caseId` | Danh sách, tiếp nhận, chi tiết/trạng thái/đính kèm |
| Profile | `/profile` | Phiên và thông tin thiết bị/người dùng |

Các thư mục legacy `home`, `menu`, `checkout`, `product-detail`, `order*`, `search`, `select-location`, `custom-request` và phần lớn `src/components/common/*` không reachable từ router này; loại khỏi phạm vi UI migration, trừ dependency được active route import trực tiếp.

## Shared component inventory và dependency map

### Foundation đang dùng

- **Runtime/shell:** `src/app.tsx` (StrictMode, `zmp-ui` App/Snackbar, runtime error boundary), `src/app/App.tsx` (shell/bottom navigation), `AuthGate`.
- **WMS primitives:** `Button`, `PageContainer`/`SectionHeader`, `WmsBrand`, `WmsPageHeader`, `WmsCard`, `WmsNotice`, `WmsField`, `WmsInput`, `ActionCard`, `KpiCard`, `Icon`, `InfoRow`, `LongTextValue`, `WmsModal`.
- **Feedback/list:** `LoadingState`, `EmptyState`, `ErrorState`, `StatusBadge`, `ScanHistoryList`, `ScanModeSelector`, `ScanResultCard`, `QuantityInput`.
- **Token debt:** `src/css/app.scss` là WMS CSS token hiện hành; `src/tokens.js` là hệ token legacy Bistro/Roboto. Có 407 literal color/radius match trong source; color lặp nhiều nhất: `#69758A` 94, `#06142A` 84, `#0F73DC` 65, `#D6E0EC` 40, `#F3F6FA` 16. Các card/input còn lặp `rounded-[18|20|22|24|28px]` và shadow literal.

### Dependency map đủ dùng

- **Auth/App shell/Home:** `routes → AuthGate → useZaloAuth → auth-session.service + zalo-auth.service`; `WarehouseApp` đọc staff để hiện nav; `HomePage → useWarehouseDashboard → scan.service`, `ActionCard`, `KpiCard`.
- **Receipt:** `ReceiptCreatePage → receipt-flow.service + receipt-session.store` → `ScannerPage(RECEIPT)` → `ReceiptReviewPage → receipt-flow.service + receipt-session.store` → `ReceiptSuccessPage`; queue approval cùng đọc receipt/outbound service.
- **Outbound:** `DocumentContextPage(OUTBOUND) → scan.service + wms-context.service + outbound-session.store` → `ScannerPage(OUTBOUND)` → `OutboundReviewPage → recordOutboundBatch` → `OutboundSuccessPage`; chi tiết/duyệt dùng `OutboundDocumentDetailPage`.
- **Scanner/manual/result/history:** `ScannerPage → useBarcodeScanner → scanner-adapter → @zxing/browser`; scanner gọi `useScanRequest → scan.service`, liên kết receipt/outbound stores. `ManualCodePage`, `ScanResultPage`, `ScanHistoryPage` dùng scan session/document services; history hợp nhất backend data với receipt session cục bộ.
- **Approval:** `ApprovalQueuePage → receipt-flow.service + scan.service + outbound-session.store`; outbound detail phục vụ route approval và history.
- **Warranty:** `WarrantyPage`, `WarrantyReceivePage`, `WarrantyDetailPage → warranty-flow.service`; receive dùng defect catalog/address; detail quản lý attachment image/video qua cùng flow service.
- **Profile/error fallback:** `ProfilePage → useZaloAuth + auth-session/zalo-auth/device-info`; app-level `RuntimeErrorBoundary` và route-level `RouteErrorFallback`/not-found.

## Baseline commands và kết quả

| Lệnh | Kết quả | Phân loại |
| --- | --- | --- |
| `git status --short` | Thành công; snapshot ở trên được ghi trước mọi thao tác. | Baseline protection |
| `npx tsc --noEmit` | Không vào typecheck: `This is not the tsc command you are looking for ... npm install typescript`. `package.json` không có `typescript`; `npm ls typescript --depth=0` là empty. | Tooling gap có sẵn, không phải kết quả type xanh/đỏ của source |
| `npx vite build` | Thành công với Vite `5.4.21`, 564 modules transformed. | Production baseline pass |

Build tạo `www/index.html` 1.67 kB (gzip 0.84 kB), `www/assets/index-CtR6zIOM.css` 159.03 kB (gzip 24.86 kB), `www/assets/index.CV0CzyH2.module.js` 1,020.17 kB (gzip 288.40 kB). Vite cảnh báo chunk minified vượt 500 kB. Không có script `build` riêng trong `package.json`, vì vậy `npx vite build` là baseline production Vite khả dụng.

## Baseline bundle observations

- Output chỉ có **1 CSS chunk và 1 JS chunk**; chưa có page-level split.
- `routes.tsx` static-import toàn bộ active page, bao gồm `ScannerPage`; `ScannerPage` static-import `useBarcodeScanner`; hook static-import `scanner-adapter`; adapter static-import `@zxing/browser` và `@zxing/library`. Vì vậy ZXing/camera nằm trong initial dependency graph dù người dùng chưa mở scanner.
- Không tìm thấy `React.lazy`/`lazy(` trong `src`; `vite.config.mts` cũng chưa có manual chunks. Đây là critical-path performance risk rõ ràng cho Home/auth và reload trên thiết bị yếu.
- Chưa cài bundle analyzer theo đúng giới hạn Phase 1; kết luận dựa trên Vite output và static import graph.

## Existing errors / risks trước refactor

1. **Type baseline không thực thi được:** thiếu local `typescript`. Hành động nhỏ nhất ở phase được phép tooling là thêm TypeScript vào `devDependencies`, cài lockfile có kiểm soát, rồi chạy lại đúng `npx tsc --noEmit`; không làm trong Phase 1.
2. **Initial bundle vượt ngưỡng Vite:** 1.02 MB raw / 288.40 kB gzip một chunk. Đây là baseline performance issue, không sửa trong Phase 1.
3. **Scanner critical path eager:** chuỗi ZXing trên khiến camera dependency tải cùng entry, trái với yêu cầu home/auth nhẹ.
4. **Design-system phân mảnh:** WMS SCSS token và token Bistro legacy cùng tồn tại; 407 hard-coded visual literal khiến đổi theme có rủi ro lệch màn.
5. **Không tái tạo thêm lỗi runtime/API trong audit:** Phase 1 chỉ baseline và không thay business/API. Các lỗi chức năng đã tồn tại trong dirty tree cần được giữ nguyên, phân loại/test ở phase QA tương ứng, không “sửa hộ” trong audit.

## Vuexy gap matrix

Khảo sát tham chiếu X trên desktop và viewport mobile khoảng 390 px: nền `rgb(248,247,250)`/`#F8F7FA`, font Public Sans, desktop sidebar + topbar trắng; mobile 16 px margins, KPI 2 cột ~160 px, không overflow ngang, card trắng radius nhỏ/shadow mảnh, active purple và status semantic. Sidebar chỉ là tham chiếu desktop — Mini App giữ navigation mobile.

| Hạng mục | Vuexy X | Hiện tại | Gap / hướng xử lý sau P1 |
| --- | --- | --- | --- |
| Color | Lavender-neutral `#F8F7FA`, primary tím, semantic rõ | Navy/blue `#06142A`/`#0F73DC`, literal rải rác | Tạo semantic token layer, map dần, không đổi API |
| Typography | Public Sans, hierarchy nhẹ/rõ | Inter, nhiều `font-black`, tracking âm mạnh | Chuẩn hóa type scale/weight, kiểm tra font fallback ZMP |
| Spacing | Nhịp 4/8/12/16/24/32, mobile 16 | Có px-4 nhưng khoảng cách từng page không đồng nhất | Áp dụng spacing scale qua primitives trước page |
| Radius | Card nhỏ khoảng 6–8 px | 18–28 px, rounded-2xl/3xl nhiều | Giảm có hệ thống, giữ hit target và modal đặc thù |
| Shadow | Elevation mảnh, tách nền nhẹ | Card/nav/button shadow đậm hơn | Một token elevation, tránh shadow per-component |
| Navigation | Desktop sidebar/topbar; mobile compact | Bottom nav 5 mục; flow hide nav | Giữ IA mobile, chỉnh active state/height/feedback theo X |
| Card | White, border nhẹ, grid nhất quán | `WmsCard` tốt nhưng Action/KPI/list nhiều biến thể | Hợp nhất surface/card variants |
| Form | Label, help/error, focus nhất quán | `WmsField/Input` có nhưng select/textarea tự style ở page | Mở rộng primitive form; validation UI không đổi rule |
| Status | Chip semantic compact, icon vừa đủ | `StatusBadge` có nền tảng; nhiều chip inline khác | Centralize status metadata/size/tone |
| Loading | Skeleton/progressive feedback | Spinner/notice khá chung; list/history từng màn tự xử lý | Thêm loading primitive/skeleton có boundary rõ |
| Error | Alert rõ CTA retry/hierarchy | ErrorState + WmsNotice nhưng page-specific nhiều kiểu | Chuẩn error/empty/retry surfaces |
| Empty | Illustration/tone yên tĩnh, action hợp ngữ cảnh | EmptyState dùng icon, card radius lớn | Chuẩn compact empty visual không thêm asset có bản quyền |
| Motion | Subtle 150–200 ms, giảm motion tôn trọng | `transition`, active scale rải rác; chưa thấy policy chung | Token motion/reduced-motion, không animation camera/modal sai ngữ cảnh |
| Responsive | Grid thích nghi, no horizontal overflow | Max width mobile và safe area tốt; page style không đồng nhất | Audit 320/390/large phone sau primitive migration |
| Lazy loading | Page/module boundary rõ | Router/page eager; ZXing eager | Lazy route boundary + dynamic scanner import/Suspense sau khi baseline typecheck khả dụng |

## Quyết định kiến trúc ban đầu

1. **Một design layer WMS duy nhất:** CSS custom properties semantic trong `src/css/app.scss` làm canonical, Tailwind consume token đã chuẩn hóa; loại bỏ literal dần theo migration, không rewrite hàng loạt.
2. **Primitive-first, domain-preserving:** refactor `WmsRuntime`, `Page`, button/card/form/feedback/status/modal trước; workflow receipt/outbound/warranty và API payload không đổi.
3. **Mobile-first:** giữ max-width, safe-area, scrolling tự nhiên và bottom nav; chỉ mượn visual language X, không đưa desktop sidebar/Next/MUI vào Mini App.
4. **Performance boundary:** tách page routes; ZXing chỉ dynamic-load khi người dùng vào scanner (hoặc prewarm sau explicit scan intent), có loading/error boundary và cleanup camera giữ nguyên contract hiện tại.
5. **Migration thứ tự đề xuất:** (a) tool/type gate + semantic tokens, (b) shell/navigation/page primitives, (c) form/feedback/status/list, (d) auth/home, (e) receipt/outbound flow, (f) scanner/lazy boundary, (g) approval/history, (h) warranty/profile/fallback, (i) responsive/a11y/performance QA.

## Phase gates

`P1_AUDIT: PASS`

Điều kiện đạt: working-tree snapshot có; active routes và shared components/dependency map có; typecheck đã chạy và có nguyên nhân kỹ thuật chính xác khi không thể thực thi; Vite production build đã pass; bundle/ZXing observation, lỗi baseline, gap matrix, scope và migration order đã ghi; không sửa implementation file trong Phase 1.

Không đánh giá và không tạo marker PASS cho bất kỳ phase sau nào.

## Blocker và việc còn lại

- Không blocker cho audit gate. Tooling blocker cho type verification là thiếu `typescript`; chỉ xử lý khi phase sau cho phép thay đổi dependency, sau đó phải rerun typecheck/build.
- Phase tiếp theo phải dùng snapshot này làm guardrail, re-check `git status` trước mỗi nhóm thay đổi, không động vào legacy unreachable nếu không phải shared dependency, và đo lại bundle sau mỗi lazy-boundary thay đổi.

## Follow-up sau P1 — lazy scanner (theo yêu cầu trực tiếp)

Sau khi P1 đã đóng, có yêu cầu tách tải ZXing khỏi Home/login. `src/app/routes.tsx` được thay đổi có chủ đích: `ScannerPage` là `React.lazy`, bọc `Suspense`, và có fallback “Đang chuẩn bị máy quét”. Không thay đổi API, state, quyền, contract camera hay nghiệp vụ scan.

`npx vite build` sau thay đổi pass (565 modules). Entry hiện là `index.Bsb_nxcb.module.js` 530.52 kB / gzip 159.92 kB; chunk scanner async là `index.ZzIjb4IG.module.js` 491.76 kB / gzip 129.71 kB. Logic adapter ZXing (`CAMERA_PREVIEW_UNAVAILABLE`) nằm trong chunk async; entry chỉ còn catalog message cùng tên. Không có modulepreload scanner trong `www/index.html`, nên Home/login không tải chunk này lúc khởi động.

## Phase 2 — Design foundation, primitives, App shell, Auth và Home

### Phạm vi đã thực hiện

- Đọc lại marker `P1_AUDIT: PASS` và snapshot working tree trước khi thay đổi. Không reset/revert/checkout/clean; không sửa backend, API contract, auth handler, permission, store hay navigation outcome.
- `src/css/app.scss` là nguồn token X duy nhất cho các màn đã migrate: canvas `#F8F7FA`, surface `#FFF`, primary `#7367F0`, semantic colors, text/divider, radius 8px, shadow `0 4px 18px rgba(47,43,61,.10)`, scale spacing, focus ring, motion 140/220ms và `prefers-reduced-motion`. Alias `--wms-*` cũ chỉ trỏ về token X để các route chưa migrate không tạo thêm palette cạnh tranh.
- `src/tokens.js` được rút gọn thành mapping Tailwind theo cùng token X; không tải Google Font, dùng Public Sans nếu máy có và system fallback an toàn.
- Đồng bộ primitive dùng chung: `AppButton`, `WmsCard/PageHeader/Notice/Field/Input`, `PageContainer`, `ActionCard`, `KpiCard`, `StatusBadge`, `LoadingState`, `EmptyState`, `ErrorState`, `InfoRow`, `LongTextValue`, `WmsModal` (qua CSS). Bổ sung skeleton CSS dùng thực tế tại Home; không tạo design system song song.
- Restyle `src/app/App.tsx` (shell + bottom navigation), `AuthStatePage` và `HomePage`; giữ route, label, handler, API/service call và các state nghiệp vụ nguyên trạng. KPI Home là surface trắng + semantic accent, không full-card gradient; refresh nền chỉ hiện trạng thái nhỏ, initial load dùng skeleton.
- Đồng bộ flash/runtime surface: `index.html` splash, `app-config.json` header color, `src/app.tsx` runtime error boundary. Không làm thay đổi flow xử lý lỗi.
- Thêm `typescript@~5.7.3` vào devDependencies và đổi `tsconfig.json` `lib` sang `dom` + `es2022` để lệnh typecheck thực thi được. Đây là tooling gate, không thay API/runtime business.

### File Phase 2

`app-config.json`, `index.html`, `package.json`, `package-lock.json`, `tsconfig.json`; `src/css/app.scss`, `src/tokens.js`, `src/app.tsx`, `src/app/App.tsx`; `src/pages/{AuthStatePage,HomePage}/index.tsx`; `src/components/{EmptyState,ErrorState,LoadingState,StatusBadge}/index.tsx`; `src/components/ui/{ActionCard,Button,InfoRow,KpiCard,LongTextValue,Page,WmsRuntime}.tsx`.

### Kiểm chứng thực tế

| Hạng mục | Bằng chứng | Kết quả |
| --- | --- | --- |
| Login 390×844 | Body/document width = 390; background `rgb(248,247,250)`; button min-height 44px; Public Sans/system stack. Blank submit focus email với ring tím 3px. | PASS |
| Auth loading 320×740 | Width = 320, không overflow; 2 control bị disable; touch target 44px. | PASS |
| Auth error 768×1024 | Width = 768, không overflow; content max width 448px; error state render. | PASS |
| Home authenticated 390×844 | Đăng nhập tài khoản test thành công; dashboard thật render KPI, tác vụ, list; 2 KPI trắng 166px/radius 8px, 5 mục nav fixed cao 69px, không overflow. | PASS |
| Home 320×740 / 768×1024 | Document width khớp viewport; nav có 5 item; desktop-sized viewport giữ shell/nav content 448px; computed KPI `background-image: none`. | PASS |
| Navigation | Bottom nav `Lịch sử` chuyển đúng `/history`, quay về `/` thành công. | PASS |
| Modal | Profile logout modal: panel radius 18px; backdrop `rgba(47,43,61,.82)`, `blur(5px) saturate(.82)`, chặn touch nền; không overflow. Không xác nhận logout. | PASS |
| Console | Browser local kiểm tra Auth/Home sau interaction: không có console error. | PASS |
| Reduced motion/focus/touch | CSS có `prefers-reduced-motion`, focus-visible chung, control/nav/button tối thiểu 44px; transition chỉ opacity/transform/color/border/shadow nhẹ. | PASS |

### Build, type và bundle

- `npx vite build`: **PASS**, 565 modules. Output hiện tại: CSS `158.81 kB` (`25.02 kB` gzip); entry `528.83 kB` (`159.31 kB` gzip); scanner lazy chunk `491.80 kB` (`129.72 kB` gzip). Vite còn cảnh báo entry vượt 500 kB; ZXing vẫn được tách khỏi initial graph theo follow-up sau P1.
- `npx tsc --noEmit`: chạy được nhưng **29 lỗi có sẵn trong 9 file**, không có file primitive/shell/Auth/Home Phase 2: `useBarcodeScanner` (1), `ApprovalQueuePage` (8), `ReceiptReviewPage` (1), `receipt-flow.service` (1), `scan.service` (1), `scanner-adapter` (1), `vietnam-address.service` (2), `warranty-flow.service` (1), `zalo-auth.service` (13). Đây là lỗi contract/type tồn tại trong scanner, approval và services; không sửa vì ngoài phạm vi Phase 2 và sẽ cần phase luồng nghiệp vụ/type-hardening riêng.
- `git diff --check`: không có whitespace error. Không có literal old theme (`#06142A`, `#0F73DC`, `#F3F6FA`, `#D6E0EC`), old large radius hoặc gradient trong App shell/Auth/Home/primitives đã migrate.

### Quyết định và việc còn lại

1. Giữ CSS properties semantic làm canonical; migration route sau chỉ dùng token này, không thêm bảng màu/radius thứ hai.
2. Giữ mobile IA/bottom nav, safe-area, scrolling và flow pages; X chỉ định hình visual language, không đưa MUI/Next/sidebar desktop vào runtime.
3. Scanner đã lazy-load từ follow-up P1; không prewarm camera để tránh làm chậm login/Home. Khi người dùng chủ động vào scanner, chunk camera mới tải — có loading boundary hiện hữu.
4. Phase 3 trở đi migrate receipt/outbound/scanner, rồi approval/history và warranty/profile; phải giữ API/business state, dùng primitive đã chuẩn hóa và giải quyết từng nhóm type error khi đúng phạm vi.

### Phase gates

`P2_FOUNDATION: PASS`

Điều kiện đạt: token X là nguồn truth của phần đã migrate; primitive chính, shell, bottom nav, Auth và Home đã render trực tiếp; không còn theme/radius/gradient cũ rõ rệt trên các màn này; focus/reduced-motion/touch target/safe area/responsive đạt kiểm tra; build pass, không có lỗi type mới trong file Phase 2; API/auth/navigation semantics không đổi. Typecheck toàn repo chưa xanh do 29 lỗi baseline đã phân loại ở trên.

## Phase 3 — migrate active business routes

### Checkpoint 1/6 — Receipt

- **Phạm vi:** `/documents/RECEIPT`, `/receipt-review/:receiptId`, `/receipt-success/:receiptId`.
- **UI đã migrate:** thêm `WmsFlowSteps` dùng chung cho bốn bước Thông tin → Quét mã → Kiểm tra → Gửi duyệt; tạo/kiểm tra/thành công cùng dùng canvas X, surface trắng, radius/elevation token X và safe-area. Review có skeleton đúng hình dạng ở initial loading; lỗi giữ CTA “Về trang chủ”; action cuối dùng vùng sticky safe-area (`wms-sticky-action`).
- **File:** `src/components/ui/FlowSteps.tsx`, `src/components/ui/WmsRuntime.tsx` (mở rộng tương thích `WmsCard` để nhận ARIA/section props), `src/css/app.scss`, `src/pages/ReceiptCreatePage/index.tsx`, `src/pages/ReceiptReviewPage/index.tsx`, `src/pages/ReceiptSuccessPage/index.tsx`.
- **Không đổi:** service/API, payload, mã lỗi, Zustand session, permission, camera, hay destination sau action. Không gửi, tạo, sửa hoặc duyệt bất kỳ phiếu nào trong lúc kiểm thử.

| Kiểm tra | Bằng chứng | Kết quả |
| --- | --- | --- |
| Tạo phiếu 320×740 | Width/scrollWidth `320/320`, đủ 4 bước; CTA bị disable khi thiếu tên; không clipping. | PASS |
| Tạo phiếu 390×844 | Width/scrollWidth `390/390`, focus input có ring tím `0 0 0 3px rgba(115,103,240,.22)`, bottom inset 24px. | PASS |
| Review loading/error 320px | Skeleton có role/status và 4 bước; thử route ID không hợp lệ chỉ đọc dữ liệu, sau đó error notice + CTA render, width `320/320`. Log API 422 trong test là chủ đích do ID không hợp lệ, không phải lỗi UI/runtime. | PASS |
| Success 320px | Route ID không hợp lệ vẫn render consistent success summary/error tải chi tiết, đủ 4 bước, width `320/320`. | PASS |
| Targeted build/type | `npx vite build --logLevel error` pass. `npx tsc --noEmit` vẫn đúng 29 lỗi baseline/9 file, không có lỗi mới do receipt UI. | PASS |

**Checkpoint receipt:** PASS — có thể chuyển sang nhóm Outbound. Chưa đánh marker Phase 3 tổng vì còn năm nhóm bắt buộc.

### Checkpoint 2/6 — Outbound

- **Phạm vi:** `/documents/OUTBOUND`, `/outbound-review/:outboundId`, `/outbound-success/:documentId`, `/history/outbound/:documentId` và `/history/OUTBOUND/:documentId` qua `OutboundDocumentDetailPage`.
- **UI đã migrate:** form xuất kho dùng `WmsFlowSteps` và `WmsSelect` cùng input token X; các screen kiểm tra/empty/success/detail dùng flow step thống nhất, surface X và status semantic. Action xác nhận trên review vào `wms-sticky-action`; bottom nav được ẩn trên `/outbound-review` và `/outbound-success` để không che CTA flow. Không thay đổi điều kiện tạo draft, validation Việt Nam, address API, session hoặc API record.
- **File:** `src/app/App.tsx`, `src/pages/DocumentContextPage/index.tsx`, `src/pages/OutboundReviewPage/index.tsx`, `src/pages/OutboundSuccessPage/index.tsx`, `src/pages/OutboundDocumentDetailPage/index.tsx`.

| Kiểm tra | Bằng chứng | Kết quả |
| --- | --- | --- |
| Form xuất 320×740 | Width/scrollWidth `320/320`, đủ 4 bước; 3 select render; phường/xã bị disable trước khi chọn tỉnh/thành; nội dung không overflow. Không submit form. | PASS |
| Review empty 390×844 | Route session không tồn tại render error + CTA tạo lại, 4 bước; bottom nav bị ẩn cho flow. | PASS |
| Success 390×844 | Tóm tắt gửi duyệt, 4 bước, hai CTA và `390/390`; bottom nav ẩn. ID test chỉ đọc, không tạo/chỉnh phiếu. | PASS |
| Detail error 320×740 | Error theo item/route có CTA quay lịch sử, 4 bước, `320/320`; nav lịch sử giữ vì đây là detail từ History. | PASS |
| Targeted build/type | `npx vite build --logLevel error` pass. `npx tsc --noEmit`: vẫn 29 lỗi baseline/9 file, không có lỗi mới từ outbound UI. | PASS |

**Checkpoint outbound:** PASS — có thể chuyển sang scan shared. Chưa đánh marker Phase 3 tổng vì còn bốn nhóm bắt buộc.

### Checkpoint 3/6 — Scan shared, manual, result và history

- **Phạm vi:** `/scanner/:context`, `/manual/:context`, `/result/:id`, `/history`.
- **UI đã migrate:** scanner vẫn full-screen theo ngoại lệ camera nhưng chuyển lớp dark/sheet/overlay/toast sang token X, sheet top radius 18px, không còn decorative blur; màn manual dùng `PageContainer`, `WmsCard/Field/Input/Notice`, `QuantityInput` dùng AppButton/X input; result có sticky CTA safe-area; history search có focus-within ring, modal xóa dùng `WmsModal` sheet token X. Bottom nav ẩn ở `/manual` như scanner/result để không cạnh tranh CTA flow.
- **File:** `src/app/App.tsx`, `src/css/app.scss`, `src/pages/ScannerPage/index.tsx`, `src/pages/ManualCodePage/index.tsx`, `src/pages/ScanResultPage/index.tsx`, `src/pages/ScanHistoryPage/index.tsx`, `src/components/QuantityInput/index.tsx`.
- **Không đổi:** `useBarcodeScanner`, ZXing adapter, quyền camera, `useScanRequest`, API/payload/error mapping, session/store, retry/clear/review navigation. Không bật camera, không đồng ý permission, không scan, submit, xóa hoặc đồng bộ cưỡng bức dữ liệu trong kiểm thử.

| Kiểm tra | Bằng chứng | Kết quả |
| --- | --- | --- |
| Manual 390×844 | Header, hai field, textarea, Hủy/Xác nhận render; nav ẩn, primary touch target 44px, không submit mã. | PASS |
| Scanner lazy + camera wait | Route đầu tiên hiện fallback “Đang chuẩn bị máy quét”; sau khi chunk ZXing tối ưu xong hiện `Bật camera để quét`, không tự yêu cầu camera, không console error. | PASS |
| Result empty 320px | ID không tồn tại trong session render EmptyState thân thiện, back header, không API mutation. | PASS |
| History 390px | 50 chứng từ thật render với search/filter/status/list, nav lịch sử, không console error; không bấm đồng bộ/xóa. | PASS |
| Targeted build/type | `npx vite build --logLevel error` pass. `npx tsc --noEmit`: vẫn 29 lỗi baseline/9 file, không có lỗi mới từ scan UI. | PASS |

**Checkpoint scan shared:** PASS — có thể chuyển sang Approval. Chưa đánh marker Phase 3 tổng vì còn ba nhóm bắt buộc.

### Checkpoint 4/6 — Approval

- **Phạm vi:** `/approvals`, `/approvals/outbound/:documentId` và trạng thái kiểm tra phiếu nhập qua `/receipt-review/:receiptId?from=approvals`.
- **UI đã migrate:** header/kpi/folder phân tách Nhập–Xuất, action đồng bộ, list phiếu chờ duyệt và progress đã dùng surface, accent và trạng thái semantic X; giữ nguyên callback tạo phiếu, đồng bộ, kiểm tra và phê duyệt. `OutboundDocumentDetailPage` tiếp tục dùng flow step X và destination quay về Approval vốn có.
- **File:** `src/pages/ApprovalQueuePage/index.tsx`, `src/pages/OutboundDocumentDetailPage/index.tsx` và CSS/primitive X dùng chung đã có ở các checkpoint trước.
- **Không đổi:** không thay API approval/post, `If-Match`, idempotency, permission, pagination/load-more, dữ liệu queue hay destination sau approve/reject. Không bấm “Phê duyệt”, “Đồng bộ” hoặc tạo phiếu khi kiểm thử.

| Kiểm tra | Bằng chứng | Kết quả |
| --- | --- | --- |
| Queue 390×844 | Initial loading chuyển thành 10 phiếu nhập chờ duyệt/15 mã; grid KPI, 2 folder và list render; `clientWidth/scrollWidth = 390/390`, body scroll tự nhiên, không console error mới. | PASS |
| Kiểm tra phiếu 320×844 | Nút “Kiểm tra” đưa về `/receipt-review/<id>?from=approvals`, đúng điểm quay lại Approval. Phiên backend hết hạn khi tải chi tiết, app hiện `Phiên đăng nhập đã hết hạn` thay vì thực hiện duyệt. `320/320`. | PASS UI / external session expired |
| Targeted build/type | `npx vite build --logLevel error` pass. `npx tsc --noEmit` vẫn 29 lỗi baseline/9 file, gồm 8 lỗi đã có tại `ApprovalQueuePage:100`; không có lỗi mới do UI. | PASS |

**Checkpoint approval:** PASS — điều hướng kiểm tra, layout queue, loading và trạng thái phiên an toàn. Chưa đánh marker Phase 3 tổng vì còn Warranty và profile/fallback.

### Checkpoint 5/6 — Warranty

- **Phạm vi:** `/warranty`, `/warranty/receive`, `/warranty/:caseId`.
- **UI đã migrate:** danh sách dùng KPI X, action card/status semantic; receive thêm `WmsFlowSteps`, `WmsSelect`/`WmsTextArea` chung, vùng CTA sticky safe-area; detail có timeline/media card, status semantic và flow steps theo state. Chọn file, preview image/video, upload/delete, defect suggestion, địa chỉ và validation giữ nguyên handler/API.
- **File:** `src/components/ui/WmsRuntime.tsx` (thêm `WmsSelect`, `WmsTextArea` dùng ít nhất receive + detail), `src/css/app.scss`, `src/pages/WarrantyPage/index.tsx`, `src/pages/WarrantyReceivePage/index.tsx`, `src/pages/WarrantyDetailPage/index.tsx`.
- **Không đổi:** resolve/create case, `defect_ids`, validation phone/address, state transition/`confirmed_defect`, attachment multipart/upload/delete/download và Cloudflare/backend contract đều không thay đổi.

| Kiểm tra | Bằng chứng | Kết quả |
| --- | --- | --- |
| Compile/build | `npx vite build --logLevel error` pass sau migration; `git diff --check` không có whitespace error. | PASS |
| Type baseline | `npx tsc --noEmit` vẫn chính xác 29 lỗi baseline/9 file, trong đó `warranty-flow.service` 1 và address service 2 lỗi đã có trước P3; không có lỗi mới từ UI Warranty. | PASS |
| List 390×844 | Danh sách thật tải 4 hồ sơ RECEIVED sau initial loading; action, status tabs, KPI và list card render, `clientWidth/scrollWidth = 390/390`, không console error mới. | PASS |
| Receive 320×844 | Form thật render 3 bước; province load, ward disabled trước province, catalog defect render; `320/320`. Focus field có ring tím 3px, `min-height: 44px`. Không nhập/gửi hồ sơ. | PASS |
| Detail 390×844 | Hồ sơ thật `19ac…95c9` render state RECEIVED, timeline, attachment quota/select và media placeholder; `390/390`, không click đổi trạng thái, upload, download hay xóa. | PASS |

### Checkpoint 6/6 — Profile, not-found và route fallback

- **UI đã migrate:** Profile dùng notice X cho lỗi phiên, status semantic và `AppButton` danger; not-found/router fallback dùng canvas X; `ScannerRouteLoading` là card/skeleton token X thay vì surface/radius xanh cũ.
- **File:** `src/pages/ProfilePage/index.tsx`, `src/app/routes.tsx`.
- **Không đổi:** `useZaloAuth`, session/store, logout target, exception mapping router và lazy boundary scanner giữ nguyên.

| Kiểm tra | Bằng chứng | Kết quả |
| --- | --- | --- |
| Not-found 320×844 | `/route-khong-ton-tai` render header, warning và CTA “Về trang chủ”; `clientWidth/scrollWidth = 320/320`. | PASS |
| Profile 390×844 / 320×844 | Profile thật Administrator render status, account/session/device và logout X; `390/390` và `320/320`, không bấm đăng xuất. | PASS |
| Build/type | Production build pass; 29 lỗi baseline/9 file, không thêm lỗi từ Profile/routes. | PASS |

### Phase 3 verification summary

- Đã migrate source của toàn bộ route active (Receipt, Outbound, Scan/manual/result/history, Approval, Warranty, Profile/not-found/route fallback) sang token/primitive X; không có thay đổi service, payload, permission, auth semantics, state/store, camera contract hoặc destination action.
- Kiểm tra trực quan đã hoàn thành cho Receipt/Outbound/Scan/History/Approval/NotFound ở 320 hoặc 390px, không có horizontal overflow. Build production pass; `git diff --check` pass.
- Sau khi có xác nhận sử dụng tài khoản test, đã đăng nhập local app và render thực tế đủ Warranty/Profile; không tạo, duyệt, hủy, xóa, upload/download hoặc đổi trạng thái dữ liệu. Không có console error mới trên các route đã kiểm tra.

### Phase gates

`P3_ROUTES: PASS`

Điều kiện đạt: toàn bộ active route đã migrate hoặc được chứng minh dùng foundation chung; sáu nhóm có checkpoint; UI không còn theme xanh/radius lớn cũ rõ rệt trên active routes; loading/error/empty/success/disabled bảo toàn nhất quán; không đổi API/business/auth/permission/store/navigation semantics; render mobile kiểm tra không horizontal overflow; production build pass và typecheck chỉ còn 29 lỗi baseline/9 file đã phân loại.

Không tự chạy Phase 4.

### Khắc phục typecheck sau Phase 3 — 2026-08-27

- **Kết quả:** `npx tsc --noEmit` đã PASS, từ 29 lỗi baseline về **0 lỗi**. `npx vite build --logLevel error` PASS và `git diff --check` PASS.
- **Không đổi nghiệp vụ:** chỉ chuẩn hóa kiểu dữ liệu/narrowing ở frontend; không đổi endpoint, payload runtime, quyền, auth flow, store hay điều hướng.
- **Sửa chính:**
  - `useBarcodeScanner` dùng interface adapter chung, nên mock và camera adapter cùng hỗ trợ optional video binding đúng kiểu.
  - Approval giữ promise tải phiếu cục bộ để không còn kết quả `undefined` và không xóa nhầm request mới; model danh sách outbound bổ sung `version` vốn đã được dùng làm fallback `If-Match`.
  - Receipt review narrow đúng hai dạng response khi gửi duyệt; patch line inbound cho phép dòng mới chưa có `id`.
  - Warranty component scan có type body riêng `{ qty, code_value }`, không còn bị ép `line_id`; address filter dùng type guard; torch capability và attachment type được parse an toàn.
  - Auth response dùng wire model độc lập thay vì mở rộng `WarehouseStaff`, vẫn normalize email trước login và giữ nguyên mapping staff hiện hữu.
- **File đã chạm trong lần khắc phục:** `src/hooks/useBarcodeScanner.ts`, `src/pages/ApprovalQueuePage/index.tsx`, `src/pages/ReceiptReviewPage/index.tsx`, `src/services/receipt-flow.service.ts`, `src/services/scan.service.ts`, `src/services/scanner-adapter.ts`, `src/services/vietnam-address.service.ts`, `src/services/warranty-flow.service.ts`, `src/services/zalo-auth.service.ts`.

## Phase 4 — lazy loading và performance (đang kiểm chứng)

### Thay đổi triển khai

- Thêm `src/app/route-modules.ts` làm registry dynamic import. App shell, `AuthGate`, error boundary, `AuthStatePage` và `HomePage` vẫn là critical path; 16 màn nghiệp vụ active chuyển thành lazy route qua `ProtectedLazyRoute` trong `src/app/routes.tsx`.
- `ProtectedLazyRoute` chỉ bọc `Outlet` route bằng `Suspense`, nên không remount App shell/bottom navigation. Generic route fallback là skeleton theo cấu trúc; scanner giữ skeleton riêng và camera vẫn chỉ bắt đầu sau thao tác người dùng.
- Sau khi Home đã có dashboard, chỉ prefetch `ApprovalQueuePage` và `ScanHistoryPage` khi idle/user network không bật Save-Data hay 2G. Không prefetch scanner/ZXing, warranty hay media.
- Warranty list có cache 30 giây + in-flight dedupe theo status: cache được giữ khi revalidate nền; initial không cache mới skeleton. Tránh request trùng trong Strict Mode/remount.
- Thumbnail Warranty đặt aspect ratio sẵn có, `loading="lazy"`, `decoding="async"`, `width/height` và `object-cover`. Preview blob/video vẫn chỉ download khi người dùng bấm xem; object URL và media stream đã được cleanup hiện hữu.

### Bundle/graph sau thay đổi

| Hạng mục | P1 baseline | P4 hiện tại | Bằng chứng |
| --- | ---: | ---: | --- |
| Initial JS | 1,020.17 kB / gzip 288.40 kB | 340.82 kB / gzip 108.73 kB | giảm khoảng 66.6% raw, 62.3% gzip |
| Initial CSS | 159.03 kB / gzip 24.86 kB | 161.43 kB / gzip 25.49 kB | tăng nhỏ do UI X đã có từ Phase 2/3 |
| Scanner + ZXing lazy entry | nằm trong graph eager P1 | 491.93 kB / gzip 129.56 kB | `manifest` ghi `src/pages/ScannerPage/index.tsx` là dynamic entry |
| Dynamic route entries | 0 | 16 | `index.html` chỉ khai báo chúng trong `dynamicImports`, không trong `imports` |

- Build dùng `npx vite build --manifest`; initial entry `assets/index.DEe4bi2d.module.js`, scanner entry `assets/index.DaGb11Rs.module.js`, CSS `assets/index-BToAU3od.css`. Scanner adapter chỉ được import từ `ScannerPage`, nên ZXing không ở initial graph.
- Các route chunks còn lại 0.37–19.93 kB raw (trừ scanner); dependencies chung được Vite tách riêng. Chưa dynamic-import adapter lần hai khi bấm camera vì scanner route đã là boundary riêng; tách thêm sẽ dời độ trễ sang đúng CTA "Bật camera" mà không giảm initial graph hơn nữa.

### Validation hiện có

- `npx tsc --noEmit`: PASS, 0 lỗi.
- `npx vite build --manifest`: PASS, 567 modules transformed.
- `git diff --check`: PASS.
- Build manifest cuối: initial `assets/index.DEe4bi2d.module.js` 342,666 bytes; scanner `assets/index.DaGb11Rs.module.js` 493,031 bytes; 16 dynamic route entries. Sass legacy API warning là warning tooling đã có, không làm type/build fail.

### Smoke test local — 390×844, đăng nhập test chỉ đọc

- Đăng nhập `admin@gmail.com` vào `http://127.0.0.1:4173` thành công; Home có dashboard, bottom navigation và không console error.
- Client navigation Home → `/approvals` load queue đúng nội dung, không overflow (`clientWidth/scrollWidth = 390/390`). Reload trực tiếp `/approvals` vẫn mở lại lazy route và queue.
- Direct navigation lazy routes đã render không console error, mọi route đều `390/390`:
  - Receipt: `/documents/RECEIPT` (form tạo phiên, không submit);
  - Outbound: `/documents/OUTBOUND` (form thông tin, không tạo draft);
  - Warranty: `/warranty`, `/warranty/receive`, `/warranty/19AC783A-801B-4DD8-B3AA-54D217CD95C9` (list/form/detail, không tạo case, upload, xoá hay đổi trạng thái);
  - Scanner: `/scanner/INVENTORY_LOOKUP` (route chunk render, chỉ có "Bật camera để quét", không JavaScript dialog/permission camera);
  - History: `/history` tải 50 phiếu sau initial loading, không flash trắng; Profile `/profile`; fallback `/route-khong-ton-tai`.
- Home asset inventory sau idle có Approval + History prefetch theo thiết kế; không thấy `ScannerPage`, `scanner-adapter` hay ZXing. Warranty detail chưa tải preview media (`0 img`, `0 video`, chỉ có placeholder "Tải và xem ảnh") trước thao tác người dùng.
- Không click CTA mutation, không bật camera, không upload/download/xóa/duyệt. Không có console error trong các route đã kiểm tra. Caches/in-flight hiện có ở dashboard, history, approval và Warranty ngăn effect/remount tạo request trùng; không quan sát duplicate reload trong smoke test.

### Phase gates

`P4_PERFORMANCE: PASS`

Đạt: split route hoạt động với ZMP base path, initial graph không kéo ZXing, lazy fallback giữ App shell, scanner không khởi tạo camera trước intent, media không eager, cached list giữ dữ liệu khi refresh nền, type/build sạch và direct/client navigation local đều pass. Không tự chạy Phase 5.

## Phase 5 — full regression, visual QA và nghiệm thu cuối

### Gate, phạm vi và working tree

- Đã xác nhận lại đầy đủ `P1_AUDIT`, `P2_FOUNDATION`, `P3_ROUTES` và `P4_PERFORMANCE` đều là `PASS` trước khi QA.
- Snapshot working tree bẩn ở đầu Phase 5 được giữ nguyên: không reset/revert/checkout/clean, không chạm backend, API contract, permission, store, payload hay dữ liệu WMS.
- Defect frontend duy nhất phát hiện trong Phase 5: deep-link trực tiếp tới `/auth/logout-confirm` rồi bấm **Hủy** dùng `navigate(-1)` và có thể trả browser về trang trống. `src/pages/AuthStatePage/index.tsx` nay kiểm tra `history.state.idx`: có history nội bộ thì quay lại, thiếu history thì replace an toàn về `/profile`. Không thay đổi hành vi xác nhận đăng xuất, API hay session cleanup. Đã retest direct URL tại 390px: Hủy đóng modal, mở `/profile`, bỏ scroll-lock, không console error.

### Functional regression matrix — local, chỉ đọc

| Nhóm | Evidence P5 và checkpoint trước đó | Kết quả |
| --- | --- | --- |
| Auth | Render `/auth/login` (input/button 44px), `/auth/failed` (notice lỗi cạnh form), security/auth route và modal logout. Login thật bằng tài khoản test đã được kiểm tra chỉ đọc ở P4; P5 không nhập lại credential. | PASS UI/state |
| Home | Home render tại 320px và 768px; dashboard/cache có skeleton initial đúng hình dạng, action/bottom nav hiện đủ. | PASS |
| Receipt | `/documents/RECEIPT` và `/manual/RECEIPT` render form/validation/disabled CTA; `/receipt-review/<id>` render loading an toàn; `/receipt-success/<id>` có fallback success/read-only không crash. Không submit/record/post. | PASS UI/code path |
| Outbound | `/documents/OUTBOUND` render toàn bộ field, địa chỉ phụ thuộc bị disabled đúng lúc chưa chọn tỉnh. Review/success và destination sau hành động đã được checkpoint ở P3; P5 không tạo, scan, gửi hay duyệt phiếu. | PASS UI/code path |
| Scanner/manual | `/scanner/INVENTORY_LOOKUP` render lazy chunk, chỉ hiển thị “Bật camera để quét”, không tự gọi permission/camera; manual và result-empty render đúng. Source audit xác nhận adapter dọn timer, listener, track/stream và object URL. | PASS |
| History/result | History tải 50 chứng từ không flash trắng; `/result/p5-qa-no-session` render empty state, không overflow. Cache/in-flight đã ghi ở P4 vẫn không tạo reload trùng trong smoke. | PASS |
| Approval | `/approvals` tải 10 phiếu nhập chờ duyệt, CTA Kiểm tra/Phê duyệt đúng 44px; không bấm action mutation. Checkpoint P3 đã xác nhận “Kiểm tra” quay về review cùng nguồn Approval. | PASS |
| Warranty | `/warranty` tải 4 hồ sơ, mở chi tiết chỉ đọc; attachment hiện placeholder “Tải và xem ảnh”, không tạo `img`/`video` hoặc download trước intent. Upload/delete/transition/validation giữ handler contract đã checkpoint P3. | PASS UI/code path |
| Profile/fallback | `/profile` sau bootstrap render session/device; 404 render fallback X. Modal logout có `role=dialog`, `aria-modal`, focus modal và unlock sạch khi Hủy. | PASS |

Các smoke không tạo/sửa/xóa/chuyển trạng thái/duyệt chứng từ, không bật camera, không upload/download media. Khi refresh một số protected URL, auth bootstrap của backend development có thể hiển thị loading ngắn trước khi trả session; không có console error hay router error. E2E post/approve/upload thật không chạy vì sẽ làm đổi dữ liệu WMS.

### Visual QA matrix

| Viewport | Màn đã render/inspect | Kết quả |
| --- | --- | --- |
| 320×740 | Home, Login, NotFound | `clientWidth/scrollWidth = 320/320`; KPI/action 2 cột, surface X, bottom nav, input/button 44px, text dài không tràn. |
| 360×760 | Nhập kho, Xuất kho | `360/360`; form một cột, field/select 44px, tỉnh/phường dependent disabled, notice/flow step không clip. |
| 390×844 | Scanner, Approval, History, Auth error/empty, modal | `390/390`; scanner không auto-camera, danh sách/CTA không che nav; backdrop `rgba(47,43,61,0.82)`, dialog focus/scroll lock; focus-visible xuất hiện trên input. |
| 430×860 | Warranty list/detail/media | `430/430`; card một cột, thumbnail placeholder không tải trước, vùng filter trạng thái cuộn ngang có chủ đích và không tạo overflow trang. |
| 768×900 | Home, Profile | `768/768`; không có sidebar desktop, content được giới hạn hợp lý, KPI 2 cột, bottom nav/safe-area vẫn hoạt động. |

- CSS audit xác nhận `prefers-reduced-motion`, focus-visible, `100dvh` fallback, safe-area, touch target 44px và khóa body khi modal đều là rule chung.
- Token bridge trong `src/css/app.scss` map các utility legacy còn lại bên trong `.wms-page`/`.wms-flow-page` về token X; không còn theme navy/blue/radius lớn hiển thị rõ ở active route đã inspect.
- Không thể mô phỏng bàn phím ảo, safe-area vật lý, quyền camera hoặc GPU WebView của iOS/Android bằng browser desktop; các điểm này cần smoke trên Zalo device thật.

### Technical/performance verification cuối

- `npx tsc --noEmit`: **PASS**, 0 lỗi.
- `npx vite build --manifest --logLevel error`: **PASS**, 567 modules; chỉ còn Dart Sass legacy API deprecation warning đã có, không phải lỗi runtime/type.
- Manifest build cuối: initial `assets/index.DjGgoFVL.module.js` **342,776 bytes / gzip 108,779 bytes**; Scanner + ZXing `assets/index.CtrAHFYY.module.js` **493,031 bytes / gzip 129,567 bytes**; có **16** dynamic route entries.
- Initial entry không chứa `BrowserMultiFormatReader`, `decodeFromVideo` hoặc `@zxing`; source chỉ import ZXing tại `src/services/scanner-adapter.ts`, route Scanner là lazy boundary. Không có MUI, Framer Motion, ApexCharts hay asset/source Vuexy/Pixinvent trong runtime.
- `git diff --check`: PASS, không whitespace error; chỉ có cảnh báo CRLF của working tree Windows. Working tree vẫn chỉ gồm các thay đổi đã bảo vệ cùng fix/logout và file progress của phase.

### Phase gates

`P5_QA: PASS`

Nghiệm thu frontend X hoàn tất trong phạm vi: active routes đã có evidence functional/visual phù hợp, lazy loading/ZXing split giữ nguyên, type/build sạch, và không phát hiện regression mới về API, payload, permission, auth semantics, store hay luồng nghiệp vụ. Giới hạn còn lại là test E2E ghi dữ liệu và thiết bị Zalo thật như đã nêu trên; không che giấu bằng kết quả mock.
