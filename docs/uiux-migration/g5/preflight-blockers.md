# UIUX-G5 preflight — BLOCKED

**Recorded:** 2026-09-10T14:41:28.5365499+07:00

## Read-only environment check

- Current branch / `HEAD` / `origin/mini_product`:
  `mini_product` / `7782cd9af5843d82a39cf6c2b61ee5a9ae931e35` /
  `7782cd9af5843d82a39cf6c2b61ee5a9ae931e35`.
- Locked Designer baseline remains
  `Duc-Nguyen98/WMS_UIUX_HoaNamv2@86079f965f2fcb43a7e3efbbc9467d119b47921f`.
  The live reference URL is currently reachable and rendered, but it exposes
  no immutable commit identifier. It is not substituted for the locked source.
- Node `v24.19.0`; npm `11.17.0`; `package.json` SHA-256
  `1b639e33d62ffd86321dcf2790ed007277c7196df563d6ac28efd9c80e6bcfbc`;
  `package-lock.json` SHA-256
  `47a387d38b463493f1799c9ba8f0f70595f4aa1f452b4910f4abc5923e43ffba`.
- The working tree has the uncommitted G1–G4 implementation, evidence and
  local environment files listed by `git status`; nothing was reset, removed,
  committed, pushed or deployed during this preflight.

## Entry blockers

### G5-B01 — prior-gate artifact lineage is stale

The required G1–G4 PASS chain is not valid for the current working tree.
Read-only hash verification found:

| Gate | Artifact | Expected SHA-256 | Current SHA-256 |
| --- | --- | --- | --- |
| G1 | `decisions.json` | `0b50d376…` | `8abf3bbd…` |
| G1 | `src/types/public-api.ts` | `bc059969…` | `f39e2454…` |
| G1 | `src/services/backend-public-mappers.ts` | `3ce48141…` | `34220da6…` |
| G1 | `src/services/public-api.ts` | `fb8df1bb…` | `d180e25f…` |
| G1 | `src/services/quote-service.ts` | `abf1ea8c…` | `75f5d337…` |
| G1 | `src/pages/quote-request.tsx` | `89592ede…` | `a43a631e…` |
| G2 | `decisions.json` | `cccf7398…` | `8abf3bbd…` |
| G3 | `decisions.json` | `1b5f9fa3…` | `8abf3bbd…` |

The new decisions include later approved D13 material, but G1–G3 have not
been revalidated or re-recorded against it. The G1 source artifacts also
changed after the G1 record. A status string of `PASS` cannot replace those
missing revalidations.

### G5-B02 — physical-device matrix is only partially complete

The Android leg was executed on 2026-09-10 using Xiaomi 2206122SC, Android 13,
Zalo 26.08.02 and Vietnamese Gboard. It demonstrated Home, catalogue append
and deep scroll, product detail, native Back, and a clean visible Eruda
console/network read path. See
[`android-xiaomi-2206122sc-2026-09-10.md`](../evidence/g5/android-xiaomi-2206122sc-2026-09-10.md).

This does not complete the matrix: the global quote-entry control overlaps
Zalo's native close chrome (G5-A01), so Vietnamese IME/form-focus and
resume cases cannot yet be passed; a named iPhone running Zalo has also not
been supplied. Desktop/headless or the local in-app browser cannot replace
the missing iPhone evidence.

### G5-B03 — final visual/motion matrix cannot be truthfully measured yet

The baseline has no approved final matrix binding exact desktop height/DPR,
real-device browser/runtime, route data, capture timing or zero-diff
exceptions. Existing G2/G3 visual captures are structural comparisons with
approved runtime-data variance, not a whole-app zero-pixel result. The G5
matrix must therefore remain `NOT_RUN`, not PASS.

## Safe stopping point

No G5 source code, runtime configuration, API call, quote POST, fixture,
Customer/Production operation, deployment, push or commit was performed. No
final acceptance matrix, visual/motion result, performance result, review
patch or runbook has been produced because doing so would imply a G5 execution
after a failed entry condition.

## Required authorization/input

To proceed, the user must explicitly authorize revalidation of the stale
G1–G4 lineage on the current working diff and supply access to one named
Android and one named iPhone running Zalo (model, OS, Zalo version, orientation
and test availability), plus the final viewport/DPR/visual acceptance rule.
Revalidation will remain local/read-only where possible and will not issue a
new Green quote POST unless separately authorized.
