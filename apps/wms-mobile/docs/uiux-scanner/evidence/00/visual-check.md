# Visual check — Prompt 00 / D07

Run date: 2026-09-11. The Web Login capture was produced with Chromium device emulation at `390×844` CSS px, DPR `3`, `vi-VN`, `Asia/Ho_Chi_Minh`, sRGB, safe-area `0`, and no browser chrome. The output raster is `1170×2532`.

## PASS — Login fixture approved

Official fixture: `login-d07-390x844-dpr3.png`
SHA-256: `e4a605d5f8e7d359dbc38b33a8656fce8bd7c868b3c96b862c655fe2f110498e`

The user explicitly confirmed `chốt` in this thread after reviewing the matching Login screen. This approval designates the app-only D07 capture as the official Gate 00 Login fixture, replacing the earlier non-comparable two-device composite for this single screen.

The capture reports `innerWidth = 390`, `innerHeight = 844`, `documentElement.scrollWidth = 390`, and `body.scrollWidth = 390`; both input wrappers are contained between x=`32` and x=`358`. Therefore no horizontal overflow is present.

The old Designer image `01_Dang_nhap_va_Xac_nhan_phien_ORIGINAL.jpg` remains inventoried but is not used for pixel comparison: it is a two-device presentation composite. It has not been altered.

## Scope limit

The fixture approval is Login-only. It does not claim pixel parity for the remaining board inventory, authenticated business flows, camera/NFC behavior, or animation. Those require their own approved fixture and/or DEV/device evidence when their prompt is assigned.
