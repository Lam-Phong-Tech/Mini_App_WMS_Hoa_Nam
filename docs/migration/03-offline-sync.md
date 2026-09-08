# 03 — Storage offline & Đồng bộ

**Commit nguồn:** `663114aff6804e50b77b88e05dda9f9c784d6fff`
**Phạm vi:** Prompt 3 §C (storage) và §D (đồng bộ).

> 🔓 Phần này chỉ tồn tại được nhờ **Change Control 2026-09-05 lần 2** — người dùng nới ràng buộc `GATE_01 §3` để cho phép xây hàng đợi trước khi `GATE_WMS_API_INTEGRATION` PASS. Xem [GATE_01 §0b](gates/GATE_01.md).

---

## 1. Hai quy tắc nền — do người dùng chốt, không phải tôi đặt

Prompt 3 cấm thẳng: *"Không được tự đặt quy tắc xử lý xung đột hoặc idempotency."* Hai quy tắc dưới đây là **câu trả lời trực tiếp của người dùng ngày 2026-09-05**:

| # | Quy tắc | Nguyên văn lựa chọn |
|:--:|---|---|
| **R1** | **Chống trùng phía client, KHÔNG tự retry** | *"Khóa single-flight: một bản ghi chỉ có đúng một request bay cùng lúc. Gặp timeout → đánh dấu `unknown`, DỪNG, báo người dùng tự kiểm tra trên WMS rồi quyết định. Không giả định gì về server."* |
| **R2** | **Không bao giờ tự giải quyết xung đột** | *"Đánh dấu bản ghi `conflict`, dừng đồng bộ bản đó, giữ nguyên dữ liệu local, hiển thị cho người dùng tự quyết định. Không ghi đè tự động theo bất kỳ hướng nào."* |

Cả hai được **cưỡng chế trong đường thực thi** và có test bảo vệ — không dựa vào kỷ luật lập trình viên.

---

## 2. §C — Storage

### 2.1 Vì sao mỗi bản ghi là một khoá JSON duy nhất

MMKV bảo đảm ghi **nguyên tử ở mức từng khoá** nhưng **không có transaction nhiều khoá**. Nhồi trọn bản ghi vào một khoá là cách duy nhất ở thư viện này để đạt yêu cầu *"tránh ghi dở dang"* (Prompt 3 §C): hoặc bản ghi cũ còn nguyên, hoặc bản mới đã trọn vẹn.

**Hệ quả có chủ đích: không có file index riêng.** Index tách rời sẽ tạo ra đúng cái ghi-hai-khoá mà ta đang tránh, và index lệch là mất dấu bản ghi. Danh sách dựng bằng quét khoá theo tiền tố — chấp nhận được ở quy mô hàng trăm bản ghi, và **không bao giờ lệch với dữ liệu thật**.

📄 [`src/storage/repository.ts`](../../apps/wms-mobile/src/storage/repository.ts)

### 2.2 Schema version và migration

| Mục | Giá trị |
|---|---|
| Khoá lưu version | `schema.version` |
| Version hiện tại | **1** |
| Máy chưa có mốc | coi là version **0** |

Quy tắc chạy:

- Chạy **một lần lúc khởi động**, trong `App.tsx`, **trước** khi màn đầu tiên đọc dữ liệu.
- Mỗi migration đi từ đúng một version lên version kế tiếp, chạy theo thứ tự tăng dần.
- Gặp lỗi → **dừng ngay tại đó, KHÔNG nâng version qua nó**, để lần khởi động sau thử lại thay vì bỏ qua âm thầm.
- App bị hạ cấp (schema trên máy mới hơn) → **không đụng gì**, ghi cảnh báo.

Migration lên v1 cố tình **không biến đổi gì**: máy đã cài bản Prompt 2 chỉ có `config.environment` và khoá phiên, cả hai còn hợp lệ nguyên vẹn. Nó tồn tại để đóng mốc version, **không phải chỗ giữ chỗ cho việc chưa làm**.

📄 [`src/storage/schema.ts`](../../apps/wms-mobile/src/storage/schema.ts)

### 2.3 Giới hạn dung lượng và dọn dữ liệu

| Cơ chế | Hành vi |
|---|---|
| `UNSENT_WARNING_THRESHOLD = 200` | ⚠️ **Chỉ ghi cảnh báo log**, tuyệt đối không xoá gì |
| `pruneSynced(olderThanMs)` | Chỉ xoá bản ghi **đã `synced`** và đủ cũ |
| `pending` · `failed` · `conflict` · `unknown` | ❌ **KHÔNG BAO GIỜ bị xoá tự động** — GATE_01 §3: *"Không làm mất dữ liệu kiểm kho"* |

> 🔴 **Con số 200 và chu kỳ gọi `pruneSynced` CHƯA được người dùng xác nhận.** Prompt 3 §C đòi *"chính sách dọn dữ liệu đã xác nhận"*.

#### Phát biểu chính thức của người dùng — 2026-09-05

> `pruneSynced` là hàm dọn dữ liệu local đã đồng bộ xong. Hiện hàm này **chưa được tự gọi theo lịch**, nên dữ liệu local đó vẫn được giữ lại.
>
> **Chưa bật tự dọn vì chưa có chính sách được duyệt**, ví dụ: giữ dữ liệu đã đồng bộ 30 ngày rồi xoá. Nếu bật quá sớm có thể mất dữ liệu cần tra cứu/offline.

**Trạng thái: 🔴 CÒN MỞ.** `pruneSynced` **chưa được gọi tự động ở bất kỳ đâu** trong mã nguồn — đây là trạng thái an toàn có chủ đích, không phải thiếu sót.

> ℹ️ Con số **30 ngày** ở trên là **ví dụ minh hoạ người dùng nêu ra**, ❌ **chưa phải chính sách đã duyệt**. Không được lấy nó làm mặc định.

---

## 3. §D — Máy trạng thái đồng bộ

```
  pending ──(người dùng bấm "Đồng bộ ngay")──> syncing
                                                  │
            ┌────────────┬────────────┬───────────┴───┬──────────────┐
            ▼            ▼            ▼               ▼              ▼
         synced       failed      conflict         unknown        pending
         (2xx)     (4xx nghiệp   (409 / 412)    (timeout, parse   (chưa gửi đi:
                      vụ, 401)                    lỗi, 5xx)        offline,
                                                                   config,
                                                                   Gate chặn)
```

`synced` là trạng thái cuối duy nhất coi là thành công.
**`conflict` và `unknown` là ngõ cụt của máy tự động** — không có đường tự động nào đi ra.

### 3.1 Bảng phân loại lỗi

| `AppError.kind` | → trạng thái | Lý do |
|---|:--:|---|
| `network` | `pending` | Chắc chắn **chưa rời máy** → gửi lại an toàn |
| `config` | `pending` | Chưa cấu hình máy chủ → chưa gửi đi |
| `blocked_by_gate` | `pending` | Bị chốt chặn Gate → chưa gửi đi |
| `timeout` | **`unknown`** | Đã gửi, **không rõ server nhận chưa** — R1 |
| `cancelled` | **`unknown`** | Đã gửi rồi mới huỷ |
| `parse` | **`unknown`** | Server **có** phản hồi nhưng không đọc được → mutation có thể đã áp dụng |
| `auth` (401) | `failed` | Server từ chối, không áp dụng gì |
| `http` **409 / 412** | **`conflict`** | R2 — không tự ghi đè |
| `http` 4xx khác | `failed` | Lỗi nghiệp vụ, gửi lại sẽ bị từ chối tương tự |
| `http` 5xx | **`unknown`** | ⚠️ xem §3.2 |

📄 [`src/sync/syncEngine.ts`](../../apps/wms-mobile/src/sync/syncEngine.ts) — hàm `classifyFailure`

### 3.2 🔴 HTTP 5xx — giả định CHƯA được xác nhận

`HTTP_5XX_POLICY` hiện đặt là **`'unknown'`**, tức bắt người dùng tự đối chiếu trên WMS.

**Lý do chọn hướng an toàn:** một 5xx có thể xảy ra **sau khi** server đã ghi một phần. Không có tài liệu nào nói WMS bọc mutation trong transaction, nên coi như *"có thể đã ghi"* sẽ an toàn hơn cho tồn kho.

**Đây là chỗ cần chủ sở hữu WMS xác nhận tại `GATE_WMS_API_INTEGRATION`.** Nếu xác nhận server luôn rollback khi 5xx, đổi hằng số đó thành `'failed'` để người dùng gửi lại được ngay. Đổi một dòng, có test bám theo.

> ⚠️ Tôi **nêu ra chứ không tự chốt** — đây thuộc phạm vi *"quy tắc idempotency"* mà Prompt 3 cấm tôi tự đặt.

#### Phát biểu chính thức của người dùng — 2026-09-05

> `HTTP_5XX_POLICY = unknown` nghĩa là khi API trả lỗi server `500–599`, app không biết chắc thao tác đã thất bại hoàn toàn hay backend đã ghi dữ liệu rồi nhưng phản hồi lỗi.
>
> Vì vậy app chọn an toàn: không tự retry hoặc tự coi là thất bại; người dùng cần đối chiếu trên WMS trước để tránh tạo/post phiếu trùng. **Cần backend xác nhận transaction có rollback toàn bộ khi 5xx hay không.**

**Trạng thái: 🔴 CÒN MỞ.** Chờ chủ sở hữu WMS trả lời tại `GATE_WMS_API_INTEGRATION`. Cho tới lúc đó giữ nguyên `'unknown'`.

### 3.3 Chống gửi trùng — hai lớp

| Lớp | Cơ chế | Bảo vệ trước tình huống |
|---|---|---|
| **Bền vững** | Ghi `syncing` **xuống đĩa TRƯỚC khi** request bay đi | App bị đóng giữa lúc gửi |
| **Trong tiến trình** | `Set` các id đang bay | Hai lời gọi song song trên cùng bản ghi |

**Khôi phục sau restart:** bản ghi còn kẹt ở `syncing` → chuyển sang **`unknown`**, **không** quay về `pending`. Quay về `pending` sẽ khiến lần đồng bộ sau gửi lại và có nguy cơ tạo bản ghi trùng — đúng thứ R1 muốn tránh.

### 3.4 Không có retry/backoff tự động

Prompt 3 §D nhắc *"Retry/backoff có giới hạn"*. Theo R1, **không có retry tự động nào cả**:

- ❌ Không timer, không backoff, không listener mạng nào gọi đồng bộ.
- ✅ `syncAll()` chỉ chạy khi người dùng bấm nút.
- ✅ Gửi **tuần tự**, không song song — giữ thứ tự nghiệp vụ và không dồn tải server.
- ✅ Offline → **không đánh dấu bản ghi nào thất bại**, vì chúng chưa hề được gửi.

Đây không phải thiếu sót mà là quy tắc R1 được thực thi đúng.

---

## 4. Bộ gửi hiện tại — từ chối thẳng thắn

`gateBlockedSender` **cố ý không gửi gì cả**. Chưa có endpoint nghiệp vụ nào được xác nhận: `GATE_WMS_API_INTEGRATION` vẫn BLOCKED và GATE_01 §11 điều 4 vẫn cấm gọi mutation thật.

> ❗ Đây **không phải mock để giả vờ đã xong** (Prompt 3 cấm). Nó ném `blocked_by_gate` với lý do đọc được; bản ghi quay về `pending` và **không bao giờ bị đánh dấu `synced` sai sự thật**.

Prompt 4 sẽ thay bằng bộ gửi thật sau khi Gate WMS PASS.

📄 [`src/sync/bootstrap.ts`](../../apps/wms-mobile/src/sync/bootstrap.ts)

---

## 5. Kiểm thử

| Tệp test | Số ca | Nội dung |
|---|:--:|---|
| `__tests__/storageMigration.test.ts` | **15** | Schema version, migration theo thứ tự, dừng khi lỗi, hạ cấp app · Repository CRUD, cô lập collection, id không hợp lệ, bản ghi hỏng JSON |
| `__tests__/outboxSync.test.ts` | **27** | Outbox enqueue/summary/tồn tại qua restart · khôi phục bản kẹt `syncing` · dọn dữ liệu không mất bản chưa gửi · phân loại 6 nhóm lỗi · máy đồng bộ: offline→online, chống trùng song song, xung đột, thứ tự gửi |

Tổng toàn dự án sau Prompt 3:

| Suite | Số ca |
|---|:--:|
| `outboxSync.test.ts` 🆕 | 27 |
| `apiClient.test.ts` | 22 |
| `keyboardWedge.test.ts` | 20 |
| `foundation.test.ts` | 19 |
| `storageMigration.test.ts` 🆕 | 15 |
| `App.test.tsx` | 1 |
| **Tổng** | **104** |

🔧 `npx jest --ci` → exit **0**, **104 passed / 104 total**, 6 suite. Trước Prompt 3 là **62** → thêm **42 ca mới**.

### 5.1 Ca chỉ được mô phỏng

| Ca | Mức kiểm chứng |
|---|---|
| Mất mạng rồi có mạng lại | ✅ mô phỏng bằng `ConnectivityState` giả — **chưa** rút cáp/tắt wifi thật |
| Timeout của server | ✅ mô phỏng bằng `AppError` — **chưa** gặp timeout thật từ WMS |
| Xung đột 409/412 | ✅ mô phỏng — **chưa** có server thật nào trả 409 |
| App bị kill giữa lúc gửi | ✅ mô phỏng bằng cách dựng lại outbox trên cùng storage — **chưa** kill process thật |
| Duplicate submission | ✅ test song song thật trong process |

> Không ca nào ở trên được kiểm chứng với **backend thật**. Xem [03-device-test-matrix.md](03-device-test-matrix.md).
