# Foundation checks — Prompt 00

Run from `apps/wms-mobile` on 2026-09-11 with Node `v24.19.0`, npm `11.17.0`.

| Command | Exit | Result / evidence |
| --- | ---: | --- |
| `npm run typecheck` | 0 | `tsc --noEmit` completed successfully. |
| `npm test -- --runInBand --silent` | 0 | 32 suites, 863 tests passed. The Login smoke assertion was updated to the approved Scanner copy; no test failure. |
| `npm run lint` | 0 | D07 scope: `eslint src __tests__`. 0 errors, 9 pre-existing warnings. The changed `InboundFlow.tsx`, `web/camera-kit.tsx`, `AppShell.tsx` and `BottomNav.tsx` also lint clean individually with no warning. `web-dist/**` is generated build output and excluded. |
| `npm run build:web` in sandbox | 1 | Sandbox denied esbuild reading Vite config parent path. This is environment access failure, not treated as source failure. |
| `npm run build:web` outside sandbox | 0 | Vite built 936 modules. Bundle-size warning: chunks larger than 500 kB; no source modification performed by this check. |

## Explicitly not run

- `npm run build:android`: no Android SDK/PDA/device test environment was provided.
- Camera scan, NFC assignment/read-back and keyboard wedge on physical hardware: no real device was available in this prompt.
- DEV WMS authenticated read/write E2E: no test account, role, warehouse fixture or authorization to mutate test stock was provided.
- Pixel diff: the current Login capture is stored as `login-d07-390x844-dpr3.png` and passes the responsive containment check. The locked Designer source is still a two-device composite rather than a crop-ready app raster, so pixel parity is not demonstrated. See `visual-check.md`.

These checks are not silently waived. They remain `NOT_RUN` and block a PASS gate where required.
