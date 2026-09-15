# Checks — Prompt 06 Tra cứu

Run from `apps/wms-mobile` on 2026-09-16.

| Check | Result | Evidence |
| --- | --- | --- |
| Gate 00–05 | PASS | Gate 05 SHA-256 `6EC1A0EECEF2A0BB2728AAC8C8FAD1BF15BE0A5E98A5A8D1F9A58BD0B50360D4`. |
| Board inspection | PASS | Pinned board `04_tra_cuu.png` opened directly. |
| Lookup race/errors | PASS | Covers blank code, abort, response inversion, 4xx not-found and network error. |
| Full regression | PASS | `npm test -- --runInBand --silent`: 37 suites / 893 tests. |
| Typecheck/lint | PASS | `npm run typecheck`, `npm run lint`, exit 0. |
| Web build | PASS | `npm run build:web`, exit 0; Vite chunk-size advisory only. |
| Web read-only smoke | PASS | Home opens lookup directly. Known lookup and not-found were exercised; CDP observed only GET trace, no mutation. |
| SKU name mapping | PASS | Real `inventory/trace/DF1234` exposes `resolved_object.sku_name`; UI displays `Máy Khoan cắt điện`, SKU, group and unit. NFC supplements a missing name with the same GET trace. |
| Physical NFC | PASS | Registered tag resolved to `DF1234-01` / `DF1234` on Xiaomi. No false success when NFC was disabled. Screenshot `android-nfc-lookup-resolved.png`. |
| Visual fixture | PASS | User approved `fixture-06-lookup-ready-xiaomi-1440x3200.png` as Prompt 06 UI fixture. |
| Per-location/history enrichment | NOT_RUN | Explicitly deferred until BE provides the read contract; app does not invent values. |
