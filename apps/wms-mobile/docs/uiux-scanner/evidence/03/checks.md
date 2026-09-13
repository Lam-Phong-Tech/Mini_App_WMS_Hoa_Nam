# Checks — Prompt 03 Dialog cố định

Run from `apps/wms-mobile` on 2026-09-12.

| Check | Result | Evidence |
| --- | --- | --- |
| Gate 00 | PASS | `../00/gate.json` status `PASS`. |
| Gate 01 | PASS | `../01/gate.json` status `PASS`. |
| Gate 02 | PASS | `../02/gate.json` status `PASS`; source hashes valid before Prompt 03 edits. |
| Board inspection | PASS | Direct browser inspection of `01_dialog_header_aligned_v2.png`; all four panels/copy/CTAs legible. |
| Source inventory | PASS | Read Sheet, Banner, Button, Input, Select, Badge, Page, theme tokens and all existing Sheet callers. |
| Draft persistence | PASS | `draftStore.test.ts`: save/read, 7-day expiry and CANCELLED retention. |
| Flow regression | PASS | Inbound, Outbound, auth/Home and draft tests: 5 suites / 154 tests. |
| Typecheck | PASS | `npm run typecheck`, exit 0. |
| Lint | PASS | `npm run lint`, exit 0; no errors or new warnings. |
| Web build | PASS | `npm run build:web`, exit 0; existing Vite chunk-size advisory only. |
| Dialog smoke | PASS | Scan picker selected Bảo hành; Inbound/Outbound exit dialogs exercised; save/resume and CANCELLED observed without WMS write. |
| Hardware camera/NFC | OUT_OF_SCOPE | Physical permission and NFC acceptance remain their flow-specific tests. |

No backend endpoint or schema was invented. Local DRAFT is device-persistent;
existing `record` endpoints remain the only WMS document creation path.
