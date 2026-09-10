# UIUX-G2 dependency compatibility

**Recorded:** 2026-09-09T16:28:39.3111985+07:00

## Baseline versus target

| Item | Designer locked source | Target | Result |
| --- | --- | --- | --- |
| React | `19.2.6` | `18.3.1` | Do not copy Designer package manifest. |
| route motion | `motion@13.2.0` | ZaUI `AnimationRoutes` | Motion peers permit React 18, but adding it would create a second route-animation owner until a target visual/accessibility test proves otherwise. Not installed. |
| smooth scroll | `locomotive-scroll@5.0.1` / one Lenis owner | ZaUI `Page` is measured scroll root | Designer controller targets `window`; target does not. Not installed. |
| virtual list | `@tanstack/react-virtual@3.14.10` | cursor-paginated DOM grid | Peer range permits React 18, but no target legacy-browser, focus, resize, 80-loaded-item, or real Zalo evidence exists. Not installed. |

Public npm metadata checked during this run reports Motion React peers
`^18.0.0 || ^19.0.0` and TanStack Virtual React peers including React 18.
That is not evidence of compatibility with the target's Android 5/iOS 9.3/
Chrome 49 browser matrix.

## G2 choice

No dependency was added and `package.json`/lockfile were not changed. CSS
provides the 180 ms visual transitions and the app-wide reduced-motion fallback.
The existing ZaUI `AnimationRoutes` remains the only route-transition owner;
the measured native `Page` remains the only scroll owner.

This does not reject Motion, Locomotive, or TanStack Virtual by default. Their
integration remains `NOT_RUN` until the D06/D08 compatibility and target-device
evidence exists. The list remains cursor-paginated and does not fetch the whole
catalogue merely to reach 80 loaded products.
