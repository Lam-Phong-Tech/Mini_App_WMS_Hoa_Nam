# UIUX-G2 change report

**Recorded:** 2026-09-09T16:28:39.3111985+07:00

## Implemented

- Added the locked Hoa Nam token set and scoped G2 theme in
  `src/css/hoa-nam-theme.scss`, including semantic state, focus, reduced-motion,
  modal and toast styling.
- Bundled the approved Google Fonts Public Sans source in `public/fonts` at
  weights 400, 500, 600, 700 and 800; the local target confirms all five faces
  load.
- Rebuilt the app shell with a light, sticky 48px / 1fr / 48px header, genuine
  menu destinations, focus trap, Escape close, focus restoration, scroll lock,
  native Back close, safe-area bottom navigation, and separate request/contact
  destinations.
- Restyled Home PV-01 with the locked two-line heading and CSS arcs. Hero media
  remains sourced only from the public Green DTO when available; no Designer
  product asset or contact data was copied.
- Used `DomainDto.display_name` for the product-group labels; removed the
  customer-facing `3 domain` counter and hard-coded domain translations.
- Added a shared native `UiButton` with stable loading slot and actual disabled
  state. Existing ZaUI controls remain in place rather than replacing the UI
  framework.
- Forced the ZMP app surface to the approved light Preview baseline rather than
  inheriting Zalo dark theme. Token styles keep controls readable.

## Preserved

- Green API/config/media remains the only approved integration data source.
- Quote/config work from G1 is preserved; no quote request was sent in G2.
- No Customer/Production request, deployment, package install, React/Vite
  upgrade, backend/API contract change, fixture, pricing, stock, cart, checkout
  or other excluded business scope was introduced.

## Intentionally not implemented

- Motion/Locomotive/Lenis/TanStack Virtual integration: see
  `dependency-compatibility.md` and `scroll-owner.md`.
- PV-13–PV-18 and detail/contact/quote redesign stages owned by later prompts.
- Pixel-perfect asset equality is not claimed; physical Zalo device acceptance
  remains owned by G5.

## D10 revalidation update

- The user authorized the locked Designer build only for QA comparison. The
  detached temporary checkout built successfully at
  `86079f965f2fcb43a7e3efbbc9467d119b47921f`; it was not changed or imported
  into the target.
- The mobile shell was refined against the captured QA baseline: wordmark
  framing, 68px header, 56px search with action affordance, hero/CTA rhythm,
  three-card group row, two-column category entry and bottom navigation.
- All visible catalogue names and media remain Green adapter values. The QA
  outcome is therefore a structural/primitives pass with explicit runtime-data
  variance, not an assertion of pixel-perfect asset equality.
- The deterministic capture helper at `scripts/capture-g2-visual.mjs` is QA
  tooling only; it is not bundled into the app and does not call a public write
  endpoint.
