# PHASE 1/5 — Audit, baseline và khóa phạm vi

Bạn là Lead Frontend Architect, Senior Product Designer và Performance Engineer. Hãy làm việc trực tiếp trong repository:

`C:\laragon\www\zalo_mini_app\bachhoa`

Đây là file đầu tiên trong chuỗi 5 prompt tuần tự. Phase này chỉ khảo sát, đo baseline và tạo hợp đồng thực thi bền vững. Không triển khai refactor UI ở phase này.

## Điều kiện đầu vào

- File này không có prerequisite phase.
- Nếu `docs/vuexy-miniapp-progress.md` đã tồn tại, đọc nó trước. Không xóa lịch sử hoặc ghi đè kết quả hợp lệ của lần chạy trước.
- Working tree đang có nhiều thay đổi của người dùng. Không reset, revert, checkout, clean, xóa hoặc ghi đè hàng loạt.

## Nguồn sự thật bắt buộc

- Vuexy reference: https://demos.pixinvent.com/vuexy-nextjs-admin-template-old/demo-1/dashboards/crm/
- Baseline nội bộ: `docs/ui-system-x-vuexy.md`
- Active route source of truth: `src/app/routes.tsx`
- Stack: React 18, TypeScript, Vite 5, zmp-vite-plugin, React Router 7, Tailwind 3, SCSS, ZMP SDK/UI, TanStack Query, Zustand và ZXing.

## Quyền hạn và giới hạn

Được phép đọc repository, dùng browser để khảo sát Vuexy/local app, chạy lệnh kiểm tra không phá hủy và tạo/cập nhật đúng file `docs/vuexy-miniapp-progress.md`.

Không được sửa implementation frontend trong phase này. Không commit, push, deploy, sửa backend/API contract, permission hoặc business rule. Không sao chép source code hay asset có bản quyền từ Vuexy.

## Công việc bắt buộc

1. Đọc `git status` và ghi nhận các file modified/untracked cần bảo vệ.
2. Đọc toàn bộ `docs/ui-system-x-vuexy.md`.
3. Đọc `package.json`, `vite.config.mts`, `zmp-cli.json`, `tailwind.config.js`, `src/css/app.scss`, app shell, router và các UI primitive.
4. Lập inventory các route thực sự reachable từ `src/app/routes.tsx`. Không đưa page legacy không reachable vào phạm vi, trừ dependency dùng chung.
5. Lập dependency map ở mức đủ dùng cho:
   - Auth/App shell/Home;
   - Receipt;
   - Outbound;
   - Scanner/manual/result/history;
   - Approval;
   - Warranty;
   - Profile/error fallback.
6. Xác định component nền đang dùng chung và các hard-coded token cần xử lý.
7. Xác định dependency nặng hoặc critical-path risk, đặc biệt chuỗi `ScannerPage → useBarcodeScanner → scanner-adapter → @zxing/browser`.
8. Nếu browser khả dụng, khảo sát Vuexy ở desktop và mobile khoảng 390px; ghi nhận token, grid, responsive, component và motion. Chỉ lấy design language, không lấy kiến trúc Next.js/MUI làm yêu cầu runtime.
9. Chạy baseline phù hợp, tối thiểu:
   - `npx tsc --noEmit`;
   - production build Vite/ZMP khả dụng.
10. Ghi rõ lỗi nào đã có sẵn trước khi refactor. Không sửa lỗi ngoài phạm vi chỉ để làm baseline xanh.
11. Ghi nhận output bundle hiện tại nếu build thành công: số chunk, các chunk lớn và dấu hiệu ZXing/non-home route nằm trong initial dependency graph. Không cài bundle analyzer mới.
12. Xây gap matrix giữa Vuexy X và implementation hiện tại cho: color, typography, spacing, radius, shadow, navigation, card, form, status, loading, error, empty, motion, responsive và lazy loading.

## File trạng thái bắt buộc

Tạo hoặc cập nhật `docs/vuexy-miniapp-progress.md` với cấu trúc ngắn gọn:

- Objective và non-negotiables.
- Protected working-tree changes.
- Active route inventory.
- Shared component inventory.
- Baseline commands và kết quả.
- Baseline bundle observations.
- Existing errors.
- Vuexy gap matrix.
- Quyết định kiến trúc ban đầu.
- Phase gates.
- Blocker và việc còn lại.

Dùng đúng marker sau trong mục `Phase gates`:

`P1_AUDIT: PASS|FAIL|BLOCKED`

Không tạo marker PASS cho phase sau.

## Gate PASS

Chỉ ghi `P1_AUDIT: PASS` khi đồng thời có đủ:

- snapshot working tree;
- inventory route active và component dùng chung;
- baseline type/build được chạy hoặc có lý do kỹ thuật chính xác vì sao không chạy được;
- lỗi baseline được phân loại;
- gap matrix Vuexy;
- bundle/ZXing observation;
- phạm vi và thứ tự migration rõ ràng;
- không có implementation file nào bị sửa trong phase này.

Nếu thiếu một mục, ghi `FAIL` hoặc `BLOCKED`, nêu bằng chứng và hành động nhỏ nhất để gỡ. Không giả lập PASS.

## Kết thúc phase

Trả lời tiếng Việt, dẫn đầu bằng `P1_AUDIT: PASS`, `FAIL` hoặc `BLOCKED`, sau đó nêu bằng chứng chính và đường dẫn progress file. Dừng tại đây. Không tự chạy nội dung của file 02.

