# Changes — Prompt 04 Nhập kho

- Updated Inbound review/result language to the current HANDOFF: `Gửi phiếu lên Web`, `Chờ xử lý trên Web`, and `Phiếu đã gửi, chưa ghi sổ`.
- Kept the existing resolve → validate → outbox → `inbound/record` sequence;
  no Post Receipt call or inventory mutation was added.
- Reused the Prompt 03 durable local draft store for exit/resume/cancel. A
  successful WMS record clears the completed local draft; pending/failed/
  unknown records stay available for reconciliation.
- Kept duplicate item, IN_STOCK/ISSUED, box-quantity and SKU classification
  checks in the existing parser/flow.
- Added stable React keys for the document icon's mapped line segments in
  `src/ui/AppIcon.tsx`; this removes the runtime LogBox that previously covered
  the scanner on Android.
- No backend, schema, permission or new dependency was changed.
