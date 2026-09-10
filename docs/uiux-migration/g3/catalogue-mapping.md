# UIUX-G3 catalogue mapping

**Recorded:** 2026-09-09T18:31:00+07:00

| PV | Locked Designer source | Target implementation | Result in this run |
| --- | --- | --- | --- |
| PV-02 | `components/product-group-browser.tsx/.css` | `src/pages/category.tsx`, `src/css/app.scss` | Uses only the three canonical DTO codes in fixed order; 320px labels wrap; empty branch has a return path. Green POWER_TOOLS rendered 52 cards (one all-products entry + 51 API categories). |
| PV-03 | `preview-catalog.tsx`, `preview-products.tsx`, `preview-virtual-products.tsx` | `product-card.tsx`, `product-grid.tsx`, `virtual-product-grid.tsx` | Stable `product_id` keys, public availability, media fallback and 2/4 grid. TanStack rows activate only at 80 loaded **and rendered** eligible cards. |
| PV-04 | `preview-catalog.tsx` filter sheet | `filter-sheet.tsx`, list/search toolbars | Dynamic server facets only; applied/draft separation is retained. Escape closes the sheet and Green headless evidence observes `.hn-page` overflow `hidden` while it is open. |
| PV-05 | `preview-catalog.tsx`, `preview-motion.tsx` | `search.tsx`, `use-debounced-value.ts`, `use-product-results.ts` | 220 ms committed value, no URL update per keystroke, composition pause, Enter flush, request generation check and Green exact item-code result. Physical Vietnamese IME remains G5-only. |
| PV-06 | `preview-detail.tsx` | `product-detail.tsx`, `product-detail-template.tsx` | DTO variants select public variant media and flow `variant_id` into the existing quote deep link. Bundle/compatibility labels only render when supplied. Related items progress 2 at a time. |
| PV-07 | `preview-detail.tsx` gallery portion | `gallery.tsx`, `product-gallery.tsx` | White gallery, public media only, 100–300%/fit controls, next/previous only for multiple media, Escape/Close and fixed `list → detail → gallery → detail` chain. |

## Preserved boundaries

- The mapping imports no Designer products, images, hotline, OA, policy copy,
  catalogue fixture or operational data.
- Runtime API reads target only Green/DEV-TEST. No quote POST, Customer/
  Production request, data seed, reset, deployment, merge or push was made.
- Price, stock quantity, cart, checkout, payment, login, order tracking and
  other excluded business capabilities were not added.

## Visual-status boundary

The mappings above were checked structurally against the locked source and
captured in headless target screenshots. They are **not** a pixel-match claim.
D10 permits rendering the Designer checkout only for G2 comparison, so it
does not authorize the required G3 side-by-side/diff run.
