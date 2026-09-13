# Runtime motion check — Prompt 04

Date: 2026-09-12 (Asia/Ho_Chi_Minh)

## Web no-preference

- Local Web preview at `http://127.0.0.1:5175/`, viewport controlled by the
  existing preview harness.
- Opened `Quét mã` → `Tra cứu sản phẩm` so `BusinessScanScreen` mounted.
- Camera stub became active; the scan beam was visible inside the viewfinder.
- Two CUA screenshots captured 1.2 seconds apart showed the beam at different
  vertical positions, confirming the `2.6s sine.inOut` yoyo loop.

## Reduced motion and cleanup (source/runtime audit)

- `ScanBeam.web.tsx` subscribes to `matchMedia('(prefers-reduced-motion: reduce)')`.
  In reduced mode it returns `null`, so no GSAP tween is created.
- `active=false`/`paused=true` (camera blur, app background, modal or image
  picker) returns `null`; the effect cleanup kills the tween and clears inline
  transform/opacity.
- Android/PDA resolves `ScanBeam.tsx`, which is a no-op and contains no GSAP
  import. Native camera behavior remains unchanged.

## Build evidence

`npm run build:web` completed successfully with only the existing Vite chunk-size
advisory. `npm run typecheck`, `npm run lint` and the full 33-suite/873-test
regression also passed after the integration.
