# GATE — PDA Hardware Certification

| | |
|---|---|
| **Mã Gate** | `GATE_PDA_HARDWARE_CERTIFICATION` |
| **Trạng thái** | 🚧 **BLOCKED** — chưa có thiết bị thật |
| **Tạo ngày** | 2026-09-04 |
| **Nguồn** | Tách khỏi `GATE_01` theo Change Control 2026-09-04 |
| **Chặn** | ❌ **Phát hành production** |
| **Không chặn** | ✅ `PROMPT_01` · ✅ công việc kiến trúc, adapter, camera scanner |

---

## 1. Vì sao Gate này tồn tại

`GATE_01` là cổng quyết định **kiến trúc và phạm vi migration**, không phải cổng chứng nhận thiết bị. Việc xác minh phần cứng phụ thuộc vào thiết bị vật lý chưa có, nên được tách ra đây để không chặn quyết định kiến trúc.

> 🔴 **KHÔNG được tuyên bố ứng dụng hỗ trợ PDA production trước khi Gate này PASS.**

---

## 2. Phạm vi đã chốt cho kiến trúc (Q4)

Những điều sau **đã được quyết định** và không chờ Gate này:

| # | Đã chốt |
|:--:|---|
| 1 | Thiết bị mục tiêu: **PDA và điện thoại Android 7.0 / API 24 trở lên** |
| 2 | Kiến trúc scanner **bắt buộc dùng abstraction/adapter**, không phụ thuộc hãng |
| 3 | Nền tảng **phải hỗ trợ**: Camera scanner **và** Keyboard Wedge scanner |
| 4 | Broadcast Intent/DataWedge và SDK riêng của hãng là **adapter tuỳ chọn**, chỉ bổ sung sau khi có thiết bị |

### Điều bị cấm cho tới khi Gate PASS

| # | Cấm |
|:--:|---|
| 1 | Tuyên bố đã tương thích Zebra, Honeywell, Urovo, Chainway, Seuic hoặc bất kỳ model cụ thể nào |
| 2 | Viết native module của hãng khi chưa có thiết bị/tài liệu |
| 3 | Tuyên bố hỗ trợ PDA production |
| 4 | Coi `Enter` là suffix của PDA production (chỉ là mặc định local/test) |

---

## 3. Hạng mục bắt buộc kiểm tra **trên thiết bị thật**

| # | Hạng mục | Bằng chứng cần có | Kết quả |
|:--:|---|---|:--:|
| 1 | **Model, hãng, phiên bản Android** | Ảnh chụp *Cài đặt → Giới thiệu* | ⬜ |
| 2 | **Cơ chế scanner**: Keyboard Wedge / Broadcast Intent / SDK hãng | Ảnh chụp app cấu hình scanner + kết quả quan sát | ⬜ |
| 3 | **Prefix / suffix** thực tế | Quan sát trực tiếp trong ô nhập | ⬜ |
| 4 | **Enter / Tab** — ký tự kết thúc thật | Bài kiểm tra A + B trong checklist | ⬜ |
| 5 | **Focus behavior** — có/không focus, app nền, màn khoá | Bảng §7 của checklist | ⬜ |
| 6 | **Scan trùng** — quét cùng mã liên tiếp | Đo hành vi thực tế | ⬜ |
| 7 | **Tốc độ quét liên tục** — nhiều mã khác nhau liên tiếp | Đo số mã/giây tối đa không mất dữ liệu | ⬜ |
| 8 | **Background / resume** — app bị đưa nền rồi quay lại | Quan sát listener có sống lại đúng không | ⬜ |
| 9 | **Camera fallback** — quét bằng camera trên chính máy đó | Ảnh chụp/màn hình ghi | ⬜ |
| 10 | **Bằng chứng test trên PDA thật** | Ảnh, video, hoặc log từ thiết bị | ⬜ |

📋 **Công cụ thu thập:** [01-pda-verification-checklist.md](../01-pda-verification-checklist.md) — 7 nhóm câu hỏi, ~20 phút/model, không cần cài gì.

> ⚠️ Làm **riêng cho từng model** nếu kho dùng nhiều loại máy.

---

## 4. Điều kiện PASS

Tất cả phải đồng thời đúng:

| # | Điều kiện |
|:--:|---|
| 1 | 10 hạng mục §3 đều có bằng chứng từ **thiết bị vật lý** |
| 2 | Mọi model trong kho chạy **Android ≥ 7.0** (nếu có máy thấp hơn → **DỪNG**, đánh giá lại nền tảng, không tự hạ phiên bản) |
| 3 | Suffix thực tế được xác nhận và ghi vào cấu hình |
| 4 | Adapter tương ứng với cơ chế thật đã hiện thực và test **trên máy thật** |
| 5 | Camera fallback hoạt động trên chính thiết bị đó |
| 6 | Không còn hạng mục nào dựa trên giả định |

---

## 5. Bằng chứng được chấp nhận

| ✅ Chấp nhận | ❌ Không chấp nhận |
|---|---|
| Checklist đã điền từ thiết bị vật lý | Suy đoán từ tên model |
| Ảnh/video màn hình thiết bị | Thông số công bố trên website hãng |
| Log thu từ máy | Tài liệu hãng chưa kiểm chứng trên máy cụ thể |
| Tài liệu kỹ thuật chính thức **kèm** xác nhận trên máy | Giá trị mặc định "thường là Enter" |

---

## 6. Trạng thái hiện tại

| Hạng mục | Trạng thái |
|---|---|
| Thiết bị PDA thật | ⛔ **Chưa có** |
| Model / hãng | ⛔ Chưa xác định |
| Cơ chế scanner | ⛔ Chưa xác định |
| Suffix thực tế | ⛔ Chưa xác định |
| Kiến trúc adapter | ✅ Đã chốt (Q4/Q5 `PASS_FOR_ARCHITECTURE`) |

**Không có hạng mục nào ở §3 đã được thực hiện.** Chưa từng có thiết bị PDA nào được kiểm tra trong dự án này.
