# 01 — Yêu cầu kiến trúc Scanner (Q4 + Q5)

**Trạng thái:** ✅ Ràng buộc bắt buộc — chốt 2026-09-04
**Phạm vi:** đặc tả thiết kế. **Chưa hiện thực trong Prompt 1.**

> 🔴 **Suffix thực tế của PDA production chưa được xác nhận.** Tài liệu này định nghĩa *khả năng* mà parser phải có, **không** khẳng định giá trị nào là đúng với thiết bị thật. Giá trị thật phải được chốt trong [GATE_PDA_HARDWARE_CERTIFICATION](gates/GATE_PDA_HARDWARE_CERTIFICATION.md).

---

## 1. Thiết bị mục tiêu (Q4 — `PASS_FOR_ARCHITECTURE`)

| Hạng mục | Chốt |
|---|---|
| Thiết bị | PDA **và** điện thoại Android |
| OS tối thiểu | **Android 7.0 / API 24** |
| Model/hãng cụ thể | ⛔ **Chưa chứng nhận** |

---

## 2. Kiến trúc adapter bắt buộc

Tầng quét **phải** đặt sau một abstraction, **không phụ thuộc hãng**.

```
        ┌──────────────────────────────┐
        │   Tầng nghiệp vụ quét        │  ← không biết nguồn mã đến từ đâu
        └──────────────┬───────────────┘
                       │  ScanSource (interface)
     ┌─────────────────┼─────────────────┬──────────────────┐
     ▼                 ▼                 ▼                  ▼
┌──────────┐   ┌──────────────┐   ┌─────────────┐   ┌──────────────┐
│  Camera  │   │   Keyboard   │   │  Broadcast  │   │  SDK hãng    │
│ (bắt buộc)│   │Wedge (bắt buộc)│  │Intent (tuỳ chọn)│ │ (tuỳ chọn)  │
└──────────┘   └──────────────┘   └─────────────┘   └──────────────┘
   PHẢI CÓ          PHẢI CÓ         Sau khi có TB     Sau khi có TB
```

| Adapter | Bắt buộc? | Điều kiện triển khai |
|---|:--:|---|
| **Camera scanner** | ✅ **Bắt buộc** | Triển khai được ngay |
| **Keyboard Wedge** | ✅ **Bắt buộc** | Triển khai được ngay (đọc chuỗi ký tự) |
| Broadcast Intent / DataWedge | ⬜ Tuỳ chọn | **Chỉ sau khi có thiết bị + tài liệu** |
| SDK riêng của hãng | ⬜ Tuỳ chọn | **Chỉ sau khi có thiết bị + tài liệu** |

> ❌ **Không được viết native module của bất kỳ hãng nào khi chưa có thiết bị và tài liệu.**
> ❌ **Không được tuyên bố tương thích** Zebra, Honeywell, Urovo, Chainway, Seuic hoặc model cụ thể.

---

## 3. Yêu cầu bắt buộc của Scanner Parser (Q5 — `PASS_FOR_ARCHITECTURE`)

Parser **phải** hỗ trợ đủ 8 khả năng sau:

| # | Khả năng | Yêu cầu chi tiết |
|:--:|---|---|
| 1 | **`Enter`** | Nhận diện `\n`, `\r`, `\r\n` là ký tự kết thúc chuỗi |
| 2 | **`Tab`** | Nhận diện `\t` là ký tự kết thúc chuỗi |
| 3 | **Custom suffix có cấu hình** | Suffix là **giá trị cấu hình**, không hard-code. Phải đổi được mà không sửa code |
| 4 | **Timeout kết thúc chuỗi có cấu hình** | Khi thiết bị **không gửi suffix**, parser kết thúc chuỗi sau N mili-giây im lặng. N phải cấu hình được |
| 5 | **Loại ký tự điều khiển** | Lọc bỏ ký tự điều khiển không in được khỏi mã kết quả |
| 6 | **Chống xử lý hai lần** | Một lần quét chỉ sinh **đúng một** sự kiện, kể cả khi cả suffix lẫn timeout cùng kích hoạt |
| 7 | **Buffer tuần tự** | Ký tự đến rời rạc phải được gom **đúng thứ tự**; quét liên tiếp nhanh không được trộn lẫn vào nhau |
| 8 | **Bật/tắt listener theo màn hình** | Listener chỉ hoạt động ở màn hình cần quét; màn khác phải tắt để không nuốt phím |

### 3.1 Giá trị mặc định cho local/test

| Tham số | Mặc định local/test | Ghi chú |
|---|---|---|
| Suffix | `Enter` | ⚠️ **Chỉ là mặc định tiện lợi cho local/test** |
| Timeout | *(chưa chốt)* | Cần đo trên thiết bị thật |

> 🔴 **`Enter` KHÔNG được coi là suffix của PDA production.** Đây là giá trị mặc định để phát triển và kiểm thử cục bộ. Suffix thật phải được xác nhận trong [GATE_PDA_HARDWARE_CERTIFICATION](gates/GATE_PDA_HARDWARE_CERTIFICATION.md) §3 hạng mục 3–4.

---

## 4. Ràng buộc kế thừa từ hệ thống hiện tại

Ghi nhận từ audit `GATE_01` để không lặp lại vấn đề cũ:

| # | Bài học từ Mini App hiện tại | Yêu cầu cho app mới |
|:--:|---|---|
| 1 | `ScanMethod` có giá trị `"SCANNER"` nhưng **không đường code nào tạo ra nó từ thiết bị** — chỉ là nhãn fallback | Giá trị nguồn quét phải phản ánh **nguồn thật**, không phải nhãn mặc định |
| 2 | Chống trùng dùng `dedupeKey = context:code` + debounce **1800 ms** (`useScanRequest.ts:76-92`) | Ngưỡng chống trùng **phải cấu hình được** — 1800 ms có thể chặn nhầm thao tác quét nhiều đơn vị cùng SKU (rủi ro R-06) |
| 3 | Định dạng hỗ trợ: `QR_CODE`, `CODE_128`, `CODE_39`, `CODE_93`, `EAN_13`, `EAN_8`, `UPC_A`, `UPC_E` | Giữ tối thiểu bằng bộ này |
| 4 | Interface `BarcodeScannerAdapter` 11 phương thức đã tồn tại và là **tài sản kiến trúc tốt nhất** của codebase cũ | Port sang app mới thay vì thiết kế lại từ đầu |
| 5 | Mã lỗi camera đã chuẩn hoá (`CAMERA_PERMISSION_DENIED`, `CAMERA_IN_USE`, `CAMERA_PREVIEW_UNAVAILABLE`, `CAMERA_NOT_SUPPORTED`) | Giữ nguyên danh mục |

---

## 5. Hạng mục **chưa thể xác định** — chờ Gate phần cứng

| # | Hạng mục |
|:--:|---|
| 1 | Suffix thật của từng model PDA |
| 2 | Có prefix hay không |
| 3 | Cơ chế xuất dữ liệu thật (Wedge / Intent / SDK) |
| 4 | Giá trị timeout phù hợp |
| 5 | Hành vi khi app không có focus / chạy nền |
| 6 | Tốc độ quét liên tục tối đa |
| 7 | Ngưỡng chống trùng phù hợp nghiệp vụ |

---

## 6. Trạng thái

| Câu hỏi | Trạng thái |
|---|---|
| **Q4** | `PASS_FOR_ARCHITECTURE — DEFERRED_TO_GATE_PDA_HARDWARE_CERTIFICATION` |
| **Q5** | `PASS_FOR_ARCHITECTURE — ACTUAL_SUFFIX_DEFERRED_TO_GATE_PDA_HARDWARE_CERTIFICATION` |

**Chưa có thiết bị PDA nào được kiểm tra. Chưa hiện thực scanner nào trong Prompt 1.**
