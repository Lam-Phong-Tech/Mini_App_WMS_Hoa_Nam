# UIUX-G1 gate — PASS (revalidated)

**Recorded:** 2026-09-09T14:59:49.2667260+07:00  
**Target base / implementation HEAD:** `411ba4d3ae4e287ef40626aba8ca6794924be1ef`  
**Designer source baseline:** `86079f965f2fcb43a7e3efbbc9467d119b47921f`

The original documentation-only G1 record was `BLOCKED`. The user supplied the outstanding decisions and explicitly authorized this revalidation. The previous record SHA-256 is `0baec58fe6ab7b60473515cef2cf7265965813f4e2b05e0ff8779fd343d300ce`.

G1 now passes for its scope:

- Green/DEV-TEST config and health advertise `1.1.0`; 933 products across 19 pages have valid domain/status mapping; the `POWER_TOOLS` category endpoint returns 51 entries.
- Green OpenAPI documents the multi-product quote shape and `items[].variant_id`; an authorized QA sequence demonstrated `201` creation, `200` same-key replay, and `409 IDEMPOTENCY_CONFLICT` after a payload change. One QA record was created in Green/DEV-TEST.
- The user resolved D02: product presentation order is canonicalized for fingerprint/key/wire payload; the official consent copy is set; `province_code` is neither collected nor submitted; privacy URL/version come from public config.
- The user authorizes only Green public API/config/media for UI integration testing. It does not authorize Customer/Production or Designer runtime fixtures.
- The authorized quote/config source changes pass `npm run typecheck`, `npm run lint`, `npm run test` (12 files / 50 tests), and `npm run build:backend-preview`.

D06 and D08 remain mandatory in UIUX-G2; D07 remains mandatory in UIUX-G5. This gate does not claim a visual baseline, pixel match, scroll-owner measurement, real-device Zalo QA, full PV completion, deployment, or Customer/Production approval.

`next_prompt_allowed` is **true** for UIUX-G2 only.

See [g1-revalidation.md](../g1-revalidation.md), [decisions.json](../decisions.json), and [Green evidence](../evidence/reference/api-green-g1-revalidation-2026-09-09.json).
