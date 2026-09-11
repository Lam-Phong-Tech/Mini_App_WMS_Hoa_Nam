# Android Zalo route regression — 2026-09-12

## Device

- Xiaomi 2206122SC (`fbb9e686`), Android 13, portrait.
- Physical display: 1440 × 3200 px, density 560 dpi.
- Zalo: 26.08.02 (`versionCode` 260802903).
- Mini App: Zalo Testing Version 33.
- No quote form was submitted and no personal data was entered.

## Route results

| Route/state | Result | Actual screenshot |
| --- | --- | --- |
| Product Detail — DCZC02-26 | PASS — image, availability, identity, actions and features render; header is clear of native capsule. | `.tmp/android-detail-20260912.png` |
| Gallery | PASS — product image and zoom controls render. | `.tmp/android-gallery-20260912.png` |
| Gallery → Detail native Back | PASS — native Back returned to Detail. | Detail screenshot above |
| Quote — direct Detail entry | PASS — form opened with one selected product; no blocking load-error panel. | `.tmp/android-quote-20260912.png` |
| Compare — two selected products | PASS — two products, comparison row and CTA render. | `.tmp/android-compare-selected-20260912.png` |
| Compare → Quote | PASS — both selected products were retained in Quote. | `.tmp/android-quote-compare-20260912.png` |
| Quote → Compare native Back | PASS — native Back returned to Compare with `2/3 sản phẩm đã chọn`. | `back.xml` accessibility capture |
| Background/resume | PARTIAL — Zalo task resumed, but the attempted `monkey` launch reopened inbox; a subsequent deep-link launch reset the route to Home. Compare-state preservation is not claimed PASS. | `.tmp/android-resume-miniapp-20260912.png` |

## Visual-diff status

The actual captures are physical 1440 × 3200 Android screenshots, while the
available locked reference images are 390 × 844 Preview captures. They do not
share the defined 375 × 812 CSS viewport/DPR 3 capture contract, so no pixel
diff or SSIM value is generated from this pair. Producing a resized image and
calling it a diff would be misleading.
