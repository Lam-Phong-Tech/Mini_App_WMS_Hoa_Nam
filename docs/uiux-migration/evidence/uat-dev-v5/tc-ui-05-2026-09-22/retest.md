# UAT_Dev_v5 — TC_UI_05

Status: Retest pass locally; UAT status updated to Retest

## Case

- Screen: Tìm kiếm sản phẩm
- Expected result: One aligned search field, back icon, placeholder, clear icon when a keyword exists, right-arrow action, and a two-column product card grid.

## Fix

- Kept the search input as one topbar surface; no nested input border is rendered.
- Added the right-arrow submit action for both empty and populated states.
- Kept the X control only when there is a search value; pressing it clears the input.
- Replaced the legacy horizontal search result list with the shared product-card grid, which presents two cards per mobile row with the required availability, image, model, name, detail, save, and compare controls.

## Retest

- Data source: live public catalogue API through the local development proxy.
- Viewport: 375 × 812 CSS px, device scale factor 3.
- Empty state: placeholder `Tìm sản phẩm`, back action, and submit arrow are present; clear action is absent.
- Query `khoan`: clear action and submit arrow are present; four result cards are rendered in two 165.6px columns; legacy list is absent.
- Clear action: input returns to an empty value and the X action is removed.
- Automated checks passed: `npm run typecheck`, `npm run lint`.

## Screenshots

- `retest-pass-search-empty.png`: correct empty search field state.
- `retest-pass-search-query.png`: populated field and two-column result grid.
