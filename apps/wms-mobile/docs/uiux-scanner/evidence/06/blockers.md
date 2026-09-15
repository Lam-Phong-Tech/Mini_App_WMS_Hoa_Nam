# Deferred validation — Prompt 06 Tra cứu

Gate 06 has no active blocker under the user-approved scope.

Deferred BE validation, to be reopened after backend delivery:

1. Per-location balance for an item/SKU: warehouse/location identity plus
   `total_qty`, `available_qty`, `reserved_qty` and `unavailable_qty` with
   field definitions.
2. Item transaction history: type, time, reference document, quantity delta,
   warehouse/location, status and pagination.
3. Optional NFC enrichment: `sku.name`, active-warranty fields and last-issue
   fields. Existing UI shows `—` when BE returns null; it never infers values.
