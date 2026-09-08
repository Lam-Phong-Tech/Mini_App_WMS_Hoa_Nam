# Chạy thật trên máy — 2026-09-06

> Lần đầu tiên mã của app gửi một **request GHI** lên máy chủ WMS.
> Máy: Xiaomi 12 Pro (`2206122SC`) · môi trường **Green / dev-test**.

---

## 1. Bản dựng

| | |
|---|---|
| Lệnh | `./gradlew assembleDebug -PreactNativeArchitectures=arm64-v8a` (WSL2) |
| Kết quả | **`BUILD SUCCESSFUL in 6m 55s`** · exit `0` |
| APK | `60.010.548` byte · một ABI (`arm64-v8a`) |
| **BUILD_ID (sha256)** | `d0ed0ca8019de15959aa5e1375e293d05f6d3c5b48537b61dc9f5d5a2e1f7c3c` |
| Cài đặt | `adb install -r` → `Success` |
| JS bundle | nạp qua Metro (bản debug) |

🔧 **Bẫy quy trình đã gặp và cách vượt:** PATH của Windows (có dấu cách và `\`)
tràn vào WSL qua nhiều lớp quoting `Git Bash → wsl → bash` làm hỏng `export`.
Cách chắc chắn: **viết script ra file** rồi `wsl bash <đường-dẫn>`, thay vì
truyền chuỗi lệnh lồng nhau. Đã bổ sung vào `02-build-runbook.md`.

⚠️ **Metro cache cũ suýt làm sai kết quả.** Lần chạy đầu **không** thấy lời gọi
`/api/v1/health` — Metro đang phục vụ bundle cũ. Phải kill tiến trình trên cổng
8081 rồi `--reset-cache`. Bài học: thấy thiếu một request mới thêm thì nghi
bundle trước, đừng nghi code.

---

## 2. ✅ Preflight tier — đo thật, cả hai host

```
GET https://khohoanamdev.lptech.info.vn/api/v1/health
→ HTTP 200 · X-WMS-Deployment-Tier: dev-test

GET https://khohoanamdev.bigk.click/api/v1/health
→ HTTP 200 · x-wms-deployment-tier: customer-production
```

Cả hai header **có thật và đúng tier**. Mục 3 và mục 4 Gate WMS đóng có cơ sở đo
được, không chỉ dựa vào lời khai.

### 2.1 🔴 Bẫy `APP_ENV` — bằng chứng sống

Thân phản hồi `/health` của **Green** ghi:

```json
{"data":{"environment":"production", ...}}
```

Tức là đọc trường `environment` trong **body** sẽ kết luận Green là production.
App đọc **header**, nên đúng. Đây là bằng chứng chạy thật cho thấy quyết định
*"nguồn có thẩm quyền duy nhất là header"* không phải cẩn thận thừa.

### 2.2 🔴 Cloudflare viết thường tên header

| Host | Tên header trả về |
|---|---|
| `lptech.info.vn` (nginx) | `X-WMS-Deployment-Tier` |
| `bigk.click` (Cloudflare) | `x-wms-deployment-tier` — **thường** |

Nếu chỗ tra header phân biệt hoa thường, bản **Customer** sẽ luôn thấy "thiếu
header" ⇒ khoá sạch quét và Post Issue. Đã bổ sung test khoá điều này.

---

## 3. ✅ Header app gửi lên — đọc từ log máy thật

```
HTTP POST /api/v1/mini-app/inbound/record
  Accept: application/json
  Idempotency-Key: wmshn-mtp3cn4x-z7xu3f-xzy7ka
  User-Agent: WMSHoaNam-Android/1.0
  X-WMS-Client-Tier: dev-test
  Content-Type: application/json
  Authorization: [ĐÃ CHE]
```

| Kiểm chứng | Kết quả |
|---|---|
| `X-WMS-Client-Tier` gửi trên **mọi** request | ✅ — sẵn sàng cho middleware BE |
| `User-Agent` đúng chuỗi Cloudflare allowlist | ✅ |
| `Idempotency-Key` lấy từ outbox | ✅ |
| Token **bị che trong log** | ✅ — không rò ra logcat |
| Endpoint được bảo vệ, không token | ✅ HTTP **401** (tới được ứng dụng, không bị chặn ở biên) |

---

## 4. 🔴 Phát hiện chính — `inbound/record` KHÔNG phản hồi trong 30 giây

### 4.1 Sự việc

| Mốc | |
|---|---|
| `07:46:20.968` | POST `/api/v1/mini-app/inbound/record` (8 sản phẩm) |
| `07:46:50.990` | Hết thời gian chờ — **đúng 30,0 giây** (`RECORD_TIMEOUT_MS`) |

### 4.2 Không phải máy chủ chậm chung

Đo ngay sau đó, cùng host:

| Endpoint | Thời gian |
|---|---|
| `GET /api/v1/health` × 3 | 0,274s · 0,202s · 0,185s |
| `GET /api/v1/mini-app/inbound-documents` × 2 | 0,141s · 0,131s |

⇒ GET trả trong **~0,2 giây**, còn `POST inbound/record` **quá 30 giây**. Chênh
hơn **100 lần**. Đây là vấn đề của riêng endpoint đó, không phải mạng hay tải.

### 4.3 🔴 Cần backend trả lời

- `POST inbound/record` với **8 item** mất bao lâu là bình thường?
- Có phải nó tạo mới SKU/product cho từng `raw_code` chưa tồn tại không?
- Có khoá (lock) nào bị giữ lâu trong transaction không?
- Nếu >30s là bình thường thì **timeout phía app phải nâng lên**, và giao diện
  phải nói rõ *"có thể mất vài phút"* — chứ không để thủ kho nhìn nút quay.

---

## 5. ✅ Chính sách an toàn hoạt động đúng — đây mới là phần quan trọng

Tình huống vừa xảy ra chính là tình huống mơ hồ nhất: **request đã rời máy,
không biết máy chủ xử lý hay chưa.**

| Điều đã chốt 2026-09-05 | Hành vi thật đo được |
|---|---|
| Timeout sau khi gửi ⇒ `unknown` | ✅ log ghi `errorKind: 'timeout'` → `nextState: 'unknown'` |
| **Không tự retry** request ghi | ✅ đúng **1** lần POST trong toàn bộ log |
| **Không** sinh `Idempotency-Key` mới | ✅ không có lần gửi thứ hai để mà sinh |
| Dữ liệu quét **không mất** | ✅ nằm trong hàng đợi, trạng thái *"Chờ gửi lên WMS"* |

Màn kết quả hiện nguyên văn:

> **Chưa gửi được lên WMS** — Hết thời gian chờ sau khi đã gửi. **Chưa xác định
> máy chủ đã ghi nhận hay chưa.** Vui lòng đồng bộ/đối chiếu trước khi gửi lại.

Và banner *"Chưa tăng tồn kho"* vẫn đúng: `record` không đụng tồn.

⚠️ **Việc cần làm ngay:** đối chiếu trên WMS xem phiếu `Hihii` (8 sản phẩm) có
được tạo hay không. Đó đúng là việc app đang yêu cầu người dùng làm — và nó
**chưa có lời giải trong báo cáo này**, vì đúng theo thiết kế thì app không được
đoán hộ.

---

## 6. Chưa kiểm chứng được trong lần chạy này

| Hạng mục | Vì sao |
|---|---|
| `post-receipt` · `post-issue` | Chưa có phiếu nào tới trạng thái sẵn sàng Post |
| **Mục 12 — định dạng `If-Match`** | Chỉ đo được khi có một lần Post thật thành công |
| Luồng xuất kho (`resolve-code`, `record`) | Chưa chạy |
| Bốn thao tác bảo hành | Chưa chạy; và `GET /api/v1/defects` vẫn chờ cấp quyền (mục 25) |
| Tải file đính kèm | Chưa có thư viện chọn ảnh (mục 26) |

---

## 7. Tổng kết

| | |
|---|---|
| Build · cài · chạy trên máy thật | ✅ |
| Preflight tier, cả hai host | ✅ đo thật |
| Header app gửi lên | ✅ đúng đủ, token được che |
| Request ghi đầu tiên | ✅ đi đúng endpoint, đúng header |
| Máy chủ phản hồi | 🔴 **quá 30 giây** — cần backend xem |
| Xử lý tình huống mơ hồ | ✅ đúng chính sách, dữ liệu còn nguyên |

**Kết luận trung thực:** tầng client làm đúng phần của nó — kể cả ở tình huống
xấu. Nhưng **chưa có một thao tác ghi nào hoàn tất thành công**, nên mọi hạng
mục phụ thuộc "một lần ghi thành công" vẫn còn treo.


---

# Lần chạy thứ hai — 2026-09-06 12:35

> Sau khi dựng lại APK kèm module chọn ảnh (`GATE_WMS §2j`).
> **Lần Post Issue thật đầu tiên.**

## 1. ✅✅ Mục 12 ĐÓNG HẲN — `If-Match` là số trần

```
POST /api/v1/mini-app/outbound-documents/40201492-…/post-issue
  Idempotency-Key: wmshn-postissue-40201492-4c71-47fb-a561-ce1071b7bca2
  If-Match: 4
  User-Agent: WMSHoaNam-Android/1.0
  X-WMS-Client-Tier: dev-test
  Authorization: [ĐÃ CHE]
→ KHÔNG lỗi
```

Câu hỏi treo từ 2026-09-05 — *"server chấp nhận định dạng `If-Match` nào?"* —
nay có câu trả lời **đo được**: **số trần, không dấu nháy, không `W/`**.

Và nó được trả lời bởi đúng thao tác đáng tin nhất: một lệnh **giảm tồn kho
thật** đã thành công.

## 2. ✅ Quy trình duyệt chạy đúng thiết kế

| Bước | Đo được |
|---|---|
| Lọc phiếu chờ duyệt | `?ready_for_post=true&ready_for_issue=true` — bộ lọc mới, **không còn 422** |
| Đọc lại version trước khi Post | `GET /outbound-documents/{id}` ngay trước `POST` |
| Khoá idempotency ổn định | `wmshn-postissue-<id>` — suy từ mã phiếu |
| Nạp lại danh sách sau khi Post | có, `ready_for_post` gọi lần hai |

## 3. 🔴 Một lỗi CÂU CHỮ của app, đo mới thấy

```
HTTP lỗi 422 /api/v1/mini-app/warranty/resolve-code  { code: 'SKU_NOT_FOUND' }
```

WMS **đã trả lời** — chỉ là trả lời *"không biết mã này"*. Nhưng app gộp mọi
lỗi vào một nhánh và báo *"Chưa hỏi được WMS"*.

Sai, và sai theo hướng tốn công: thủ kho sẽ đi kiểm tra mạng trong khi vấn đề
nằm ở cái tem.

**Đã sửa.** Ranh giới nay rõ ràng:

| Tình huống | Kết luận | Câu hiện ra |
|---|---|---|
| 4xx — máy chủ trả lời rõ | **đã trả lời** | *"WMS không nhận ra mã … (SKU_NOT_FOUND)"* |
| Mất mạng, hết giờ chờ, 5xx | **chưa hỏi được** | *"Chưa hỏi được WMS về mã …"* |

Lý do phân biệt: 4xx là **kết luận về mã**; 5xx và mất mạng thì máy chủ **chưa
kết luận gì**, và bảo thủ kho rằng mã hỏng là vu oan cho cái tem.

## 4. Trạng thái sau hai lần chạy

| Thao tác | Chạy thật | Kết quả |
|---|:--:|---|
| `inbound/record` | ✅ | 🔴 **timeout 30s** (mục 28) |
| `outbound/post-issue` | ✅ | ✅ **thành công** |
| `warranty/resolve-code` | ✅ | 422 `SKU_NOT_FOUND` — đúng hành vi, app xử lý đúng sau khi sửa |
| `inbound/resolve-code` · `outbound/resolve-code` · `outbound/record` · `post-receipt` | ❌ | chưa |
| `warranty-cases` · `status` · `attachments` | ❌ | chưa |

**Hai điều đáng chú ý khi so hai lần chạy:** `post-issue` (giảm tồn, một phiếu)
trả về **ngay**, trong khi `inbound/record` (8 mã, một transaction) **quá 30
giây**. Càng củng cố rằng mục 28 là vấn đề của riêng endpoint `record`, không
phải máy chủ chậm.


---

# Lần chạy thứ ba — 2026-09-06 13:54

> Người dùng tự chọn một ảnh và bấm Tải lên. **Lần tải file thật đầu tiên.**

## 1. 🔴🔴 Phát hiện chặn cứng: nginx giới hạn 1 MB

```
POST /api/v1/mini-app/warranty-cases/9e464849-…/attachments
→ HTTP 413 Request Entity Too Large
   Server: nginx/1.18.0 (Ubuntu)
   Content-Type: text/html
   (KHÔNG có X-Request-ID)
```

Đo ngưỡng bằng curl trên cùng host:

| Kích thước | Kết quả |
|---|---|
| 256 KB · 512 KB · 900 KB · 1000 KB · 1010 KB | **401** — tới được ứng dụng |
| 1024 KB · 2048 KB | **413** — nginx chặn |

⇒ `client_max_body_size` = **1 MB**, đúng giá trị **mặc định** của nginx. Chưa
ai đặt nó.

Không có `X-Request-ID` và thân là HTML ⇒ **request chưa từng tới Laravel**.
Đây là chặn ở tầng web server, không phải luật nghiệp vụ.

### Hệ quả

| Thiết kế khai | Hạ tầng cho |
|---|---|
| Ảnh **10 MB** | 1 MB |
| Video **300 MB** | 1 MB |

Ảnh chụp bằng điện thoại thường **3–8 MB** ⇒ **không tải lên được ảnh nào**.
Phần **J** coi như không dùng được cho tới khi hạ tầng sửa.

## 2. ✅ Phần app làm đúng

| Kiểm chứng | Kết quả |
|---|---|
| `Content-Type` **không** bị đặt tay | ✅ RN tự sinh `boundary` — đúng như thiết kế |
| `Idempotency-Key` **không** gửi | ✅ spec không khai cho endpoint này |
| `X-WMS-Client-Tier` gửi kèm | ✅ |
| App xử lý 413 | ✅ không crash, nạp lại danh sách file |
| Bộ chọn ảnh | ✅ mở `com.google.android.photopicker`, **không hộp thoại quyền nào** |
| Quyền app đang có | `INTERNET · ACCESS_NETWORK_STATE · ACCESS_WIFI_STATE · CAMERA` — **không quyền media** |

## 3. 🔴 Câu lỗi cũ vô dụng — đã sửa

413 rơi vào nhánh chung và hiện *"Yêu cầu không hợp lệ."* Với người dùng vừa
chọn một ảnh hợp lệ, đã qua kiểm 10MB của app, thì câu đó **không nói được gì**
và không chỉ tới ai sửa được.

Nay nói đúng nguyên nhân, và chỉ đúng người sửa được — thủ kho không tự nâng
giới hạn nginx. Cùng đợt, thêm nhánh **412/428** (optimistic locking): nói rõ
*bấm lại không giải quyết*, phải mở lại bản ghi.

## 4. 🔴 Một lỗi nối dây, chỉ chạy thật mới lộ

Bấm vào một hồ sơ bảo hành ở màn danh sách: **không có gì xảy ra**. Log không
có `/warranty-cases/{id}` nào.

`onOpenCase` chưa được nối ở `AppShell` ⇒ **toàn bộ màn chi tiết bảo hành không
tới được từ trong app** — chuyển trạng thái, timeline, ảnh/video, cả ba đều đã
dựng và test xanh nhưng không ai mở được.

Đúng loại lỗi test đơn vị không bắt: mỗi mảnh đều đúng, chỉ là không ai nối
chúng lại. Đã nối; màn chi tiết nay chạy đủ.

---

# Lần chạy thứ tư — 2026-09-06 15:00 → 15:45

**Yêu cầu:** *"chạy 1 lượt app đưa dữ liệu test vào chạy full luồng lấy thống kê
lỗi và fix triệt để"*.

**Máy:** Xiaomi 12 Pro (`fbb9e686`), Android 15, bản debug nối Metro.
**Môi trường:** `dev-test` → `khohoanamdev.lptech.info.vn`.
**Dữ liệu test đã đưa vào thật:** một hồ sơ bảo hành nhánh *mất tem/mã*, khách
*"Khach Kiem Thu App"* / `0987001122`, Hà Nội – Ba Đình.

## 0. Cách đo — một cái bẫy phải biết trước

`uiautomator dump` **bỏ sót Text nhiều dòng**. Lúc đầu bản dump không có dòng
nội dung banner, suýt nữa tôi báo "banner mất chữ". Chụp màn hình thì thấy chữ
hiện đủ. **Kết luận: dump dùng để bấm đúng toạ độ; muốn khẳng định có/không hiện
thì phải chụp màn hình.**

Cái bẫy thứ hai: **Fast Refresh không ăn**. Sửa mã xong, màn hình vẫn chạy bundle
cũ — tôi đã suýt kết luận sai rằng bản vá không có tác dụng. Phải
`am force-stop` rồi mở lại thì app mới nạp bundle mới.

## 1. Thống kê lỗi

| # | Lỗi | Mức | Nguồn gốc | Trạng thái |
|---|---|---|---|---|
| L‑01 | Bộ gõ Telex **ăn ký tự** trong ô nhập mã | 🔴 **CHẶN** | port | ✅ sửa + đo lại trên máy |
| L‑02 | Bắt buộc chọn bệnh lỗi, mà danh mục WMS **rỗng** ⇒ không hồ sơ bảo hành nào tạo được | 🔴 **CHẶN** | port | ✅ sửa + đo lại trên máy |
| L‑03 | Khoá `Idempotency-Key` = SĐT + **độ dài** mô tả ⇒ hai hồ sơ khác nhau **trùng khoá** | 🟠 CAO | port | ✅ sửa (chưa đo lại) |
| L‑04 | Android rủ **lưu SĐT khách vào Google Password Manager** | 🟠 CAO (riêng tư) | port | ✅ sửa (chưa đo lại) |
| L‑05 | Gửi `defect_ids: []` thay vì bỏ hẳn khoá | 🟡 TRUNG BÌNH | port | ✅ sửa |
| L‑06 | `GET /api/v1/defects` trả **200 + rỗng** — WMS chưa khai bệnh lỗi nào | 🔵 backend | WMS | ⏳ chờ backend |
| L‑07 | Chú thích mã nói `/defects` đang **403**, thực tế đã là 200 | 🟢 THẤP | tài liệu | ✅ sửa |
| L‑08 | Tạo xong hồ sơ thì **mất dấu** — không mở lại được | 🔴 **CHẶN** | port + backend | ✅ sửa phía app + đo lại; phần sắp xếp/phân trang chờ backend |
| L‑09 | Trên thẻ danh sách **chỉ một dòng chữ** bấm được | 🟠 CAO | port | ✅ sửa 2 màn + đo lại |
| L‑10 | Nút **Back của Android đóng hẳn app** ở mọi màn — mất phiếu đang điền dở | 🔴 **CHẶN** | port | ✅ sửa + đo lại |

### L‑01 — Telex ăn ký tự của mã (CHẶN)

Đo trực tiếp, ô *"Mã QR/Barcode*"* màn **Nhập mã thủ công**:

| Gõ vào | Ô nhận được |
|---|---|
| `TEST` | `TÉT` |
| `HN1SKUTEST` | `HN1SKUTEST` (không ghép, vì không phải âm tiết tiếng Việt hợp lệ) |

Telex ghép `e` + `s` thành `é` và **nuốt luôn chữ `s`**. Hỏng **âm thầm**: thủ
kho gõ đúng mã trên tem, WMS trả `SKU_NOT_FOUND`, không ai hiểu vì sao.

Không cứu được ở tầng xử lý chuỗi — bỏ dấu `TÉT` chỉ ra `TET`, chữ `S` đã mất.
`autoCorrect={false}` cũng **không** chặn được, vì Telex là **bộ gõ**, không
phải sửa lỗi chính tả.

**Sửa:** [`src/ui/CodeInput.tsx`](../../apps/wms-mobile/src/ui/CodeInput.tsx) —
`keyboardType="visible-password"` (Android `TYPE_TEXT_VARIATION_VISIBLE_PASSWORD`)
tắt hẳn phần ghép dấu. Ô vẫn hiện chữ bình thường, **không** che như mật khẩu.
Áp cho 4 màn nhập mã; ô tiếng Việt thật (tìm kiếm theo tên phiếu) **giữ nguyên**
bộ gõ.

**Đo lại sau khi sửa, cùng máy cùng ô: gõ `TEST` → nhận `TEST`.** ✅

> ⚠️ **Một chỗ chưa chứng minh được:** màn *Kiểm tra đầu quét* nhận ký tự từ
> **đầu quét cứng của PDA** (keyboard wedge) cũng được đổi sang `CodeInput`.
> Về lý thuyết chỉ có lợi — đầu quét bắn key event, `visible-password` không
> chặn key event mà còn ngăn Telex bóp méo mã quét. Nhưng **máy Xiaomi không có
> đầu quét cứng**, nên điều này chỉ đúng trên giấy cho tới khi thử trên PDA
> thật. Ghi vào `03-device-test-matrix.md` khi có máy.

### L‑02 — Luồng bảo hành là ngõ cụt tuyệt đối (CHẶN)

Hai sự thật cộng lại:

| Đo được lúc 15:17:39 | Kết quả |
|---|---|
| `GET /api/v1/defects?status=ACTIVE&page=1&per_page=100` | HTTP **200**, danh sách **rỗng** |
| Bấm *"Tiếp tục"* ở bước 2 | *"Chọn ít nhất một bệnh lỗi."* |

⇒ **Không hồ sơ bảo hành nào tạo được**, dù khách đã mang máy tới quầy.

**Luật đúng không phải tôi tự quyết** — lấy từ chính Mini App đang được port:

| Nguồn | Bằng chứng |
|---|---|
| `src/services/warranty-flow.service.ts:71` | `defect_ids?: string[]` — có dấu `?` |
| `src/services/warranty-flow.service.ts:497` | bỏ hẳn khoá khi mảng rỗng |
| `src/pages/WarrantyReceivePage/index.tsx:482` | *"Bạn vẫn có thể nhập mô tả thủ công."* |

Mini App gốc **không có** kiểm tra nào bắt chọn bệnh lỗi. Đây là **lỗi hồi quy
do bản port thêm vào**, không phải quyết định nghiệp vụ mới.

**Sửa:** `validateStep2` không chặn nữa; trạng thái rỗng đổi câu chữ thành
*"WMS chưa khai báo bệnh lỗi nào. Bấm Tiếp tục và mô tả lỗi bằng lời ở bước
sau — bước này không bắt buộc."* Mô tả ở bước 3 **vẫn bắt buộc**.

**Đo lại: đi hết 3 bước, `POST /warranty-cases` thành công lúc 15:30:45, số hồ
sơ *Đã tiếp nhận* nhảy 31 → 32.** ✅

### L‑03 — Khoá idempotency phân biệt sai

Log thật lúc 15:30:45.061:

```
'Idempotency-Key': 'wmshn-wcase-0987001122-53'
```

Công thức cũ: `số điện thoại + '-' + độ dài mô tả`.

| Vấn đề | Hậu quả |
|---|---|
| Độ dài mô tả không phân biệt nội dung | Cùng khách, **hai máy khác nhau**, hai mô tả **tình cờ dài bằng nhau** ⇒ trùng khoá. WMS coi hồ sơ thứ hai là "bấm lại" và **nuốt**. Thủ kho thấy báo thành công nhưng máy thứ hai không có hồ sơ. |
| SĐT khách nằm trong header | PII đi vào header HTTP và log máy chủ, không cần thiết. |

**Sửa:** băm (FNV‑1a 64‑bit) **toàn bộ payload đã chuẩn hoá**. Khác một ký tự
bất kỳ là khác khoá, và không lộ dữ liệu khách.

> ⚠️ **Câu hỏi nghiệp vụ còn treo — cần người quyết, tôi không tự chốt.**
> Khoá suy từ nội dung nghĩa là: khách mang **đúng máy đó, đúng lỗi đó** quay
> lại lần hai (sửa xong vẫn hỏng) sẽ ra **cùng khoá** ⇒ WMS không tạo hồ sơ
> thứ hai. Có muốn vậy không? Nếu **không**, phải đổi sang khoá sinh ngẫu nhiên
> một lần cho mỗi phiên tiếp nhận.

### L‑04 — Dữ liệu khách rơi vào Google Password Manager

Ngay sau khi bấm *"Tạo hồ sơ bảo hành"*, Android bật hộp thoại **"Lưu mật khẩu
vào Google?"**, ô *Tên người dùng* điền sẵn **`0987001122` — số điện thoại của
khách hàng**.

Thủ kho bấm nhầm *"Lưu"* là PII của khách chui vào tài khoản Google **cá nhân**
của họ.

**Sửa:** [`ui/Input.tsx`](../../apps/wms-mobile/src/ui/Input.tsx) mặc định
`autoComplete="off"` + `importantForAutofill="no"`. Ngoại lệ **duy nhất** là màn
đăng nhập — nơi đó là tài khoản WMS của chính người dùng, không phải dữ liệu
khách. Có test quét toàn bộ `src/` khoá lại ngoại lệ này.

## 2. Phần chạy đúng — đã kiểm chứng

| Việc | Bằng chứng |
|---|---|
| Câu lỗi 422 đã đúng sự thật | Ảnh chụp: *"WMS không nhận ra mã "HN1\|SKU=DCCS20083-2\|ITEM=A-001" (SKU_NOT_FOUND)"* — không còn nói dối là "chưa hỏi được" |
| Mã ghép tách đúng | Nhập `HN1\|SKU=DCCS20083-2\|ITEM=A-001` → hiện *MÁY ĐỌC ĐƯỢC / SKU: DCCS20083-2 / ITEM: A-001* trước khi gửi |
| 422 **không** thành ngõ cụt | Tự chuyển sang hồ sơ tạm, nêu rõ lý do |
| Tỉnh/phường nạp thật | 34 tỉnh sau sáp nhập; chọn Hà Nội → nạp phường (Ba Đình, Ngọc Hà, Giảng Võ…) |
| Header tier đúng | `X-WMS-Client-Tier: dev-test` trên mọi yêu cầu |
| `Authorization` được che trong log | `Authorization: '[ĐÃ CHE]'` |
| Log debug **không** có ở bản release | `logger.ts:109` — `minLevel = isDev ? 'debug' : 'warn'` |

## 2b. Vòng đời hồ sơ bảo hành — chạy hết, đo được

Máy mở khoá lúc 15:58, chạy tiếp.

| Bước | Bằng chứng |
|---|---|
| Tạo hồ sơ thứ hai (nhánh mất tem) | `POST /warranty-cases` 16:03:24 → mã **`WC-20260906160324-MMS7`** |
| Khoá idempotency mới | `Idempotency-Key: wmshn-wcase-180d1c55f54da32a` — **băm, không còn SĐT khách** ✅ L‑03 |
| **Không** còn hộp thoại Google | Tạo xong vào thẳng chi tiết, không có *"Lưu mật khẩu vào Google?"* ✅ L‑04 |
| Vào thẳng chi tiết hồ sơ vừa tạo | Gọi `/{id}/attachments` và `/{id}/events` ngay sau khi tạo ✅ L‑08 |
| Chuyển trạng thái RECEIVED → CHECKING | 16:04:50, `If-Match: '1'` (số trần), `Idempotency-Key: wmshn-wstatus-{id}-CHECKING`; nhãn đổi thành **CHECKING**, stepper nhảy sang bước ✓ |

### 🆕 L‑08 — tạo xong thì **mất dấu** hồ sơ (đã sửa)

Hồ sơ đầu tiên tạo lúc 15:30 **không tìm thấy trong danh sách**, dù bộ đếm
*Đã tiếp nhận* nhảy 31 → 32. Nguyên nhân lộ ra khi tạo hồ sơ thứ hai:

- Hồ sơ nhánh **mất tem/mã** nhận mã dạng **`WC-<dấu thời gian>-<ngẫu nhiên>`**
  (`WC-20260906160324-MMS7`), khác hẳn dãy `WC-RPTW-####` của hồ sơ thường.
- App gọi `GET /warranty-cases?per_page=25&status=RECEIVED` — **không tham số
  sắp xếp**. Danh sách quan sát được xếp **giảm dần theo mã**; theo thứ tự
  ASCII thì `WC-RPTW-…` luôn đứng trên `WC-2026…`, nên **mọi hồ sơ tạm rơi
  khỏi trang đầu 25**.
- Cộng thêm: `onCreated` ở `AppShell` **vứt bỏ** hồ sơ vừa tạo và quay về hub.

⇒ Thủ kho lập xong hồ sơ thì **không còn đường nào mở lại nó**: không đính kèm
ảnh, không chuyển trạng thái được.

**Sửa:** `onCreated` mở thẳng chi tiết, đúng như Mini App gốc làm
(`navigate('/warranty/' + response.case.id + '?created=1')`,
`src/pages/WarrantyReceivePage/index.tsx:239`). **Đo lại: tạo hồ sơ thứ hai →
vào thẳng màn chi tiết.** ✅

> 🔵 **Phần backend vẫn còn**: đây là lý do mục 24 (phân trang) nặng hơn tưởng.
> Không phải "quá 25 thì không xem được phần đuôi" mà là **hồ sơ tạm gần như
> không bao giờ xuất hiện trong danh sách**. Cần backend cho sắp xếp theo
> `created_at` giảm dần, hoặc app phải tự phân trang + tìm kiếm.

### 🆕 L‑09 — chỉ **một dòng chữ** trên thẻ là bấm được (đã sửa)

Đo thật: chạm vào **mã hồ sơ** `WC-RPTW-0157` tại (559, 2045) → **không có gì
xảy ra**; chạm dòng tên sản phẩm tại (719, 2219) → mở chi tiết.

`onPress` được gắn vào riêng thẻ `<Text>` tên sản phẩm, không phải cả thẻ.
Thủ kho đeo găng nhắm vào **mã** là chuyện đương nhiên. `ApprovalsScreen` đã
làm đúng (bọc `Pressable`, có `accessibilityRole="button"`); `WarrantyListScreen`
và `HistoryScreen` thì không.

**Sửa cả hai màn** theo mẫu của `ApprovalsScreen`. **Đo lại: chạm đúng (559,
2045) trên mã hồ sơ → mở chi tiết.** ✅

### 🆕 L‑10 — nút Back của Android **đóng hẳn app** (đã sửa)

Đo thật: đang ở danh sách hồ sơ bảo hành, bấm Back → về **màn hình chính của
điện thoại**. Toàn bộ mã nguồn **không có một `BackHandler` nào**, nên Android
hiểu là "không ai xử lý" và đóng activity.

Hậu quả không chỉ là bất tiện:

| Đang làm gì | Bấm Back (trước khi sửa) |
|---|---|
| Điền tới bước 3 phiếu bảo hành | **mất sạch** tên, SĐT, địa chỉ, mô tả |
| Quét dở 20 mã trong một phiên | **mất cả phiên** |
| Xem chi tiết một phiếu | thoát app thay vì về danh sách |

Mini App cũ chạy trong webview nên Back đi lùi trong lịch sử trình duyệt; bản
native không có gì thay thế. Người dùng Android vuốt cạnh màn hình để lùi hàng
trăm lần mỗi ngày — đây không phải ca hiếm.

**Sửa:** [`useHardwareBack.ts`](../../apps/wms-mobile/src/app/useHardwareBack.ts)
— ngăn xếp handler, **màn trong cùng xử lý trước**. `AppShell` lùi từng lớp
(chi tiết → danh sách → tab → Trang chủ), chỉ ở tab gốc mới nhường cho Android
đóng app. Luồng tiếp nhận bảo hành lùi **từng bước** thay vì nhảy ra ngoài.

**Đo lại trên máy:**

| Thao tác | Kết quả |
|---|---|
| Back ở màn bảo hành | về tab **Trang chủ** ✅ (trước: thoát app) |
| Back lần nữa ở tab gốc | thoát ra launcher ✅ (đúng thói quen Android) |
| Back ở **bước 2** phiếu bảo hành | về bước 1, **giữ nguyên** mô tả sản phẩm, tên khách, SĐT ✅ |

> ⚠️ **Còn một quyết định cho bạn:** Back ở **bước 1** hiện thoát luồng và mất
> dữ liệu đã điền — giống hệt nút "Quay lại" trên màn. Có muốn hỏi *"Bỏ phiếu
> đang điền?"* trước khi thoát không? Đó là quyết định thiết kế, tôi không tự
> đặt thêm hộp thoại.

## 3. Còn nợ

| Việc | Vì sao chưa xong |
|---|---|
| Luồng **xuất kho** với mã có thật | `DCCS20083-2` chỉ là dữ liệu giả trong test (`inboundFlow.test.tsx:61`), WMS trả `SKU_NOT_FOUND`. Cần một mã **có thật** trên `dev-test` để chạy tiếp |
| **Duyệt + post-receipt** phiếu nhập tạo lúc 14:50 | Chưa chạy trong lượt này |
| Đính kèm **ảnh** vào hồ sơ bảo hành | Chặn bởi mục 30 — nginx giới hạn 1 MB, chưa nới |
| Đầu quét **cứng** trên PDA | Xiaomi không có đầu quét cứng; xem cảnh báo ở L‑01 |

**Ghi chú giữa chừng:** máy khoá màn hình lúc 15:44 (`mScreenLocked=true`) —
tôi **không mở khoá máy của người dùng**, đã dừng và nhờ mở, chạy tiếp từ 15:58.
