# Checks — Prompt 02 Home

Run from `apps/wms-mobile` on 2026-09-11.

| Check | Result | Evidence |
| --- | --- | --- |
| Prerequisite Gate 00 | PASS | `../00/gate.json` status `PASS` |
| Prerequisite Gate 01 | PASS | `../01/gate.json` status `PASS` |
| Typecheck | PASS | `npm run typecheck`, exit 0 |
| Lint | PASS | `npm run lint`, exit 0 |
| Targeted Home/navigation tests | PASS | `npm test -- --runInBand __tests__/authFlow.test.tsx __tests__/App.test.tsx --silent`, 2 suites / 30 tests |
| Full regression | PASS | `npm test -- --runInBand --silent`; all discovered suites completed without test failure |
| Production web build | PASS | `npm run build:web`, exit 0; existing chunk-size advisory only |
| Local visual review | PASS | `http://127.0.0.1:5175/` at `390×844`; font/asset stable, Home grid remained two columns, navigation dock and task icons rendered |
| CTA smoke test | PASS | Browser interaction opened Inbound, Outbound, Warranty, NFC, lookup and documents; Back returned Home for tested flows; avatar opened Cá nhân. No write CTA was pressed. |

The user-supplied Home reference remains the visual target. This check is a
review of layout, color, type, icon semantics and navigation at the approved
viewport; it does not claim a fabricated pixel-diff measurement.
