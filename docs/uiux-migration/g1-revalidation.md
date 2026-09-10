# UIUX-G1 revalidation — 2026-09-09

## Scope

This revalidation records the user's authorized quote/config integration changes that occurred after the original documentation-only G1 record. It does not merge, push, deploy, modify Customer/Production, or start UIUX-G2 implementation.

## Runtime and contract evidence

- Green/DEV-TEST public API and OpenAPI were re-read at `2026-09-09T14:53:40.1889743+07:00`.
- All 933 public products across 19 pages had an allowed domain and availability. `POWER_TOOLS` contains 412 products and its category endpoint returns 51 items.
- Public config reports contract `1.1.0`, structured hotline, `zalo_oa: null`, support-hour intervals, `privacy_policy_url`, and a separate `privacy_version`.
- OpenAPI exposes `POST /api/v1/public/quote-requests`, a required 16–128 character `Idempotency-Key`, `items[].product_id`, `items[].variant_id`, and a multi-product sample. Its array lacks machine-readable `minItems`/`maxItems`; the user explicitly approves the 1–20 unique-item rule.
- An authorized earlier Green QA request created exactly one test record and demonstrated `201` acceptance, `200` same-key replay with the same request ID, and `409 IDEMPOTENCY_CONFLICT` for a changed payload with the same key. See [api-green-g1-revalidation-2026-09-09.json](evidence/reference/api-green-g1-revalidation-2026-09-09.json).

## Quote/config implementation recheck

The working tree now maps root Green config fields with legacy fallback; it uses root `privacy_version`; it sends canonical `items[]`; it normalizes the approved Vietnamese mobile inputs; it uses the official consent direction without collecting `province_code`; it applies a 15-second request timeout without automatic re-submission; and it derives a session key from canonical content so a presentation-order change does not alter the wire payload or key.

## Local verification

| Command | Exit | Actual |
| --- | ---: | --- |
| `npm run typecheck` | 0 | Completed without diagnostics. |
| `npm run lint` | 0 | Completed without warnings. |
| `npm run test` | 0 | 12 test files and 50 tests passed. |
| `npm run build:backend-preview` | 0 | ZMP backend-preview build completed. |

## Gate boundary

The user moves D06 and D08 measurement/compatibility and G2 visual-baseline work to UIUX-G2, and real Android/iPhone Zalo evidence to UIUX-G5. They remain mandatory for their stated gates and final acceptance; this revalidation does not claim pixel match, complete app coverage, device QA, production authorization, or a deployment.
