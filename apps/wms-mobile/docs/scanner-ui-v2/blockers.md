# Blockers — Gate 01

## R1 — Mất pending scan marker khi tiếp tục phiên linh kiện — ĐÃ SỬA, cần Gate kiểm kê lại

`issueWarrantyComponents()` phát progress `created` sau `freshDocument()` mà không truyền `pendingCodeKey`. Flow lưu `progress.pendingCodeKey`, do đó marker của scan dở bị ghi thành `undefined` trước nhánh reconciliation. Lần retry sau không còn bằng chứng để chặn scan lại. Vị trí: `services/wms/warrantyComponentWrite.ts` (progress `created` và nhánh reconciliation), `features/warranty/WarrantyComponentIssueFlow.tsx` (persist progress).

Sửa trong working tree sau Gate 01: callback `created` giờ truyền nguyên `pendingCodeKey`, cả callback sau `freshDocument()` cũng giữ marker. Regression test gọi retry hai lần và xác nhận cả hai lần đều bị chặn `COMPONENT_SCAN_RECONCILIATION_REQUIRED`, không có request scan.

## R2 — Chưa persist document id trước GET detail sau create — ĐÃ SỬA, cần Gate kiểm kê lại

Sau `createComponentIssueDocument()`, service gọi `freshDocument()` trước callback `created`. Nếu create trả id nhưng GET detail lỗi, UI storage chỉ có stage `creating`, không có `documentId`; lần sau có thể gọi create lại. Vị trí: `services/wms/warrantyComponentWrite.ts` và persist đầu `confirmIssue()` trong `WarrantyComponentIssueFlow.tsx`.

Sửa trong working tree sau Gate 01: service phát progress `created` ngay khi Create trả `documentId`, trước `freshDocument()`. Regression test làm GET detail lỗi, kiểm tra id đã được persist callback, rồi tiếp tục chính document mà không Create thêm.

## R3 — Khóa kho phụ thuộc vào số dòng draft — ĐÃ SỬA, cần Gate kiểm kê lại

Select kho disable khi `draft.items.length > 0`, nhưng “Bỏ khỏi danh sách” vẫn xóa dòng khi không submitting. Xóa hết dòng mở lại kho dù đã scan/đã có document server; restart cũng không có mốc lock riêng. Vị trí: `WarrantyComponentIssueFlow.tsx`.

Sửa trong working tree sau Gate 01: thêm `warehouseLocked` persisted ngay sau resolver nhận diện mã thành công; Select dùng mốc này thay vì chiều dài draft. Phiên cũ có dòng nháp/document cũng được khóa để không mở lỗ hổng migration. Regression test khởi động lại với nháp trống nhưng cờ lock và xác nhận kho vẫn bị khóa.

## R4 — loadMore có thể trộn dữ liệu generation cũ — ĐÃ SỬA, cần Gate kiểm kê lại

Request trang đầu có `active` guard, nhưng `loadMore()` không so sánh generation/case/revision khi response về. Response cũ có thể cập nhật `pageRef` và nối documents sau refresh/đổi hồ sơ khi hook vẫn mounted. Dedupe id không ngăn được trộn hai case/generation. Vị trí: `features/warranty/useWarrantyComponentHistory.ts`.

Sửa trong working tree sau Gate 01: generation token tăng ngay khi Refresh/đổi case; trang `loadMore` chỉ được nối khi token vẫn hiện hành. Regression test dùng deferred response xác nhận response cũ bị bỏ sau đổi hồ sơ và sau Refresh.

## Baseline và điều kiện ngoài code

- `npm run lint` exit 1: **65 errors, 10,968 warnings**. Ít nhất có lỗi `react-hooks/exhaustive-deps` tại `InboundFlow.tsx` và `WarrantyComponentIssueFlow.tsx`; output cũng lint bundle `web-dist`, tạo lượng cảnh báo lớn.
- D01, D03, D04, D05 chưa có xác nhận thực tế; xem `decisions.md`.
- Chưa có test camera/NFC/PDA, account/role E2E hoặc benchmark performance.

Gate 01 snapshot ban đầu đã `STALE` vì source có bản sửa R1–R4 chưa tái kiểm kê vào Gate. Các blocker D01/D03/D04/D05 và lint toàn project vẫn còn, nên chưa được chạy Gate 02.
