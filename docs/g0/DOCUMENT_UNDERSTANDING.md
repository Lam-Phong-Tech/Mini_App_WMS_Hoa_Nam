# DOCUMENT UNDERSTANDING — G0

## Sources read and repository facts

| Source | Finding used for G0 |
| --- | --- |
| `SRS_Zalo_MiniApp_Product_Viewer_Hoa_Nam_v1.0_2026-08-28.docx` | Full text and 26 tables were extracted and reviewed. Its embedded architecture diagram was visually reviewed. The document renderer could not run because LibreOffice is unavailable on this host. |
| `Hoa_Nam_Zalo_Mini_App_UIUX_Demo_mvp.html` | Reviewed as a visual/content reference. Its bundled UI defines mobile-first catalogue screens, three display domains, two-column cards, dynamic facets, contact/system states, and 12 embedded demo records. It is not a data source. |
| Embedded SRS architecture diagram | Confirms Catalogue/Data Entry -> Public Catalogue API/BFF -> Mini App plus an obsolete Lead/CRM/outbox/queue branch. No separate diagram file is present in the checkout. |
| Repository source, `package.json`, lockfile, configs, README, and tracked files | Confirmed Zalo Mini App React + TypeScript + Vite + ZMP SDK + ZaUI. The current app is a near-blank single-route template; no backend, OpenAPI, schema, catalogue source, or existing API contract is present. `.env` existence only was checked; its values were not read. |
| `implementation-prompts/01`–`05` | Used only to map gates. This run follows Prompt 01 and does not begin G1–G4. |

## Locked scope summary

The MVP is a public Product Viewer. It covers public catalogue discovery and conversion: Home, the three canonical domains, category/list/search/filter/sort/detail, optional variants/media/related content, share/deep link, hotline/OA, and the minimal quote acknowledgement. There is no login, ecommerce, price, stock quantity, or CRM/ERP workflow.

Public reads apply this eligibility predicate at the API boundary:

`publish_status = PUBLISHED AND stock_status = IN_STOCK`

Only the non-numeric availability label may be shown. A deep link to an ineligible product is presented by the client as Product Unavailable without exposing internal state.

## Screen baseline

The SRS and prototype align on a mobile-first Zalo experience, bottom navigation limited to Trang chủ/Danh mục/Liên hệ, two-column product cards, and a sticky quote CTA on detail. The planned screen map is:

- Launch/bootstrap and safe system states.
- Home, category browser, listing, search, and filter/sort bottom sheet.
- Product detail, gallery, optional variant/package/compatibility/media/related sections.
- Quote request and contact (hotline/OA/privacy).

Optional Home and detail sections are omitted when the API returns no public content. The prototype intentionally demonstrates empty/no-network/loading states; those remain required later, but are not implemented in G0.

## API and persistence contract direction

`docs/g0/openapi.v1.yaml` is the public API authority for v1. It defines the requested config, home, category, product, related, facets, version, and minimal quote endpoints using one response envelope:

`success`, `message`, `data`, `meta`, `error_code`, `errors`.

The quote table has exactly the scoped fields. It stores no CRM identifier, queue job, retry count, synchronization state, notification recipient, analytics payload, deep link, or other downstream field. The response-only `RECEIVED` acknowledgement is not a persisted lifecycle/status column.

## Data-source position

The SRS references a 497-model Power Tools classification, Power Tools/Accessories PDF, and Hand Tools PDF, but none is in the workspace. The SRS itself records missing SKU/spec/media readiness and requires Data Entry quality gates. Therefore G0 supplies an empty DEV-only contract fixture and adapter behavior rather than inventing products, codes, specs, images, SKU, barcode, phone, or UAT/Production data.

## Gaps and conflicts

1. No approved catalogue feed, publication read model, media manifest, product IDs, variant mappings, public config values, or quote persistence service is available.
2. The prototype has 12 embedded sample records with base64 images and catalogue-source strings. Reusing them would violate the data boundary.
3. The SRS specifies CRM/ERP, outbox, queue, retries, notifications, and Lead lifecycle. The prompt explicitly deprecates all of these for the current MVP.
4. The SRS mentions QR as a possible platform entry point while the prompt excludes QR/NFC product features. External Zalo entry is not a Mini App QR feature.
5. The SRS's displayed taxonomy labels must be mapped to stable codes and signed off by BA/Data Entry before catalogue import.

Decisions for every conflict are recorded in `docs/g0/SCOPE_CONFLICT_MATRIX.md`; all later work is gated by `SCOPE_LOCK.md`.
