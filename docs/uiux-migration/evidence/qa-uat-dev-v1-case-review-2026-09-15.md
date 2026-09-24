# UAT_Dev_v1 case-by-case review — 2026-09-15

## Scope

- Source: [UAT_HOANAM_App_ PV_v1 — UAT_Dev_v1](https://docs.google.com/spreadsheets/d/1JKStrpk-4K0USrXCF7YkmB0TQRAJcesLbPUlkYO4h-o/edit?gid=1834824608#gid=1834824608).
- Reviewed rows: 10–27, covering 17 UI cases and one Compare functional case.
- Every linked image in the `Evidence` column was inspected. Multi-image cases were reviewed as a set; data values such as product names, stock count, and category count remain API-sourced rather than hard-coded from the mock-up.
- Browser retest: Public API, iPhone viewport `375 × 812` CSS px.
- Android retest: Xiaomi `2206122SC`, Android 13, Zalo `26.08.02`; Testing Version 43.

## Case matrix

| Case | QA evidence | Defect addressed | Current verification | Result |
| --- | --- | --- | --- | --- |
| TC_UI_01 | `I10` | Header logo, Hero composition, CTA, group cards. | Replaced header asset with the supplied Hoa Nam oval logo, cropped to remove outer white margin; retained `HOA NAM / TOOLS` copy. Hero, CTA and group cards render in the reference order. | PASS in browser source. |
| TC_UI_02 | `I11` | Main-category tile layout and icon/content alignment. | Home uses a responsive two-column category strip and separate user-library links; each tile has its own icon, label and tap target. | PASS in browser source. |
| TC_UI_03 | `I12` | Product-card image/title/status overlap and recent layout. | Shared `ProductCard` reserves the status rail, clamps titles to two lines, and keeps image, CTA, Save and Compare actions separate. | PASS in browser source. |
| TC_UI_04 | `I13` (two images) | Count placement and progress copy. | Count is aligned on the catalogue toolbar; progress uses `Đã hiển thị x / y sản phẩm`. It reflects loaded API records and never fabricates a global total. | PASS for layout/data contract. |
| TC_FUNC_01 | `I14` / linked bug | Compare previously only changed a control state. | Smoke test added two same-category products, opened `/compare`, found two roster items and a comparison table. | PASS. |
| TC_UI_05 | `I15` (two images) | Search topbar and result structure. | Search reuses shared topbar Back/input, uses an icon-only clear control, preserves title/description, and renders compact result rows rather than a two-column catalogue grid. | PASS. |
| TC_UI_06 | `I16` | Hamburger side drawer. | Hamburger now opens the centred `Tiện ích sản phẩm` modal with the `Xem lại`, `Lựa chọn & tư vấn`, and `Hỗ trợ` groups. | PASS. |
| TC_UI_07 | `I17` | Plane icon opened product selection instead of Quote. | Header plane smoke route: `/quote`. | PASS. |
| TC_UI_08 | `I18` | Selected category card color/icon state. | Selected group uses the blue gradient surface with white icon/text; inactive group remains neutral. | PASS in browser source. |
| TC_UI_09 | `I19` (two images) | Domain/category content did not update correctly. | Groups and category lists are driven by the selected public domain/category. Data count/list differences follow the API and are not fixture overrides. | PASS for functional/data binding. |
| TC_UI_10 | `I20` | Missing applied-filter context and progress. | Applied domain/category chips, remove actions, `Xóa bộ lọc`, dynamic result count and progress are shown. | PASS. |
| TC_UI_11 | `I21` | PREORDER visual marker. | The live Public API has PREORDER products; filter smoke loaded later cursor pages and displayed four `Đặt trước` cards, each with the clock icon. | PASS. |
| TC_UI_12 | `I22` (five images) | Detail gallery, identity, info/spec, related grid and extra related action. | Gallery uses the lower `Xem ảnh lớn` rail; title removes repeated item-code suffix; Save/Compare labels are visible; information/spec CTA follows reference flow; related section has progress rather than the obsolete extra button. | PASS in browser source. |
| TC_UI_13 | `I23` (two images) | `Tư vấn thông số` opened Quote. | Detail action smoke route: `/contact`. | PASS. |
| TC_UI_14 | `I24` | Detail fixed footer actions. | Contact actions remain two compact left controls plus full-width `Gửi yêu cầu đặt hàng` CTA. | PASS in browser source. |
| TC_UI_15 | `I25` (two images) | Contact cards, hotline copy, Zalo OA and support hours. | Public-config Contact renders request, hotline/copy button, unavailable OA badge and Vietnamese support-day mapping. | PASS in browser source. |
| TC_UI_16 | `I26` (four images) | Contact request opened standalone selection. | Contact CTA smoke route: `/quote`. Empty Quote state shows form first and places `Sản phẩm quan tâm` + `Chọn sản phẩm` in the form, matching the reference hierarchy. | PASS. |
| TC_UI_17 | `I27` | Status bar, Zalo Capsule and bottom navigation overlap. | Android Testing v43 confirms Header is below the Android status bar and plane action is left of the native Capsule; bottom navigation is visible. | PASS. |

## Automated and flow checks

- `npm run typecheck` — PASS.
- `npm run lint` — PASS.
- `npm test` — PASS, 64/64.
- Browser smoke — PASS: menu modal, Header plane → Quote, Contact → Quote, PREORDER loading/filter, Detail → Gallery, Detail → Contact, and two-product Compare table.

## Testing deployment and Android evidence

- Zalo Testing deploy: PASS, Version 43. Production was not changed.
- Android Home: [android-v43-home.png](android-v43-home.png) confirms the cropped oval logo, status-bar clearance, and Capsule clearance.
- Android Quote: [android-v43-quote.png](android-v43-quote.png) confirms Header plane → `Gửi yêu cầu đặt hàng` and the combined contact/product-selection form.

## Data-contract note

The public product endpoint exposes cursor pagination (`limit`, `has_more`, `next_cursor`) but does not expose a global `total`. UI counts therefore correctly describe loaded/visible records and must not be represented as the full catalogue count until the backend exposes that field.
