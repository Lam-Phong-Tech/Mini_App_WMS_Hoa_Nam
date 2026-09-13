# State matrix evidence — Prompt 00

| Coverage | Evidence captured | Status |
| --- | --- | --- |
| 24 catalog boards | Catalog HTML, every source image path/dimension/SHA in `../../baseline.json`, mapping in `../../board-map.md` | PASS — inventory coverage only |
| Locked Login/Home image bytes | SHA-256 recorded; inspected without modification | PASS |
| Prototype 17–22 scenes | 24 scene names, scene graph and panel bbox source from `handoff/scanner-screens-17-22/QA.json` | PASS — prototype source only |
| Business/API state | Source routes plus BE-provided contract mapped in `../../source-contract-map.md` | PASS — contract documentation only |
| App visual equivalence | User-approved Login fixture `login-d07-390x844-dpr3.png` at D07 profile; SHA-256 is recorded in `../../baseline.json`. See `visual-check.md`. | PASS — Login-only fixture approval |
| Android/PDA Login launch | Debug build launched on Xiaomi `2206122SC`; current Login screen captured at `android-login-635c9e-1440x3200.png`. | PASS — launch/render only |
| Android/PDA camera/NFC | No camera/NFC workflow was exercised on the physical device. | DEFERRED |
| DEV API RBAC/E2E | No test account/role/warehouse was supplied | NOT_RUN |
| Motion parity | Prototype CSS inspected; no App implementation/video | NOT_RUN |

Coverage is not pixel equality and is not integration acceptance.
