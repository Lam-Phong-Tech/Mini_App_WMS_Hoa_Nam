# 04 — Ma trận truy vết chuyển đổi màn hình

> Bắt buộc theo Prompt 4 §A. Cập nhật sau **mỗi đợt**, không viết một lần lúc cuối.
>
> Nguồn thiết kế: [04-design-reference.md](04-design-reference.md) — 47 ảnh chụp thật.
> Nguồn hành vi: [01-screen-inventory.md](01-screen-inventory.md) và khảo sát trực quan
> [04-screen-survey.md](04-screen-survey.md).

## Quy ước trạng thái

| Ký hiệu | Nghĩa |
|:--:|---|
| ✅ | Dựng xong, đã đấu nguồn dữ liệu **thật** (đọc), có test |
| 🟡 | Dựng xong UI + state, **luồng ghi chưa đấu** — ngoại lệ `GATE_WMS §2d` |
| ⬜ | Chưa làm |

---

## Đợt 1 — Nền móng ✅

| Màn nguồn | Ảnh | Component ZaUI | Màn đích | Tệp đích | Trạng thái |
|---|:--:|---|---|---|:--:|
| Đăng nhập | 02–05 | `Page` `Input` `Button` | Đăng nhập | `features/auth/LoginScreen.tsx` | ✅ |
| Xác thực — phiên hết hạn | 06 | `Page` `Button` | Phiên hết hạn | `features/auth/StatusScreen.tsx` | ✅ |
| Xác thực — không có quyền | 07 | `Page` `Button` | Không có quyền | `features/auth/StatusScreen.tsx` | ✅ |
| Fallback — không tìm thấy màn | 47 | `Page` `Button` | Không tìm thấy | `features/auth/StatusScreen.tsx` | ✅ |
| Cá nhân — tài khoản, kết nối | 08 | `Page` `List` | Cá nhân | `features/profile/ProfileScreen.tsx` | ✅ |
| Cá nhân — phiên và bảo mật | 09 | `List` `Button` | Cá nhân | `features/profile/ProfileScreen.tsx` | ✅ |
| Xác nhận đăng xuất | 10 | `Sheet` | Hộp thoại đăng xuất | `ui/Sheet.tsx` | ✅ |
| Trang chủ — tổng quan | 11 | `Page` `Box` | Trang chủ | `features/home/HomeScreen.tsx` | ✅ |
| Trang chủ — sản phẩm đã duyệt | 12 | `List` | Trang chủ | `features/home/HomeScreen.tsx` | ✅ |
| Danh mục màn xác thực | 01 | — | **không port** | — | ⬜ |

> Ảnh 01 là **công cụ nội bộ** để chụp ảnh, không phải màn nghiệp vụ (§2.3 của
> design reference). App mới đã có màn Chẩn đoán riêng.

### Nguồn dữ liệu đợt 1 — đều là ĐỌC thật

| Màn | Endpoint | Đã kiểm chứng |
|---|---|:--:|
| Đăng nhập | `POST /api/v1/auth/login` | ✅ ngoại lệ `§2c`, chạy thật |
| Cá nhân | `GET /api/v1/auth/me` | ✅ trả 200 (§4e.2) |
| Cá nhân — đăng xuất | `POST /api/v1/auth/logout` | ✅ ngoại lệ `§2c` |
| Trang chủ | `GET /api/v1/mini-app/inbound-documents` | ✅ trả 200 (§4e.2) |

### Component mới dựng ở đợt 1

`Banner` · `Badge` · `Stepper` · `StatCard` · `DefinitionRow` · `EmptyState` ·
`BottomNav` · `Sheet` · `StatusScreen`

Tất cả có chú thích trỏ về **số ảnh** làm căn cứ, để lần sửa sau không phải đoán.

---

## Đợt 2 — Nhập kho ✅ / 🟡

| Màn nguồn | Ảnh | Màn đích | Tệp đích | Trạng thái |
|---|:--:|---|---|:--:|
| Nhập kho — tạo phiếu | 18 | Tạo phiếu nhập | `features/inbound/InboundCreateScreen.tsx` | ✅ |
| Nhập kho — máy quét | 19 | Quét hàng nhập | `features/scan/CameraScanScreen.tsx` *(mở rộng)* | ✅ |
| Nhập kho — kiểm tra trước ghi nhận | 20 | IN-04 Xác nhận hàng nhập | `features/inbound/InboundReviewScreen.tsx` | ✅ |
| Chi tiết phiếu nhập — tổng hợp | 21 | IN-04 *(chế độ `recorded`)* | `features/inbound/InboundReviewScreen.tsx` | ✅ |
| Chi tiết phiếu nhập — SKU, trạng thái | 22 | IN-04 *(chế độ `recorded`)* | `features/inbound/InboundReviewScreen.tsx` | ✅ |
| Kết quả nhập kho | 23 | Kết quả nhập kho | `features/inbound/InboundResultScreen.tsx` | 🟡 |
| Kết quả nhập kho — thao tác | 24 | Kết quả nhập kho | `features/inbound/InboundResultScreen.tsx` | 🟡 |

### 🟡 Vì sao hai màn kết quả chưa ✅

Bước **ghi nhận** gọi endpoint ghi, mà `GATE_WMS §2d` chỉ mở **đọc**. Luồng đã
đấu vào **hàng đợi thật**: bấm *Ghi nhận nhập* → `outbox.enqueue` (có
`idempotencyKey` ổn định) → `syncEngine.syncOne` → nhận `blocked_by_gate`.

Màn kết quả vì thế có **hai kết cục**:

| Kết cục | Khi nào | Hiển thị |
|---|---|---|
| `posted` | Gate đã mở | *"Đã ghi nhận hàng nhập"*, trạng thái **Chờ duyệt nhập kho** |
| `queued` | **hiện tại** | *"Đã lưu vào hàng đợi trên máy"* + đúng lý do Gate chặn |

Dữ liệu quét **không mất** — nằm trong hàng đợi ở trạng thái `pending`.

⚠️ Khi Gate WMS PASS: thay `gateBlockedSender` ở `sync/bootstrap.ts`, **không**
sửa màn nào. Toàn bộ luồng đã đi qua hàng đợi thật.

### Ba mốc tồn kho — giữ nguyên văn từ ảnh

| Mốc | Ai làm | Tồn kho |
|---|---|---|
| **Quét** | thủ kho, trên máy | không đổi — *"Scan chỉ lưu danh sách mã tạm"* (ảnh 18) |
| **Ghi nhận** | thủ kho | không đổi — tạo phiếu WMS, chuyển **chờ duyệt** (ảnh 20) |
| **Post Receipt** | người duyệt | **tăng** — *"Tồn kho chỉ tăng sau khi duyệt/Post Receipt"* (ảnh 24) |

Nói nhầm mốc là thủ kho tưởng hàng đã vào kho. Có test khoá câu chữ.

---

## Đợt 3 — Xuất kho ✅ / 🟡

| Màn nguồn | Ảnh | Màn đích | Tệp đích | Trạng thái |
|---|:--:|---|---|:--:|
| Xuất kho — thông tin phiếu | 25 | Tạo phiếu xuất | `features/outbound/OutboundCreateScreen.tsx` | ✅ |
| Xuất kho — địa chỉ và số lượng | 26 | *(cùng màn, cuộn xuống)* | ↑ | ✅ |
| Xuất kho — lỗi validation | 27 | *(cùng màn, trạng thái lỗi)* | ↑ | ✅ |
| Xuất kho — máy quét | 28 | Quét hàng xuất | `features/scan/CameraScanScreen.tsx` | ✅ |
| Xuất kho — kiểm tra trước ghi nhận | 29 | OUT-RECORD | `features/outbound/OutboundReviewScreen.tsx` | ✅ |
| Xuất kho — danh sách chờ quét | 30 | *(cùng màn, dòng viền đứt nét)* | ↑ | ✅ |
| Chi tiết phiếu xuất — thông tin | 31 | OUT-04 *(chế độ `posted`)* | ↑ | ✅ |
| Chi tiết phiếu xuất — danh sách mã | 32 | *(cùng màn)* | ↑ | ✅ |
| Chi tiết phiếu xuất — cuối màn | 33 | *(cùng màn)* | ↑ | ✅ |
| Kết quả xuất kho | 34 | Kết quả xuất kho | `features/outbound/OutboundResultScreen.tsx` | 🟡 |
| Kết quả xuất kho — thao tác | 35 | *(cùng màn, cuộn xuống)* | ↑ | 🟡 |

> 11 ảnh nhưng **4 màn thật** — bộ ảnh chụp nhiều lát cắt của cùng một màn khi
> cuộn hoặc khi đổi trạng thái.

### Ba khác biệt so với luồng nhập kho

| | Nhập kho | Xuất kho |
|---|---|---|
| Số lượng | không biết trước | **đặt trước** ở form |
| Điều kiện ghi nhận | ≥ 1 mã | **đủ** số lượng đã nhập |
| Tồn kho | **tăng** sau Post Receipt | **giảm** sau Post Issue |

### Component mới ở đợt 3

`Select` (có trường phụ thuộc) · `ProgressBar`

---

## Đợt 4 — Bảo hành ✅ / 🟡

| Màn nguồn | Ảnh | Màn đích | Tệp đích | Trạng thái |
|---|:--:|---|---|:--:|
| Bảo hành — danh sách tiếp nhận | 39 | Tiếp nhận bảo hành | `features/warranty/WarrantyListScreen.tsx` | ✅ |
| Bảo hành — hồ sơ đã tiếp nhận | 40 | *(cùng màn, cuộn xuống)* | ↑ | ✅ |
| Bảo hành — chi tiết hồ sơ | 44 | Hồ sơ bảo hành | `features/warranty/WarrantyDetailScreen.tsx` | ✅ |
| Bảo hành — chuyển trạng thái, timeline | 45 | *(cùng màn, cuộn xuống)* | ↑ | 🟡 |
| Bảo hành — ảnh và video | 46 | *(cùng màn, cuộn xuống)* | ↑ | 🟡 |
| Bảo hành — tạo hồ sơ mất mã | 41 | ⬜ | — | ⬜ |
| Bảo hành — chọn bệnh lỗi | 42 | ⬜ | — | ⬜ |
| Bảo hành — mô tả và phụ kiện | 43 | ⬜ | — | ⬜ |

### ⬜ Ba màn tạo hồ sơ (41–43) — chưa dựng, có lý do

Luồng *"Mất tem/mã · Tạo hồ sơ tạm"* là **luồng GHI thuần**: nó không đọc gì, chỉ
tạo hồ sơ mới. Dựng UI xong cũng không bấm được gì có ý nghĩa cho tới khi
`GATE_WMS §2d` mở phần ghi.

Nút vào luồng vẫn có trên màn danh sách (đúng ảnh 39), nhưng chưa nối. Sẽ dựng
cùng lúc với việc mở Gate, hoặc theo yêu cầu riêng của người dùng.

⚠️ Ngoài ra màn 42 cần `GET /api/v1/defects`, mà endpoint đó trả **403** với vai
thủ kho — đã có `isDefectPermissionDenied` xử lý sẵn, coi 403 là trạng thái hợp
lệ chứ không phải sự cố.

### Ba rủi ro của luồng này — đều đã có test

| Rủi ro | Cách xử lý |
|---|---|
| **PII che theo vai** | Client **không tự che**: hiển thị nguyên thứ máy chủ trả. Ảnh 40 (có quyền) và khảo sát cùng màn bằng tài khoản thủ kho (bị che) là hai bằng chứng |
| **`defects` trả 403** | Coi là **trạng thái hợp lệ**, có câu giải thích và lối đi tiếp — không hiện màn "lỗi hệ thống" |
| **Hồ sơ ẩn danh** | Nhận qua `[ANONYMIZED]`; ẩn liên hệ khách **và** tải tệp (tệp đã bị xoá vật lý, nút tải chỉ dẫn tới 404) |

### Component mới ở đợt 4

`FilterChipRow` (cuộn ngang) · `Checkbox` · `Timeline`

---

## Đợt 5 — Duyệt · Lịch sử · Tra cứu ✅

| Màn nguồn | Ảnh | Màn đích | Tệp đích | Trạng thái |
|---|:--:|---|---|:--:|
| Duyệt phiếu nhập | 36 | Duyệt phiếu *(tab nhập)* | `features/approvals/ApprovalsScreen.tsx` | ✅ |
| Duyệt phiếu xuất | 37 | *(cùng màn, tab xuất)* | ↑ | ✅ |
| Lịch sử chứng từ | 38 | Lịch sử chứng từ | `features/history/HistoryScreen.tsx` | ✅ |
| Quét mã — sẵn sàng | 13 | Tra cứu *(tab Quét mã)* | `features/lookup/LookupScreen.tsx` | ✅ |
| Tra cứu — hộp nhập mã | 14 | *(cùng màn, `Sheet`)* | ↑ | ✅ |
| Nhập mã thủ công — màn riêng | 15 | *(cùng chức năng, lối vào khác)* | ↑ | ✅ |
| Tra cứu — chi tiết sản phẩm | 16 | *(cùng màn)* | ↑ | ✅ |
| Tra cứu — công dụng, mô tả | 17 | *(cùng màn, cuộn xuống)* | ↑ | ✅ |
| Fallback — không tìm thấy màn | 47 | Không tìm thấy | `features/auth/StatusScreen.tsx` | ✅ |

### 🔧 Sửa V-01 và V-02 — có test chứng minh

Nguyên nhân đã truy được từ log mạng: **V-02 là nguyên nhân, V-01 là triệu chứng**.

| | Trước | Sau |
|---|---|---|
| Trang chủ | tự gọi `?status=WAITING_APPROVAL` → **5** | không đổi |
| Duyệt phiếu | **đợi bấm *Đồng bộ WMS*** → **0** | **tự nạp khi mở**, cùng query → khớp trang chủ |

Nút *Đồng bộ WMS* **giữ lại** (ảnh 36 có nó) nhưng đổi vai: từ *"cách duy nhất
để có dữ liệu"* thành *"tải lại khi nghi số liệu cũ"*. Bỏ hẳn là lấy mất công cụ
thủ kho đang quen dùng.

Câu empty state cũng sửa: app cũ ghi *"bấm Đồng bộ để tải lại danh sách"* — nay
danh sách đã tự nạp nên câu đó vừa sai vừa gây hiểu nhầm là chưa tải.

### Danh sách dài dùng FlashList

Màn Lịch sử dùng `List` (bọc `FlashList`) theo ràng buộc `GATE_01` Q1 — cũng là
chỗ sửa **D-06** của app cũ (*"Không có virtualization cho danh sách dài"*).

⚠️ Ô tìm và chip lọc **lọc trên dữ liệu đã tải**, không gọi lại máy chủ mỗi ký
tự: mạng kho chập chờn, và gọi theo từng ký tự đốt hạn mức rate limit
(30 lần/phút theo IP, cả kho chung một IP). Hệ quả phải biết: chỉ lọc được trong
phạm vi trang đã tải — khi vượt một trang phải chuyển sang lọc phía máy chủ.

---

## Thanh tab — thêm dần, không để tab rỗng

Bộ ảnh có **5 tab**. `AppShell` hiện **chỉ tab đã dựng thật**:

| Tab | Đợt | Trạng thái |
|---|:--:|:--:|
| Trang chủ | 1 | ✅ |
| Quét mã | 5 | ✅ *(mở màn **Tra cứu** — quét ở đây chỉ tra cứu, không ghi gì)* |
| Duyệt phiếu | 5 | ✅ |
| Lịch sử | 5 | ✅ |
| Cá nhân | 1 | ✅ |

**Đủ 5 tab như bộ ảnh.** Suốt đợt 1–4 thanh tab chỉ hiện tab đã dựng, vì nguyên
tắc #4 cấm màn demo: một tab bấm vào ra màn trống đúng là thứ đó, và tệ hơn —
thủ kho tưởng chức năng **hỏng** chứ không phải **chưa làm**.

Tab lạ rơi vào màn fallback của ảnh 47, không bao giờ để màn trắng.

---

## Ghi chú bắt buộc cho `GATE_04`

Theo `GATE_WMS §2d.5`, khi xin duyệt Gate 04 phải ghi rõ:

> Luồng **ghi** (tạo phiếu, ghi nhận, duyệt, post) dựng xong UI và state nhưng
> **chưa đấu backend**, theo ngoại lệ được phê duyệt tại `GATE_WMS §2d`.

**Hai mục thuộc diện này tính đến đợt 3:**

| Luồng | Bước bị chặn | Đã xong |
|---|---|---|
| Nhập kho | *Ghi nhận nhập* | UI · state · hàng đợi · khoá idempotency |
| Xuất kho | *Xác nhận ghi nhận* | UI · state · validation · hàng đợi · khoá idempotency |

| Bảo hành | *Chuyển trạng thái* · *Tải ảnh/video* | UI · state · validation ghi chú · giới hạn tệp |

Cả ba chỉ thiếu đúng một thứ: lời gọi endpoint ghi.

Riêng ba màn **tạo hồ sơ bảo hành mất mã** (ảnh 41–43) chưa dựng — chúng là luồng
ghi thuần, dựng xong cũng không bấm được gì cho tới khi Gate mở.


---

## 🔍 Rà soát lại toàn bộ 47 ảnh — 2026-09-06

> Người dùng nêu: *"bên duyệt không xem được chi tiết phiếu"* và *"hiện đang
> nhiều lỗi và thiếu các màn quá"*. Rà lại từng ảnh thay vì vá từng chỗ.

### 🔴 Ba lỗi thật tìm được

| # | Lỗi | Hệ quả nếu để nguyên |
|:--:|---|---|
| 1 | **Màn Duyệt không mở được chi tiết phiếu** | Người duyệt được yêu cầu quyết định về một phiếu mà **không mở được phiếu ấy ra xem**. Đây không phải thiếu tính năng phụ — nó bỏ mất bước *đọc trước khi ký* |
| 2 | **Chi tiết phiếu xuất (`OUT-04`) chưa tồn tại** | Ảnh 31–33 hoàn toàn chưa có màn nào |
| 3 | **Thẻ phiếu vô hiệu vẫn đọc "Xem chi tiết"** cho trình đọc màn hình | Hứa hão với người khiếm thị. Bộ test bắt được |

### ✅ Đã dựng trong đợt này

| Ảnh | Màn | Tệp |
|:--:|---|---|
| 21, 22, 31, 32, 33 | **Chi tiết chứng từ** — dùng chung nhập/xuất | `features/documents/DocumentDetailScreen.tsx` |
| 41 | Bảo hành — nhập/quét mã + thông tin khách | `WarrantyIntakeScreens.tsx#WarrantyCodeStep` |
| 42 | Bảo hành — chọn bệnh lỗi (tìm + checkbox nhiều) | `WarrantyIntakeScreens.tsx#WarrantyDefectStep` |
| 43 | Bảo hành — mô tả, phụ kiện, tình trạng | `WarrantyIntakeScreens.tsx#WarrantyDescriptionStep` |
| — | Luồng nối ba màn + gọi WMS thật | `WarrantyIntakeFlow.tsx` |

Đường vào chi tiết đã nối từ **cả** màn Duyệt lẫn màn Lịch sử.

### ✅ Bổ sung đợt hai — 2026-09-06

| Ảnh | Màn | Tệp |
|:--:|---|---|
| 15 | **Nhập mã thủ công — màn riêng** | `features/scan/ManualCodeScreen.tsx` |
| — | `resolve-code` nối vào lối quét bảo hành | `WarrantyIntakeFlow.tsx` |

**Ảnh 15 khác bản modal (ảnh 14) ở đâu:** có thêm ô *Ghi chú* — chỗ ghi *vì sao*
phải nhập tay, thông tin có giá trị khi đối soát sau. Màn còn **đọc thử mã ngay**
và hiện SKU/ITEM máy hiểu được **trước khi** xác nhận: gõ nhầm một ký tự trong
chuỗi dài rất khó tự phát hiện.

Cả hai bản đều cần: modal dùng khi đang quét dở (mở màn khác lúc đó là mất phiên
quét), màn riêng dùng khi chủ động vào nhập tay.

**Ai gọi `resolve-code`:** máy quét **không** gọi mạng — nó chỉ chuyển mã, đúng
như mô tả *"Scanner chỉ chuyển mã sang `/warranty/receive?code=…`. Trang tiếp
nhận mới gọi API"*. Lý do: máy quét phải phản hồi tức thì, và mất mạng giữa lúc
quét thì mất luôn mã vừa quét.

Ba kết quả resolve, **không kết quả nào là ngõ cụt**:

| Kết quả | Nhánh | Vì sao không chặn |
|---|---|---|
| đủ điều kiện | hồ sơ thường | — |
| không đủ điều kiện | hồ sơ tạm, lý do `NOT_ELIGIBLE` | khách đã mang máy tới rồi |
| gọi mạng hỏng | hồ sơ tạm, lý do `UNREADABLE` | mất mạng không phải lỗi của khách |

Cả ba đều **hiện banner nói rõ lý do**. Im lặng đổi nhánh sẽ khiến thủ kho tưởng
máy tự ý bỏ qua mã họ vừa quét.

### 🔴 Còn thiếu — nói thẳng

| Ảnh | Màn | Vì sao chưa có |
|:--:|---|---|
| 46 | Bảo hành — ảnh và video | Giới hạn đã có trong `warrantyPolicy`, tầng tải lên đã có. **Chưa có đường CHỌN file** — thiếu thư viện native, và `GATE_01 §11` #2 cấm tự thêm (mục 26) |

⇒ **46/47 ảnh đã có màn.** Ảnh 46 là ảnh duy nhất còn kẹt, và nó kẹt ở một
quyết định thuộc về người dùng, không phải ở code.

### ⚠️ Còn tắc ở tầng quyền

Bước chọn bệnh lỗi **không dùng được với vai Thủ kho** vì `GET /api/v1/defects`
trả 403 (mục 25). Màn nói rõ đó là vấn đề quyền và chỉ tới người sửa được —
nhưng nói rõ không thay được quyền.

### Kiểm chứng

`npx tsc --noEmit` sạch · `npx eslint .` sạch · **732/732 test qua**
(tăng 53 trong hai đợt rà soát).
