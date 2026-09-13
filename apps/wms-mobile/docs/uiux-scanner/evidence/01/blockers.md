# Blockers — Prompt 01

| ID | Status | Disposition |
| --- | --- | --- |
| B01-01 | RESOLVED — CONTROLLED FIXTURE | DEV Login, `/auth/me`, role/scope, logout and re-login pass on Xiaomi 2206122SC. User approved controlled fixtures for refresh failure and different user; these now run without a DEV token or account mutation. |
| B01-02 | RESOLVED — APPROVED FIXTURE | Gate 00’s Login fixture fixes browser, viewport, DPR, locale, timezone and safe area. Its approval is Login-only, which is exactly the visual scope of Prompt 01. |
| B01-03 | RESOLVED — USER DECISION | User confirmed static React Native motion is acceptable. No native animation timing or new motion dependency is required. |
| B01-04 | RESOLVED BY SCOPE | Shift start/end is not implemented. Confirmation shows `Chưa áp dụng` and only enters Home. |
| B01-05 | RESOLVED BY SCOPE | Password recovery is absent; no OTP/email/recovery success UI exists. |
| B01-06 | RESOLVED | `npm run web` now renders Login. Vite excludes React Native and Safe Area Context from dependency prebundling, so its `.web` implementations are selected instead of native Flow sources. |
