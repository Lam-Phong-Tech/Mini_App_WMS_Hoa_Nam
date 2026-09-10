# UIUX-G1 reference evidence

This directory records source-level evidence only. It does not contain a screenshot, pixel measurement, device run, exported Designer bundle, personal data, contact configuration, or production fixture.

The source inventory was recorded on 2026-09-08T17:22:02+07:00. Command outcomes are listed in `baseline-checks.json`; that file intentionally does not assert a fabricated common completion time for commands run separately.

- Target checkout: `mini_product`, `HEAD` and `origin/mini_product` both resolved to `411ba4d3ae4e287ef40626aba8ca6794924be1ef`.
- Designer checkout: `Duc-Nguyen98/WMS_UIUX_HoaNamv2` resolved with a per-command safe-directory override to `86079f965f2fcb43a7e3efbbc9467d119b47921f`.
- The live Designer URL returned HTTP 200 to a HEAD request. No page image, DOM geometry, console trace, route state, or asset-to-live-build correspondence was captured in this gate. The exact command timestamp was not captured, so the response is recorded without one.
- Target baseline commands were run locally: `npm run typecheck`, `npm run lint`, `npm run test`, and `npm run build`; each exited 0. The test run reported 12 files and 47 tests passed.

The design files listed in `source-manifest.json` were read as source references. Their own QA claims are not reclassified as UIUX-G1 runtime proof.

The following pre-existing user-local untracked paths were observed and deliberately left untouched: `.env.backend-preview`, `.env.dev-preview`, and `.tmp/` (including its contents). There were no tracked or staged code diffs at the time recorded above.
