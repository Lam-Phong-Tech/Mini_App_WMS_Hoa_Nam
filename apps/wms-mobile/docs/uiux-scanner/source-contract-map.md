# Source and API contract map — Prompt 00

## Evidence labels

- **SOURCE**: endpoint is currently referenced by `apps/wms-mobile` source.
- **BE-CONFIRMED**: contract supplied by BE in the user-provided response on 2026-09-10; it has not been independently exercised during Prompt 00.
- **BA-BLOCKED**: no endpoint is requested yet because the business aggregate/rule itself is undecided.

## Existing App calls

| Domain | Endpoint / source | Evidence | UI rule |
| --- | --- | --- | --- |
| Auth | `POST /api/v1/auth/login`, `POST /api/v1/auth/refresh`, `POST /api/v1/auth/logout`, `GET /api/v1/auth/me` | SOURCE: `services/wms/auth.ts`, `queries.ts` | Session controls AppShell login vs tabs. |
| Inbound | `GET /mini-app/inbound-documents`, `GET /{id}`, `POST /inbound/resolve-code`, `POST /inbound/record` | SOURCE | Scanner records then waits for Web; it must not expose Post. |
| Outbound | corresponding `/mini-app/outbound*` read/resolve/record paths | SOURCE | Same wait-for-Web rule. |
| Warranty | case list/detail/events/attachments, resolve/create/status/attachment writes | SOURCE | Status update must retain version/idempotency behavior. |
| Component issue | `/api/v1/component-issue-documents`, `/{id}/scan`, `/{id}/post`, `resolve-code` | SOURCE | Narrow exception: direct Post after Create → Scan for eligible warranty case. |
| NFC | `/mini-app/nfc/*`, `/mini-app/items/{id}/nfc*`, `/mini-app/nfc-tags/*` | SOURCE | Preserve reservation and read-back confirmation. |
| Inventory/history | `/api/v1/inventory/balances`, `/api/v1/scan/events`, inventory trace | SOURCE declaration | Read schema/permission must be honored; no client-calculated stock. |

## BE response applied to D03

| Feature | Confirmed contract | Required FE behavior |
| --- | --- | --- |
| Current profile | `GET /api/v1/auth/me` returns `user_id`, `display_name`, `email`, `phone`, `roles`, `permissions`, `warehouse_scope_ids`, `version` | Do not expect `id` or `avatar_url`; source adapter must map `user_id` before the UI can rely on it. |
| Edit profile | `PATCH /api/v1/auth/me`; `If-Match: <version>`; body only `display_name`, `phone` | Handle `PROFILE_FIELD_NOT_EDITABLE`, `PROFILE_EMPTY_UPDATE`, `INVALID_VERSION`, `412 STALE_VERSION`; response is updated `me` plus ETag. |
| Change password | `POST /api/v1/auth/change-password`; current/new/confirmation password | On success clear local session and return to login: BE revokes every session including current. Handle `401 CREDENTIALS_CHANGED`. |
| Sessions | `GET /api/v1/auth/sessions?page&per_page`; `DELETE /api/v1/auth/sessions/{id}` | Current logout remains `/auth/logout`. Revoke is not immediate for an unexpired access token; `already_revoked` remains successful. |
| Notifications | `GET /api/v1/notifications?page&per_page&unread&severity`; unread-count; detail; PATCH read; POST read-all | Path has no `/mini-app`; construct link from `event_key`, `subject_type`, `subject_id`, not old proposed names. No normal document approval action in App. |
| Inbound/outbound attachments | `GET/POST /api/v1/mini-app/{inbound|outbound}-documents/{id}/attachments`; `GET /mini-app/document-attachments/{attachmentId}/download` | Only make real upload/view after client write policy is explicitly expanded. |
| Warranty history | `GET /mini-app/warranty-cases/{id}/events?page&per_page` | Respect BE pagination/meta and case access permission. |
| NFC audit | `GET /mini-app/nfc-tags/{physicalCodeId}/events` | Requires `physical_code.assign_rfid` or `inventory.trace`; map action values to Vietnamese labels. |
| Scan history | `GET /api/v1/scan/events?mine=1&from&to&entity_type&scan_batch_id` | Requires `inventory.view`; never pass `user_id`; fields are `id`, `created_at`, `evidence_source`, `result_status`, `resolved_object_type`, `resolved_object_id`, `scan_batch_id`. |

## Intentionally not implemented / not declared ready

| Feature | Status | Reason |
| --- | --- | --- |
| Shift start/end/history | BA-BLOCKED | No shift data aggregate/rules: concurrent shifts, overdue close and warehouse relation are undecided. |
| My work queue | BA-BLOCKED | Documents/cases have creator but no responsible assignee; “my work” cannot be inferred honestly. |
| Warranty handover | BA-BLOCKED | Needs same shared assignee model, eligible transitions and role rules as work queue. |
| Account recovery | BA-BLOCKED | Verification channel and abuse/rate policy are not decided. |
| Component location write | BA-BLOCKED | No confirmed location schema/action policy; do not turn lookup into inventory movement. |

## Cross-cutting rules

1. BE scopes every API to the signed-in user; client must not send `user_id` to widen a query.
2. `Idempotency-Key` and `If-Match` are endpoint-specific, not universal headers. Existing `writeGate.ts` remains authoritative until a separately approved change expands it.
3. List screens retain prior good pages when a later page fails; generation/case checks prevent stale response merging.
4. A fixture can prove a presentation state only. It cannot prove API, RBAC, stock, camera or NFC behavior.
