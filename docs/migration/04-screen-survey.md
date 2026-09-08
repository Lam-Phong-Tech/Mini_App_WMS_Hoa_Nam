# 04 — Khảo sát trực quan Mini App cũ (2026-09-05)

> Mục đích: gỡ blocker **B-1** — trước đợt này **17/18 màn hình chưa ai nhìn thấy**
> ([01-screen-inventory.md §9](01-screen-inventory.md)), nên "port màn hình và sửa
> UI/UX" của Prompt 4 sẽ là port mù.

---

## 1. Cách làm và giới hạn — đọc trước khi tin số liệu

| | |
|---|---|
| **Chạy app** | `npx vite --port 5199` trên máy, không qua Zalo |
| **Đăng nhập** | **Người dùng tự gõ mật khẩu.** Tôi không nhập credential vào form — ranh giới giữ nguyên từ đợt contract test |
| **Tài khoản** | `warehouse-keeper-01@gmail.com` — vai **Thủ kho**, đúng vai cần khảo sát |
| **Thao tác** | **Chỉ đọc.** Không bấm nút gửi/duyệt/xác nhận/lưu nào |
| **Đã xem** | **12 / ~18 màn** |

### 1.1 🔴 Sai sót của tôi trong đợt này — ghi lại nguyên vẹn

**Tôi nói phiên chạy trên DEV/TEST. Sai — nó chạy trên production.**

Tôi tạo `.env.local` trỏ `VITE_WMS_API_BASE_URL` sang `khohoanamdev.lptech.info.vn`
rồi khẳng định với người dùng là an toàn. Nhưng `wms-link-context.ts:62-77` cho
thấy ở chế độ DEV app **bỏ qua** biến đó trừ khi có `VITE_WMS_DEV_DIRECT=true`;
mặc định nó gọi proxy `http://localhost:2999/wms-api`. Cổng 2999 là `zmp-cli start`
của người dùng, proxy tới `bigk.click` — **production**.

Tôi phát hiện khi đọc console thấy URL `localhost:2999`, chứ không phải nhờ kiểm
tra trước. Lẽ ra phải đọc hàm `getWmsApiBaseUrl()` **trước** khi khẳng định.

Kiểm chứng thiệt hại: trong 36 request còn trong bộ đệm, **chỉ GET và OPTIONS**,
không một POST/PUT/PATCH/DELETE nào. Bộ đệm đã loại bỏ 121 request cũ hơn nên
không xác minh được toàn bộ; nhưng không nút gửi/duyệt/xác nhận nào được bấm.

Người dùng được báo và **chọn tiếp tục trên production ở chế độ chỉ đọc**.

### 1.2 ⚠️ Một khiếm khuyết suýt bị ghi nhầm

`documents/INVENTORY` và `manual/RECEIPT` kẹt vĩnh viễn ở splash "Đang mở ứng
dụng…". Suýt ghi thành lỗi app. Đọc console thì thấy `504 (Outdated Optimize Dep)`
— **lỗi dev server của tôi** (Vite tối ưu lại dependency), không phải lỗi app.
Xoá `node_modules/.vite` và khởi động lại bằng `--force` thì hết.

Bài học: mọi "màn treo" phải đối chiếu console trước khi ghi vào danh mục lỗi.

---

## 2. 12 màn đã xem

| # | Đường route | Tên hiển thị | Ghi chú |
|:--:|---|---|---|
| 1 | `/auth` | Đăng nhập | Email + mật khẩu, nút "Hiện". Chân trang ghi rõ `Môi trường development · v1.0.0` |
| 2 | `/` | Trang chủ — *"Chào kho 01"* | Thẻ *Chờ duyệt / Đã duyệt hôm nay*; 4 tác vụ (Tra cứu · Nhập · Xuất · Bảo hành); thẻ Duyệt phiếu; danh sách "Sản phẩm đã duyệt" |
| 3 | `/documents/RECEIPT` | Tạo phiếu nhập | Wizard 4 bước: Thông tin → Quét mã → Kiểm tra → Gửi duyệt |
| 4 | `/documents/OUTBOUND` | Xuất kho | Form dài: tên phiếu, nhóm đối tượng, người nhận, SĐT, tỉnh/phường, địa chỉ, số lượng cần quét |
| 5 | `/documents/INVENTORY` | Nhập kho — chọn phiếu | Danh sách phiếu `PN-COV-*` có sẵn. **Khác** #3: đây là chọn phiếu, không phải tạo mới |
| 6 | `/manual/RECEIPT` | Nhập mã thủ công | Ô mã QR/Barcode, bộ đếm số lượng, **có ô Ghi chú**, Huỷ/Xác nhận |
| 7 | `/approvals` | Duyệt phiếu | Tab *Phiếu nhập · Phiếu xuất*; nút Đồng bộ WMS; trạng thái rỗng |
| 8 | `/receipt-review/:id` | **IN-04** Xác nhận hàng nhập | Dữ liệu thật: `PN-COV-P00060`, 8 mã, 1 SKU, *"Phiếu đã phê duyệt"* |
| 9 | `/history` | Lịch sử chứng từ | Ô tìm; lọc *Tất cả/Nhập/Xuất* và *Mọi trạng thái/Đang xử lý/Chờ duyệt/Đã…*; 50 phiếu |
| 10 | `/warranty` | Tiếp nhận bảo hành | Thẻ *Đã tiếp nhận 25 / Luồng tiếp nhận 2*; Quét mã · Nhập tay · Mất tem; 5 tab trạng thái |
| 11 | `/profile` | Cá nhân | Vai **Thủ kho**, *Ngữ cảnh: Theo phân quyền tài khoản*, kết nối WMS, phiên & bảo mật |
| 12 | `/warranty/receive` | **403 Không có quyền** | Xem §3.1 |

### 2.1 Sáu màn CHƯA xem

`scanner/:context` (cần camera) · `outbound-review/:id` · `approvals/outbound/:id`
· `receipt-success/:id` · `outbound-success/:id` · `warranty/:caseId` · `result/:id`.

Lý do dừng: thao tác click bắt đầu timeout và ảnh chụp lỗi `UnknownVizError` —
cửa sổ trình duyệt bị che nên trang ngừng vẽ. Thẻ bảo hành lại không phải `<a>`
nên không mở được bằng URL. Mở lại được bất cứ lúc nào.

---

## 3. Trả lời câu B-2 — app phục vụ vai trò nào

> ✅ **NGƯỜI DÙNG ĐÃ CHỐT 2026-09-05:** *"app phục vụ cả duyệt luôn"*.
> ⇒ Phạm vi Prompt 4 gồm **cả luồng duyệt phiếu**, không cắt bớt.
> ⇒ Phải làm phân quyền theo vai, và phải xử lý PII trên đĩa cho vai **có**
> `warranty.pii.view` (ADMIN / WAREHOUSE_MANAGER) — xem [§4i.4](03-api-contract-delta.md).

### 3.1 Thủ kho **CÓ** thấy luồng duyệt phiếu

Thanh điều hướng dưới có mục **Duyệt phiếu**, trang chủ có thẻ
*"Kiểm tra phiếu đã ghi nhận, phê duyệt/Post theo đúng quyền nhân viên."*

⇒ Không thể bỏ màn duyệt khỏi phạm vi Prompt 4. Nhưng **quyền do máy chủ cưỡng
chế**, không phải do UI ẩn/hiện.

### 3.2 🔴 Thủ kho **KHÔNG** có quyền đọc `defects`

```
GET /api/v1/defects?status=ACTIVE  →  403 ACCESS_DENIED
    "Bạn không có quyền thực hiện thao tác này."
```

Đây là lý do `/warranty/receive` trả **403 "Không có quyền"**: luồng tiếp nhận bảo
hành cần danh mục lỗi, mà vai này không đọc được.

### 3.3 ✅ PII bị che **phía máy chủ** — xác nhận trực quan cho §4i.3

Danh sách hồ sơ bảo hành hiện tên khách dạng `H*** V*** N*** · ******372`.

⇒ Đúng như người dùng nói: thủ kho không có `warranty.pii.view`, máy chủ trả về
đã che sẵn. **Cache trên máy không chứa PII thật.** Chính sách dọn dữ liệu §0b
xác nhận là bài toán bộ nhớ, không phải bài toán tuân thủ.

---

## 4. Khiếm khuyết UI/UX **nhìn thấy được** — chưa có trong `01-ui-ux-defects.md`

| # | Mức | Phát hiện |
|:--:|:--:|---|
| **V-01** | 🔴 | **Hai nguồn sự thật đá nhau.** Trang chủ ghi *"Chờ duyệt: **5**"*, màn Duyệt phiếu ghi *"**0** phiếu chờ duyệt"* — cùng lúc, cùng tài khoản |
| **V-02** | 🟠 | Màn Duyệt phiếu **nạp ra rỗng**, đòi bấm *"Đồng bộ WMS"* thủ công mới có dữ liệu — trong khi trang chủ đã biết số 5 mà không cần bấm gì |
| **V-03** | 🟠 | **Mọi lần tải lại / deep-link đều nháy qua màn đăng nhập** kèm *"Đang xác thực tài khoản"* rồi mới khôi phục phiên. Trên PDA lưu trữ chậm, thủ kho sẽ tưởng bị đăng xuất giữa ca |
| **V-04** | 🟠 | Màn Bảo hành vẫn hiện nút *Quét mã · Nhập tay · Mất tem*, nhưng vai thủ kho bấm vào sẽ ăn **403**. Lối vào dẫn tới ngõ cụt |
| **V-05** | 🟡 | Nhãn *"Duyệt phiếu"* ở thanh dưới xuống 2 dòng trong khi 4 nhãn còn lại 1 dòng — lệch chiều cao |

> V-01 và V-04 đáng chú ý nhất: cả hai đều là **thứ đọc mã nguồn không phát hiện
> ra**, chỉ lộ khi chạy thật bằng đúng tài khoản có phân quyền thật. Đây chính là
> lý do bước khảo sát này cần thiết trước Prompt 4.

---

## 5. Việc cần làm tiếp

| # | Việc |
|:--:|---|
| 1 | Xem nốt 6 màn còn lại (cần cửa sổ trình duyệt không bị che) |
| 2 | Đối chiếu V-01 với backend: trang chủ và màn duyệt gọi endpoint nào, vì sao lệch |
| 3 | Quyết định cho Prompt 4: giữ nút bảo hành rồi báo lỗi (như hiện tại), hay ẩn theo quyền |
