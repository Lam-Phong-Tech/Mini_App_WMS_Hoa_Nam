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

The 2026-09-12 Android route regression is recorded at
[`android-xiaomi-2206122sc-routes-2026-09-12.md`](evidence/g5/android-xiaomi-2206122sc-routes-2026-09-12.md).
It passes Detail, Gallery, Quote and Compare route entry plus native Back. The
resume case remains partial and the physical Android captures still cannot be
paired with the locked 375×812 reference set for a valid diff.
