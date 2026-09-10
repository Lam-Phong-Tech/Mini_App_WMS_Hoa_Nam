# UIUX-G4 — BLOCKED

**Recorded:** 2026-09-10T00:33:56.0941164+07:00

UIUX-G3 has been revalidated to `PASS`, so the required predecessor lineage
was valid and G4 opened. A read-only Green/OpenAPI audit then found a blocking
contract gap: D04 permits persistence of product IDs only, but Green provides
no documented product-ID or batch-ID lookup with which to rehydrate those
records after reload.

G4 cannot continue to PV-13/PV-14 until an authoritative current-public-data
lookup contract is provided, or D04 is explicitly changed. It must not use a
cached catalogue snapshot, a persisted slug, or a whole-catalogue scan to
bypass the ID-only boundary.

See [the G4 contract audit](../g4/contract-implementation.md), [the G4
preflight](../g4/preflight.md), and [the G3 gate](UIUX-G3.md).
