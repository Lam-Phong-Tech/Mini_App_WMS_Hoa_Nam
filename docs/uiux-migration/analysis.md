# UIUX-G1 analysis

## Result

The target is a running React 18/ZMP/ZaUI catalogue application, not a blank template. Its current shell uses a ZaUI `Page`, `AnimationRoutes`, route-level lazy loading, three bottom-navigation items, public DTO/API adapters, opaque-cursor pagination, safe states, and a single-product quote flow. The baseline checks passed without source edits.

The locked Designer source is a separate React 19/Vite 8 Preview implementation. It supplies the intended visual vocabulary and PV-01 through PV-18 behavior, but it embeds local design data and assets. That data must not become target runtime data or a production fixture.

## Source-level design findings

The source-of-truth token file at the locked Designer commit defines near-white `#FAFCFC`, surface `#FFFFFF`, primary `#0C6286`, primary dark `#0C5D7D`, support blue `#5E93A7`, and Public Sans. It also defines the focus ring, semantic status colors, and five named gradients. These values differ materially from the target's current purple visual tokens, so a later UI stage needs an explicit visual migration rather than a small selector tweak.

The new header source uses a `48px 1fr 48px` grid: utility/menu action on the left, HOA NAM TOOLS brand in the center, and a 48px request action on the right. The source documents a single native-sticky topbar containing both header and normal-flow search. The target instead currently has a conventional Product Viewer header in `AppShell`, and page ownership is provided by ZaUI `Page`; scroll implementation must be measured rather than copied from the Designer's window-scrolling model.

The Home source describes a white hero with the two-line message “Tìm đúng dụng cụ.” / “Làm tốt công việc.”, gradient headline, CTA, curved decoration, and a design asset. The target already has home/search/domain/category/product areas, but its hero copy, gradient and asset behavior differ. Any replacement must render image/media only from approved public DTO/config data; the Designer hero image is not authorized runtime data.

The Designer has a two-column mobile and nominal four-column desktop catalogue, draft-then-apply filters, a 220ms IME-aware search behavior, progressive display, rich image viewer, and library features. The target already has two-column mobile cards, public API filtering, 300ms debounce, safe return paths, cursor pagination and route-based gallery. “Show four then add four” is source-local progressive rendering and is not interchangeable with the target's opaque API cursor contract.

## Target behavior relevant to the migration

- `src/routes.ts` and `src/components/layout.tsx` expose PV-01 to PV-12-related routes: launch, home, category, product list, search, filters, detail, gallery, quote, contact and system states. There are no routes for PV-13 through PV-18.
- `src/types/public-api.ts`, `src/services/public-api.ts`, and `docs/g0/openapi.v1.yaml` define a single-product quote request: `product_id`, optional `variant_id`, name, phone, optional province/note, consent and `privacy_version`; a successful response is a single `request_id` with status `RECEIVED`.
- The current quote client validates a Vietnamese mobile pattern, limits notes to 500 characters, uses an 8-second timeout and makes one idempotent retry. The Designer request source describes a potentially multi-product payload and a different validation/retry model.
- Contact is intended to be public-config driven. No value from Designer source may be hard-coded into target runtime contact settings.
- Target browser support includes Android 5, iOS 9.3, Edge 15, Safari 9.1, Chrome 49, Firefox 31 and Samsung 5. New animation, smooth-scroll or virtual-list dependencies need compatibility proof before any install.

## Evidence boundary

The live URL returned HTTP 200 to a HEAD request. This verifies transport reachability only. No browser screenshot, DOM geometry, console/network capture, live route state, DPR, device, font loading, or scroll/animation moment was captured. The Designer documents contain their own historical QA statements; those statements were read as reference, not re-run or adopted as target evidence.

## Baseline command results

| Command | Actual | Status |
| --- | --- | --- |
| `npm run typecheck` | `tsc --noEmit -p tsconfig.json` completed | PASS |
| `npm run lint` | `eslint src --max-warnings=0` completed | PASS |
| `npm run test` | 12 test files, 47 tests passed | PASS |
| `npm run build` | `npx --yes zmp-cli build` completed | PASS |

These checks demonstrate the current target build is healthy. They do not validate the intended visual migration or an operational backend/device.

## Scope boundary retained

No runtime source, dependency, API contract, configuration value, Designer repository file, user-local environment file, or data fixture was changed in UIUX-G1. The proposed work remains public product discovery and consultation only: no price, stock quantity, cart, checkout, payment, shipping, login, QR/NFC, CRM, WMS, ERP or fabricated operational data.
