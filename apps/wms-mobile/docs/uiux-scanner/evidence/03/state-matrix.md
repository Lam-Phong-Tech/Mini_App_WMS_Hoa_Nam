# State matrix — Prompt 03 Dialog cố định

Board inspected directly: `01_dialog_header_aligned_v2.png` (`1774×887`).
The four panels are independent states, not a forced four-step workflow.

| Board panel | Implemented behavior | Close/CTA rule | Status |
| --- | --- | --- | --- |
| Chọn tác vụ quét | Tab Quét mã opens a fixed dialog with Nhập kho, Xuất kho, Bảo hành, Tra cứu sản phẩm and Tra cứu bằng NFC. | Backdrop/Hủy closes the picker; selecting a business route closes it and opens the real existing flow. | PASS |
| Phiếu chưa hoàn tất | Inbound and Outbound drafts are persisted locally as `DRAFT`; updates refresh a 7-day expiry. | Continue resumes; Lưu nháp và thoát leaves it resumable; Bỏ phiếu changes status to `CANCELLED`; Hủy only closes the dialog. | PASS |
| Kho tạm dừng | When the active-warehouse read succeeds with no active warehouse, the create screen shows the board message. | Informational only: `Đã hiểu` closes it. No fake contact button or navigation is provided. | PASS |
| Xác nhận bỏ phiếu | Exiting a non-empty Inbound/Outbound draft opens a confirmation dialog. | Save or cancel is explicit; dismiss/backdrop returns to editing. No draft is silently deleted. | PASS |

## Shared component rules

- `Dialog` is a centered, modal, reusable presentation component. It accepts
  caller content and a `dismissible` policy; it contains no inventory logic.
- `Sheet` remains the bottom-sheet component for existing manual-input/select
  callers and was not changed into a different contract.
- During a write, the caller keeps the dialog context and does not report
  success until the real service returns. A successful WMS record removes only
  the completed local draft; a cancelled draft remains stored as `CANCELLED`.
- No new motion package was installed; dialog transition uses existing React
  Native modal fade and static button feedback.
