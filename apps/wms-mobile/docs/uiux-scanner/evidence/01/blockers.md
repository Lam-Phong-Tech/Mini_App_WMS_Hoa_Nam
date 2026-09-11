# Blockers — Prompt 01

| ID | Status | Reason / needed input |
| --- | --- | --- |
| B01-01 | BLOCKED | Authenticated DEV acceptance needs a DEV account, role and test warehouse. It must cover login, `/auth/me`, logout, expired/invalid refresh and different-user flow. |
| B01-02 | BLOCKED | Board 01 lacks approved crop, DPR and safe-area profile. The manual 390×844 review does not prove pixel parity. |
| B01-03 | DEFERRED | No native Prompt 01 motion call-site/timing/reduced-motion acceptance is approved; implementation is static as D06 requires. |
| B01-04 | RESOLVED BY SCOPE | Shift start/end is not implemented. Confirmation shows `Chưa áp dụng` and only enters Home. |
| B01-05 | RESOLVED BY SCOPE | Password recovery is absent; no OTP/email/recovery success UI exists. |
| B01-06 | FAIL (tooling) | `npm run web` cannot start its development server because Vite/esbuild parses an untranspiled React Native Flow file. `build:web` and production preview pass. It is recorded, not silently fixed under this board. |
