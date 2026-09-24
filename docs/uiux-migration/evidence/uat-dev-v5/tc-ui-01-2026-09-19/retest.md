# UAT_Dev_v5 — TC_UI_01

Status: Retest pass locally

## Case

- Screen: Trang chủ
- Expected result: Background khu vực banner hiển thị đúng hình ảnh, bố cục và màu nền theo thiết kế.
- Defect from Evidence: Nền/background sai mẫu.

## Fix

- Replaced the hero image with the approved source image and the same crop ratio and offsets used by the reference screen.
- Kept the decorative sweep and two rotated ellipses behind the product so they do not cover the copy or product.
- Applied multiply blending to remove the source image's white canvas while preserving the product detail.

## Retest

- Route: `/home`
- Viewport: 375 × 812 CSS px, device scale factor 3
- Checks passed: banner artwork is behind the product, the product remains visible, no white image rectangle is present, and headline/CTA remain unobstructed.
- Automated checks passed: `npm run typecheck`, `npm run lint`.

## Screenshots

- `reference-home.png`: approved reference screen.
- `retest-pass-home.png`: local retest result.
