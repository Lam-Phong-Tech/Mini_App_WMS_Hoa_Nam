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

## Zalo Testing Version 34 retest — 2026-09-13

### Build and runtime

- Build: `npm run build:backend-preview` — PASS.
- Testing deploy: `npm run deploy:backend-preview` — PASS, **Version 34**.
- Correct Testing entrypoint: `https://zalo.me/s/1760850009175431684/?env=TESTING&version=34`.
  The unqualified deep link intentionally resolves to the unavailable
  Production version because the app has `currentVersion: 0`; it is not a
  runtime UI failure of Version 34.
- Device: Xiaomi 2206122SC (`fbb9e686`), Android 13, Zalo 26.08.02
  (`versionCode` 260802903), portrait 1440 × 3200.
- Zalo foreground activity was `com.zing.zalo/.ui.WebViewMPActivity` during
  every route check.

### Executed routes and state restoration

| Case | Result | Evidence |
| --- | --- | --- |
| Home / native chrome | PASS — menu, logo and global quote icon remain below the status bar; the icon is left of Zalo Capsule. | `android-xiaomi-2206122sc-v34-home-20260913.png` |
| Categories → Catalogue | PASS — category grid, filter/status controls and two-column product cards render. | `android-xiaomi-2206122sc-v34-catalogue-20260913.png` |
| Detail — DCZC02-26 | PASS — product image, availability and fixed request CTA render without native-chrome overlap. | `android-xiaomi-2206122sc-v34-detail-20260913.png` |
| Gallery → Android Back | PASS — Gallery renders zoom controls and Android Back returns to Detail. | `android-xiaomi-2206122sc-v34-gallery-20260913.png` |
| Detail → Quote | PASS — one selected product reaches the form. No field was populated and no request was submitted. | `.tmp/android-v34-quote-detail.png` |
| Compare — two products | PASS — two selected products, comparison table and request CTA render. | `android-xiaomi-2206122sc-v34-compare-20260913.png` |
| Compare → Quote | PASS — Quote reports two selected products. No field was populated and no request was submitted. | `android-xiaomi-2206122sc-v34-quote-compare-20260913.png` |
| Quote IME focus | PASS — focusing “Họ và tên” opens Vietnamese Gboard (`mInputShown=true`) while the focused field stays visible above the keyboard. No value was entered. | `android-xiaomi-2206122sc-v34-quote-ime-20260913.png`, `.tmp/android-v34-quote-ime.xml` |
| Quote → Android Back | PASS — returns to Compare with `2/3 sản phẩm đã chọn`. | `.tmp/android-v34-compare-back.xml` |
| Background / resume | PASS — after opening Android Recent Apps and selecting the existing `Zalo: Hoa Nam…` task, Zalo resumes Compare with `2/3 sản phẩm đã chọn`; no deep link was used for resume. | `android-xiaomi-2206122sc-v34-resume-20260913.png`, `.tmp/android-v34-resume-compare.xml` |

An unrelated device-level floating `Quản lý kho` application overlapped the
lower-right edge of one product card during an early Compare tap. It was not
launched by the Mini App code, no Play Protect data was sent, and the valid
Compare run used controls outside that overlay. The running Mini App stayed in
`WebViewMPActivity` throughout the accepted route checks.

### Remaining coverage boundary

The real-device Android route, resume and Vietnamese IME-focus regression now
pass for Version 34. Validation was intentionally not triggered because the
form must not receive personal data or submit a quote. This does not replace
the separate mandatory physical iPhone-on-Zalo and approved same-viewport
visual-diff evidence.
