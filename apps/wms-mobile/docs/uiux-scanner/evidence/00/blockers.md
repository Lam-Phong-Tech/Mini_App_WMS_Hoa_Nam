# Blockers — Prompt 00

| ID | Status | Evidence | What is needed to clear it |
| --- | --- | --- | --- |
| B00-01 | RESOLVED | `npm run lint` now runs `eslint src __tests__`: 0 errors and 9 pre-existing warnings. The four files changed to clear the errors lint clean with no warning. `web-dist/**` is no longer in scope because it is generated build output. | Keep the source/test lint scope and do not introduce a warning in changed code. |
| B00-02 | BLOCKED | `login-d07-390x844-dpr3.png` verifies the current Login layout at D07 and has no horizontal overflow. The locked Designer reference remains a `1448×1086` two-device composite rather than an app-only raster; no crop bounds or raw per-state capture exists. See `visual-check.md`. | Designer supplies raw `390×844` captures or explicit perspective-free app crop bounds for each target state; then capture and diff at `≤0.5%` differing pixels and color delta `≤8`. |
| B00-03 | EXTERNAL DEPENDENCY | DEV credential/role/warehouse will be supplied securely; Android/PDA camera/NFC acceptance awaits a physical device. | Do not claim hardware/E2E coverage before the supplied DEV/device test; this dependency does not represent a missing Prompt 00 UI/API decision. |
| B00-04 | RESOLVED — NOT APPLICABLE | Shift, assigned work, warranty handover and account recovery are formally “Chưa áp dụng”, without an API or business model. | Keep them hidden or labelled “Chưa áp dụng”; no simulated success. |
| B00-05 | RESOLVED — CURRENT COHORT | No motion/virtual-list package is in scope; only current React Native/dependencies may be used. | Obtain a separate approval before adding a package or an animation/virtual-list cohort. |
| B00-06 | RESOLVED | Public `HEAD` and `main` are both `90b0032b…`; normalized SHA-256 of the live Pages entry document matches `docs/index.html` at that commit. See `designer-deployment-check.md`. | Re-run this direct mapping whenever Designer publishes a new release. |
| B00-07 | RESOLVED | User confirmed current 4 tabs; documents open from Home/Lịch sử. | Do not add a Chứng từ tab without a new decision. |

## Non-blocking documented deltas

- Current App HEAD is `28447eb…`, not the requested baseline `7f4d400…`. The 13-file delta includes committed warranty-component reliability fixes and earlier Gate 01 artifacts. Prompt 00 preserved them.
- BE supplied new D03 contracts. They are documentation evidence only until an App change and authenticated DEV verification are separately requested.
- Current App theme uses the pre-existing Vuexy purple tokens; the 17–22 prototype uses Public Sans/deep blue. This is intentionally not changed in Prompt 00.
