# State matrix evidence — Prompt 00

| Coverage | Evidence captured | Status |
| --- | --- | --- |
| 24 catalog boards | Catalog HTML, every source image path/dimension/SHA in `../../baseline.json`, mapping in `../../board-map.md` | PASS — inventory coverage only |
| Locked Login/Home image bytes | SHA-256 recorded; inspected without modification | PASS |
| Prototype 17–22 scenes | 24 scene names, scene graph and panel bbox source from `handoff/scanner-screens-17-22/QA.json` | PASS — prototype source only |
| Business/API state | Source routes plus BE-provided contract mapped in `../../source-contract-map.md` | PASS — contract documentation only |
| App visual equivalence | Local Login capture produced at D07 viewport/DPR, but locked Designer reference is a two-device composite (`1448×1086`), not an app-only raster. Material visual differences are visible. See `visual-check.md`. | FAIL — no valid pixel-diff fixture and no parity evidence |
| Android/PDA camera/NFC | No named physical device or hardware session supplied | NOT_RUN |
| DEV API RBAC/E2E | No test account/role/warehouse was supplied | NOT_RUN |
| Motion parity | Prototype CSS inspected; no App implementation/video | NOT_RUN |

Coverage is not pixel equality and is not integration acceptance.
