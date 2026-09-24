# UIUX-G5 — visual matrix revalidation, 2026-09-11

## Acceptance target

- Viewport: **375 x 812 CSS px**
- Device scale factor: **3**
- Scroll owner: `.hn-page` only; capture scrollbars are hidden.
- Pages/states: Home, Categories (each domain), Catalogue (all/domain/category,
  long name and preorder cards), Search (empty/query/result), Detail (stock/
  preorder/variants), Contact (hotline configured and unavailable OA), Quote,
  Compare and error/empty/loading states.

This target explains the prior 343.2px reference card width: the mobile content
column is the 375px viewport minus the shared 16px inline gutters. A 390px
capture produces a 358px card and is not comparable to that reference.

## Revalidation outcome

The source is updated to use that scroll model and compact Contact geometry.
`npm run typecheck`, `npm run lint`, `npm test` (63 tests) and `npm run build`
completed successfully.

The current source revalidation additionally confirms the host-specific
safe-area flag, pinned local `zmp-cli@4.0.3`, direct Vite root `/`, and both
`npm run build:dev-preview` and `npm run build:backend-preview`.

No visual PASS is recorded. The current desktop computer-use browser cannot
write its kernel assets (`The system cannot find the path specified`), so it
cannot truthfully produce the reference, actual and diff images. The physical
iPhone-on-Zalo capture also remains absent. These are blocking evidence gaps,
not a claim of a pixel comparison result.

The Android route regression was rerun on Zalo Testing Version 34 on
2026-09-13 and is recorded at
[`android-xiaomi-2206122sc-routes-2026-09-12.md`](evidence/g5/android-xiaomi-2206122sc-routes-2026-09-12.md).
It passes Home native-chrome clearance, Detail, Gallery, Quote, Compare,
native Back and Recent-Apps resume with Compare state preserved. The physical
Android captures still cannot be paired with the locked 375×812 reference set
for a valid diff.

## Chrome iPhone responsive run — 2026-09-13

Chrome DevTools Protocol was used with the agreed 375 × 812 CSS px viewport
and DPR 3. The Browser Preview and local Backend Preview both reported the
same viewport and DPR; the local document reported `data-host="browser"`, so
the Zalo-only safe-area/capsule fallback was not applied.

- Captured responsive reference/actual pairs: Home, Catalogue, Detail, Search,
  Contact and request/selection.
- Captured same-viewport diffs at a per-channel threshold of 24:

  | State | Mismatch | Mean channel delta |
  | --- | ---: | ---: |
  | Home | **11.290%** | 13.667 |
  | Catalogue | **14.070%** | 19.374 |
  | Detail | **11.756%** | 17.245 |
  | Search | **13.466%** | 19.315 |
  | Contact | **11.520%** | 16.170 |

  The Home result was remeasured after synchronising the browser/Zalo host
  flag, the Hero public media source, and the group icon/card styling.

This is an evidence-backed **FAIL** against the agreed 2% mismatch threshold,
not a visual PASS. The remaining drift spans the Hero composition, shared
top/bottom chrome, and route-specific content geometry. The reference uses
its own approved mock catalogue data while the target uses the Green public
catalogue; media/content variance is visible but does not by itself explain
the full layout mismatch.

## Android availability — 2026-09-13

The attached Samsung SM-A305F (Android 11) has Chrome and Samsung Internet but
does not have the Zalo package installed; both browsers also stopped at their
first-run setup screens. It therefore cannot add a Zalo-native evidence leg.
The earlier Xiaomi Zalo route evidence remains the valid Android native run.
