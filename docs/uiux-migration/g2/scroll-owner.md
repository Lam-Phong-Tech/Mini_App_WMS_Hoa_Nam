# UIUX-G2 scroll-owner measurement

**Recorded:** 2026-09-09T16:28:39.3111985+07:00

## Environment

- Target: local `backend-preview` dev server at `http://localhost:3100` using
  the approved Green/DEV-TEST adapter.
- Browser: Chrome headless, emulated CSS viewport `390 × 844`, DPR `1`.
- Scope: desktop/headless integration evidence only. It is not Zalo Android or
  iOS evidence and does not replace G5.

## Measurement

The ZaUI `Page` element, `.hn-page`, is the real scroll root in this runtime:

| Property | Observed value |
| --- | --- |
| `.hn-page` `overflow-y` | `auto` |
| `.hn-page` `scrollHeight` / `clientHeight` | `3413` / `844` px |
| after `page.scrollTop = 420` | `.hn-page.scrollTop = 420`; `window.scrollY = 0` |
| `.hn-topbar` after deep scroll | `position: sticky`, `y = 0`, white background |
| bottom navigation | `position: fixed`, `y = 784`, `height = 60` px |

Opening the menu at deep scroll changed the root to `overflow-y: hidden` while
retaining `scrollTop = 420`; both Escape and the runtime native-back message
closed the dialog, restored focus to the menu trigger, restored `overflow-y:
auto`, and retained the same scroll position without changing the route.

## Decision applied

ZaUI `Page` remains the sole scroll owner. No Locomotive/Lenis instance,
window-scroll handler, GSAP ticker, or second RAF controller is installed.
Touch/wheel therefore stays native. This is a measured choice for the current
target runtime, not an assertion about Zalo device behavior.

See `evidence/g2/geometry-font-menu.json` and the Home/menu screenshots.

## D10 revalidation capture

The reproduced Designer and target comparison used `390 × 844` CSS pixels,
DPR `1` and reduced motion. At target `.hn-page.scrollTop = 420`, the target
`.hn-topbar` remained at `y = 0`; its header measured `68px`, its search control
measured `56px`, and the complete sticky topbar measured `146px`. The bottom
navigation remained fixed over the viewport. This confirms the target's one
native ZaUI scroll owner through the comparison case, while the Designer's QA
fixture retained its independent `window` scroll model.
