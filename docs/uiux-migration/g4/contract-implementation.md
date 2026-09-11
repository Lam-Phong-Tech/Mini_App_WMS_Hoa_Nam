# UIUX-G4 contract implementation audit — PASS

**Completed:** 2026-09-10T14:19:23.0864237+07:00

## Public and privacy boundaries

- Contact actions use only the current public config. Missing OA is an explicit
  unavailable state; no hotline, OA URL, policy URL, media or Designer fixture
  is invented for runtime.
- The quote form uses the approved Vietnamese-mobile normalization, 1–100
  trimmed name, 1,000-character normalized note, explicit consent copy and
  current `privacy_policy_url`/`privacy_version`. Missing policy configuration
  blocks submission while keeping the RAM draft.
- `items[]` is canonicalized before fingerprinting, idempotency-key lookup and
  the request body. A request contains 1–20 unique products, never fans out,
  and has no `province_code` in this release.
- Quote draft, selection and accepted receipt are React-memory state only.
  A receipt is created only from a valid `{ request_id, status: RECEIVED }`
  backend response; deleting it from the screen never cancels a backend record.

## PV-13 / PV-14 ID-only rehydration

The D13 public list mode is the sole rehydration path:
`GET /api/v1/public/products?ids[]=…`. The adapter validates UUIDs, removes
duplicates by first occurrence, sends batches of at most 50 IDs, and does not
combine `ids[]` with pagination or catalogue filters. It keeps the saved/recent
ordering defensively even though the API returns the requested order.

Recent stores at most 30 IDs; Saved at most 100 IDs. Both persist a
schema-versioned list of normalized UUID strings only—never a slug, catalogue
snapshot, media, receipt or PII. Storage failures retain the in-memory list
and show its limitation. An ID is removed only when a successful D13 response
names it in `missing_ids`; `PREORDER`, a missing catalogue page, invalid
lookup input, network failure and rate limiting are non-destructive.

## PV-15 / PV-16 / PV-18 behavior

- FAQ stays within the approved topics: access, availability, multi-product
  request, request meaning/error, device-local library and information use.
  It makes no shipping, warranty or operating commitment.
- Product selection supports one to twenty products in one request. It can
  use Saved via D13 or current valid public Home records when Green's ordinary
  list returns unmappable `domain: null` records. This fallback does not infer
  taxonomy, copy Designer fixture data, or scan the catalogue.
- Comparison is RAM-only, limited to three products in one identical
  domain/category. At least two products are needed before a comparison table
  is shown; unavailable specifications display `Chưa có thông tin`.

## Green data condition recorded, not hidden

At G4 local QA time, Green's ordinary `/products` returned many rows with
`domain: null`, and `/products?domain=POWER_TOOLS` returned no mappable rows.
The public DTO mapper rejects those invalid taxonomy records. Current valid
Home public products and the D13 ID lookup remain usable, so the local fallback
is visible to the tester. This is a Green catalogue-data defect for backend
follow-up, not a fabricated frontend taxonomy and not a Customer/Production
claim.

No quote POST, sale/CRM write, config write, fixture publication, Customer or
Production operation occurred in this audit.
