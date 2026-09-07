# G2 GATE REPORT

## GATE G2 — STATUS: DONE

### Gate entry check

- [G1 report](../g1/G1_GATE_REPORT.md) records `GATE G1 — STATUS: DONE`.
- `SCOPE_LOCK.md`, G0 OpenAPI/DTO/error matrix, and the empty DEV fixture were re-read before implementation.
- The existing typed public API/config boundary and three-item bottom navigation were verified. `typecheck`, `lint`, `test`, and `build` were re-run successfully before G2 changes.

### Scope completed

- Replaced the G1 catalogue placeholders with real, typed catalogue pages: Home, domain/category navigation, product list, search, dynamic filter/sort sheet, detail, gallery, related products, and unavailable deep-link handling.
- Home now has product search entry, canonical domains, conditional API-supplied category/featured/recent sections, skeleton, safe empty/error/retry states, and touch pull-to-refresh.
- Product lists use a two-column mobile grid, lazy public image rendering with fallback, maximum two-line names, optional model/primary code, the fixed non-numeric `Còn hàng` chip, opaque cursor paging, infinite-load trigger, cache deduplication, and route/scroll return state.
- Search debounces at 300ms and sends trimmed input through the G0 boundary. It communicates the server-authoritative no-case/no-diacritic and exact-model/item-code ranking contract; it does not re-sort cursor pages on the client.
- The ZaUI bottom sheet fetches dynamic facets through `GET /facets`, applies/resets category/power source/feature/spec filters, shows filter count, and supports the three G0 sort values.
- Detail/gallery render only meaningful public optional DTO values. Media supports public HTTPS image fallback, lazy image loading, gallery swipe/zoom controls, and document/video WebView opening. Variant media/attributes, bundle, compatibility, and related sections are hidden when absent.
- A stale/unavailable detail deep link maps to the safe Product Unavailable UI. It provides a catalogue fallback and only config-supplied Hotline/OA actions when public config is present; it never exposes raw 404 data.

### Data boundary and red flags

- Runtime still uses only the G0 `DEV_CONTRACT_FIXTURE_NOT_UAT_OR_PRODUCTION` empty fixture when DEV mock mode is active. No product, SKU, barcode, spec, media, price, quantity, or UAT/Production record was added to a runtime fixture or component.
- `src/catalogue/catalogue-utils.test.ts` contains explicitly labelled **TEST-ONLY** synthetic contract values solely for unit coverage. It is not imported by runtime code, adapter data, UAT, or Production output, and contains no price, quantity, PII, supplier, source path, or production claim.
- Approved Catalogue/Data Entry records, public media mapping, and environment public config values are still absent. The running app therefore correctly presents safe empty states rather than fabricated results.

### Files changed

- Catalogue behavior/state: `src/catalogue/catalogue-utils.ts`, `src/catalogue/catalogue-session.ts`, `src/hooks/use-debounced-value.ts`, `src/hooks/use-product-results.ts`, `src/hooks/use-product-detail.ts`, `src/hooks/use-pull-to-refresh.ts`, `src/hooks/use-scroll-restoration.ts`.
- Catalogue UI/pages: `src/components/catalogue/*`, `src/pages/index.tsx`, `src/pages/category.tsx`, `src/pages/product-list.tsx`, `src/pages/search.tsx`, `src/pages/product-detail.tsx`, `src/pages/gallery.tsx`, `src/components/layout.tsx`, `src/components/app-shell.tsx`, `src/css/app.scss`.
- Boundary/test evidence: `src/state/app-context.tsx`, `src/catalogue/catalogue-utils.test.ts`, `src/services/public-api.catalogue.test.ts`, and this report.

### API / DB impact

- **API:** No server route or OpenAPI contract changed. Every read uses the existing typed `PublicApiAdapter` endpoints: `/home`, `/categories`, `/products`, `/products/{slug}`, `/products/{slug}/related`, and `/facets`. Product query serialization covers `q`, `domain`, `category`, `power_source`, repeated `feature`, `spec.<code>`, `sort`, opaque `cursor`, and `limit`.
- **DB:** None. No migration, catalogue storage, quote persistence, CRM/ERP integration, outbox, queue, worker, retry, or notification was added.

### Screen matrix

| Screen | G2 behavior with approved API data | Current empty DEV fixture behavior |
| --- | --- | --- |
| Home | Conditional categories/featured/recent sections, search entry, refresh | 3 domains and labelled empty state |
| Categories | Domain → public categories → product-list route | Domain selector and empty state |
| Products | Grid, image fallback, cursor/infinite load, filter/sort, back-state | Empty state through `getProducts` |
| Search | Debounced API search with contract ranking and filters | Suggestions, then no-result state |
| Detail/Gallery | Optional media/spec/variant/bundle/compatibility/related UI | Safe unavailable state |
| Product Unavailable | Catalogue fallback plus config-gated contact actions | Safe unavailable state, no raw server error |

### Validation and evidence

| Evidence | Result |
| --- | --- |
| `npm run typecheck` | Passed. |
| `npm run lint` | Passed with `--max-warnings=0`. |
| `npm test` | Passed: 7 files, 22 tests. G2 tests cover Home empty-section omission, canonical domains/category flow, exact model and Vietnamese diacritic normalization, filter/reset/sort, opaque cursor deduplication, return path/scroll state, optional sections, variant/family/bundle visibility, IN_STOCK-only filtering, unavailable deep link, media fallback, and 44px/pull-to-refresh mobile contract. |
| `npm run build` | Passed with `zmp build`; 543 modules transformed and `www/` produced. |
| Local mobile browser check | At 390×844, verified Home’s three domains and DEV empty-state label; Category domain controls; Search suggestions and API-backed no-result state; and the ZaUI `Lọc & sắp xếp` sheet with all three sort options. |

The build continues to emit the existing Tailwind legacy `purge`/`content` and Sass legacy JS API warnings. They are non-blocking and were not expanded beyond this gate.

### Out-of-scope confirmation

No login/account/profile, price, stock quantity, cart/checkout/order/payment, shipping/WMS, QR/NFC, offline/native app, CRM/ERP, Lead Management, credentials, outbox, queue, retry worker, dead-letter queue, notification, dashboard/export/assignment, lifecycle sync, or fake UAT/Production catalogue data was implemented. `ADR-04`, `ADR-05`, and `FR-013` remain deprecated for the current MVP.

## GATE G2 — STATUS: DONE
