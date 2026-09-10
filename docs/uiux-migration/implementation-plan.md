# Staged implementation plan after UIUX-G1

## Gate rule

No subsequent prompt may begin until UIUX-G1 is PASS. It is currently BLOCKED because its required decisions and visual/device baseline are absent. This plan is an allowlist proposal, not authorization to edit these files now.

## Proposed staged allowlist

| Stage | Goal | Candidate target files | Preconditions | Rollback |
| --- | --- | --- | --- | --- |
| UIUX-G2 | Token/shell/Home/category/list/search visual migration | `src/css/app.scss`, `src/components/app-shell.tsx`, `src/components/layout.tsx`, `src/pages/index.tsx`, `src/pages/category.tsx`, `src/pages/product-list.tsx`, `src/pages/search.tsx`, existing catalogue components and focused tests | D05/D06/D07; approved data/assets where visible | Revert only stage commit/files; no API change. |
| UIUX-G3 | Detail/gallery/contact visual migration | `src/pages/product-detail.tsx`, `src/pages/gallery.tsx`, `src/pages/foundation-screen.tsx`, `src/components/catalogue/product-detail-template.tsx`, `src/components/catalogue/product-gallery.tsx`, `src/components/catalogue/contact-actions.tsx`, CSS/tests | D03/D05/D06/D07 | Revert stage files; keep public DTO boundary. |
| UIUX-G4 | Request/receipt and optional library surfaces | `src/pages/quote-request.tsx`, `src/services/quote-service.ts`, routes/state/new focused components/tests only if approved | D01/D02/D03/D04/D07 | Revert stage files and any separately approved API work; do not retain PII. |
| UIUX-G5 | Measured visual QA/performance/accessibility/device audit | test/evidence files and narrowly justified fixes | All decisions, deployed test environment and device protocol | Revert only corrective UI files; preserve evidence. |

## Non-negotiable implementation constraints

- Do not change React/Vite major versions merely to align with the Designer repository.
- Do not add a Designer dependency until its target compatibility, scroll interaction and approval are proven.
- Do not bring Designer product data, imagery, hotline, OA URL or legal text into runtime without D03.
- Do not alter the existing public API contract without D01/D02 and explicit backend authority.
- Do not implement pricing, stock quantity, cart, checkout, payment, shipping, login, QR/NFC, CRM/WMS/ERP or order tracking.
- Keep source changes traceable to a stage; re-run impacted typecheck, lint, unit tests, build and the approved visual/device cases after each stage.

## QA evidence to create later

For every required PV case, record source revision, target commit, route, deterministic public/approved fixture data, viewport, DPR, browser/OS/runtime, loaded font/asset state, scroll position, animation mark, screenshot and comparison result. A case with a missing input is NOT_RUN or BLOCKED, never visual PASS.
