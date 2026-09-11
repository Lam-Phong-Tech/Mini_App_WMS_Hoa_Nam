# Visual check — Prompt 00 / D07

Run date: 2026-09-11. Local Web was captured with Chromium DevTools device emulation at `390×844` CSS px, DPR `3`, `vi-VN`, `Asia/Ho_Chi_Minh`, sRGB, safe-area `0` and no browser chrome. Output raster is `1170×2532`.

## Latest local capture: responsive check PASS; parity check BLOCKED

Evidence: `login-d07-390x844-dpr3.png` (SHA-256 `e4a605d5f8e7d359dbc38b33a8656fce8bd7c868b3c96b862c655fe2f110498e`).

The capture is produced through DevTools emulation rather than Chrome's `--window-size` alone: headless Chrome silently exposed a `488px` CSS viewport for the latter. The captured page reports `innerWidth = 390`, `innerHeight = 844`, `documentElement.scrollWidth = 390` and `body.scrollWidth = 390`; both input wrappers are contained between x=`32` and x=`358`. Therefore the earlier apparent right-edge clipping was a capture-profile defect, not the current responsive layout.

The Login screen now contains the reference's main visual structure (warehouse background, scanner brand, hero, rounded white form, two icon fields, primary button and access notice) and the D07 capture shows no horizontal clipping. This is a responsive verification only — it is not a pixel-diff PASS.

The only locked Login reference supplied by Designer is:

`design/01_Main/BOARDS/00_LOCKED_ORIGINALS/01_Dang_nhap_va_Xac_nhan_phien_ORIGINAL.jpg` (`1448×1086`). It is a single composite containing two angled iPhone device frames (Login and Session confirmation), not an app-only raster. The Designer tree contains no independent Login or Session-capture PNG/JPEG to crop at the D07 viewport.

Consequently it cannot be compared mathematically to the local app-only `1170×2532` capture under the D07 rules (crop app region, no device frame, `≤0.5%` differing pixels and color delta `≤8`). No raw comparison fixture means neither PASS nor a numerical mismatch may be inferred.

For review only, two candidate `390×844` crops (Login and Session) were mechanically extracted from the composite. They still contain system/device-edge pixels and are **not** official D07 fixtures. The Login candidate confirms the material mismatch against the local capture; it must not be used to declare PASS or as a replacement for Designer’s raw export.

## Required to re-run

Designer must supply either one raw `390×844` CSS-pixel capture per target state, or explicit app-content crop bounds plus a perspective-free source image for each composite board. Then local captures can be produced with the same viewport/DPR and pixel-diffed against those fixtures.

This check does not touch authenticated flows: no DEV credential was entered and no API state was changed.
