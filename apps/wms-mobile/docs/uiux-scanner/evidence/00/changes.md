# Changes — Prompt 00

The original Prompt 00 survey created documentation/evidence under `apps/wms-mobile/docs/uiux-scanner/`.

- `baseline.json`
- `board-map.md`
- `state-inventory.md`
- `source-contract-map.md`
- `decisions.md`
- `motion-spec.md`
- `evidence/00/*`

No package, lockfile, API request implementation or deployment setting was changed. Existing warranty-component fixes in the current revision were preserved and recorded as a baseline delta.

## Post-decision Gate 00 maintenance

After D07, the lint command was limited to source/test, the two real hook-dependency errors were corrected, and the App navigation was restored to the approved four tabs. These are Gate-maintenance changes, not a claim that any unverified screen, hardware or API flow has passed.

## Post-D07 Login visual remediation

At the user's explicit request to run the visual cohort, the Login presentation was aligned without changing the authentication contract:

- `src/features/auth/LoginScreen.tsx`: Scanner visual hierarchy and real login/error states retained.
- `src/ui/Input.tsx`: optional left/right adornments; all existing callers keep the same input behaviour.
- `src/theme/scannerAssets.ts`: approved warehouse background registry.
- `__tests__/authFlow.test.tsx` and `__tests__/App.test.tsx`: assertions updated to the approved Scanner copy.
- `evidence/00/login-d07-390x844-dpr3.png`: deterministic 390×844/DPR 3 capture.

The edit does not enter credentials, call an authenticated API, post stock, install a package, or alter the four-tab navigation decision.
