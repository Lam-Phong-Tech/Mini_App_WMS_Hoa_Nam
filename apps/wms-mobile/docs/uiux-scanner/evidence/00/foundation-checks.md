# Foundation checks — Prompt 00

Run from `apps/wms-mobile` on 2026-09-11 with Node `v24.19.0`, npm `11.17.0`.

| Command | Exit | Result / evidence |
| --- | ---: | --- |
| `npm run typecheck` | 0 | `tsc --noEmit` completed successfully. |
| `npm test -- --runInBand` | 0 | 32 suites, 863 tests passed. Console output contains pre-existing React test `act(...)` notices and logging, but no test failure. |
| `npm run lint` | 0 | D07 scope: `eslint src __tests__`. 0 errors, 9 pre-existing warnings. The changed `InboundFlow.tsx`, `web/camera-kit.tsx`, `AppShell.tsx` and `BottomNav.tsx` also lint clean individually with no warning. `web-dist/**` is generated build output and excluded. |
| `npm run build:web` in sandbox | 1 | Sandbox denied esbuild reading Vite config parent path. This is environment access failure, not treated as source failure. |
| `npm run build:web` outside sandbox | 0 | Vite built 936 modules. Bundle-size warning: chunks larger than 500 kB; no source modification performed by this check. |

## Explicitly not run

- Android debug build: `app:assembleDebug --no-daemon -PreactNativeArchitectures=arm64-v8a` succeeded in Ubuntu and was launched on the Xiaomi `2206122SC`. The Login screen render was captured; this is not camera/NFC acceptance.
- Camera scan, NFC assignment/read-back and keyboard wedge on physical hardware: no workflow was exercised.
- DEV WMS authenticated read/write E2E: no test account, role, warehouse fixture or authorization to mutate test stock was provided.
- The user approved `login-d07-390x844-dpr3.png` as the official Login fixture. Its exact hash and scope are recorded in `baseline.json`; see `visual-check.md`.

Deferred hardware/API E2E checks are not silently waived. They are outside the user-approved Gate 00 Login fixture scope and remain required before any hardware or stock-changing flow is accepted.
