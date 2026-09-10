# DEV public API read check — 2026-09-09

> Historical initial G1 check against `khohoanamfe.lptech.info.vn`. It is superseded for G1 revalidation by Green evidence at [api-green-g1-revalidation-2026-09-09.json](evidence/reference/api-green-g1-revalidation-2026-09-09.json). The older observations below are retained without alteration.

## Outcome

`https://khohoanamfe.lptech.info.vn` is a reachable HTTPS public API base. All tested GET endpoints returned a success envelope with HTTP 200 and no `Authorization` header. `GET /api/v1/public/config` and `GET /api/v1/public/health/version` both advertise contract version `1.1.0`.

No POST request was sent. Testing `POST /quote-requests` would create or rate-limit a real anonymous consultation request, so this check cannot certify the request body, `201`/`200` replay behavior, errors, persistence, or line-level error paths.

## GET endpoint results

| Endpoint | Result | Notes |
| --- | --- | --- |
| `/config` | 200 | Has contact, support hours, privacy, maintenance, flags, quote-request settings, catalogue and contract version. |
| `/health/version` | 200 | Has status, contract version, maintenance and server time. |
| `/home` | 200 | Has domains and sections. |
| `/categories` | 200 | Returned 5 category records. |
| `/products?limit=1` | 200 | Returned opaque page with an item. |
| `/products/{public-slug}` | 200 | Returned public detail, specifications, variants and images. |
| `/products/{public-slug}/related?limit=1` | 200 | Returned page with one related item. |
| `/facets` | 200 | Has domain/category/power-source/feature/spec groups. |
| `/categories?domain=POWER_TOOLS` | 200, empty | Domain filter has no matching category. |
| `/products?domain=POWER_TOOLS&limit=1` | 200, empty | Domain filter has no matching product. |
| `/products?category={known-public-category}&limit=1` | 200 | Category filter returned one item. |

The checked response metadata is preserved in [api-dev-read-check-2026-09-09.json](evidence/reference/api-dev-read-check-2026-09-09.json).

## Verified config shape

- `contract_version`: `1.1.0`.
- Privacy configuration is nested as `privacy.url` and `privacy.version` — not root `privacy_version`.
- Quote configuration gives idempotency key bounds `16..128` and `note_max_length: 1000`.
- A hotline value is present; Zalo OA URL was absent in this response. Presence does not establish business/legal approval.

## FE compatibility findings

The backend's raw product payload does **not** currently provide a non-empty `domain` or an `availability` field for the 20 public products checked. Both `/categories?domain=POWER_TOOLS` and `/products?domain=POWER_TOOLS` return empty data, although `/home` advertises that domain and category filtering returns data.

This is incompatible with the target's current `mapBackendProduct`: it requires `domain` to be one of `POWER_TOOLS`, `HAND_TOOLS`, or `ACCESSORIES`, and otherwise omits the product. Its temporary missing-availability fallback would label every product `IN_STOCK`, so it cannot truthfully render `PREORDER` without an authoritative public status field.

The public detail exposes variants as `id`, `code`, `name`, `variant_label`, `unit`, and `is_default`; the checked examples do not prove the exact `items[].variant_id` request schema. That must come from the referenced OpenAPI artifact or a non-mutating backend-provided contract fixture.

## Required backend clarifications

1. Provide an authoritative schema or patch that supplies valid domain mapping for every public product/category and supports the domain queries the API advertises.
2. Expose a public availability/status contract, including `PREORDER` semantics where applicable, or explicitly remove that UI state from the approved backend contract.
3. Supply the v1.1 OpenAPI/samples, specifically the exact position and validation of `variant_id` in `items[]`, before changing the quote client.
4. Resolve whether changing `items` display order creates a new idempotency key (BE instruction) or is normalized as the same content (earlier user rule).
5. Finalize approved consent wording. FE can read `privacy.version` and `privacy.url`, but the current response does not prove legal approval of the proposed copy.
