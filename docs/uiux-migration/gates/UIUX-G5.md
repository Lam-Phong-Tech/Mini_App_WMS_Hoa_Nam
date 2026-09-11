# UIUX-G5 — BLOCKED

**Revalidated:** 2026-09-12T01:20:52+07:00 against implementation `b471a799854b654631a2d76ece6a3a2a6acbb41e`.

Final G5 acceptance remains blocked. Its G1–G4 chain is stale: G1
source-output hashes changed and G1–G3 reference an older `decisions.json`.
One physical Android leg has now been executed, but the iPhone leg and final
visual/motion acceptance matrix are still unavailable. The Android run also
found G5-A01: native Zalo chrome covers the global quote-entry control and
closes the Mini App instead of opening product selection.

After this preflight, the local implementation was revalidated for host-specific
safe-area handling, Contact/Search copy/layout, the pinned build toolchain and
the approved 375×812 visual target. It does not make G5 PASS, and makes no API
write, quote POST, fixture change, commit, push or Production deployment. See
[the live Designer audit](../g5/live-designer-screen-audit-2026-09-10.md).

See [the entry blocker report](../g5/preflight-blockers.md) and
[the machine-readable gate record](UIUX-G5.json).

The Android execution record is
[available here](../evidence/g5/android-xiaomi-2206122sc-2026-09-10.md).

The acceptance viewport and current capture blocker are recorded in the
[2026-09-11 visual matrix](../g5/visual-matrix-2026-09-11.md). The gate is
still **BLOCKED**: deterministic checks pass, but the final actual/reference/
diff set and iPhone-on-Zalo leg do not yet exist.

The latest Android route run is recorded in
[android-xiaomi-2206122sc-routes-2026-09-12.md](../evidence/g5/android-xiaomi-2206122sc-routes-2026-09-12.md): Detail, Gallery, Quote,
Compare and native Back pass; resume and same-viewport visual diff remain
partial.
