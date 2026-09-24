# UAT_Dev_v5 — TC_UI_06

Status: Retest pass locally; UAT status updated to Retest

## Case

- Screen: Trang chủ, Tiện ích sản phẩm
- Expected result: A centered utility popup with dimmed or blurred background, correct groups, icons, counts, and a close action. No left-side drawer.

## Fix

- Preserved the centered dialog implementation and added backdrop blur.
- Corrected menu action icons to match their functions: heart for saved items, compare arrows, sliders for multi-product requests, paper plane for submitted requests, and open book for guidance.

## Retest

- Data source: live public catalogue API through the local development proxy.
- Viewport: 375 × 812 CSS px, device scale factor 3.
- Popup checks: `role=dialog`, `aria-modal=true`, backdrop present, title `Tiện ích sản phẩm`, required description, three section headings, six action cards, and both review counters are present.
- Close check: before close, dialog exists and menu button is `aria-expanded=true`; after close, dialog is removed, menu button is `aria-expanded=false`, and the URL remains `/home`.
- Automated checks passed: `npm run typecheck`, `npm run lint`.

## Screenshots

- `reference-menu.png`: reference utility sheet.
- `retest-pass-menu.png`: local popup retest result.
