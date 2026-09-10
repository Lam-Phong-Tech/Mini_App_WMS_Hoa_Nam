# Motion and scroll plan — proposal only

This document is not approval to add a dependency or change scroll behavior. The target must retain working ZaUI page navigation, native input/dialog behavior and safe return/scroll behavior until a measured, compatible plan is approved.

## Observed source versus target

| Topic | Designer source/reference | Target observed | Gate consequence |
| --- | --- | --- | --- |
| Screen transition | Motion `LazyMotion`/`MotionConfig`, short opacity transition | ZaUI `AnimationRoutes` | Do not animate both wrappers without an ownership decision. |
| Press feedback | Small tap scale and reduced-motion policy | CSS transitions, `prefers-reduced-motion` already present | Native/CSS can be a fallback; exact behavior needs visual baseline. |
| Card reveal | Lazy GSAP reveal in source docs | No GSAP dependency | Must remain progressive and visible if animation fails; no install yet. |
| Smooth scroll | Designer documents a single Locomotive/Lenis owner | ZaUI `Page` owns the target scroll container; pull-to-refresh reads `.hn-page` | Window-scroll code cannot be copied. Measure owner, input/modal behavior, back restoration and safe areas first. |
| Long list | Designer's virtual module uses fixed two-column rows at >=80 items | Target uses DOM cards plus opaque cursor pagination | Test realistic server paging and a >=80-item data case before considering virtualisation. |

## Candidate safe sequence after decisions

1. Measure target Zalo/ZaUI scroll ownership on each approved device. Record exact element, `scrollTop`, keyboard behavior, safe areas, gallery/dialog interaction, pull-to-refresh and back restoration.
2. Implement visual CSS and native semantic controls first. Respect `prefers-reduced-motion` and preserve a 44px minimum hit target.
3. If requested, trial one small, lazy-loaded motion module with React 18 and the locked target browsers before applying it to routes. Verify no duplicate route transition and no reduced-motion regression.
4. Treat GSAP, Locomotive and virtualisation as separate proposals with bundle, browser and platform checks. Never run a global scroll interceptor over inputs, sheets, dialogs or native Zalo handoffs.
5. Use target API cursors for loading. The source's local `4 + 4` expansion is a UI policy only, not a substitute for server pagination.

## Compatibility evidence still required

- Exact target browser/runtime versions and physical Zalo iOS/Android devices.
- Package version/peer-dependency and bundle impact for each proposed library.
- Screenshot/geometry protocol for topbar, search focus, sheet, gallery, long list and bottom safe area.
- Resolution of the source inconsistency: virtual rows are two-column while the screen plan calls for four-column desktop catalogue.
