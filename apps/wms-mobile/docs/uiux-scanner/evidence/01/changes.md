# Changes — Prompt 01

## Source changed

- `src/features/auth/LoginScreen.tsx`
  - Replaced the generic light page shell by a dark authentication surface,
    white form card and green login CTA.
  - Kept existing email/password validation, failed-input retention, submit
    lock and login service. Added keyboard-aware scroll containment; no asset,
    font or package was added.
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
    start-shift action; updates the async render helper so the new screen does
    not add `act(...)` warnings.

## Explicitly not changed

- No auth API, session model, refresh flow, write gate, backend schema or
  permission logic.
- No account recovery/OTP, shift start/end or work assignment.
- No motion/scroll package, font or warehouse-photo asset.
- No approval/Post UI for normal inbound/outbound documents.
