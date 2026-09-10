# API and data impact — UIUX-G1

## Current contract observed

The target client uses `/api/v1/public` through `HttpPublicApiAdapter`. Its read boundaries cover config, home, categories, products, product detail, related products, facets and health. List pagination is cursor-based and opaque. Product rendering is deliberately constrained to public DTO fields; mapper code removes private/source/price/stock-like material.

The current quote request is a single-product operation. Its input is `product_id`, optional `variant_id`, `full_name`, `phone`, optional `province_code`, optional `note`, mandatory `consent: true`, and `privacy_version`. Its success data is only `request_id` and `status: RECEIVED`. The client supplies one idempotency key per form and retries a network/unavailable failure once with the same key.

## No change made in this gate

| Area | UIUX-G1 result |
| --- | --- |
| API endpoint/schema/version | No change |
| Backend/database/migration | No change |
| DTO mapping | No change |
| Runtime configuration | No change |
| Product/asset fixture | No change |
| Contact, hotline or OA values | No value added or copied |
| PII storage/logging | No change |

## Required decision before an API-affecting implementation

The Design Preview's multi-product `productIds[]` request cannot be projected onto the target's single-product request safely. Any multi-product scope requires an authoritative endpoint, complete request/response schema, error/idempotency behavior, backend ownership and explicit authorization. The app must not submit one request per product, discard selected products, or invent a response aggregation.

The source's local product data, sample images, contact values and status records remain reference-only. A comparison fixture must be separately approved, labelled non-production, kept outside runtime UAT/production data paths, and include asset use authorization.

## User-supplied BE direction after the first gate record

The user supplied a BE instruction whose SHA-256 is recorded in `evidence/reference/user-input-2026-09-08.json`. It claims that quote contract `1.1.0` retains `POST /api/v1/public/quote-requests` and adds a multi-product `items` request with 1–20 unique products; it also states an optional requested `quantity` of 1–9999. That quantity must stay a consultation-request detail only: it must not expose stock, reserve inventory, become a cart, or imply checkout/payment.

The instruction describes `201` for a newly accepted request, `200` for same-key replay, line-addressable `422` validation errors, and the error codes needed by the client. It also says the legacy one-product app does not need a server-side change. The precise OpenAPI artifact, sample bundle, and reachable DEV config endpoint referenced by that instruction are not present in this checkout; `GET http://localhost:8080/api/v1/public/config` was unavailable during the read-only check. Therefore the instruction is decision evidence, not a verified runtime contract.

There are three implementation-critical gaps:

- The `items[]` JSON example does not show where `variant_id` belongs. Use the authoritative OpenAPI schema; do not infer it.
- The earlier user decision says product display order is normalized for idempotency; the new BE instruction says changing item order creates a new key. This is a direct conflict and needs one final rule.
- `privacy_version` must no longer reuse `config_version`, but the exact config shape conflicts between a root field and an `appConfig.privacy.version` example. The config schema and approved consent copy remain required.

## Implementation guardrails for later stages

- Preserve opaque server cursor pagination and query serialization.
- Keep public DTO filtering; never surface price, stock quantity, barcode, supplier, WMS/CRM/ERP or source metadata.
- Keep consent and privacy data only where approved by the authoritative contract.
- Treat PV-17 as same-session display only if explicitly approved; never call it order history or tracking without a separate server contract.
- Keep contacts config-driven and gracefully unavailable when config is absent.

## UIUX-G1 revalidation — 2026-09-09

The preceding sections describe the original G1 observation and are retained as historical evidence. They are superseded for Green/DEV-TEST by [g1-revalidation.md](g1-revalidation.md) and [api-green-g1-revalidation-2026-09-09.json](evidence/reference/api-green-g1-revalidation-2026-09-09.json).

The user authorizes only the Green public API/config/media for UI integration testing. Green now exposes usable domain and availability values across 933 checked public products, root `privacy_policy_url`/`privacy_version`, structured contact/support configuration, and the quote v1.1 OpenAPI. The authorized runtime test proves a two-item request with an item `variant_id`, same-key replay and changed-payload conflict.

The target quote/config adapter is revalidated as a canonical `items[]` client. It does not collect `province_code`; it normalizes presentation order before fingerprint/key/wire payload; it uses the separate privacy version and the approved consent copy; it maintains a 15-second transport timeout with customer-initiated retry. This is Green/DEV-TEST scope only, not Customer/Production authorization.
