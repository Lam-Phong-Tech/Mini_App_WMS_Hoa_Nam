# Nối máy Android thật, gỡ lỗi, và lái app tự động

> Viết từ những gì **đo được** trên máy `fbb9e686` (Xiaomi 12 Pro, Android 13 /
> API 33) trong phiên 2026-09-06. Mọi cái bẫy ghi ở đây đều là bẫy đã dính, kèm
> triệu chứng thật để lần sau nhận ra ngay.
>
> Script đi kèm: [`apps/wms-mobile/tools/device/`](../../apps/wms-mobile/tools/device).

---

## 0. Tóm tắt một phút

```bash
cd apps/wms-mobile/tools/device && ./app.sh state
```

Lệnh đó trả lời hết mọi câu "sao app không chạy": Metro sống chưa, cổng nối
chưa, máy có khoá màn hình không, app đang ở màn nào, pid bao nhiêu.

---

## 1. Chuẩn bị máy điện thoại (làm một lần)

Ba việc này **bạn phải tự làm trên máy** — không có đường nào làm từ máy tính:

1. **Bật Tuỳ chọn nhà phát triển**: Cài đặt → Giới thiệu điện thoại → chạm
   **Số bản dựng (MIUI version)** 7 lần.
2. **Bật Gỡ lỗi USB**: Cài đặt → Tuỳ chọn nhà phát triển → *USB debugging*.
3. **Cắm cáp, chọn "Cho phép"** ở hộp thoại *Allow USB debugging?* và tích
   *Always allow from this computer*.

Kiểm tra đã bật:

```bash
"$ADB" shell settings get global adb_enabled
```

Trả `1` là xong.

> 🔴 **Trên máy Xiaomi còn một bước nữa**: Tuỳ chọn nhà phát triển →
> *USB debugging (Security settings)* phải bật thì `input tap` / `input text`
> mới điều khiển được. Không có nó thì `adb` vẫn thấy máy nhưng mọi lệnh chạm
> đều im lặng không làm gì.

---

## 2. Nối và kiểm tra

`adb` của dự án này nằm ở:

```
C:\Users\TAN MIE\AppData\Local\Android\Sdk\platform-tools\adb.exe
```

Phiên bản đo được: **1.0.41 / 37.0.1-15733141**.

```bash
"C:/Users/TAN MIE/AppData/Local/Android/Sdk/platform-tools/adb.exe" devices -l
```

Kết quả đúng trông như:

```
fbb9e686   device product:unicorn model:2206122SC device:diting transport_id:1
```

| Thấy gì | Nghĩa là |
|---|---|
| `device` | ✅ sẵn sàng |
| `unauthorized` | Chưa bấm "Cho phép" trên máy — rút cáp, cắm lại, nhìn màn hình điện thoại |
| `offline` | `adb kill-server` rồi `adb devices` lại |
| Không có dòng nào | Cáp chỉ sạc không truyền dữ liệu, hoặc chưa bật USB debugging |

### 🔴 Hai quy tắc không được phá

**① `adb` phải chạy từ Windows, KHÔNG phải WSL.**
Build Gradle thì dùng WSL (xem [`02-build-runbook.md`](02-build-runbook.md)),
nhưng WSL **không thấy thiết bị USB**. Chạy `adb` trong WSL ra "no devices
found" trong khi máy vẫn đang cắm — mất thời gian đi tìm lỗi không tồn tại.

**② `export MSYS_NO_PATHCONV=1` trước mọi lệnh adb trong Git Bash.**
Không có nó, Git Bash "sửa" `/sdcard/u.xml` thành
`C:/Program Files/Git/sdcard/u.xml`, và mọi lệnh `adb shell` hỏng vô cớ với
thông báo chẳng liên quan gì. Các script trong `tools/device/` đã tự đặt biến
này.

---

## 3. Nối app với Metro

Bản **debug không nhúng JS bundle trong APK** — nó tải bundle từ Metro trên máy
tính. Vậy nên cần một đường ống:

```bash
"$ADB" reverse tcp:8081 tcp:8081
```

Kiểm tra:

```bash
"$ADB" reverse --list
```

Phải thấy `UsbFfs tcp:8081 tcp:8081`.

Rồi bật Metro **từ Windows**:

```bash
cd "C:/Users/TAN MIE/Documents/GitHub/Mini_App_WMS_Hoa_Nam/apps/wms-mobile" && npx react-native start
```

Kiểm tra: `curl -s http://localhost:8081/status` phải trả
`packager-status:running`.

### ⚠️ Một chi tiết dễ hiểu nhầm

Metro tắt **không** làm app đang chạy chết ngay. Tiến trình đã nạp bundle vào bộ
nhớ thì cứ thế chạy tiếp — đo lúc 17:57 hôm nay: Metro tắt hẳn mà app vẫn hiện
màn Trang chủ bình thường.

Màn đỏ chỉ xuất hiện khi app **khởi động lại** mà Metro không có. Nghĩa là: app
đang chạy ngon không chứng minh được Metro đang sống. Cứ `./app.sh state` mà
xem.

---

## 4. Cài và mở app

```bash
"$ADB" install -r apps/wms-mobile/android/app/build/outputs/apk/debug/app-debug.apk
```

Điều khiển vòng đời bằng script:

```bash
cd apps/wms-mobile/tools/device
./app.sh restart   # tắt hẳn rồi mở lại — chờ ~20 giây
./app.sh state     # xem toàn cảnh
```

### 🔴 Bẫy tốn thời gian nhất cả phiên: Fast Refresh không ăn

Sửa mã JS xong, màn hình **vẫn chạy bundle cũ**. Tôi đã sửa một tệp, thử lại
trên máy, thấy y hệt cũ, và suýt kết luận rằng bản vá vô tác dụng. Sự thật là
bản vá đúng, chỉ là nó chưa bao giờ được nạp.

**Cách nhận ra:** đặt tạm một chuỗi dễ thấy vào giao diện (ví dụ đổi placeholder
thành `RELOAD-OK`), rồi `./ui.sh RELOAD-OK`. Không thấy nghĩa là bundle cũ.

**Cách chữa:** `./app.sh restart`. Dev menu **không** mở được từ adb trên bản
dựng này — đã thử cả hai cách và cả hai đều không ra menu:

```bash
"$ADB" shell input keyevent 82
"$ADB" shell am broadcast -a com.facebook.react.devsupport.SHOW_DEV_MENU
```

Cách thứ hai trả `result=0` (không receiver nào nhận). Muốn dev menu thì **lắc
máy**.

---

## 5. Đọc log

```bash
cd apps/wms-mobile/tools/device
./log.sh -c      # xoá sạch TRƯỚC khi làm thao tác muốn đo
# ...thao tác trên app...
./log.sh net     # chỉ lời gọi HTTP và lỗi HTTP
./log.sh err     # chỉ cảnh báo và lỗi
./log.sh         # mọi dòng JS của app
```

Một lời gọi thành công trông như:

```
[wms:debug] HTTP POST https://khohoanamdev.lptech.info.vn/api/v1/mini-app/warranty-cases
  'Idempotency-Key': 'wmshn-wcase-180d1c55f54da32a',
  'X-WMS-Client-Tier': 'dev-test',
  Authorization: '[ĐÃ CHE]'
```

Một lời gọi hỏng:

```
[wms:warn] HTTP lỗi 422 .../warranty/resolve-code { code: 'SKU_NOT_FOUND' }
```

### ⚠️ Ba điều phải biết về log này

| Điều | Hệ quả |
|---|---|
| **Thành công KHÔNG ghi log** | Không thấy dòng lỗi nào sau một lời gọi nghĩa là nó **chạy được**. Đừng hiểu là "không có phản hồi". Đã suýt báo nhầm `/api/v1/defects` là hỏng, thật ra nó trả 200 với danh sách rỗng. |
| **`Authorization` luôn bị che** | `redact()` trong `logging/logger.ts` thay bằng `[ĐÃ CHE]`. Token không lọt vào log. |
| **Bản release chỉ ghi từ `warn` trở lên** | `logger.ts:109` — `minLevel = isDev ? 'debug' : 'warn'`. Muốn xem lời gọi HTTP thì phải chạy bản debug. |

---

## 6. Lái app tự động

Bốn script, tất cả ở `apps/wms-mobile/tools/device/`:

| Script | Việc |
|---|---|
| `ui.sh [chữ]` | Đọc cây giao diện thật, in `text` kèm **toạ độ tâm** |
| `tap.sh "chữ" [giây]` | Tìm chữ rồi chạm đúng tâm, chờ |
| `hidekb.sh` | Đóng bàn phím **chỉ khi nó đang mở** |
| `shot.sh [tên.png]` | Chụp màn hình về máy tính |

Ví dụ một lượt đi qua ba bước phiếu bảo hành:

```bash
cd apps/wms-mobile/tools/device
./tap.sh "Tiếp nhận sản phẩm" 6
./tap.sh "Mất tem/mã · Tạo hồ sơ tạm" 5
./tap.sh "VD: Nguyễn Văn A" 2
"$ADB" shell "input text 'Nguyen Van Test'"
./hidekb.sh
./tap.sh "Tiếp tục" 5
```

### 6.1 Vì sao đọc toạ độ thật thay vì đoán từ ảnh

Bấm theo toạ độ đoán từ ảnh chụp trượt liên tục khi màn cuộn hoặc bàn phím bật
lên. `ui.sh` đọc `bounds` thật từ `uiautomator` nên bấm đúng chỗ mọi lúc.

### 6.2 🔴 Năm cái bẫy khi lái tự động

**① `uiautomator` bỏ sót Text nhiều dòng.**
Bản dump không có dòng nội dung của banner, tôi suýt báo cáo "banner mất chữ".
Chụp màn hình thì chữ hiện đủ.
⇒ **`ui.sh` để BẤM. `shot.sh` để KẾT LUẬN.**

**② Toạ độ `0 0` nghĩa là nằm ngoài màn hình.**
Phải cuộn tới rồi mới bấm được. `tap.sh` đã tự chặn và báo `NGOÀI MÀN HÌNH`.

**③ `tap.sh` bấm khớp ĐẦU TIÊN.**
Chữ "Kiểm tra" vừa là nhãn bước trên stepper (y=501) vừa là nút ở cuối màn
(y=2482). `tap.sh` bấm nhãn stepper và không có gì xảy ra. Gặp cảnh đó thì
`./ui.sh "Kiểm tra"` xem có mấy dòng rồi bấm thẳng toạ độ:

```bash
"$ADB" shell input tap 409 2482
```

**④ Không đóng bàn phím thì cú chạm sau rơi vào bàn phím.**
Số điện thoại đã từng chui vào ô tên khách vì thế: `Kiem Thu Hái 0987003344`.
⇒ Luôn `./hidekb.sh` sau khi gõ.

**⑤ Bấm Back bừa để đóng bàn phím sẽ thoát app.**
Back lúc bàn phím đã đóng thì **lùi màn hình**. Một chuỗi Back liên tiếp đã
thoát hẳn app giữa lúc điền phiếu, mất toàn bộ dữ liệu vừa gõ.
⇒ Dùng `hidekb.sh` (nó kiểm tra `mInputShown` trước), đừng gọi `keyevent 4`
thẳng.

### 6.3 🔴 Bẫy lớn nhất: `input text` bị bộ gõ tiếng Việt bóp méo

```
gõ "TEST"        → ô nhận "TÉT"
gõ "HN1SKUTEST"  → ô nhận "HN1SKUTEST"
```

Gboard kiểu Telex ghép `e` + `s` thành `é` và **nuốt luôn chữ `s`** — nhưng chỉ
khi chuỗi tạo thành âm tiết tiếng Việt hợp lệ. Nghĩa là **lúc hỏng lúc không**,
đúng kiểu bẫy khó tin nhất.

Đây **không phải chỉ là vấn đề của script**: người dùng thật gõ tay mã trên tem
cũng dính. Đã tìm thấy bằng chứng nằm trong dữ liệu WMS thật — ghi chú của phiếu
`PN-20260906145004-1KGO` là `Mini App scan-driven: TÉT-FULL-RUN-Ag`, trong khi
tôi gõ `TEST-FULL-RUN-Ag`.

App đã sửa bằng [`ui/CodeInput.tsx`](../../apps/wms-mobile/src/ui/CodeInput.tsx)
(`keyboardType="visible-password"`) cho **ô nhập mã**. Ô tiếng Việt thật (tên
khách, ghi chú) vẫn giữ Telex — ở đó nó là thứ người dùng cần.

⇒ Khi lái tự động, **kiểm tra lại chuỗi đã vào ô** thay vì tin là nó vào đúng:

```bash
./ui.sh | grep "chuỗi vừa gõ"
```

### 6.4 Gõ ký tự đặc biệt

`input text` không tự giải mã `%7C`. Muốn gõ `|` hay `=` thì bọc trong nháy đơn
để shell **của máy** không hiểu là lệnh:

```bash
"$ADB" shell "input text 'HN1|SKU=DCCS20083-2|ITEM=A-001'"
```

Xoá ô đang có chữ:

```bash
"$ADB" shell input keyevent KEYCODE_MOVE_END
for i in $(seq 1 40); do "$ADB" shell input keyevent 67; done
```

### 6.5 Cuộn

```bash
"$ADB" shell input swipe 720 2400 720 1200 400   # cuộn xuống
"$ADB" shell input swipe 720 1200 720 2400 400   # cuộn lên
```

---

## 7. Chụp màn hình và quay màn hình

```bash
cd apps/wms-mobile/tools/device
./shot.sh man-hinh.png
```

Quay video (tối đa 3 phút, dừng bằng Ctrl-C):

```bash
"$ADB" shell screenrecord /sdcard/quay.mp4
"$ADB" pull /sdcard/quay.mp4
"$ADB" shell rm /sdcard/quay.mp4
```

---

## 8. Bảng tra sự cố

| Triệu chứng | Nguyên nhân thật | Cách chữa |
|---|---|---|
| Mọi lệnh `adb shell` hỏng với thông báo lạ | Git Bash đổi đường dẫn | `export MSYS_NO_PATHCONV=1` |
| `no devices found` mà máy vẫn cắm | Đang chạy adb trong **WSL** | Chạy adb bản Windows |
| Sửa mã mà màn hình không đổi | Fast Refresh không ăn | `./app.sh restart` |
| Mở app ra màn đỏ | Metro không chạy | Bật Metro rồi `./app.sh restart` |
| `ui.sh` không trả gì | Máy **khoá màn hình** | Mở khoá máy (xem §9) |
| `ui.sh` trả nội dung của mấy ngày trước | `/sdcard/u.xml` cũ, lệnh dump thất bại lặng lẽ | `ui.sh` đã tự xoá tệp trước khi dump |
| Chạm mà không có gì xảy ra | Bấm trúng chữ trùng tên ở chỗ khác | `./ui.sh "chữ"` xem có mấy dòng |
| Chữ gõ vào sai so với chữ gửi đi | Bộ gõ Telex | Xem §6.3 |
| Chữ chui vào nhầm ô | Chưa đóng bàn phím | `./hidekb.sh` |
| App tự thoát giữa chừng | Bấm Back lúc bàn phím đã đóng | Dùng `hidekb.sh` |
| `--reset-cache` không có tác dụng | Metro cũ vẫn giữ cổng 8081 | Kill tiến trình giữ cổng **trước** |

---

## 9. Ranh giới — việc tôi không làm hộ

| Việc | Vì sao |
|---|---|
| **Mở khoá màn hình máy** | Máy cá nhân của bạn. Gặp `mScreenLocked=true` là tôi dừng và nhờ bạn mở. |
| **Đăng nhập bằng mật khẩu bạn đưa** | Không nhập thông tin đăng nhập. Phiên làm việc trên máy đã có sẵn token. |
| **Đọc/chụp nội dung app khác** | Một cú chạm trượt đã mở nhầm ứng dụng nhắn tin của bạn — tôi thoát ra ngay và không lưu gì. Nếu app đích không ở màn trước, tôi mở lại app WMS chứ không thao tác tiếp. |
| **Chọn hoặc tải ảnh cá nhân của bạn lên máy chủ** | Đó là quyết định của bạn. |
| **Gửi lệnh ghi ngoài 10 thao tác đã duyệt** | Xem `writeGate.ts`. `DELETE` không mở trên đường dẫn nào. |
