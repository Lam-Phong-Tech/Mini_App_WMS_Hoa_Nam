# G3 GATE REPORT — Conversion MVP tối thiểu

## Gate entry

- `docs/g2/G2_GATE_REPORT.md` records `GATE G2 — STATUS: DONE`.
- `SCOPE_LOCK.md`, G0 OpenAPI, DTO/error/config matrices and the DEV fixture were re-read.
- Baseline shell, typed API/config boundary and the three-item bottom navigation remain intact.

## Scope completed

- Product detail now has a sticky primary `Yêu cầu tư vấn / Báo giá` CTA. Share and contact actions remain secondary.
- Product deep links use `/products/{slug}` and add `variant_id` when a public variant is selected. Sharing uses ZMP `openShareSheet`; device share and clipboard are safe fallbacks. No analytics or PII logging was added.
- Hotline (primary, then configured fallback) and Zalo OA are rendered only from `PublicConfigDto`; hotline is a sanitized `tel:` URI and OA opens the configured `chat_url` through ZMP WebView with an anchor fallback. No number, URL, token or operational value is hard-coded.
- Quote form keeps product/model/variant context read-only and accepts only `full_name`, `phone`, optional `province_code`, optional `note` (500 characters), consent and `privacy_version`. `source` is server-derived as `ZALO_MINI_APP` and is not accepted in the request body.
- Client validation trims values, normalizes Vietnamese phones to `+84`, validates name/phone/province/note/consent/privacy version, displays field errors, disables submission during flight and keeps one idempotency key per form instance.
- `submitQuoteWithRetry` performs one timeout/network retry with the same key. Safe handling exists for validation, unavailable product, idempotency conflict, rate limit, maintenance and upstream/network failures.
- `DevQuotePersistenceMock` is a DEV/TEST-only in-memory contract implementation with exactly the G0 quote columns, replay of the same response for an equivalent key/payload, and `IDEMPOTENCY_CONFLICT` for a changed payload. It has no status/lifecycle/downstream fields.

## Files changed for G3

- `src/services/share.ts`, `src/services/quote-service.ts`, `src/services/dev-quote-mock.ts`, `src/services/contact-config.ts`
- `src/services/share.test.ts`, `src/services/quote-service.test.ts`, `src/services/dev-quote-mock.test.ts`
- `src/components/catalogue/share-button.tsx`, `src/components/catalogue/contact-actions.tsx`, `src/components/catalogue/contact-actions.test.ts`
- `src/pages/quote-request.tsx`, `src/pages/product-detail.tsx`, `src/pages/foundation-screen.tsx`, `src/components/layout.tsx`
- `src/state/system-state.ts`, `src/state/system-state.test.ts`, `src/css/app.scss`

## API / DB impact

- **API:** No OpenAPI route or DTO change. The existing typed `POST /api/v1/public/quote-requests` boundary sends only the G0 request fields and `Idempotency-Key`; the response remains `{ request_id, status: "RECEIVED" }` in the standard envelope.
- **DB:** No production database, migration or system of record exists in this checkout. The in-memory mock is not a production persistence claim and is not wired to a fake catalogue. The runtime DEV adapter still returns the labelled empty fixture and rejects quote attempts for unavailable products.
- **Privacy:** No PII is emitted to analytics or unnecessary logs. Quote PII exists only in the explicit request/mocked record contract and is not returned in the response body.

## Screen / state matrix

| Surface | G3 behavior |
| --- | --- |
| Product detail | Sticky quote CTA, variant-aware share link, config-driven Share/Call/OA actions |
| Quote request | Read-only product context, field validation, consent, loading/double-tap guard, safe API errors, success acknowledgement |
| Unavailable detail/quote deep link | Safe unavailable panel, retry/catalogue fallback, config-gated contact actions; no raw 404 |
| Contact | Config-driven Hotline/OA and empty state when config has no approved contact |
| System states | Friendly validation/conflict/rate-limit/network/maintenance/unavailable messages |

## Validation and evidence

| Command / check | Result |
| --- | --- |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed with `--max-warnings=0` |
| `npm test` | Passed: 11 files, 36 tests |
| `npm run build` | Passed with `zmp build`; 548 modules transformed and `www/` produced |
| Quote tests | Required fields, name/phone/note/consent/privacy validation; happy path; double tap; same-key retry; network retry; rate limit |
| Idempotency tests | DEV mock replay returns one request ID; changed payload returns `IDEMPOTENCY_CONFLICT`; unavailable eligibility returns `PRODUCT_NOT_AVAILABLE` |
| Share/contact tests | Slug + variant deep link; ZMP share invocation; runtime config changes update Hotline/OA targets without rebuild |
| Mobile runtime | Local preview checked at 390×844: Home empty fixture, Contact empty state, stale product unavailable state, and stale quote route unavailable state rendered without blank/raw error |

## Red flags and production limitations

- No approved Catalogue/Data Entry snapshot, public media mapping, environment contact values, privacy-version policy, backend API, or production quote store is present. The app intentionally shows empty/unavailable states and does not fabricate UAT/Production data.
- `privacy_version` is populated from the public config version because G0 `PublicConfigDto` has no separate privacy-version field; legal approval is still open.
- `zmp start`/build emit existing Tailwind `purge`/`content` and Sass legacy API deprecation warnings; they are non-blocking.
- The browser dev preview may show existing React development warnings about spreading a `key` prop into `AppShell`; no runtime failure or raw error state was observed.

## Out-of-scope confirmation

No login/account/profile, price, stock quantity, cart/checkout/order/payment, shipping/WMS, QR/NFC, offline/native app, CRM/ERP, Lead Management, CRM credentials, outbox, queue, retry worker, dead-letter queue, notification/email/SMS, dashboard/export/assignment, lifecycle synchronization, or fake UAT/Production data was implemented. `ADR-04`, `ADR-05`, and `FR-013` remain deprecated for this MVP.

## GATE G3 — STATUS: DONE
