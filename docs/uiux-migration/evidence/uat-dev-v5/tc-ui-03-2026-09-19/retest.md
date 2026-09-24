# UAT_Dev_v5 — TC_UI_03

Status: Retest pass locally

## Case

- Screen: Trang chủ, danh sách sản phẩm trong danh mục
- Expected result: Status does not cover the product image; the saved state follows the design; the product image remains completely visible inside its card.
- Defect from Evidence: Status overlapped the image, saved styling differed from the reference, and card boundaries cut product images.

## Verified implementation

- The product status has a separate top rail inside product media. Product source images begin below that rail and use `object-fit: contain`.
- The product card uses a single rounded outer border with independent media, content, and actions sections. Media has no clipping boundary around the product itself.
- Pressing Save changes the action to `Đã lưu`, applies a light teal background, and fills the heart icon.

## Retest

- Route: `/home`
- Viewport: 375 × 812 CSS px, device scale factor 3
- Interaction result: `aria-pressed=true`; label `Đã lưu`; saved class active; heart filled; background `rgb(229, 246, 248)`.
- Visual checks passed: status badge is separated from the product visual, product images are fully contained, and the saved action matches the approved card treatment.
- Automated checks passed: `npm run typecheck`, `npm run lint`.

## Screenshots

- `reference-products.png`: approved reference card treatment.
- `retest-pass-saved-product.png`: local saved-state retest result.
