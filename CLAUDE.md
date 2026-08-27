# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

This is a **Zalo Mini App** (a mini-app that runs inside the Zalo messenger app) built from the "ZaUI Bistro" template — a food/coffee ordering UI (menu browsing, product options, cart, checkout, order history). App title/config: `app-config.json` (title "BachHoa"). Vietnamese is the UI language throughout (see `src/tokens.js` text strings).

## Commands

- `npm install` — install dependencies
- `npm start` (runs `zmp start`) — start the Zalo Mini App dev server, served at `localhost:3000`. Requires the [Zalo Mini App CLI](https://mini.zalo.me/docs/dev-tools/cli/intro/) to be installed globally.
- `npm run login` (runs `zmp login`) — authenticate the ZMP CLI
- `npm run deploy` (runs `zmp deploy`) — deploy the mini app to Zalo using the App ID configured for the project

There is no configured lint, typecheck, or test script in `package.json`. TypeScript is checked via the editor/build (`tsc --noEmit` is implied by `tsconfig.json`'s `noEmit: true`); there is no standalone `npm run typecheck` — run `npx tsc --noEmit` directly if you need to check types.

Build tooling is Vite (`vite.config.mts`) with the `zmp-vite-plugin` and `@vitejs/plugin-react` plugins; path alias `@` maps to `src/`.

## Architecture

### Entry point is not the router (currently)

`src/index.ts` mounts `MiniApp` from `src/app.tsx` as the app root. **`src/app.tsx` currently does not render `router.tsx`/the page tree** — it's a standalone tracking screen that POSTs a `miniapp-open` event (with `tracking_id`/`msg_id` query params) to an external ngrok endpoint and shows a loading/success/error state. `src/router.tsx` defines the full page tree (Home, Menu, Order, Profile, Product Detail, Checkout, Select Location, Order Success, Order Detail) via `createBrowserRouter`, wrapped in `Layout`, but is not currently wired into `index.ts`/`app.tsx`. Check which mode is intended before assuming routed pages are reachable at runtime.

### Routing & Layout

- `src/router.tsx` — route table; each route can set a `handle` object consumed by `Layout` to control chrome: `title`, `back`, `whiteBackground`, `hideFooter`, `hideCart`, `hideHeader`, `headerPosition`.
- `src/components/layout/layout.tsx` — reads the current route's `handle` via `useMatches()` and conditionally renders `Header`/`Footer`/`CartFloatButton` around the `Outlet`.
- Base path is environment-aware: `src/utils/zma.ts#getBasePath()` returns `/zapps/{APP_ID}` in production/testing envs and `window.BASE_PATH` (or empty) in local dev.

### State management

- **Zustand** (`src/stores/cart.store.tsx`) holds cart state (client-only, in-memory). Cart item identity is derived, not random: `generateCartItemId()` builds an id from `productId` + sorted selected variants + note, so adding "the same" product+variant+note combo merges quantities instead of creating a duplicate line. Any change to `CartItem`/`SelectedVariant` shape must be reflected in this id-generation logic and in `calculateTotals()`.
- **TanStack Query** (`src/lib/query-client.ts`, `src/lib/react-query-provider.tsx`) holds server state. `QueryClientProvider` (custom wrapper, not the TanStack one) is a singleton via `getInstance()`. Query/mutation errors are centrally routed through `ReactQueryProvider`, which shows a `zmp-ui` snackbar: offline errors get a generic network-error message, `APIError` instances surface `error.message`, others are swallowed. Retries stop after `MAX_RETRIES` (3) or immediately on HTTP 401.

### Services layer (mock-backed, designed for API swap-in)

Each domain (`product`, `category`, `order`) under `src/services/<domain>/` follows the same three-file split:
- `<domain>.api.ts` — the actual data-fetching functions (currently reading from `<domain>.mock.ts` in-memory arrays instead of calling a real backend)
- `<domain>.mock.ts` — mock/fixture data
- `<domain>.queries.ts` / `<domain>.mutations.ts` — TanStack Query hooks (`useQuery`/`useMutation`) that wrap the `.api.ts` functions, with query keys sourced from `src/constants/api.ts`

To connect a real backend, replace the bodies of the functions in `<domain>.api.ts` only — the query/mutation hooks and consuming components should not need to change as long as the returned shape matches the TypeScript interfaces in `src/types/`.

### Theming (`src/tokens.js`)

A single JS file is the source of truth for design tokens, consumed by `tailwind.config.js` (spread into `theme.extend`). Structure: `base` (raw scale values — font sizes, colors, spacing) and `semantic` (role-based aliases — `semantic.colors.primary`, `semantic.text.*` for all UI copy strings) deep-merged together (`deepMerge`) into the exported `themeTokens`. Two important consequences:
- **All user-facing Vietnamese copy lives in `semantic.text`**, not scattered through components — treat it like an i18n dictionary. `src/constants/copy.ts` re-exports/aliases from here for use in components (e.g. `copy.header.profile`).
- Brand name is `semantic.text.brand.name`; renaming the "restaurant" only requires editing this one field per the README's guidance.
- Dark mode is enabled via a `[zaui-theme="dark"]` selector attribute (`tailwind.config.js` `darkMode`), not the `prefers-color-scheme` media strategy.

### Component conventions

- `src/components/common/` — reusable, mostly presentational pieces (product cards, cart sheet, variant selectors, quantity steppers, checkbox/radio/quantity "option" components used for product variant selection).
- `src/components/layout/` — app chrome (`Header`, `Footer`, `Layout`).
- Uses `zmp-ui` (Zalo's own component library) for primitives (`Spinner`, `Text`, `useSnackbar`, etc.) alongside custom Tailwind-styled components.
- `src/utils/cn.tsx` provides the `clsx` + `tailwind-merge` className combiner used throughout instead of raw template strings.

### Product variants / cart pricing model

`src/types/cart.types.ts` — a cart line item's price is `basePrice + sum(selectedVariants[].extraPrice * (quantity ?? 1))`, multiplied by the item's own `quantity`. Variants can themselves carry a `quantity` (used for "QUANTITY type variants", e.g. extra shots/toppings priced per unit) distinct from the cart item's overall quantity. Any pricing logic (cart totals, checkout summary, order display) must replicate this formula — see `calculateTotals()` in `src/stores/cart.store.tsx` and `src/utils/cart.ts`/`src/utils/order.ts` for existing implementations before adding a new one.

### Config files of note

- `app-config.json` — Zalo Mini App runtime config (title, header/status bar theming, safe-area behavior). Not a build tool config.
- `zmp-cli.json` — metadata about the template this project was scaffolded from (framework, state management, theming choices at creation time); not consulted at runtime.
- `.env` — contains `APP_ID` and `ZMP_TOKEN` used by the ZMP CLI for login/deploy; treat as a secret, don't commit changes that expose it further.
