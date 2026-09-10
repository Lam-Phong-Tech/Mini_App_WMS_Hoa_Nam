# UIUX-G3 revalidation — 2026-09-10

## Authority and environment

The user approved D11 and D12 in
`evidence/reference/user-confirmation-g3-revalidation-2026-09-10.md`.

- The Designer checkout was verified at
  `86079f965f2fcb43a7e3efbbc9467d119b47921f` and served only on the local
  loopback address for screenshots.
- The visual target used a local backend-preview adapter that reads Green
  public data from `https://khohoanamdev.lptech.info.vn`; it made no write.
- `scripts/run-g3-qa-harness.mjs` provided the separate local-only in-memory
  adapter. It exposes no quote endpoint, writes no fixture to disk or runtime,
  and records no sale/CRM data.

## New evidence

| Check | Result | Evidence |
| --- | --- | --- |
| Local controlled negative states | PASS: loading, empty, append error with retained cards, rate-limit, maintenance, unavailable and image-error fallback | `evidence/g3/qa-interaction-results.json` and `qa-*.png` |
| Exact interactive threshold | PASS: 79 remains ordinary DOM grid; 80 and 81 activate 2-column virtual grid | `evidence/g3/qa-interaction-results.json` |
| Green read-only flow | PASS: categories, filter/Escape, detail/gallery, search race/IME harness, 80-record virtual list, focus retention, mobile/desktop columns and GSAP | `evidence/g3/interaction-results.json` |
| Locked Designer comparison | PASS with allowed runtime-data variance: local catalog, search, detail and gallery were paired at 390×844/DPR1/reduced-motion | `evidence/g3/visual-comparison-results.json` and `visual-*.png` |

The append-error run exposed an observer retry loop. The narrow corrective
change in `src/components/catalogue/catalogue-feedback.tsx` disables the
intersection observer after a failed append; only the visible retry button can
request the next attempt. The QA browser evidence then shows retained cards and
the error state without a repeated automatic request loop.

## Quality checks

| Command | Result |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS, zero warnings |
| `npm run test` | PASS, 12 files / 53 tests |
| `npm run build:backend-preview` | PASS |

## Boundaries retained

No quote POST, Green write, fixture deployment, Customer/Production action,
UAT data, push, merge or deployment occurred. This remains headless browser
evidence only: G5 still owns the required real Zalo Android/iPhone, physical
Vietnamese IME, safe-area and native-Back evidence. The visual result is a
structural pass under approved data/media variance, never a zero-pixel match.
