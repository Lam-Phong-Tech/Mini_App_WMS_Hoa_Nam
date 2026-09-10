# UIUX-G3 preflight

**Recorded:** 2026-09-09T17:53:01+07:00

## Entry lineage

- Target checkout: `mini_product` at `411ba4d3ae4e287ef40626aba8ca6794924be1ef`.
- Designer baseline: `Duc-Nguyen98/WMS_UIUX_HoaNamv2@86079f965f2fcb43a7e3efbbc9467d119b47921f`.
- UIUX-G1 is `PASS` with `next_prompt_allowed: true`; its current SHA-256 is `a8f83f5f6118cb840888b5c23a7a9df825f778d97e0653d965cca0352e3257d9`.
- UIUX-G2 is `PASS` with `next_prompt_allowed: true`; its current SHA-256 is `7601b1cc6a689f7372698acfbadd154430b955f756767caa98b077efdc074ee4`.
- The working tree is intentionally dirty with the preserved G1/G2 implementation and local `.env*`/`.tmp` entries. This stage must layer on those changes; it must not reset, checkout, merge, push, deploy or alter Customer/Production.

## Mandatory inputs read

The G1/G2 gate records, baseline, decisions, screen map, API-impact record,
motion/scroll plan, implementation plan, G2 scroll-owner measurement and G2
change report were read before starting. The required target catalogue,
search, detail, gallery, session, hooks, mapper and public-API files were
also inspected. There is no applicable `AGENTS.md` and no `.openai/hosting.json`
in this checkout.

## Facts that constrain this implementation

1. `.hn-page` is the measured ZaUI scroll root. `window` is not the scroll
   owner; G3 restoration, sentinels and any virtualizer must target that
   element.
2. Green/DEV-TEST is the only runtime product/config/media source. The existing
   local Designer checkout is reference-only and its fixture cannot be used at
   runtime or as a G3 test fixture under D10.
3. The Green read contract is opaque cursor pagination. The app must retain a
   separate count for records loaded from the server and cards rendered in the
   progressive view. It must never fetch the full catalogue merely to cross a
   client threshold.
4. The target has neither `@tanstack/react-virtual` nor `gsap` installed. A
   version, bundle and target-runtime compatibility check is needed before
   either dependency can be integrated. Physical Android/iPhone Zalo proof
   remains G5 scope and cannot be claimed here.
5. The current implementation has concrete G3 gaps: 300 ms search debounce,
   no IME/Enter flush path, window-based scroll restoration, no loaded-versus-
   rendered count, and a load-more error that clears current cards.

## Planned work

- Keep the three DTO canonical domains and restyle the category/list/filter/
  search/detail/gallery surfaces against the locked source without importing
  Designer operational values.
- Make list pagination request-safe, duplicate-safe and progressive at four
  cards per reveal; preserve cursor semantics and prior cards on append error.
- Preserve input identity/focus during a 220 ms, IME-aware search and prevent
  old responses from overwriting a newer query.
- Correct all app-owned scrolling to `.hn-page`; measure it after the changes.
- Evaluate the two optional dependencies and use Green's existing paginated
  public records for the bounded 79/80/81 test only if the target-compatible
  dependency path is established. No test quote will be sent.

## Non-claims

This is only an entry/preflight record. No G3 visual, virtual-list, browser,
real-device or build result is claimed by this file.
