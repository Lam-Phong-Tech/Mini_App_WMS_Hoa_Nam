# UAT_Dev_v5 — TC_UI_02

Status: Retest pass locally

## Case

- Screen: Trang chủ
- Expected result: Each category and utility button shows the content and icon that correspond to its function.
- Defect from Evidence: Incorrect category labels and icons.

## Fix

- Kept the approved four main categories and their matching icons: kẹp giữ/hammer, bê tông và xây dựng/sliders, dụng cụ cắt/ruler, khoan và siết-vặn/drill.
- Matched category icon sizing and stroke to the reference.
- Restored the approved utility icons: clock for recently viewed products, heart for saved products, and open book for guidance and questions.

## Retest

- Route: `/home`
- Viewport: 375 × 812 CSS px, device scale factor 3
- Checks passed: category names match their icons; the three utility cards show clock, heart, and open-book icons; the labels align with the reference screen.
- Automated checks passed: `npm run typecheck`, `npm run lint`.

## Screenshots

- `reference-home.png`: approved reference screen.
- `retest-pass-home.png`: local retest result.
