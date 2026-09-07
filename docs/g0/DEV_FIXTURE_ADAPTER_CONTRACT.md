# DEV FIXTURE / ADAPTER CONTRACT — G0

## Fixture boundary

The runtime DEV adapter now exposes `DEV_UI_PREVIEW_FIXTURE_NOT_UAT_OR_PRODUCTION` following the explicit request to populate the interface before an approved Catalogue source is connected. It is a **visual-preview-only** fixture, with `approved_catalogue_data_present: false`.

Every record is explicitly marked as a DEV preview and uses the prototype's visible names, models, descriptions, features, and local sample images so the layout can be reviewed. It carries no barcode, price, quantity, internal source, supplier data, hotline/OA value, PII, secret, CRM field, or quote data. Product identifiers and model strings are retained only to exercise the public card/detail layout and must not be treated as approved catalogue identifiers.

`dev-empty-catalogue.fixture.json` remains the original empty-contract reference for safe fallback and empty-state testing. It is not an approved catalogue import. The source of truth for the currently rendered DEV preview is the typed `DevMockPublicApiAdapter`, so components never bypass the API boundary with local sample objects.

## Adapter behavior

| Endpoint | DEV preview response | Contract assertion |
| --- | --- | --- |
| `GET /config` | `DEV-UI-PREVIEW-1`, catalogue preview enabled, quote disabled, all contact values unavailable | UI can render the preview but must not invent hotline/OA or enable quote submission. |
| `GET /home` | Three canonical domains, category highlights, and synthetic preview cards | Home may show only API-supplied non-empty sections and must show the DEV warning. |
| `GET /categories` | Seven neutral categories; optional `domain` filters them | Category navigation is visible without claiming approved taxonomy content. |
| `GET /products`, `/related` | Synthetic cards only; supports trimmed, case-insensitive, Vietnamese diacritic-insensitive `q`, domain/category, sort, opaque cursor and limit | No component-local data; unsupported power-source, feature, or spec filters safely produce no sample match because the fixture contains no invented attributes. |
| `GET /facets` | Category facet only, optionally restricted by domain | Filter UI never exposes fabricated specs, feature or power-source values. |
| `GET /products/{slug}` | One synthetic detail for a known `dev-preview-*` slug; otherwise `404 PRODUCT_NOT_FOUND` | Product unavailable remains safe for unrecognised/deep-linked records. |
| `GET /health/version` | Safe version/status only | Never exposes host/dependency/infrastructure details. |
| `POST /quote-requests` | `409 PRODUCT_NOT_AVAILABLE` | Form shows safe availability change. No PII test fixture or fake success is committed. |

## Interface invariants for future mock/BFF adapters

1. Implement exactly the paths, query normalization, envelope, DTO allowlist, pagination, errors, and headers in `openapi.v1.yaml`.
2. Filter the source before mapping: only `PUBLISHED` rows whose BE-projected public availability is `IN_STOCK` or `PREORDER` can produce public DTOs. Never map quantity, raw stock status, price, supplier, internal note, source reference, raw HTML, or secret.
3. A DEV preview can exist only under an explicit DEV mock setting, must retain the `NOT_UAT_OR_PRODUCTION` label, and must be replaced by approved data through the same adapter after BA/Data Entry quality approval.
4. The mock can generate transient test responses during automated tests, but it must not commit real product/quote/PII values or claim production persistence.
5. The quote adapter first resolves product/variant public eligibility, validates input, derives `consent_at` and `source`, and enforces the specified idempotency semantics. It performs no downstream call or queue publication.
6. Do not bypass the adapter with component-local hard-coded product objects. DEV/UAT/Production use the same DTO boundary; only the configured adapter/source differs.

## Data red flags carried forward

- **This preview is not Catalogue, UAT, or Production data.** It must never be exported, mapped to a real source, or used for customer communication.
- The prototype's sample records and base64 images are not approved fixture input.
- The SRS-referenced 497-model file/PDF/catalogue sources are absent, as are source mapping, publication status, media approvals, and an actual quote persistence provider.
- Until approved data/persistence exists, the preview demonstrates layout and API-bound UI only. Any UAT/Production claim is invalid.
