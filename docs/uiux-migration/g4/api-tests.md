# UIUX-G4 API verification — D13

**Recorded:** 2026-09-10T11:27:41.5831816+07:00

Green/DEV-TEST was queried read-only against the authorized public API.

| Case | Result |
| --- | --- |
| Two public UUID IDs | `200`, items returned in request order and no `page_info` |
| Duplicate + missing UUID | first occurrence retained; one authoritative `missing_ids` value |
| `ids[]` mixed with `limit` | `400 INVALID_QUERY`, `errors.conflicting: ["limit"]` |
| Invalid UUID | `400 INVALID_QUERY`, no `missing_ids` |

The app adapter normalizes/deduplicates IDs before each request, uses a maximum
batch of 50, and treats every failed response as non-destructive: persisted IDs
remain for later retry. It removes an ID only from a successful `missing_ids`
response. `PREORDER` is an item response and is retained rather than deleted.

There was no quote POST, config write, sale/CRM write, fixture publication or
Customer/Production operation.
