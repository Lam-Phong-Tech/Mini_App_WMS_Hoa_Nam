# G1 GATE REPORT

## GATE G1 — STATUS: DONE

### Scope completed

- Replaced the blank template’s main screen with a public Zalo Mini App shell built on the existing React, TypeScript, Vite, ZMP SDK, and ZaUI stack.
- Added launch/bootstrap, Home, Category, Product List, Search, Filter/Sort, Product Detail, Gallery, Quote Request, Contact, and System States routes. The sole bottom navigation is `Trang chủ`, `Danh mục`, and `Liên hệ`.
- Added a typed public-v1 client and adapter boundary for all G0 endpoints, including a typed `Idempotency-Key` quote POST boundary. No API server, quote form, or persistence implementation was added in G1.
- Added runtime config handling for public API base URL, application version/environment, DEV mock selection, and public config values. The empty DEV fixture is disabled unconditionally in UAT and Production.
- Added safe loading, empty, no-network, API-error, rate-limit, maintenance, unavailable, and update-required UI states. Safe messages replace raw upstream errors.
- Applied the prototype’s mobile-first purple/neutral visual direction, responsive typography, safe text wrapping, safe-area spacing, and 44px action targets. No prototype product/demo media or catalogue values were reused.

### Files changed

- Application shell/routes/state: `src/components/app-shell.tsx`, `src/components/layout.tsx`, `src/components/system-state-panel.tsx`, `src/pages/index.tsx`, `src/pages/launch.tsx`, `src/pages/foundation-screen.tsx`, `src/routes.ts`, `src/state/app-context.tsx`, `src/state/system-state.ts`.
- Public-contract boundary: `src/types/public-api.ts`, `src/services/api-client.ts`, `src/services/public-api.ts`, `src/config/runtime.ts`, `src/vite-env.d.ts`.
- Presentation/entry: `src/css/app.scss`, `src/app.ts`, `index.html`.
- Tooling/tests: `package.json`, `package-lock.json`, `eslint.config.mjs`, `vitest.config.mts`, `src/routes.test.ts`, `src/config/runtime.test.ts`, `src/services/api-client.test.ts`, `src/services/public-api.test.ts`, `src/state/system-state.test.ts`, `README.md`.

### API / DB impact

- **API:** No server endpoint was implemented or changed. The Mini App client now consumes only the G0 public-v1 OpenAPI boundary: config/home/categories/products/detail/related/facets/health and the future minimal quote POST. The DEV adapter returns the approved empty contract shape and returns unavailable errors instead of fabricating a product or quote acknowledgement.
- **DB:** No schema, migration, storage, CRM/ERP integration, queue, worker, or downstream process was added.
- **Config:** Only public build-key names and public config DTO fields are referenced. No `.env` value, secret, operational hotline/OA value, or credential was read or committed.

### Screens and foundation behavior

| Screen group | Evidence |
| --- | --- |
| Launch and bootstrap | `/` loads config/home through `AppProvider` and proceeds to `/home` only when the safe bootstrap state allows it. |
| Home and navigation | `/home` presents the Product Viewer shell and canonical domains; three-item bottom navigation routes to Home, Categories, and Contact. |
| Catalogue route boundary | `/categories`, `/products`, `/search`, `/filters`, `/products/:slug`, and `/products/:slug/gallery` are addressable but deliberately show safe foundation/empty states until G2 and approved catalogue data. |
| Conversion/contact boundary | `/products/:slug/quote` and `/contact` are addressable. No quote PII form, call/OA action, or operational value is fabricated; G3 owns the conversion UI. |
| System states | `/system` and the bootstrap boundary use safe loading, empty, no-network, generic-error, rate-limit, maintenance, unavailable, and update-required handling. |

### Validation evidence

| Command | Result |
| --- | --- |
| `npm run typecheck` | Passed (`tsc --noEmit -p tsconfig.json`). |
| `npm run lint` | Passed (`eslint src --max-warnings=0`). |
| `npm test` | Passed: 5 files, 11 tests covering routing/navigation, runtime config fallback, public adapter/envelope, and system-state classification. |
| `npm run build` | Passed (`zmp build`, ZMP CLI 4.0.3; 524 modules transformed; production `www/` emitted). |

The successful build emitted pre-existing ecosystem warnings from Tailwind’s legacy `purge`/`content` configuration and Sass’s legacy JS API; neither blocked the build and neither was expanded in this scope.

### Open questions / red flags

1. No approved Catalogue/Data Entry source, publication mapping, media manifest, or UAT/Production public dataset exists in the checkout. G2 must remain empty-state-safe until these are approved.
2. No approved environment-specific public config values exist for hotline, OA, support hours, privacy URL, maintenance, or feature flags. Contact and conversion actions must wait for config rather than hard-code values.
3. No minimal quote-store technology, retention/deletion policy, consent wording, or persistence service exists. G3 cannot claim end-to-end quote acceptance until these are approved and implemented to the exact G0 schema.
4. Share/deep-link/OA SDK behavior still needs platform approval before G3.

### Out-of-scope confirmation

No login/account/profile, price, stock quantity, cart/checkout/order/payment, shipping/WMS, QR/NFC, offline/native app, CRM/ERP, Lead Management, CRM credentials, outbox, queue, retry worker, dead-letter queue, notification, dashboard/export/assignment, lifecycle synchronization, or fake UAT/Production catalogue data was implemented. The G0-deprecated SRS requirements `ADR-04`, `ADR-05`, and `FR-013` remain excluded.
