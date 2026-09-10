# UIUX-G4 contract implementation audit — BLOCKED

**Recorded:** 2026-09-10T00:33:56.0941164+07:00

## Read-only Green verification

The public Green OpenAPI document lists these catalogue reads only:

- `GET /api/v1/public/products` with `q`, `domain`, `category`,
  `power_source`, `feature`, `sort`, `cursor`, and `limit`.
- `GET /api/v1/public/products/{slug}`.

There is no public product-ID lookup path and no `product_id`/`ids[]` query
parameter. A read-only probe selected a published catalogue record, then sent
its public UUID to `GET /products?q=<UUID>&limit=5`; the response contained no
matching item. The raw result details are recorded in
`evidence/g4/product-id-rehydration-check.json` without request PII.

## Why this blocks PV-13 and PV-14

D04 requires recent and saved lists to persist only stable product IDs. It
also requires the app to rehydrate those IDs from the current public DTO and
not expose stale metadata. The current public contract can fetch a product by
slug, but a persisted ID deliberately stores neither slug nor catalogue
snapshot. Therefore, on a fresh app session, the target cannot truthfully
recover a saved/recent product from its permitted ID-only storage.

The implementation will not use a cached slug/name/media snapshot, persist an
extra slug alongside the ID, scan the whole catalogue, or treat the generic
text query as an ID contract. Each option would violate the approved storage
or API boundary.

## Required decision

Provide and authorize one authoritative public Green contract, for example:

1. `GET /api/v1/public/products/{product_id}` with an unambiguous ID route;
   or
2. `GET /api/v1/public/products?ids[]=…` (or an equivalently documented batch
   parameter), returning only currently public products; or
3. an explicit change to D04 that permits a defined, non-PII persisted lookup
   key and specifies its stale-data behavior.

The response must be a current public product DTO and must make an unavailable
ID distinguishable from a merely un-loaded page. Once this is supplied, G4 can
resume from its existing valid G1–G3 lineage.

No quote POST, contact handoff, local-storage migration, fixture publication,
Green write, Customer/Production operation, deployment, push or merge occurred
in this audit.
