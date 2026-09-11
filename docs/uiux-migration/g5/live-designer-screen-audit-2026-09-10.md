# UIUX-G5 — live Designer screen audit and structural sync

**Recorded:** 2026-09-10  
**Locked implementation baseline:** `Duc-Nguyen98/WMS_UIUX_HoaNamv2@86079f965f2fcb43a7e3efbbc9467d119b47921f`  
**Live reference inspected:** `https://duc-nguyen98.github.io/WMS_UIUX_HoaNamv2/preview/?zarsrc=30#view=detail&product=dczc02-26`  
**Target:** local Mini App against the approved Green/DEV-TEST public API

## Baseline rule

The live URL is mutable and does not identify a commit in its response.  Its
visible Detail, Request and Contact screens were inspected as a reference, but
the implementation baseline remains the user-approved immutable commit above.
The reference repository was checked out detached at that SHA solely to build
the inventory below.  No Designer product, image, hotline, OA, FAQ fixture,
privacy text or other runtime data was copied into the Mini App.

## Complete screen inventory

| PV | Designer view | Target route | Sync result in this change |
| --- | --- | --- | --- |
| PV-01 | Home | `/home` | Shared light shell, sticky header/search, hero, groups, library entries and 3-item bottom navigation retain the locked visual vocabulary. |
| PV-02 | Product groups | `/categories` | Search entry is now available from groups; domain/category data remains public-API driven. |
| PV-03 | Catalogue | `/products` | Green cards/grid/virtual threshold remain intact; shared tokens apply. |
| PV-04 | Filter and sort | `/filters` | Existing bottom sheet behavior and API facets remain intact; no hard-coded Designer filter data added. |
| PV-05 | Search | `/search` | Existing IME/debounce/race handling remains intact; no behavior change. |
| PV-06 | Detail | `/products/:slug` | Rebuilt the visible hierarchy toward Designer: return action, framed media, availability/category, product code, title, grouped save/compare, related-card metadata and fixed three-action conversion bar. |
| PV-07 | Large image | `/products/:slug/gallery` | Existing public-media only gallery and 100–300% controls remain intact; palette now follows shared Hoa Nam tokens. |
| PV-08 | Contact | `/contact` | Existing config-gated request/hotline/OA/hours screen remains active; it never substitutes Designer literals for config values. |
| PV-09 | Call/OA handoff | detail/contact actions | Native tel/OA handoff and unavailable OA state remain config gated. |
| PV-10 | Quote request | `/quote`, `/products/:slug/quote` | Existing multi-product form remains intact and uses the shared token palette. |
| PV-11 | Request receipt | `/requests` | RAM-only receipts remain intact and now use the shared token palette. |
| PV-12 | Privacy/consent | quote request | Mandatory explicit consent and public `privacy_version`/policy URL remain intentionally different from the live fixture form. |
| PV-13 | Recently viewed | `/recent` | ID-only persistence, Green ID lookup and the shared visual system remain intact. |
| PV-14 | Saved products | `/saved` | ID-only persistence, `missing_ids` reconciliation and the shared visual system remain intact. |
| PV-15 | FAQ | `/help` | Approved FAQ scope remains intact and now uses the shared token palette. |
| PV-16 | Multiple product selection | `/selection` | One 1–20-item request flow remains intact and now uses the shared token palette. |
| PV-17 | Received request review | `/requests` | Same-session receipt boundary remains intact and now uses the shared token palette. |
| PV-18 | Compare | `/compare` | Same-domain/category 2–3 selection and public-spec fallback remain intact and now use the shared token palette. |

## Observed live-versus-target differences that cannot be removed by CSS

1. The live Designer Detail uses fixture product `DCZC02-26`; the target must
   show the Green public product returned for its real slug, media, category,
   availability and specifications.  Copying the fixture would violate the
   approved runtime-data boundary.
2. The live Request form does not visibly require a consent checkbox.  The
   target must retain the approved, initially unchecked consent together with
   `privacy_version` and `privacy_policy_url`; removing them would break the
   accepted quote contract and legal boundary.
3. The live Contact screen displays its fixture hotline/support hours.  The
   target must display only public config.  An absent OA continues to render as
   unavailable rather than inventing a chat URL.
4. Pixel equality and final G5 are still blocked by the recorded gate lineage
   revalidation and real Zalo Android+iPhone evidence.  This audit is a
   structural/style sync, not a claim of a zero-pixel diff or G5 PASS.

## Verification after the sync

- `npm run typecheck` — PASS
- `npm run lint` — PASS
- `npm run test` — PASS, 14 files / 62 tests
- `npx --yes zmp-cli build --mode backend-preview` — PASS
- Local UI inspection confirmed the revised Detail contains the return action,
  public code, grouped save/compare controls and related-card availability/code
  metadata.  No quote form was submitted and no quote POST was made.
