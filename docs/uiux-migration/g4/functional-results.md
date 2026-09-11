# UIUX-G4 functional results — PASS

**Completed:** 2026-09-10T14:19:23.0864237+07:00

## Focused local UI check

The local backend-preview app was inspected at
`http://localhost:3000/products/kim-mui-dai-8-inch-d070101/quote` after the
G4 implementation. The selected public product resolved to its readable label
(`DongCheng sê-ri D07`), rather than an ID. The page displayed the editable
selection, policy link, policy version `1.0.0`, name/phone/note fields and the
unselected required consent control. No field was filled, no consent was
changed and the submit button was not activated, so this observation issued no
quote POST and transmitted no PII.

Earlier in the same local Green-backed inspection, a product was saved from
Detail, then showed again in Saved after D13 rehydration; opening it also
appeared in Recent after navigation. Selection rendered valid public Home
records despite the invalid ordinary-list data, and two products could be
selected (`0/20` to `2/20`). Contact and FAQ states rendered configured values
and the explicit OA-unavailable state.

## Automated verification

| Check | Result |
| --- | --- |
| `npm run typecheck` | PASS — 0 TypeScript errors |
| `npm run lint` | PASS — 0 ESLint warnings |
| `npm run test` | PASS — 14 files, 62 tests |
| `npm run build:backend-preview` | PASS — ZMP CLI 4.0.3 / Vite production preview build |

Focused tests cover public ID lookup serialization/validation, ID-only storage
and missing-ID handling, quote phone/consent/privacy/idempotency/order,
1,000-character note, unique 1–20 item range, single in-flight submission, and
comparison removal/max-three/taxonomy restrictions.

## Boundary retained

This is a functional implementation gate, not a claim of pixel-perfect G4
comparison or physical-device acceptance. D06–D08 compatibility/scroll and
real Zalo Android+iPhone evidence remain G5/final-acceptance work. No G4
fixture was used or published.
