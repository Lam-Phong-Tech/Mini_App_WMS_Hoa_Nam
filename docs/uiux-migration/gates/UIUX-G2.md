# UIUX-G2 gate — PASS with allowed runtime-data variance

**Recorded:** 2026-09-09T17:30:00+07:00  
**Target base / implementation HEAD:** `411ba4d3ae4e287ef40626aba8ca6794924be1ef`  
**Designer source baseline:** `86079f965f2fcb43a7e3efbbc9467d119b47921f`

G2 is **PASS**. D10 authorizes the locked Designer build only to create a
deterministic QA comparison baseline. The temporary Designer checkout was
detached at the exact SHA, built locally and never changed; its fixture was not
inserted into the Mini App or Green.

- The two required Home cases were compared at `390 × 844`, DPR `1`, reduced
  motion: default scroll and scroll position 420. Both pass the G2 structural
  visual/primitives criteria. Target uses ZaUI `.hn-page`; the locked fixture
  uses `window`; in both cases the topbar remains sticky at `y=0`.
- The target uses bundled Public Sans, locked color tokens, an accessible shell,
  actual menu routes, focus trap/Escape/native-Back restoration, two-column
  mobile category entry, and a safe-area-aware bottom navigation. The target
  remains a single native ZaUI scroll controller.
- `typecheck`, lint, 12 Vitest files / 51 tests and the backend-preview build
  pass after the revalidation.

This is deliberately **not** a pixel-perfect-asset claim: Green product media,
labels and catalogue content are required to differ from the QA-only Designer
fixture. The resulting diagnostic RGB differences are recorded, rather than
hidden or treated as a pass threshold. The app contains no Designer image,
fixture, hotline, OA, privacy or product data.

G5 is still required for real Zalo Android/iPhone, IME, safe-area and actual
Green-media rendering. Customer/Production remains untouched. UIUX-G3 may now
start when separately requested; no deploy is authorized by this gate.

See [comparison evidence](../g2/designer-visual-comparison.md),
[visual results](../g2/visual-results.json), [scroll measurement](../g2/scroll-owner.md)
and [change report](../g2/change-report.md).
