# REQUIREMENT MAPPING G0–G4

## Gate mapping

| Gate | Scope and requirement mapping | Exit evidence for the gate |
| --- | --- | --- |
| G0 — analysis/contract | Scope lock; SRS/prototype/source reconciliation; FR-001–012, FR-014/015/017 contract implications; public taxonomy, DTO, envelope, OpenAPI, errors, config matrix, and empty DEV contract fixture. `FR-013`, ADR-04, ADR-05 are deprecated. | These G0 artifacts pass consistency and leakage checks. No product source/UI mutation. |
| G1 — foundation (future) | Public no-login shell; routes for SCR-01–11; 3-item navigation; typed client/adapter/config boundary; safe loading/empty/error/no-network/maintenance states. | Build/typecheck/lint/test evidence; no hard-coded operations/secrets or prohibited scope. |
| G2 — catalogue (future) | FR-002–010 and the public part of FR-014: Home, taxonomy, list/search/filter/sort, detail/gallery, optional variants/media/related, availability and deep-link-unavailable behavior. | Contract-bound catalogue tests with approved data or empty state; no duplicated cursor records or unavailable data leak. |
| G3 — conversion (future) | FR-011–012 only: config-driven hotline/OA/share/deep link and minimal idempotent quote request. | Quote validation/idempotency evidence against the exact G0 schema; no CRM/ERP/queue/retry/notification code or request. |
| G4 — hardening/UAT (future) | FR-015/017 and applicable NFRs: responsive/accessibility, public-data quality, PII-safe error/log handling, rate-limit/maintenance/media states, security, build/tests, UAT evidence. Analytics is evaluated only if it remains PII-safe and does not add the omitted `/events` contract. | Evidence-based readiness decision; missing catalogue/persistence remains a red flag, never a fabricated pass. |

## Canonical taxonomy codes

These are contract codes, not catalogue records. They must be approved/mapped by BA/Data Entry before import; the API returns only categories that are `PUBLISHED` and have public eligible products.

| Domain code | Proposed category code | Display label baseline |
| --- | --- | --- |
| `POWER_TOOLS` | `POWER_DRILL_DRIVERS` | Khoan & siết |
| `POWER_TOOLS` | `POWER_MASONRY` | Bê tông & xây nề |
| `POWER_TOOLS` | `POWER_GRIND_POLISH` | Mài & đánh bóng |
| `POWER_TOOLS` | `POWER_SAW_CUT` | Cưa & cắt |
| `POWER_TOOLS` | `POWER_PLANING_CUT` | Bào & cắt |
| `POWER_TOOLS` | `POWER_CLEANING` | Làm sạch |
| `POWER_TOOLS` | `POWER_GARDEN_OUTDOOR` | Làm vườn & ngoài trời |
| `POWER_TOOLS` | `POWER_MEASUREMENT_LIGHTING` | Đo lường & chiếu sáng |
| `POWER_TOOLS` | `POWER_PNEUMATIC` | Khí nén |
| `POWER_TOOLS` | `POWER_OTHER` | Khác |
| `HAND_TOOLS` | `HAND_CLAMPING` | Kẹp giữ |
| `HAND_TOOLS` | `HAND_WRENCHES` | Cờ lê |
| `HAND_TOOLS` | `HAND_SOCKETS` | Đầu tuýp |
| `HAND_TOOLS` | `HAND_DRIVING` | Siết vặn |
| `HAND_TOOLS` | `HAND_CUTTING` | Cắt |
| `HAND_TOOLS` | `HAND_MEASURING` | Đo lường |
| `HAND_TOOLS` | `HAND_ELECTRICAL` | Cơ ngành điện |
| `HAND_TOOLS` | `HAND_PAINTING_PLASTERING` | Sơn & làm tường |
| `HAND_TOOLS` | `HAND_MECHANICAL` | Cơ khí |
| `HAND_TOOLS` | `HAND_HYDRAULIC` | Thủy lực |
| `HAND_TOOLS` | `HAND_STORAGE` | Lưu trữ |
| `HAND_TOOLS` | `HAND_GARDEN` | Làm vườn cầm tay |
| `ACCESSORIES` | `ACC_BATTERY_CHARGER` | Pin & sạc |
| `ACCESSORIES` | `ACC_DRILL_BITS_DRIVER_BITS` | Mũi khoan & đầu vít |
| `ACCESSORIES` | `ACC_CUTTING_BLADES_GRINDING_DISCS` | Lưỡi cắt & đá mài |

Other controlled vocabularies: `power_source` is one of `BATTERY`, `AC`, `PNEUMATIC`, `PETROL`, `NOT_SPECIFIED`; `sort` is one of `featured`, `updated_desc`, `name_asc`; public availability is only `IN_STOCK`.
