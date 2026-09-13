# Changes — Prompt 01

## Source changed

- `src/features/auth/LoginScreen.tsx`
  - Replaced the generic light page shell by a dark authentication surface,
    white form card and green login CTA.
  - Kept existing email/password validation, failed-input retention and login
    service. Added a synchronous submit latch so two taps/Enter events in one
    render frame produce exactly one login request; added controlled password
    selection so Hiện/Ẩn preserves the typing position. Keyboard-aware scroll
    containment remains; no asset, font or package was added.
- `src/features/auth/SessionConfirmationScreen.tsx` (new)
  - Runs immediately after a **new** successful login.
  - Reads `GET /api/v1/auth/me`, shows only returned account/role/warehouse
    scope data and offers continue/logout.
  - Calls no shift endpoint. The start-shift area explicitly says `Chưa áp
    dụng` under D06.
- `src/app/AppShell.tsx`
  - Routes a newly logged-in session to confirmation; a restored valid session
    remains on the existing Home path.
  - Android Back cannot bypass confirmation to Home.
- `src/services/wms/types.ts`, `src/services/wms/queries.ts`
  - Added read-only mapping of `warehouse_scope_ids` supplied by BE for this
    confirmation UI. It is not a selectable warehouse list.
- `__tests__/authFlow.test.tsx`
  - Covers the confirmation screen fixture and proves that it contains no
    start-shift action.
  - Adds controlled, credential-free fixtures for different-user replacement,
    two submits in one frame, and password visibility/caret preservation.
- `__tests__/tokenRefresh.test.ts`
  - Existing controlled fixtures cover refresh rejection (401), interrupted
    refresh and network uncertainty. They prove which branches clear the local
    session and force a relogin; no DEV token is used.

## Explicitly not changed

- No auth API, session model, refresh flow, write gate, backend schema or
  permission logic.
- No account recovery/OTP, shift start/end or work assignment.
- No motion/scroll package, font or warehouse-photo asset. React Native
  motion stays static, as the user approved for Prompt 01.
- No approval/Post UI for normal inbound/outbound documents.
