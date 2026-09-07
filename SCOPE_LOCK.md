## IN SCOPE

- Public Zalo Mini App Product Viewer: no Hoa Nam login, registration, profile, account guard, or profile-permission request.
- Home; the three canonical domains `POWER_TOOLS`, `HAND_TOOLS`, and `ACCESSORIES`; category navigation; product listing; search; dynamic filter/sort; product detail; and system states.
- Public, approved product content only. A record is eligible for every public read response only when its internal state is `PUBLISHED` and its approved public availability is `IN_STOCK` or `PREORDER`. The UI may show only the non-numeric labels “Còn hàng” or “Đặt trước”; it must never show stock quantity or an internal stock state.
- Variant, media, document/video, bundle, compatibility, and related-product presentation only when an approved public DTO supplies them. Missing optional content is hidden.
- Share/deep link, hotline, and Zalo OA using values returned by public config; no operational values are hard-coded into the Mini App.
- Minimal quote/pre-order request only: Mini App -> `POST /api/v1/public/quote-requests` -> server-side validation of an eligible `IN_STOCK` or `PREORDER` product -> minimal durable record -> response `{ request_id, status: "RECEIVED" }` -> stop. `PREORDER` changes customer-facing wording only; the quote persistence schema is unchanged and limited to the fields stated in `docs/g0/PUBLIC_DTO_ERROR_CONFIG_MATRIX.md`.
- DEV-only, clearly labelled empty/contract fixtures when approved catalogue data is absent. They are never UAT or Production data.

## OUT OF SCOPE

- Prices; any inventory quantity or warehouse/location data; cart; checkout; order; payment; order history/tracking; shipping; WMS.
- QR/NFC scanning or generated QR functionality, offline catalogue, native Android/iOS apps, user account/profile/authentication, or Mini App catalogue editing.
- CRM, ERP, Lead Management, CRM credentials, sales assignment, lead lifecycle, outbox, queue, retry worker, dead-letter queue, notifications/email/SMS, dashboard, export, or lifecycle synchronization.
- Direct Mini App access to a catalogue database, internal source references, supplier data, internal notes, raw logs, or secrets.
- Creating or inferring SKU, barcode, specification, media, product, or UAT/Production catalogue data.

## DEPRECATED SRS REQUIREMENTS

- `ADR-04` (CRM/ERP as Lead system of record) is **DEPRECATED FOR CURRENT MVP**.
- `ADR-05` (outbox + queue + retry for CRM/notification) is **DEPRECATED FOR CURRENT MVP**.
- `FR-013` (Lead persistence plus CRM/ERP synchronization, retry, dead-letter, and alerting) is **DEPRECATED FOR CURRENT MVP**.
- All SRS passages, diagram nodes, environment keys, UAT cases, handover items, and acceptance criteria concerning CRM/ERP, Lead Management, outbox, queue, retry, dead-letter, alerts, notification, sales assignment, dashboard, export, or lifecycle sync are **DEPRECATED FOR CURRENT MVP**.
- The only retained part of the former Lead flow is the isolated, minimal quote-request persistence and idempotent acknowledgement described in `IN SCOPE`; it has no downstream action or persisted lifecycle status.

## OPEN QUESTIONS

- Which Catalogue/Data Entry source and approved publication snapshot will supply each public product, variant, media asset, taxonomy mapping, and compatibility relation?
- Which proposed category codes in `docs/g0/REQUIREMENT_MAPPING_G0_G4.md` are approved by BA/Data Entry, and what are the final category labels/icons/sort orders?
- What public config values and versioning policy are approved for hotline, fallback hotline, OA URL, support hours, privacy URL, maintenance, and feature flags in each environment?
- What persistence technology and retention/deletion policy will hold the minimal quote table, and who approves its privacy wording/version?
- What deep-link format and Zalo SDK fallback are approved for product/variant sharing and OA opening?
- Which published products/variants are approved for public `PREORDER`, and what manual business follow-up process and consent wording are approved? This decision must not add a CRM, assignment, lifecycle, notification, or automated callback system.
- Is a separate architecture attachment expected beyond the diagram embedded in the SRS? No separate diagram file was present in this checkout.

## RED FLAGS

- No approved Catalogue/Data Entry files, media manifest, schema, API, or database implementation exist in the checkout. Product UAT/Production readiness cannot be claimed.
- The prototype embeds 12 demo product records, base64 media, and catalogue-source strings. It is a UI/UX reference only and must not be promoted to runtime, fixture, UAT, or Production data.
- Current source is an almost blank ZMP React/TypeScript/Vite/ZaUI template with a single “Hello world” route and a hard-coded component-library app ID; it has no API boundary, public config client, schema, or tests.
- `.env` exists but its content was intentionally not opened, copied, or reported. Any existing value is unverified and must not be treated as approved configuration.
- The SRS architecture and FR-013 conflict with this scope lock by specifying Lead API -> CRM/ERP -> outbox/queue/retry/notification. Those parts are deprecated, not deferred implementation work in this MVP.
