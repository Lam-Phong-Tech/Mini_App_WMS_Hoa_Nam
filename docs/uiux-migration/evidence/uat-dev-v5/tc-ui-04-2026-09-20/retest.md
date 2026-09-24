# UAT_Dev_v5 — TC_UI_04

Status: Retest pass locally; UAT status updated to Retest

## Case

- Screen: Trang chủ, khu vực Sản phẩm trong danh mục
- Expected result: Gradient button styling, `Đã hiển thị 20/20 sản phẩm`, and sufficient spacing before the catalogue CTA.

## Fix

- Preserve a 20-item home set using the approved 70/30 domain mix: 14 Power Tools and 6 Hand Tools. If a preferred availability state has fewer items, fill remaining slots from the same domain.
- Stop showing the loading skeleton when the source has no next cursor, including the intentionally smaller DEV fixture.
- Format progress as `Đã hiển thị x/x sản phẩm`.
- Add a 6px margin above `Xem toàn bộ danh mục`; the section grid retains its 14px gap as well.

## Retest

- Data source: live public catalogue API through the local development proxy.
- Viewport: 375 × 812 CSS px, device scale factor 3.
- Result: 20 product cards are present; progress reads `Đã hiển thị 20/20 sản phẩm`; no loading skeleton remains.
- Active stock filter computed style is `linear-gradient(135deg, rgb(12, 93, 125) 0%, rgb(12, 98, 134) 52%, rgb(94, 147, 167) 100%)`.
- CTA top margin is 6px.
- Automated checks passed: `npm run typecheck`, `npm run lint`.

## Screenshots

- `retest-pass-progress.png`: live 20/20 progress and CTA spacing.
- `retest-pass-controls.png`: live product cards and filter treatment.
