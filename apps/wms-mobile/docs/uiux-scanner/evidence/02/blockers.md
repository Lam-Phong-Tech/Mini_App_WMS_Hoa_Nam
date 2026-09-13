# Blockers — Prompt 02

Prompt 02 was rechecked and corrected in source on 2026-09-11. The user then
explicitly requested the icon mapping and Gate 02 run to completion. The
reviewed Home reference plus the `390×844` local visual/CTA check now define
the accepted scope for this gate.

| ID | Status | Evidence | Required resolution |
| --- | --- | --- | --- |
| B02-01 | RESOLVED | `evidence/00/gate.json` SHA-256 `5d1c…6850` and `evidence/01/gate.json` SHA-256 `6fe3…846` both declare `PASS`; Gate 01 lists the current Gate 00 hash and current app head. | No action required. |
| B02-02 | RESOLVED | The user supplied the Home reference again, requested exact semantic icon application, and requested that Prompt 02 be run to pass. Local review ran at `390×844`, with stable font/assets and no browser chrome in the app region. | No action required for the reviewed Home scope. |
| B02-03 | RESOLVED | `useHomeSummary` now exposes only `postedInboundInLoadedPage`; `HomeScreen` labels it “Phiếu nhập đã ghi sổ / Trong 50 phiếu đã tải”. It no longer claims a warehouse-wide or “today” aggregate. Initial API failure renders `—` and “Chưa có dữ liệu”, rather than a false `0`. | A true daily aggregate remains a future BE enhancement, not a blocker to this exact-scope UI. |
| B02-04 | RESOLVED | User decision “motion tĩnh React Native là đạt” applies to this first UI tranche. Home uses the existing `Pressable` pressed feedback only; no motion package or unapproved timing was added. | No action required. |
| B02-05 | RESOLVED | The user requested the Home match the supplied five-tab reference; the app now exposes a functional Chứng từ tab backed by the existing history/document route. | No action required. |

## Privacy note

The real-device Prompt 01 screenshot was opened during preflight and confirmed
readable, but it visibly contained the DEV email. It was deleted instead of
being preserved as evidence. The existing textual test log remains and does not
contain a password or token.

## Corrected Home behavior

- A request sequence guard prevents an old Home reload from overwriting the
  newest result, and a failed reload retains the last successful snapshot.
- `GET /auth/me` now persists the confirmed name/avatar into the session. A
  legacy valid session without identity is hydrated once on app startup, so it
  does not require the user to sign out and in again.
- The Home avatar navigates to the existing **Cá nhân** tab.
- The Home task grid stays two columns at `390×844`; an RN-Web percentage/gap
  rounding issue had previously wrapped it to one column.
- Notification badge data is unavailable, so the visual bell intentionally has
  no hardcoded unread number.
