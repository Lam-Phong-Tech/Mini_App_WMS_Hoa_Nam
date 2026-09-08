# GATE 01 — Khảo sát & Xác định phạm vi migration

| | |
|---|---|
| **Trạng thái** | ✅ **PASS** |
| **Token** | ✅ **Đã phát hành** — xem §9 |
| **Commit khảo sát** | `663114aff6804e50b77b88e05dda9f9c784d6fff` |
| **Branch** | `main` |
| **Ngày nghiệm thu** | 2026-09-04 — người dùng gửi `APPROVE_GATE_01` |
| **Câu hỏi** | **10/10 đã đóng** (7 xác nhận trực tiếp · 3 `PASS_FOR_ARCHITECTURE`) |
| **Hoãn sang Gate chuyên biệt** | Q4, Q5 → [`GATE_PDA_HARDWARE_CERTIFICATION`](GATE_PDA_HARDWARE_CERTIFICATION.md)<br>Q9 → [`GATE_WMS_API_INTEGRATION`](GATE_WMS_API_INTEGRATION.md) |
| **Change Control** | **2026-09-05** — Q2 tái xác nhận `CHỈ Android` (§0) · 🔓 **nới ràng buộc offline cho Prompt 3** (§0b) |
| **⚠️ Cảnh báo** | **PASS ≠ production-ready** — xem §10 |

---

## 0. Change Control 2026-09-05 — Q2 tái xác nhận `CHỈ Android`

### 0.1 Sự việc

Đợt kiểm chứng lại ngày 2026-09-05 phát hiện **mâu thuẫn giữa hai tài liệu đã nghiệm thu**:

| Nguồn | Nói gì | Sửa lần cuối |
|---|---|---|
| Tài liệu này §2.1 Q2 | "**CHỈ Android**" | 2026-09-04 20:12 |
| [01-platform-comparison.md](../01-platform-comparison.md) dòng 5, 15, 26, 241 | "Android + iOS" | 2026-09-04 18:21 |

§5 điều kiện 7 của bản 2026-09-04 ghi *"Không còn mâu thuẫn Q1–Q10 giữa các tài liệu ✅ — đã rà và sửa"* — **khẳng định này sai**, mâu thuẫn vẫn còn ở 4 vị trí. Đây là lỗi của tài liệu, không phải của quyết định.

### 0.2 Quyết định của người dùng (2026-09-05)

> **"Không triển khai iOS. Phạm vi hiện tại chỉ gồm Android và máy PDA Android. Không tạo hoặc cấu hình dự án iOS."**

→ **Q2 giữ nguyên `CHỈ Android`.** Tài liệu sai là [01-platform-comparison.md](../01-platform-comparison.md) — đã sửa 4 vị trí trong cùng đợt này.

### 0.3 Hệ quả

| # | Hạng mục | Kết luận |
|:--:|---|---|
| 1 | Q3 (`Android 7.0 / API 24`) | ✅ **Không đổi** — không cần phiên bản iOS tối thiểu |
| 2 | Q10 (`APK ký số, nội bộ, Android only`) | ✅ **Không đổi** — không cần cơ chế phát hành iOS |
| 3 | `apps/wms-mobile/ios/` và `Gemfile` đã bị Prompt 2 xoá | ✅ **Vẫn đúng** — [GATE_02 §4.3](GATE_02.md) giữ nguyên hiệu lực |
| 4 | [02-architecture.md §1.2](../02-architecture.md) *"iOS đã được gỡ khỏi phạm vi"* | ✅ **Vẫn đúng** — không phải sửa |

⚠️ Câu trả lời `Q10-iOS = "cần hỏi lại công ty"` **không còn áp dụng**: iOS đã ra khỏi phạm vi nên không có gì để phát hành trên iOS. Nếu sau này công ty yêu cầu iOS thì phải **mở lại phạm vi và lập Gate riêng**, theo đúng ràng buộc Q2.

### 0.4 Token — không đổi

Không có quyết định nào bị thay đổi, nên token §9 giữ nguyên hiệu lực và Gate giữ `PASS`:

```
GATE_01_PASS|sha=663114aff6804e50b77b88e05dda9f9c784d6fff|platform=REACT_NATIVE|ui_scope=NEW_APP
```

---

## 0b. 🔓 Change Control 2026-09-05 (lần 2) — nới ràng buộc offline cho Prompt 3

### 0b.1 Quyết định của người dùng

Khi chạy Prompt 3, người dùng chọn **"Gỡ ràng buộc GATE_01 để làm §D"** — cho phép xây hàng đợi đồng bộ **trước khi** `GATE_WMS_API_INTEGRATION` PASS.

### 0b.2 Điều gì được nới

| Ràng buộc cũ | Trạng thái mới |
|---|---|
| §3 — *"❌ Không mở hàng đợi đồng bộ mutation"* | 🔓 **ĐƯỢC NỚI** — được phép xây hàng đợi, persistence, khôi phục sau restart, chống gửi trùng |
| §11 điều 5 — *"Triển khai offline mutation · retry request ghi"* | 🔓 **ĐƯỢC NỚI** ở mức **cơ chế**; xem giới hạn §0b.3 |

### 0b.3 🔴 Điều gì VẪN CÒN NGUYÊN — không được nới

| # | Vẫn cấm | Vì sao |
|:--:|---|---|
| 1 | **§11 điều 4** — gọi mutation thật lên WMS production | Chưa có môi trường nào được xác nhận |
| 2 | **§11 điều 6** — gửi `Idempotency-Key` với giả định server hỗ trợ | 🔄 **Cập nhật 2026-09-05:** spec OpenAPI thật **CÓ** tài liệu hoá `Idempotency-Key` trên **48 endpoint** ([03-api-contract-delta.md §3](../03-api-contract-delta.md)) → không còn là *giả định*. Nhưng **vẫn cấm gửi** cho tới khi kiểm chứng trên staging và có Change Control — [Gate WMS §5 điều 4](GATE_WMS_API_INTEGRATION.md) |
| 3 | **§11 điều 8** — tự xác định lớp môi trường `khohoanamdev.bigk.click` | Chưa ai xác nhận |
| 4 | Tự đặt **quy tắc xử lý xung đột** và **ngữ nghĩa idempotency** | Prompt 3 cấm thẳng: *"Không được tự đặt quy tắc xử lý xung đột hoặc idempotency"* |
| 5 | Tuyên bố hàng đợi *"đã hoạt động với backend thật"* | Chưa gọi endpoint nghiệp vụ nào |

### 0b.4 ⚠️ Rủi ro người dùng đã chấp nhận

Hàng đợi sẽ được xây dựa trên **~42 endpoint Nhóm B** mang nhãn `CLIENT_EXPECTED_CONTRACT` — suy ra từ call-site của Mini App cũ, **chưa từng đối chiếu với server thật**.

| Rủi ro | Hệ quả nếu contract thật khác |
|---|---|
| Payload/response sai khác | Phải sửa tầng mapping |
| Server không hỗ trợ idempotency | Có thể tạo **bản ghi trùng** khi retry → sai tồn kho |
| Quy tắc xung đột thật khác | Phải viết lại toàn bộ nhánh conflict |

`GATE_WMS_API_INTEGRATION` **vẫn BLOCKED** và **vẫn bắt buộc PASS trước khi phát hành production**. Việc nới này chỉ để làm trước phần cơ chế, **không** rút ngắn được Gate đó.

---

## 1. Phạm vi của Gate này

Theo Change Control 2026-09-04, `GATE_01` được xác định lại là:

> **Gate quyết định kiến trúc và phạm vi migration.**
> **KHÔNG phải** Gate chứng nhận thiết bị PDA thật, **KHÔNG phải** Gate chứng nhận WMS API production.

Các xác minh phụ thuộc bên ngoài được tách sang hai Gate mới, **bắt buộc PASS trước khi phát hành production** nhưng không chặn `GATE_01`.

---

## 2. Mười quyết định đã đóng

### 2.1 Bảy câu xác nhận trực tiếp

| Q | Quyết định | Hệ quả ràng buộc |
|---|---|---|
| **Q1** | **React Native + TypeScript** | RN 0.76+ New Architecture · FlashList cho mọi danh sách · `react-native-mmkv` giữ API đồng bộ · characterization test cho tầng service **trước khi** port |
| **Q2** | **CHỈ Android**<br><sub>tái xác nhận 2026-09-05, xem §0</sub> | iOS **không** thuộc phạm vi hiện tại **và không** tính là cam kết dài hạn. ❌ Không thiết kế/build/test iOS. ❌ Không tạo hoặc cấu hình dự án iOS. Cần iOS → mở phạm vi + Gate riêng |
| **Q3** | **Android 7.0 / API 24 trở lên** | Khớp đúng yêu cầu tối thiểu của RN 0.76+. ⚠️ PDA thật < Android 7.0 → **DỪNG, báo lại**; không tự hạ phiên bản hay đổi kiến trúc.<br>✅ Đã xác minh khớp trong hiện thực: `minSdkVersion = 24` ([apps/wms-mobile/android/build.gradle:4](../../../apps/wms-mobile/android/build.gradle)) |
| **Q6** | **Chỉ sửa UI/UX trên app mới** | Zalo Mini App giữ nguyên. D-01/D-02/D-03/D-12/D-13 → ghi chú lịch sử. D-04/D-05/D-06/D-07/D-09/D-11 → **yêu cầu thiết kế bắt buộc** cho app RN |
| **Q7** | **Vuexy + baseline đã nghiệm thu** | Thứ tự ưu tiên: **baseline đã nghiệm thu → Vuexy → không có nguồn thứ ba**. Form/button/dialog → mẫu Basic & Default. Data Table → mẫu Kitchen Sink. `docs/design/` đã xoá (§6b) |
| **Q8** | **Offline thu hẹp** | Xem §3 |
| **Q10** | **APK ký số, nội bộ, Android only** | Không Google Play, không App Store, không build iOS. Signing key do công ty giữ. ❌ Không tự tạo key production · ❌ không đưa keystore vào Git · ❌ không ghi password vào source |

### 2.2 Ba câu `PASS_FOR_ARCHITECTURE`

| Q | Trạng thái | Nội dung chốt cho kiến trúc | Hoãn sang |
|---|---|---|---|
| **Q4** | `PASS_FOR_ARCHITECTURE — DEFERRED_TO_GATE_PDA_HARDWARE_CERTIFICATION` | Thiết bị mục tiêu: PDA + điện thoại Android ≥ 7.0. Scanner **bắt buộc dùng abstraction/adapter**, không phụ thuộc hãng. Nền tảng **phải hỗ trợ Camera + Keyboard Wedge**. Broadcast Intent/DataWedge và SDK hãng là **adapter tuỳ chọn**, chỉ thêm sau khi có thiết bị. ❌ Không tuyên bố tương thích hãng/model cụ thể. ❌ Không viết native module của hãng khi chưa có thiết bị/tài liệu | [PDA Gate](GATE_PDA_HARDWARE_CERTIFICATION.md) |
| **Q5** | `PASS_FOR_ARCHITECTURE — ACTUAL_SUFFIX_DEFERRED_TO_GATE_PDA_HARDWARE_CERTIFICATION` | Parser phải hỗ trợ: `Enter` · `Tab` · custom suffix cấu hình được · timeout kết thúc chuỗi cấu hình được · loại ký tự điều khiển · chống xử lý hai lần · buffer tuần tự · bật/tắt listener theo màn hình. Local/test dùng `Enter` mặc định — ⚠️ **không phải suffix của PDA production** | [PDA Gate](GATE_PDA_HARDWARE_CERTIFICATION.md) |
| **Q9** | `PASS_FOR_ARCHITECTURE — LIVE CONTRACT/AUTH/ENVIRONMENT DEFERRED_TO_GATE_WMS_API_INTEGRATION` | **Nhóm A** (12 endpoint, có controller/route thật): nguồn implementation đã xác minh, nhãn `DRAFT_DERIVED_FROM_SOURCE`, chưa phải production contract. **Nhóm B** (~42 endpoint từ call-site): nhãn `CLIENT_EXPECTED_CONTRACT`, xem §4 | [WMS Gate](GATE_WMS_API_INTEGRATION.md) |

📄 Đặc tả kiến trúc scanner: [01-scanner-architecture-requirements.md](../01-scanner-architecture-requirements.md)

---

## 3. Q8 — Quy tắc offline (bản thu hẹp, có hiệu lực)

**Lý do thu hẹp:** audit xác nhận **không có bằng chứng** WMS backend hỗ trợ `Idempotency-Key` — [01-api-inventory.md §5](../01-api-inventory.md).

| ✅ Được phép offline | ❌ Không được phép offline |
|---|---|
| Quét bằng camera | Tự động gửi mutation lên server |
| Nhập dữ liệu | Post Receipt |
| Tạo và chỉnh sửa local draft | Post Issue |
| Lưu local draft bền vững qua restart | Duyệt / huỷ / hoàn tất nghiệp vụ làm thay đổi tồn kho |
| Hiển thị trạng thái dữ liệu chưa gửi | Tự retry request ghi dữ liệu |

### 🔒 Hai lệnh cấm tới khi `GATE_WMS_API_INTEGRATION` PASS

1. ❌ **Không gửi header `Idempotency-Key`** với giả định server đã hỗ trợ.
2. ❌ **Không mở hàng đợi đồng bộ mutation** — chỉ mở sau khi Gate WMS xác nhận contract + duplicate handling + conflict handling.

> ✅ Bản thu hẹp loại bỏ hoàn toàn phụ thuộc vào giả định chưa có bằng chứng: mọi mutation do **người dùng chủ động bấm khi có mạng**.

---

## 4. Q9 — Hai nhóm API và cách dùng

| | Nhóm A — `backend/` | Nhóm B — WMS ngoài |
|---|---|---|
| Số endpoint | **12** | **~42** |
| Nguồn | Route + Controller **thật trong repo** | **Chỉ** call-site frontend |
| Nhãn | `DRAFT_DERIVED_FROM_SOURCE` | **`CLIENT_EXPECTED_CONTRACT`** |
| Tệp | [backend-mini-api.draft.yaml](../openapi/backend-mini-api.draft.yaml) | [wms-external-api.draft.yaml](../openapi/wms-external-api.draft.yaml) |
| Dùng làm | Nguồn implementation đã xác minh | Sinh types/interfaces · API adapter · mock server/fixtures · contract test **phía client** |
| ❌ Cấm | Coi là production contract khi chưa có chủ sở hữu API xác nhận | Coi là bằng chứng server hỗ trợ endpoint/payload/idempotency/conflict · gọi mutation thật · offline mutation · retry request ghi · Post Receipt/Post Issue · dùng credential từ source |

---

## 5. Điều kiện Gate — đối chiếu (tiêu chí sau Change Control)

| # | Điều kiện | Trạng thái |
|:--:|---|:--:|
| 1 | Kiểm kê toàn bộ route và màn hình | ✅ 22 route → **18 page** *(đính chính 2026-09-05: bản đầu ghi nhầm 17; danh sách tên vốn đã đủ 18)* |
| 2 | Kiểm kê ZaUI, Zalo SDK, scanner, storage, API | ✅ |
| 3 | Ghi rõ phần nào chưa thể kiểm tra | ✅ |
| 4 | Đóng đủ 10 quyết định kiến trúc | ✅ 7 trực tiếp + 3 `PASS_FOR_ARCHITECTURE` |
| 5 | Không còn giả định kiến trúc chưa được xác nhận **trong phạm vi Gate này** | ✅ — phần phụ thuộc bên ngoài đã tách sang 2 Gate mới |
| 6 | Mọi báo cáo có dẫn chứng file hoặc lệnh | ✅ |
| 7 | Không còn mâu thuẫn Q1–Q10 giữa các tài liệu | ✅ **— nhưng chỉ từ 2026-09-05.**<br>⚠️ Bản 2026-09-04 ghi "✅ đã rà và sửa" là **khẳng định sai**: mâu thuẫn Q2 vẫn còn ở 4 vị trí của [01-platform-comparison.md](../01-platform-comparison.md). Đã sửa thật 2026-09-05 và kiểm chứng bằng `grep` — xem §0 |
| 8 | Không có câu nào tuyên bố đã kiểm thử PDA thật hoặc WMS API thật | ✅ — đã quét toàn bộ tài liệu |

---

## 6. Phát hiện chính từ khảo sát

| # | Phát hiện | Bằng chứng |
|:--:|---|---|
| 1 | **Phụ thuộc Zalo ≈ 0** | `grep "zmp-sdk"` → 2 kết quả, **cả hai ở file chết**; `grep "scanQRCode"` → **0** |
| 2 | **`api.scanQRCode` không tồn tại** | Quét bằng `@zxing/browser` + `getUserMedia` |
| 3 | **79/155 file `src/` là code chết** | Phân tích đồ thị import từ entry (exit 0) |
| 4 | **Không có tích hợp máy quét phần cứng** | `"SCANNER"` chỉ là nhãn fallback, không call-site nào tạo ra từ thiết bị |
| 5 | **`docs/design/` là hồ sơ app bán hoa** | 10/10 file, 0 từ khoá WMS → đã xoá (§6b) |
| 6 | **`backend/` không phải backend app đang gọi** | `grep "v1" backend/routes/` → 0 kết quả |
| 7 | **`CLAUDE.md` mô tả sai dự án** | `app-config.json` = `"Quản lý kho"` |
| 8 | **Không có test frontend nào** | 0 file test trong `src/` |
| 9 | **B-07: bảng log tăng không giới hạn** | → đã xử lý, xem §6c |

### 6b. Xoá `docs/design/` — hoàn tất, được nghiệm thu

10 file tracked, 0 untracked, 0 thay đổi chưa commit. Sau xoá: 0 reference trong mã nguồn/cấu hình/build; `npx tsc --noEmit` exit 0; 4 link markdown chết đã sửa.

Bản ghi phục hồi (blob hash tại `663114a`) lưu tại [01-backend-audit.md §10](../01-backend-audit.md).
Lệnh phục hồi: `git checkout 663114aff6804e50b77b88e05dda9f9c784d6fff -- docs/design/`

✅ **Người dùng chấp nhận kết quả xoá, không cần khôi phục.**

### 6c. B-07 — Retention hotfix

Phạm vi riêng `BACKEND_RETENTION_HOTFIX` đã được phê duyệt và hoàn thành code.

| | |
|---|---|
| Trạng thái | ✅ `RETENTION_POLICY_APPROVED_CODE_COMPLETE_NOT_DEPLOYED` |
| Chính sách | `zalo_webhook_events` payload 90 ngày · row 365 ngày · `warehouse_scans` payload 180 ngày · **không bao giờ xoá row `warehouse_scans`** |
| Test | 36 passed, 89 assertions — exit 0 |
| ⚠️ | **Chưa deploy.** `RETENTION_ENABLED=false`, chưa chạy migration production, chưa có giám sát thực tế |

📄 [docs/backend-retention-runbook.md](../../backend-retention-runbook.md)

---

## 7. Lệnh đã chạy & exit code

| Lệnh | Exit | Kết quả |
|---|:--:|---|
| `git rev-parse HEAD` | 0 | `663114aff6804e50b77b88e05dda9f9c784d6fff` |
| `npx tsc --noEmit` | **0** | Không lỗi kiểu |
| `npx vite build` | **0** | 568 modules · 26 chunk · 1.3 MB |
| Phân tích đồ thị import | 0 | 76 reachable / 79 orphan |
| `npx vite --port 5199` + `curl` | 0 | HTTP 200 — màn login render thật |
| `php artisan test` (backend) | **0** | **36 passed, 89 assertions** |
| `pint --test` (file mới) | **0** | passed |
| `php -l` × 10 file | 0 | Tất cả OK |
| Kiểm tra YAML 2 tệp OpenAPI | 0 | Hợp lệ, đúng nhãn |

**Không chạy:** không có script `lint`/`test`/`typecheck` cho frontend trong `package.json`; **không có công cụ static analysis** (PHPStan/Larastan/Psalm) nào được cấu hình trong `composer.json` — đã dùng `php -l` thay thế, không tự cài công cụ mới.

---

## 8. Tài liệu bàn giao

| Tài liệu | Nội dung |
|---|---|
| [01-source-audit.md](../01-source-audit.md) | Trạng thái repo, stack thực tế, code chết, xác thực, env, test |
| [01-screen-inventory.md](../01-screen-inventory.md) | 22 route, **18 page**, 5 scan context, 4 luồng nghiệp vụ |
| [01-dependency-inventory.md](../01-dependency-inventory.md) | API, SDK, ZaUI, scanner, storage, offline, dependency |
| [01-ui-ux-defects.md](../01-ui-ux-defects.md) | 14 lỗi đã xác minh + 11 nguy cơ chưa xác minh |
| [01-platform-comparison.md](../01-platform-comparison.md) | Flutter vs RN + quyết định đã chốt |
| [01-backend-audit.md](../01-backend-audit.md) | Audit `backend/`, 7 phát hiện an toàn, kết quả `docs/design/` |
| [01-api-inventory.md](../01-api-inventory.md) | Nhóm A vs Nhóm B · báo cáo idempotency/duplicate/conflict |
| [01-zns-oa-inventory.md](../01-zns-oa-inventory.md) | Inventory ZNS/OA |
| [01-tmp-backup-inventory.md](../01-tmp-backup-inventory.md) | Inventory `.tmp/bachhoa-portable-*` |
| [01-pda-verification-checklist.md](../01-pda-verification-checklist.md) | Bảng kiểm tra thiết bị PDA |
| [01-scanner-architecture-requirements.md](../01-scanner-architecture-requirements.md) | Đặc tả kiến trúc scanner (Q4+Q5) |
| [openapi/backend-mini-api.draft.yaml](../openapi/backend-mini-api.draft.yaml) | OpenAPI 3.1 — Nhóm A |
| [openapi/wms-external-api.draft.yaml](../openapi/wms-external-api.draft.yaml) | OpenAPI 3.1 — Nhóm B |
| [GATE_PDA_HARDWARE_CERTIFICATION.md](GATE_PDA_HARDWARE_CERTIFICATION.md) | 🆕 Gate phần cứng |
| [GATE_WMS_API_INTEGRATION.md](GATE_WMS_API_INTEGRATION.md) | 🆕 Gate tích hợp API |
| [backend-retention-runbook.md](../../backend-retention-runbook.md) | Runbook retention |
| [USER-ACTION-REQUIRED.md](../../../USER-ACTION-REQUIRED.md) | Việc người dùng cần làm |

---

## 9. Token

```
GATE_01_PASS|sha=663114aff6804e50b77b88e05dda9f9c784d6fff|platform=REACT_NATIVE|ui_scope=NEW_APP
```

Phát hành 2026-09-04 sau khi người dùng gửi `APPROVE_GATE_01`.

---

## 10. ⚠️ PASS ≠ Production-ready

`GATE_01` PASS **chỉ** xác nhận: kiến trúc và phạm vi migration đã được chốt trên bằng chứng.

**Chưa được xác nhận:**

| # | Hạng mục | Gate chặn |
|:--:|---|---|
| 1 | Bất kỳ thiết bị PDA thật nào — **chưa có máy nào được kiểm tra** | `GATE_PDA_HARDWARE_CERTIFICATION` |
| 2 | Cơ chế scanner và suffix thật | `GATE_PDA_HARDWARE_CERTIFICATION` |
| 3 | Contract, môi trường, xác thực của WMS API — **chưa từng gọi endpoint nào** | `GATE_WMS_API_INTEGRATION` |
| 4 | Idempotency / duplicate / conflict phía server | `GATE_WMS_API_INTEGRATION` |
| 5 | Retention trên production — **code xong nhưng chưa deploy, chưa bật, chưa giám sát** | Deploy riêng |
| 6 | **17/18 màn hình chưa xem trực quan** | Cần tài khoản test |

> 🔴 **Hai Gate `GATE_PDA_HARDWARE_CERTIFICATION` và `GATE_WMS_API_INTEGRATION` bắt buộc PASS trước khi phát hành production. Không được bỏ qua trong bất kỳ giai đoạn nào sau này.**

---

## 11. Việc bị cấm cho tới khi hai Gate mới PASS

| # | Cấm |
|:--:|---|
| 1 | Tuyên bố hỗ trợ PDA production hoặc tương thích hãng/model cụ thể |
| 2 | Viết native module của hãng khi chưa có thiết bị/tài liệu |
| 3 | Hard-code suffix; coi `Enter` là suffix của PDA production |
| 4 | Gọi mutation thật lên WMS · gọi WMS production |
| 5 | ~~Triển khai offline mutation · retry request ghi~~ 🔓 **ĐÃ NỚI 2026-09-05** ở mức cơ chế — xem §0b. **Post Receipt/Post Issue lên WMS thật vẫn CẤM** |
| 6 | Gửi `Idempotency-Key` với giả định server hỗ trợ — **VẪN CẤM**, không nằm trong phần được nới (§0b.3) |
| 7 | Dùng credential/token tìm thấy trong source |
| 8 | Tự xác định môi trường `khohoanamdev.bigk.click` |
| 9 | Sửa API contract, authentication, endpoint public, luồng ZNS/OA nghiệp vụ |
| 10 | Deploy retention; bật `RETENTION_ENABLED` trên production |
| 11 | Chạm vào `.tmp/bachhoa-portable-*`; khôi phục `docs/design/` |
| 12 | Tuyên bố hệ thống production đã được khắc phục khi chưa triển khai và giám sát thực tế |
| 13 | 🆕 **Tạo hoặc cấu hình dự án iOS dưới mọi hình thức** — khôi phục `ios/`, thêm `Gemfile`/CocoaPods, thêm script `npm run ios`, chọn phiên bản iOS tối thiểu, chọn cơ chế phát hành iOS. Người dùng tái xác nhận 2026-09-05: *"Không tạo hoặc cấu hình dự án iOS"* (§0.2) |
