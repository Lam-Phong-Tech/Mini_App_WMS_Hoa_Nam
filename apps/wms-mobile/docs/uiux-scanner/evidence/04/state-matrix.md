# State matrix — Prompt 04 Nhập kho

| State | Entry/data | Visible result and CTA | Verified |
| --- | --- | --- | --- |
| Tạo phiếu | Home → Nhập kho; active warehouse read | `Tạo phiếu nhập`, tên phiếu bắt buộc, kho lấy từ WMS; `Tiếp tục quét` disabled nếu thiếu | PASS |
| Quét mã | InboundFlow step 1 | Camera/manual input; every code goes through `inbound/resolve-code`; no stock mutation | PASS — existing tests and source audit |
| Mã hộp | `BOX-<SKU>-<n>` | Resolve first, then quantity dialog; only confirmed positive quantity enters draft | PASS |
| Mã trùng/đã tồn | Same item, `IN_STOCK` or `ISSUED` | Reject locally with clear error; code is not added | PASS |
| SKU mới | Resolver candidate requires classification | Ask PRODUCT/COMPONENT only after resolver/lookup confirms need | PASS |
| Kiểm tra | Step 2 with grouped SKU rows | Totals by real scanned quantity; remove newest local code or return to scan; `Gửi phiếu lên Web` | PASS |
| Gửi phiếu | Outbox + stable Idempotency-Key | Calls existing `inbound/record`; never calls Post Receipt | PASS |
| Sent | Sync `synced` | `Đã gửi phiếu lên Web`, status `Chờ xử lý trên Web`, banner `Phiếu đã gửi, chưa ghi sổ` | PASS |
| Pending/failed/conflict/unknown | Sync result | Keeps outbox data and presents retry/reconcile reason; no false success | PASS |
| Draft exit | Non-empty flow Back | Save local `DRAFT`, cancel as `CANCELLED`, or continue; draft expiry 7 days | PASS — Prompt 03 implementation |

## Acceptance mapping

The current source uses the existing real service contract and preserves the
one-warehouse selection by WMS ID. It does not introduce a fake supplier/type
field or a Post Receipt action that the Scanner is not allowed to perform.
