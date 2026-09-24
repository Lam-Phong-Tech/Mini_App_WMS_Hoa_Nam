# UIUX-G5 — BLOCKED

**Revalidated:** 2026-09-13T10:00:00+07:00 against implementation `763da9965d0074e5a216004cbf039cab0d0c810c` and Zalo Testing Version 34.

Final G5 acceptance remains blocked. Its G1–G4 chain is stale: G1
source-output hashes changed and G1–G3 reference an older `decisions.json`.
The Android leg has now been rerun on Zalo Testing Version 34: Home, Catalogue,
Detail, Gallery, Quote entry/IME focus, Compare, native Back and
background/resume all pass. The native quote-entry control is clear of the
Android Zalo Capsule. The physical iPhone leg is still unavailable and the
existing responsive visual matrix fails its 2% mismatch budget.

After this preflight, the local implementation was revalidated for host-specific
safe-area handling, Contact/Search copy/layout, the pinned build toolchain and
the approved 375×812 visual target. It does not make G5 PASS, and makes no API
write, quote POST, fixture change, commit, push or Production deployment. See
[the live Designer audit](../g5/live-designer-screen-audit-2026-09-10.md).

See [the entry blocker report](../g5/preflight-blockers.md) and
[the machine-readable gate record](UIUX-G5.json).

The Android execution record is
[available here](../evidence/g5/android-xiaomi-2206122sc-2026-09-10.md).

The acceptance viewport and current visual failure are recorded in the
[2026-09-11 visual matrix](../g5/visual-matrix-2026-09-11.md). The gate is
still **BLOCKED**: deterministic checks pass, but the same-viewport diff set
exceeds the 2% budget and the iPhone-on-Zalo leg does not yet exist.

The latest Android Version 34 route run is recorded in
[android-xiaomi-2206122sc-routes-2026-09-12.md](../evidence/g5/android-xiaomi-2206122sc-routes-2026-09-12.md): Detail, Gallery, Quote,
Compare, native Back and background/resume pass. Same-viewport visual diff and
the physical iPhone-on-Zalo leg remain blocking evidence gaps.
