# UIUX-G2 locked Designer visual comparison

**Recorded:** 2026-09-09T17:28:00+07:00  
**Decision:** D10 — `APPROVED_FOR_G2_QA_ONLY`  
**Designer source:** `Duc-Nguyen98/WMS_UIUX_HoaNamv2@86079f965f2fcb43a7e3efbbc9467d119b47921f`

## Reproducible environment

- The Designer repository was cloned to a temporary QA-only directory, checked
  out detached at the locked SHA and left unmodified.
- Its lockfile was installed with `npm ci --ignore-scripts`; `npm run build`
  completed successfully. The local Designer server was reachable only at
  `127.0.0.1:4174`.
- Browser: Headless Chrome `152.0.7977.84`; CSS viewport `390 × 844`; DPR `1`;
  reduced motion forced; captured after `document.fonts.ready`.
- The target used its local `backend-preview` adapter at `localhost:2999`, whose
  configured public origin is Green/DEV-TEST. It did not use the Designer
  fixture, assets, contact data or content at runtime.

## Cases and result

| Case | Designer scroll root / position | Target scroll root / position | Result |
| --- | --- | --- | --- |
| Home default | `window` / `0` | `.hn-page` / `0` | PASS — same mobile shell hierarchy, 68px header, 56px search, sticky topbar, hero/CTA, 3 group cards, category grid entry point and bottom navigation. |
| Home deep scroll | `window` / `420` | `.hn-page` / `420` | PASS — topbar remains at `y=0`; native target scroll remains sole owner and the content advances beneath it. |

The comparison is a **structural and primitive visual pass**, not a declaration
of byte-for-byte or pixel-perfect equality. A strict RGB image diff is expected
to be non-zero because the target is required to render Green public product
names, media, category titles and explanatory copy, while the QA-only Designer
build intentionally renders its own fixture. The measured non-equal pixel
rates are `31.7618%` (default) and `22.2886%` (deep scroll), using RGB delta
greater than 24. Those values are retained as diagnostic evidence, not as a
pixel-match threshold.

## Deliberate runtime-data variance

- Target hero media is selected from Green public DTO media; Designer's drill
  illustration stays in the QA fixture.
- Target product/category labels and the Green catalogue section title remain
  API-driven. No Designer contact, hotline, OA, privacy, product image or
  fixture record is embedded in the Mini App.
- The visible hero supporting copy remains non-operational UI copy. It does not
  create price, stock quantity, cart, checkout, sale, warranty or delivery
  claims.

## Evidence

- `evidence/g2/designer-home-default-390x844.png`
  — SHA-256 `88ac76ecebf7308013f39e6682cb315cd3e774d0ffb3ff77971902792bf83a18`
- `evidence/g2/target-home-designer-compare-after-390x844.png`
  — SHA-256 `3debfffbb4d6a3400339dff0344105e2217e60563849b46ab2e403e990751a70`
- `evidence/g2/designer-home-scroll-420-390x844.png`
  — SHA-256 `5290f78f80261ebf31cc2db4fda5452187dac5c934a2dff2188b0448ef045ab6`
- `evidence/g2/target-home-scroll-420-390x844.png`
  — SHA-256 `de736177467ad923fb95ef7fc3b93c0d0c7fe30c0e59296ef5f695b16c70d300`

This evidence permits the G2 decision only. It does not replace G5 Android and
iPhone Zalo, IME, safe-area, actual Green-media render or production approval.
