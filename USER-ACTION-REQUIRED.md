# USER ACTION REQUIRED — Gate 01

**`GATE_01`: ✅ PASS** (2026-09-04) · **Commit:** `663114a`

`GATE_01` đã đóng. Tài liệu này nay phục vụ **hai Gate còn lại**, bắt buộc PASS **trước khi phát hành production**:

| Gate | Cần từ ai | Mục |
|---|---|:--:|
| [`GATE_PDA_HARDWARE_CERTIFICATION`](docs/migration/gates/GATE_PDA_HARDWARE_CERTIFICATION.md) | Nhà cung cấp PDA | §1 |
| [`GATE_WMS_API_INTEGRATION`](docs/migration/gates/GATE_WMS_API_INTEGRATION.md) | Chủ sở hữu WMS backend | §2 |

Mẫu câu hỏi gửi nguyên văn ở §3.

---

## 0. Change Control 2026-09-05 — Q2 tái xác nhận `CHỈ Android`

Đợt kiểm chứng lại ngày 2026-09-05 phát hiện [01-platform-comparison.md](docs/migration/01-platform-comparison.md) ghi nhầm phạm vi là "Android + iOS" ở 4 vị trí, mâu thuẫn với [GATE_01 Q2](docs/migration/gates/GATE_01.md).

**Bạn đã tái xác nhận:** *"Không triển khai iOS. Phạm vi hiện tại chỉ gồm Android và máy PDA Android. Không tạo hoặc cấu hình dự án iOS."*

→ Tài liệu sai đã được sửa. **Không có câu hỏi mới nào phát sinh**, không quyết định nào thay đổi, token `GATE_01` giữ nguyên. Chi tiết: [GATE_01 §0](docs/migration/gates/GATE_01.md).

> ℹ️ Nếu sau này công ty yêu cầu bản iOS: phải **mở lại phạm vi và lập Gate riêng** — đây là ràng buộc do chính Q2 đặt ra, không được lách.

---

## 0b. 🆕 2026-09-05 — chính sách dọn dữ liệu local, cần bạn duyệt

`pruneSynced` là hàm dọn dữ liệu local **đã đồng bộ xong**. Hiện hàm này **chưa được tự gọi theo lịch**, nên dữ liệu local vẫn được giữ lại toàn bộ.

**Chưa bật tự dọn vì chưa có chính sách được duyệt** — ví dụ: *giữ dữ liệu đã đồng bộ 30 ngày rồi xoá*. Nếu bật quá sớm có thể **mất dữ liệu cần tra cứu/offline**.

> ⚠️ Con số 30 ngày ở trên chỉ là **ví dụ minh hoạ**, chưa phải chính sách đã duyệt.

Cần bạn chốt:

| # | Câu hỏi |
|:--:|---|
| 1 | ~~Giữ dữ liệu **đã đồng bộ** bao lâu rồi mới xoá?~~ → ✅ **suy ra được**, xem phần dưới |
| 2 | 🔴 Chu kỳ chạy dọn **trên máy quét**: mỗi lần mở app · hằng ngày · hay chỉ khi người dùng bấm? → **VẪN MỞ**, xem phần dưới |
| 3 | ~~Ngưỡng cảnh báo số bản ghi **chưa gửi**~~ → ✅ **đã chốt hai mức**, xem phần dưới |

🔒 Bất kể chốt thế nào: bản ghi `pending` · `failed` · `conflict` · `unknown` **không bao giờ bị xoá tự động** — GATE_01 §3 *"Không làm mất dữ liệu kiểm kho"*.

### ✅ ĐÃ CÓ LỜI GIẢI 2026-09-05 — không còn phải chọn số

Người dùng đối chiếu mã nguồn WMS và đo trên staging. **Hai giả định của tôi đã sai**, ghi lại để không lặp:

| Tôi giả định | Thực tế |
|---|---|
| `retention_until` luôn có giá trị, chi phối chính sách local | ❌ **Gần như luôn NULL.** Chỉ chốt lúc **đóng** hồ sơ (`RETURNED`/`CANCELLED`; `COMPLETED` **không** tính), và chỉ với case đóng **qua API sau bản vá** |
| Cache local chứa PII cần tuân thủ | ❌ **Thủ kho không có quyền `warranty.pii.view`** — nếu app chạy bằng tài khoản thủ kho thì cache **không hề chứa PII** |

⇒ §0b tụt từ **bài toán tuân thủ** xuống **bài toán bộ nhớ**. Chính sách suy ra được, chi tiết ở [03-api-contract-delta.md §4i.4](docs/migration/03-api-contract-delta.md):

| Dữ liệu local | Quy tắc |
|---|---|
| Hồ sơ đã cache (PII đã che) | TTL kỹ thuật tuỳ ý / LRU theo dung lượng |
| Case `retention_until` đã quá hạn | Xoá cache ngay |
| Case `legal_hold_flag = true` | **Không tự xoá** |
| Draft / hàng đợi chưa đồng bộ | **Không xoá theo bất kỳ TTL nào** |
| App chạy bằng tài khoản **có** `pii.view` | Không ghi PII xuống đĩa |

### ✅ Câu 3 đã chốt — ngưỡng cảnh báo hai mức

Bạn đưa chính sách cảnh báo phía máy chủ cho `audit_outbox`; tôi áp cùng hình dạng cho hàng đợi trên máy để hai bên đọc giống nhau:

| Mức | Điều kiện | Hằng số |
|---|---|---|
| Warning | `>= 200` qua **2 chu kỳ liên tiếp** (10 phút) | `UNSENT_WARNING_THRESHOLD` |
| Critical | đạt **500** hoặc tiếp tục tăng | `UNSENT_CRITICAL_THRESHOLD` |

Cả hai chỉ **ghi log**, không kích hoạt xoá gì.

Bạn cũng cho biết scheduler máy chủ đang chạy: `audit:reconcile` mỗi 5 phút · dọn file lỗi import 02:15 · ẩn danh PII bảo hành 03:10 hằng ngày. `failed_jobs` cảnh báo ngay từ bản ghi đầu tiên.

### 🔴 Câu 2 vẫn còn mở — hai thứ khác nhau

Câu hỏi gốc là **chu kỳ chạy dọn TRÊN MÁY QUÉT**. Câu trả lời mô tả **scheduler phía máy chủ** — app không chạy lúc 03:10 sáng.

`pruneSynced` vì thế **vẫn chưa được gọi tự động**, dữ liệu local vẫn giữ nguyên toàn bộ. Cần bạn chọn một trong ba:

| | Phương án |
|:--:|---|
| A | Dọn **mỗi lần mở app** — đơn giản nhất, dọn đều |
| B | Dọn **tối đa một lần/ngày**, kiểm lúc mở app |
| C | **Chỉ khi người dùng bấm** trong màn Chẩn đoán — kiểm soát chặt nhất |

---

## 1. Cần lấy từ NHÀ CUNG CẤP PDA → `GATE_PDA_HARDWARE_CERTIFICATION`

| # | Thông tin | Vì sao cần |
|:--:|---|---|
| 1 | **Model + hãng** của từng loại PDA đang dùng | Quyết định có cần native module Kotlin không |
| 2 | **Phiên bản Android** thực tế trên máy | 🔴 Nếu **< 7.0** thì React Native **không dùng được** — phải đánh giá lại nền tảng |
| 3 | **Cơ chế xuất dữ liệu của đầu quét**: Keyboard Wedge / Broadcast Intent / SDK hãng | Khác nhau về khối lượng công việc: từ 0 đến rất lớn |
| 4 | **Prefix / Suffix** mà đầu quét thêm vào (Enter, Tab, hay không có) | Không được hard-code — parser phải cấu hình được |
| 5 | **Có cấu hình được suffix không**, và cấu hình có giữ sau khi khởi động lại không | Quyết định có chuẩn hoá được toàn bộ máy không |
| 6 | Hành vi khi app **có focus / không focus / chạy nền** | Quyết định bắt sự kiện quét ở tầng nào |
| 7 | Có cho phép cài **APK ký nội bộ** (sideload) không | Liên quan Q10 — phát hành nội bộ |

> 📋 **Dùng bảng kiểm tra chi tiết:** [docs/migration/01-pda-verification-checklist.md](docs/migration/01-pda-verification-checklist.md)
> ~20 phút/model, không cần cài gì, chỉ dùng app Ghi chú + Chrome có sẵn. **Làm riêng cho từng model.**

---

## 2. Cần lấy từ CHỦ SỞ HỮU WMS BACKEND → `GATE_WMS_API_INTEGRATION`

| # | Thông tin | Vì sao cần |
|:--:|---|---|
| 1 | **Tài liệu API chính thức** (OpenAPI / Swagger / Postman) cho ~42 endpoint | Hiện **không tồn tại ở bất kỳ đâu** — đã tìm toàn ổ đĩa |
| 2 | ~~**`khohoanamdev.bigk.click` là staging hay production?**~~ | ✅ **ĐÓNG 2026-09-06** — hạ tầng cung cấp bảng tách **hai** tier theo cổng Nginx + stack + database: `bigk.click` = Blue = `customer-production`; `lptech.info.vn` = Green = `dev-test`. **Không có staging.** Nguồn hiểu nhầm cũ đã truy ra: Green ghi `APP_ENV=staging` nhưng Laravel runtime chạy `production`. Đã tách khái niệm sang `WMS_DEPLOYMENT_TIER`. ⚠️ Kéo theo: `GATE_WMS §5` còn đòi contract test *"trên staging"* — tiêu chí đó phải sửa thành **DEV/TEST** |
| 3 | **Tài khoản CHỈ ĐỌC** (gửi qua kênh an toàn, **không dán vào chat**) | ⚠️ 2026-09-05 đã dùng tạm tài khoản **admin** để chạy contract test đọc. Mật khẩu đó **đã lộ trong hội thoại → phải đổi ngay**. Cần một tài khoản chỉ đọc thay thế |
| 4 | Server **có xử lý header `Idempotency-Key`** không? Ngữ nghĩa thế nào? | 🔴 **Chặn toàn bộ tính năng offline** |
| 5 | Server **có dùng `If-Match`** cho optimistic concurrency không? Trả mã gì khi version lệch? | ✅ **Spec trả lời rồi**: 75 endpoint, thiếu → 428, sai → 412. 🟡 Nhưng **định dạng giá trị server chấp nhận vẫn chưa ai kiểm chứng** — xem mục 19 |
| 6 | Server **phát hiện trùng** (duplicate) và **xử lý xung đột** (conflict) thế nào? | Chặn thiết kế hàng đợi đồng bộ |
| 7 | **Danh mục mã lỗi đầy đủ** | Chưa biết |
| 8 | Enum `{action}` của `packing-labels/{labelId}/{action}` và tập `{resource}` của path dựng động | Frontend dựng path lúc chạy, không đoán được |
| 9 | `/api/*` tại `mini.lptech.info.vn` **còn expose công khai không**? | Liên quan phát hiện bảo mật B-01 |
| 12 | **`khohoanamdev.lptech.info.vn` đi thẳng origin, không qua Cloudflare** | ⚠️ **Hạ tầng xác nhận là CHỦ ĐÍCH** (2026-09-05): đây là DEV/TEST, không có rule Cloudflare nào cần áp. ⇒ Không phải "một ứng dụng lộ hai đường" như tôi viết ban đầu, mà là **hai môi trường khác nhau**. 🔴 Vẫn cần rà: production có rate limit trên `POST /auth/login` không — rule lọc User-Agent hiện tại **không** chặn được dò mật khẩu (§4j.3) |
| 11 | ~~**Quy tắc Cloudflare đang chặn chữ ký nào?**~~ | ✅ **ĐÃ ALLOWLIST 2026-09-05** — UA bắt đầu bằng `WMSHoaNam-Android/` được cho qua; app đã gửi đúng chuỗi này và đo thật → **401 từ ứng dụng** (qua được biên). ⚠️ Hai điểm mô tả của hạ tầng **không khớp phép đo**: 403 **không** có header `Cf-Mitigated`, và rule chỉ chặn `Python-urllib`/không-UA chứ không chặn `okhttp`/`curl`/UA rỗng. [§4j](docs/migration/03-api-contract-delta.md) |
| 10 | ~~**Khi API trả 5xx, transaction có rollback TOÀN BỘ không?**~~ | ✅ **ĐÃ CHỐT 2026-09-05** — người dùng chọn **chính sách an toàn**: 500/502/503/504/timeout/mất kết nối đều là `unknown`. Kèm 4 điều kiện để nới riêng cho 500, và quy tắc **dùng lại đúng Idempotency-Key cũ** khi retry. Đã hiện thực. [§4k.1](docs/migration/03-api-contract-delta.md) |
| 13 | ~~**Client lấy số `version` ở trường nào?**~~ | ✅ **ĐÃ TỰ TRẢ LỜI 2026-09-05** bằng contract test đọc: `data.version`, có ở cả 3 loại tài liệu. `ETag` không được trả về kể cả ở GET chi tiết. **Không cần hỏi nữa.** |
| 14 | ~~**Token sống bao lâu? Có refresh không?**~~ | ✅ **ĐÃ TỰ TRẢ LỜI 2026-09-05** — JWT HS256, `expires_in` trả kèm mọi phản hồi, `refresh_token` 86 ký tự, route `/auth/refresh` public, refresh 14 ngày **trượt**. Đã hiện thực nhánh "tự gia hạn ngầm". **Không cần hỏi nữa.** |
| 15 | ~~**`retention_until` tính theo quy tắc nào?**~~ | ✅ **ĐÃ TỰ TRẢ LỜI 2026-09-05** — chốt lúc đóng hồ sơ (`RETURNED`/`CANCELLED`), `PII_RETENTION_YEARS = 5`, job `warranty:purge-pii` 03:10 hằng ngày, purge = **ẩn danh chứ không xoá**. **Không cần hỏi nữa.** |
| 16 | ~~**UAT/production đặt `JWT_TTL` bao nhiêu?**~~ | ✅ **DevOps trả lời 2026-09-05** — Blue/Production và Green/DEV-TEST **đều đang 60 phút**, không cần hoàn tác. Giá trị 43200 trong `.env` không phải giá trị đang chạy. |
| 17 | ~~**Hồ sơ bị ẩn danh thì app hiển thị thế nào?**~~ | ✅ **BA trả lời 2026-09-05** — giữ mã hồ sơ/trạng thái/lịch sử; UI hiện *"Thông tin khách hàng đã được ẩn danh theo chính sách lưu trữ"*, ẩn thao tác liên hệ/tải file; refetch khi mở màn hình · quay foreground · người dùng làm mới; **không polling**. API chưa có cờ `pii_anonymized`. Yêu cầu cho Prompt 4. |
| 19 | ~~**`If-Match` nhận định dạng nào?**~~ | ✅✅ **ĐÓNG 2026-09-06 — đo thật.** `POST post-issue` với `If-Match: 4` (**số trần**, không dấu nháy) **thành công**. Không cần bạn hỏi backend nữa |
| 26 | ~~**Không có thư viện chọn ảnh/video**~~ | ✅ **ĐÓNG 2026-09-06** — bạn duyệt thêm `react-native-image-picker@8.2.1` (Change Control `GATE_WMS §2j`). 🎯 Điểm đáng chú ý: **không phải thêm quyền nào** — thư viện dùng photo picker của Android (API 33+ không đòi quyền), nên hai dòng `tools:node="remove"` gỡ quyền storage ở manifest **giữ nguyên**. Ghi chú cũ trong manifest lường trước là sẽ phải bỏ chúng; hoá ra không cần |
| 27 | 🆕 **Tải file KHÔNG có `Idempotency-Key`** | ℹ️ Spec không khai header này cho endpoint tải file. Hệ quả: bấm hai lần sẽ tạo **hai bản ghi file**. App chống ở giao diện, nhưng nếu backend muốn chặn ở tầng dưới thì cần thêm header — bạn quyết |
| 28 | 🔴🔴 **`POST inbound/record` KHÔNG phản hồi trong 30 giây** | 🔴 **Đo thật trên máy 2026-09-06.** Phiếu 8 sản phẩm → hết thời gian chờ đúng 30,0s. Cùng lúc đó `GET /health` trả trong **0,2s** và `GET inbound-documents` trong **0,13s** ⇒ **không phải máy chủ chậm chung**, chênh hơn 100 lần. Cần backend cho biết: 8 item mất bao lâu là bình thường? Có tạo mới SKU/product cho từng `raw_code` không? Có lock nào giữ lâu trong transaction không? Nếu >30s là bình thường thì app phải nâng timeout **và** báo cho thủ kho *"có thể mất vài phút"*. [Chi tiết](docs/migration/04-live-run-report.md) |
| 29 | 🔴 **Đối chiếu phiếu "Hihii" (8 sản phẩm) trên WMS** | 🔴 Do timeout ở mục 28, **không xác định được** máy chủ đã tạo phiếu hay chưa — đúng theo thiết kế thì app không đoán hộ. Cần người có quyền vào WMS xem phiếu đó có tồn tại không. Kết quả cũng trả lời luôn mục 28: nếu phiếu **có** tạo thì máy chủ đã xử lý xong nhưng phản hồi về muộn |
| 30 | 🔴🔴 **nginx chặn tải file ở 1 MB — giới hạn 10MB/300MB của app KHÔNG dùng được** | 🔴 **Đo thật trên máy 2026-09-06.** Bạn chọn một ảnh, app gửi lên và nhận **HTTP 413**. Đo ngưỡng bằng curl: 1010KB → 401 (tới được app), 1024KB → **413**. Phản hồi mang `Server: nginx/1.18.0`, thân **HTML**, **không có `X-Request-ID`** ⇒ nginx chặn, request **chưa từng tới Laravel**. Đây là `client_max_body_size` mặc định (1m), chưa ai đặt.<br><br>**Hệ quả:** ảnh chụp bằng điện thoại thường 3–8 MB ⇒ **không tải lên được ảnh nào**. Video 300MB thì không có cửa. Phần J của luồng bảo hành coi như **không dùng được** cho tới khi sửa.<br><br>**Cần:** nâng `client_max_body_size` trên nginx (≥ 300m nếu giữ giới hạn video như thiết kế), và kiểm luôn `upload_max_filesize` / `post_max_size` của PHP. Nếu **không** nâng được thì phải hạ giới hạn trong app và nói rõ với người dùng — nhưng lúc đó tính năng gần như vô nghĩa |
| 24 | 🆕 **Danh sách bảo hành chưa có phân trang / tìm kiếm** | 🟡 Bạn đã nêu: mỗi trạng thái chỉ tải tối đa 25 hồ sơ. Kho có hơn 25 hồ sơ ở một trạng thái thì phần còn lại **không tra được từ app**. Cần quyết: thêm phân trang, hay đủ dùng ở quy mô hiện tại? |
| 25 | ~~**`GET /api/v1/defects` trả 403 với vai Thủ kho**~~ → 🟡 **danh mục RỖNG** | ✅ **Phần quyền đã ĐÓNG 2026-09-06** — đo lại cùng vai, cùng môi trường: HTTP **200** (không còn 403). ⚠️ **Nhưng danh sách trả về rỗng** — WMS chưa khai báo bệnh lỗi nào. Cần backend: đây là môi trường `dev-test` chưa có dữ liệu mẫu, hay danh mục thật cũng chưa khai? 🔧 **Phía app đã hết bị chặn**: bước chọn bệnh lỗi không còn bắt buộc (Mini App gốc cũng để tuỳ chọn — `warranty-flow.service.ts:71`), đã tạo hồ sơ thật thành công lúc 15:30 |
| 31 | 🆕 **Khách quay lại lần hai với ĐÚNG máy đó, ĐÚNG lỗi đó — có tạo hồ sơ mới không?** | 🟡 **Cần bạn quyết, tôi không tự chốt.** Khoá `Idempotency-Key` của hồ sơ bảo hành nay là **vân tay toàn bộ nội dung** (sửa 2026-09-06 — khoá cũ là *SĐT + độ dài mô tả*, hai hồ sơ khác nhau có thể trùng khoá và bị WMS nuốt mất một). Hệ quả của cách mới: sửa xong vẫn hỏng, khách mang lại, nội dung khai y hệt ⇒ **cùng khoá** ⇒ WMS **không** tạo hồ sơ thứ hai. Nếu nghiệp vụ cần tạo hồ sơ mới trong tình huống đó thì phải đổi sang khoá sinh **ngẫu nhiên một lần cho mỗi phiên tiếp nhận** |
| 23 | 🆕 **Bản kiểm kê spec của tôi khai THIẾU `If-Match` cho `post-issue`** | ℹ️ Ghi lại để đối chiếu: `openapi/wms-external-api.draft.yaml:128` chỉ liệt kê `Idempotency-Key`, nhưng mã đang chạy gửi **cả hai** (`scan.service.ts:1747-1748`). Mô tả của bạn đúng. Không cần bạn làm gì — nhưng nếu còn endpoint nào khác dùng `If-Match` mà bản kiểm kê bỏ sót thì nên rà, vì thiếu header đó ăn `428` và chỉ lộ lúc chạy thật |
| 20 | 🆕 **Middleware BE bắt buộc `X-WMS-Client-Tier`** | 🟡 **Việc của phía BE, bạn đã nêu 2026-09-06.** App **đã gửi** header này trên mọi request. Còn thiếu phía server: trả `409 ENVIRONMENT_MISMATCH` khi client trỏ sai tier. Chưa có nó thì khoá mới **một chiều** — một bản dựng cũ không gửi header sẽ đi lọt |
| 18 | ~~**Phiếu xuất đang chờ Post Issue mang `status` gì?**~~ | ✅ **ĐÓNG 2026-09-06 — và câu hỏi này là câu hỏi SAI.** Mô tả luồng xuất bạn cung cấp cho biết endpoint nhận `ready_for_post` và `ready_for_issue`; đối chiếu `scan.service.ts:1504-1505` thì đúng. Không có `status` nào diễn đạt được *"đã quét đủ, sẵn sàng Post"* — đó là thứ **máy chủ tính** và phơi ra bằng cờ riêng. App đã đổi sang `?ready_for_post=true&ready_for_issue=true`; bỏ luôn phần lọc bù ở client vốn để lọt phiếu **đang quét dở** |
| 21 | 🆕 **Backend có thêm trường `recipient_type` cho phiếu xuất không?** | 🟡 Bốn nhóm đối tượng (`DEALER`/`DISTRIBUTOR`/`CONSTRUCTION_CUSTOMER`/`RETAIL_CUSTOMER`) hiện **gộp vào `note`** dạng `Đối tượng xuất: Đại Lý · <ghi chú>` — đúng như app cũ, vì `OutboundRecordBatchInput` không có trường nào cho nó. Hệ quả: **không lọc/thống kê theo nhóm được**, và ai sửa `note` là mất phân loại. App giữ nguyên cách gộp (không tự đặt trường mới). Cần backend quyết có thêm trường thật hay không |
| 22 | 🆕 **Phụ thuộc `provinces.open-api.vn` — dịch vụ ngoài, không SLA** | 🟡 Tỉnh và Phường là trường **bắt buộc** của phiếu xuất, mà danh mục lấy từ một dịch vụ công cộng bên thứ ba (đúng nguồn app cũ dùng). Dịch vụ chết + cache hết hạn ⇒ **không tạo được phiếu xuất**. App đã giảm nhẹ: cache 24 giờ, và **dùng tiếp cache quá hạn** khi gọi mạng hỏng (kèm banner cảnh báo). Nhưng máy mới cài chưa có cache thì vẫn kẹt. Cần quyết: WMS tự phục vụ danh mục này, hay chấp nhận rủi ro? |

---

## 3. Mẫu câu hỏi gửi nguyên văn

### 3.1 Gửi NHÀ CUNG CẤP PDA

> Chào anh/chị,
>
> Chúng tôi đang xây dựng ứng dụng Android cho nghiệp vụ kho chạy trên máy PDA. Nhờ anh/chị cung cấp giúp các thông tin kỹ thuật sau cho **từng model** đang bán/đã bàn giao cho chúng tôi:
>
> 1. Model chính xác và nhà sản xuất.
> 2. Phiên bản Android cài sẵn trên máy (chúng tôi cần tối thiểu **Android 7.0**; nếu máy thấp hơn xin báo giúp ngay).
> 3. Đầu quét vật lý xuất dữ liệu theo cơ chế nào: **Keyboard Wedge** (giả lập bàn phím), **Broadcast Intent** (như DataWedge), hay **SDK riêng của hãng**?
> 4. Nếu là Keyboard Wedge: mặc định máy có thêm ký tự **prefix/suffix** nào không (Enter, Tab, ký tự khác)?
> 5. Có ứng dụng cấu hình đầu quét cài sẵn không? Tên là gì? Có **đổi được suffix** không, và cấu hình có giữ nguyên sau khi khởi động lại máy không?
> 6. Nếu có Broadcast Intent: `Intent action` là gì? Có tài liệu tích hợp không?
> 7. Nếu có SDK riêng: xin gửi giúp file SDK/AAR và tài liệu cho lập trình viên.
> 8. Khi ứng dụng đang chạy nhưng **con trỏ không nằm trong ô nhập nào**, dữ liệu quét sẽ đi đâu?
> 9. Máy có cho phép cài **APK ký nội bộ** (không qua Google Play) không? Có chính sách MDM nào chặn không?
> 10. Máy có cài Google Play Services không?
>
> Nếu tiện, chúng tôi có sẵn một bảng kiểm tra ngắn (~20 phút/máy, không cần cài gì) — có thể gửi để anh/chị điền giúp.
>
> Cảm ơn anh/chị.

### 3.2 Gửi CHỦ SỞ HỮU / ĐỘI PHÁT TRIỂN WMS BACKEND

> Chào anh/chị,
>
> Chúng tôi đang chuyển ứng dụng Zalo Mini App kho sang ứng dụng Android native. Ứng dụng hiện gọi khoảng **42 endpoint** của hệ thống WMS, nhưng chúng tôi **không có tài liệu API chính thức nào** — toàn bộ hiểu biết hiện chỉ suy ra từ mã nguồn phía client. Nhờ anh/chị hỗ trợ:
>
> **A. Tài liệu và môi trường**
> 1. Có tài liệu **OpenAPI/Swagger/Postman** cho API `/api/v1/*` không? Nếu có xin gửi giúp.
> 2. `khohoanamdev.bigk.click` hiện là môi trường **development, staging hay production**?
> 3. Có môi trường **staging riêng** để chúng tôi kiểm thử an toàn không?
> 4. Xin cấp **tài khoản test** (gửi qua kênh bảo mật, không qua email/chat thường).
>
> **B. Ghi dữ liệu và chống trùng** *(quan trọng nhất — đang chặn thiết kế của chúng tôi)*
>
> 5. Server **có xử lý header `Idempotency-Key`** không? Nếu có: gửi lại **cùng key + cùng payload** thì trả kết quả cũ hay tạo bản ghi mới? Cùng key nhưng **khác payload** thì trả mã gì?
> 6. Server **có dùng header `If-Match`** để kiểm soát đồng thời không? Khi version lệch thì trả HTTP mã nào?
> 7. Server **phát hiện bản ghi trùng** theo tiêu chí nào?
> 8. Khi có **xung đột dữ liệu**, server trả về gì để client biết mà xử lý?
> 9. Header `X-Mini-App-Inbound-Fallback: legacy` mà client đang gửi có ý nghĩa gì?
> 9b. 🆕 **Khi API trả lỗi 5xx, transaction có được rollback TOÀN BỘ không?**
>     Nói cách khác: nếu client nhận `500`, chúng tôi có thể chắc chắn **không có gì được ghi** vào hệ thống không?
>     Hiện tại vì chưa biết, ứng dụng phải chọn phương án an toàn: đánh dấu "chưa rõ kết quả", **không tự gửi lại**,
>     và bắt thủ kho tự đối chiếu trên WMS trước — nếu không sẽ có nguy cơ tạo phiếu trùng làm sai tồn kho.
>     Nếu anh/chị xác nhận **luôn rollback**, chúng tôi sẽ cho phép gửi lại ngay và thao tác sẽ nhanh hơn nhiều.
>
> **C. Chi tiết kỹ thuật**
> 10. **Danh mục mã lỗi đầy đủ** (`error_code`) và HTTP status tương ứng.
> 11. Response lỗi dùng trường nào là chuẩn: `error_code`, `code`, hay `error.code`? (client đang đọc cả ba)
> 12. Quy tắc **phân trang**: ngoài `per_page` còn tham số nào? Response có trả tổng số không?
> 13. Với `/api/v1/mini-app/outbound-documents/{id}/packing-labels/{labelId}/{action}`: **`action`** nhận những giá trị nào?
> 14. Với các endpoint dạng `/api/v1/{resource}/{documentId}/{scanPath}`: **`resource`** nhận những giá trị nào?
> 15. Bốn endpoint `/api/v1/mini-app/warranty-cases/{caseId}/...` (đổi trạng thái, timeline, danh sách file, upload file): đường dẫn đầy đủ là gì?
> 16. Giới hạn **dung lượng và định dạng file** cho upload ảnh/video bảo hành?
> 17. Token trả về khi đăng nhập là **JWT hay opaque**? Thời hạn bao lâu? Có refresh token không?
>
> **D. Câu hỏi về một hệ thống khác**
> 18. Dịch vụ Laravel tại `mini.lptech.info.vn` — các endpoint `/api/*` của nó **còn được expose công khai không**? Chúng tôi phát hiện một vấn đề xác thực ở đó và muốn báo cáo riêng.
>
> Cảm ơn anh/chị.

---

## 4. Bằng chứng được chấp nhận để đóng từng blocker

| Blocker | ✅ Chấp nhận | ❌ Không chấp nhận |
|---|---|---|
| **Q4** Cơ chế scanner | Bảng kiểm tra đã điền từ **thiết bị thật**; hoặc tài liệu kỹ thuật chính thức của hãng ghi rõ cơ chế output; hoặc ảnh chụp màn hình app cấu hình scanner | Suy đoán từ tên model · thông tin từ website bán hàng · giả định "chắc là Keyboard Wedge" |
| **Q5** Suffix | Kết quả **quan sát trực tiếp** (bài kiểm tra A/B trong checklist); hoặc ảnh chụp màn hình cấu hình suffix | Giá trị mặc định ghi trong tài liệu mà chưa kiểm chứng trên máy |
| **Q3** Phiên bản Android *(đã chốt, cần kiểm chứng lại khi có máy)* | Ảnh chụp *Cài đặt → Giới thiệu → Phiên bản Android* | Thông số công bố của hãng |
| **Q9-1** API contract | File OpenAPI/Swagger/Postman; hoặc tài liệu API viết tay đủ chi tiết (path, method, request, response, error); hoặc **quyền truy cập mã nguồn server** | OpenAPI draft do tôi suy ra từ source (`DRAFT_DERIVED_FROM_SOURCE`) |
| **Q9-2** Môi trường | Xác nhận bằng văn bản từ chủ sở hữu hệ thống | Suy luận từ tên miền (`dev` trong domain **không** phải bằng chứng) |
| **Q9-3** Tài khoản test | Thông tin cấp qua **kênh an toàn** (trình quản lý mật khẩu, kênh nội bộ) | Credential tìm thấy trong repository · dán vào cửa sổ chat |
| **Q9-4** Idempotency | Trả lời bằng văn bản từ đội backend; hoặc mã nguồn server; hoặc tài liệu API ghi rõ hành vi | Việc client đang gửi header (đó chỉ là ý định phía client) · `client_scan_id` unique ở DB (không phải idempotency phía server) |
| **Q9-5** Conflict/duplicate | Trả lời bằng văn bản; hoặc mã nguồn; hoặc tài liệu | Suy đoán từ việc client gửi `If-Match` |

---

## 5. Điều kiện PASS của hai Gate còn lại

### `GATE_PDA_HARDWARE_CERTIFICATION`

| # | Điều kiện |
|:--:|---|
| 1 | 10 hạng mục kiểm tra đều có bằng chứng **từ thiết bị vật lý** |
| 2 | Mọi model chạy **Android ≥ 7.0** (thấp hơn → DỪNG, đánh giá lại nền tảng) |
| 3 | Suffix thực tế được xác nhận và ghi vào cấu hình |
| 4 | Adapter tương ứng cơ chế thật đã hiện thực và test **trên máy thật** |
| 5 | Camera fallback hoạt động trên chính thiết bị đó |

### `GATE_WMS_API_INTEGRATION`

| # | Điều kiện |
|:--:|---|
| 1 | 11 hạng mục xác nhận đều có bằng chứng |
| 2 | Contract chính thức được chủ sở hữu **ký duyệt**, đối chiếu xong với draft |
| 3 | Contract test chạy **thật trên staging**, không phải mock |
| 4 | Idempotency + conflict được xác nhận bằng văn bản **và** kiểm chứng trên staging |
| 5 | Tài khoản test hoạt động, cấp qua kênh an toàn |

> 🔴 **Không được bỏ qua hai Gate này trong bất kỳ giai đoạn nào sau này.**

---

## Phụ lục — Việc bị cấm cho tới khi Gate PASS

Không triển khai mutation offline · không tự retry request ghi dữ liệu · không Post Receipt/Post Issue · không gửi `Idempotency-Key` với giả định server hỗ trợ · không gọi mutation thật lên WMS · không dùng credential trong source · không tự xác định môi trường · không viết native scanner module của hãng khi chưa có thiết bị · không hard-code suffix · không tuyên bố tương thích hãng/model cụ thể · không xoá `.tmp/bachhoa-portable-*` · không deploy retention · không tuyên bố production đã được khắc phục khi chưa triển khai và giám sát.

📄 Hồ sơ đầy đủ: [GATE_01](docs/migration/gates/GATE_01.md) · [Gate PDA](docs/migration/gates/GATE_PDA_HARDWARE_CERTIFICATION.md) · [Gate WMS API](docs/migration/gates/GATE_WMS_API_INTEGRATION.md)
