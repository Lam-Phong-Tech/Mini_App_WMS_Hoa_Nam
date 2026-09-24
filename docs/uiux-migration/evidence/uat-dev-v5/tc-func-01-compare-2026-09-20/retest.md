# UAT_Dev_v5 — TC_FUNC_01

Status: Retest pass locally; UAT status updated to Retest

## Fixed deviations

- The comparison roster was incorrectly overridden to two columns by legacy styling. It now always renders one full-width model card per row, matching the reference.
- Removed legacy red styling from the per-model remove and consultation actions. Both use Hoa Nam blue as in the reference.
- The clear-all control now uses a trash icon rather than an X.
- Stock labels now use dark text with a colored status icon, matching the reference.
- The bottom navigation no longer highlights `Danh mục` while on the comparison screen.

## Retest coverage

- Add a product: success toast includes `Mở so sánh`; the action opens `/compare` directly.
- Two products from the same category: `2/3 sản phẩm đã chọn`, two model cards, `Thêm model thứ ba`, feature sections, and `Tư vấn 2 sản phẩm` are displayed.
- Remove one product: 2 cards becomes 1, counter becomes `1/3`, and the two-product CTA is hidden.
- Add third model: navigates to the selected category and keeps the two chosen models selected.
- Clear all: 2 cards becomes 0, counter becomes `0/3`, and the empty state appears.
- Viewport: 375 × 812 CSS px, device scale factor 3.
- Automated checks: `npm run typecheck`, `npm run lint`.

## Screenshots

- `reference-compare-two.png`: reference comparison screen with two models.
- `retest-pass-compare-two.png`: local retest screen after the fixes.
