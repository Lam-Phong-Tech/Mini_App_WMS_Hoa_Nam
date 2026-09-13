# Checks — Prompt 04 Nhập kho

Run from `apps/wms-mobile` on 2026-09-12.

| Check | Result | Evidence |
| --- | --- | --- |
| Gate 00–03 | PASS | All prerequisite gate files parse with status `PASS`; Gate 03 hash `d5e609b981b6d500f5416f5e833e0025159746cb2e3a5d8d818805aeb466dfee`. |
| Board inspection | PASS | Direct browser inspection of `02_nhap_kho.png` (`1536×1024`), four panels read and mapped; no panel was assumed to be an automatic linear flow. |
| Typecheck | PASS | `npm run typecheck`, exit 0. |
| Lint | PASS | `npm run lint`, exit 0; no errors/new warnings. |
| Inbound regression | PASS | `npm test -- --runInBand __tests__/inboundFlow.test.tsx --silent`, 56 tests. |
| Draft regression | PASS | `draftStore.test.ts` and Prompt 03 flow tests cover save/resume, expiry and CANCELLED retention. |
| Web build | PASS | `npm run build:web` after AppIcon fix, exit 0; Vite chunk-size advisory only. |
| Local smoke | PASS | Home → Nhập kho opened `Tạo phiếu nhập`; Back returned Home. No WMS write CTA was pressed. |
| Real-device camera | PASS | Ubuntu-built ARM64 debug APK installed on device `fbb9e686`; `pm grant` CAMERA, BusinessScan preview showed live frames, `dumpsys media.camera` reported client `vn.info.lptech.wmshoanam` `ACTIVE`, and no fatal/LogBox error after the AppIcon key fix. Screenshot: `android-camera-20260912.png`. |
| GSAP scan-line motion | PASS | `gsap@3.13.0` exact pin; Web-only `ScanBeam.web.tsx` call-site, native no-op adapter, `2.6s sine.inOut yoyo`, reduced-motion guard and tween cleanup. Two CUA Web captures 1.2s apart show beam position changed; Vite build exit 0. |
