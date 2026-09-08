# Ngữ cảnh hiện tại của app WMS Hoa Nam (bản Android) — 2026-09-06

> Bản chụp trạng thái để bất kỳ ai (hoặc phiên làm việc mới) cầm lên là chạy
> được ngay. Mọi con số dưới đây **đo tại thời điểm viết**, không phải trí nhớ.

---

## 1. Ở đâu, là cái gì

| | |
|---|---|
| Thư mục app | `apps/wms-mobile/` |
| Nguồn được port | `src/` ở gốc repo — Zalo Mini App (ReactJS + ZaUI) |
| Khung | React Native **0.87.1** · React **19.2.3** · New Architecture · Hermes · TypeScript |
| Gói Android | `vn.info.lptech.wmshoanam` · versionCode **1** · versionName **1.0** |
| SDK | minSdk **24** · compileSdk **37** · targetSdk **36** |
| Nhãn app trên máy | **Quản lý kho** |
| Quy mô | **112** tệp `.ts/.tsx` trong `src/` · **28** bộ test trong `__tests__/` |

### ⚠️ Toàn bộ `apps/` **chưa vào Git**

`git status` cho `?? apps/` — cả cây app đang là **untracked**. Chưa có commit
nào cho bản port. Mất thư mục là mất hết, và không có mốc nào để `git diff`.

---

## 2. Kiến trúc điều hướng

Không dùng React Navigation cho khung chính. `AppShell.tsx` là một **máy trạng
thái phẳng**: `tab` (5 tab dưới) cộng `flow` (luồng nghiệp vụ chồng lên tab).

```
BottomNav:  Trang chủ · Quét mã · Duyệt phiếu · Lịch sử · Cá nhân
Ô Trang chủ: Tra cứu · Nhập · Xuất · Bảo hành
flow:       inbound | outbound | warranty | warranty-scan | warranty-manual
            | warranty-intake | warranty-case | (undefined = đang ở tab)
openDocument / openCase: chi tiết chồng lên tab, Quay lại về đúng chỗ cũ
```

12 nhóm màn dưới `src/features/`: `approvals`, `auth`, `diagnostics`,
`documents`, `history`, `home`, `inbound`, `lookup`, `outbound`, `profile`,
`scan`, `warranty`.

---

## 3. Môi trường — một APK chỉ nói chuyện được với một tier

`src/config/buildProfile.ts` là **hằng số lúc biên dịch**:

```ts
export const BUILD_PROFILE: DeploymentTier = 'dev-test';
```

| Tier | Host | Cổng nội bộ | Slot | DB |
|---|---|---|---|---|
| **`dev-test`** ← bản đang chạy | `khohoanamdev.lptech.info.vn` | `127.0.0.1:18082` | Green | `wms_hoanam_green` |
| `customer-production` | `khohoanamdev.bigk.click` | `127.0.0.1:18081` | Blue | `wms_hoanam_blue` |

🔒 **Không có menu đổi URL trong app** — `setCurrentEnvironment` đã bị xoá hẳn
(quy tắc bạn chốt 2026-09-06, mục 6). Muốn đổi tier thì sửa hằng số rồi build
lại.

Chốt chặn thật **không** phải hằng số này, mà là header máy chủ trả về ở
`GET /api/v1/health` → `X-WMS-Deployment-Tier`. Sai tier thì app dừng trước mọi
lệnh đổi tồn kho và **không retry** (`services/wms/tierCheck.ts`).

Mọi request đều gửi `X-WMS-Client-Tier: dev-test`.

---

## 4. Cổng ghi — 10 thao tác được duyệt, không hơn

`src/api/writeGate.ts` khớp **METHOD cộng đường dẫn theo từng đoạn**. Ngoài danh
sách này client **không gửi được** lệnh ghi nào:

| # | Thao tác | Header đặc biệt |
|---|---|---|
| 1 | `inbound.resolveCode` | — |
| 2 | `inbound.record` | `Idempotency-Key` |
| 3 | `inbound.postReceipt` | `Idempotency-Key` · `If-Match` |
| 4 | `outbound.resolveCode` | — |
| 5 | `outbound.record` | `Idempotency-Key` |
| 6 | `outbound.postIssue` | `Idempotency-Key` · `If-Match` |
| 7 | `warranty.resolveCode` | — |
| 8 | `warranty.createCase` | `Idempotency-Key` |
| 9 | `warranty.updateStatus` | `Idempotency-Key` · `If-Match` |
| 10 | `warranty.uploadAttachment` | multipart |

**`DELETE` không mở trên bất kỳ đường dẫn nào.** Mục K
(`DELETE warranty-attachments/{id}`) **chưa được duyệt** nên chưa có trong app.

---

## 5. Trạng thái chạy ngay lúc này

| Thứ | Trạng thái đo được | Cần làm gì |
|---|---|---|
| Máy thật | `fbb9e686` — Xiaomi `2206122SC` (12 Pro), **Android 13** (API 33) | ✅ đang cắm |
| Màn hình | **`mScreenLocked=true`** (AOD) | 🔴 **bạn mở khoá** — tôi không mở khoá máy của bạn |
| App đã cài | `vn.info.lptech.wmshoanam`, bản **debug** | ✅ |
| **Metro** | ❌ **KHÔNG chạy** — cổng 8081 trống, `curl localhost:8081/status` im lặng | 🔴 **phải bật lại**, xem §6 |
| APK trên đĩa | `app-debug.apk` · 64.884.508 byte · 2026-09-06 12:06 | ✅ dùng lại được |
| Bộ test | **27/28 bộ PASS, 0 FAIL** lúc viết (bộ cuối còn đang chạy) | — |
| `tsc --noEmit` | sạch | ✅ |
| `eslint` | sạch | ✅ |

> 🔴 **Bản debug KHÔNG nhúng JS bundle trong APK.** Không bật Metro thì mở app
> ra chỉ thấy màn đỏ. Đây là lý do số một khiến "app hỏng" mà thật ra không
> hỏng.

---

## 6. Cách chạy — quy trình đang dùng

### 6.1 Chạy hằng ngày (đã có APK, chỉ sửa mã JS)

Ba việc, đúng thứ tự.

**① Bật Metro** — chạy từ **Windows**, không phải WSL:

```bash
cd "C:/Users/TAN MIE/Documents/GitHub/Mini_App_WMS_Hoa_Nam/apps/wms-mobile" && npx react-native start
```

Kiểm tra đã lên:

```bash
curl -s http://localhost:8081/status
```

Phải trả `packager-status:running`.

**② Mở khoá máy, rồi nối cổng** — `adb` chạy từ **Windows**, không phải WSL:

```bash
"C:/Users/TAN MIE/AppData/Local/Android/Sdk/platform-tools/adb.exe" reverse tcp:8081 tcp:8081
```

**③ Mở app:**

```bash
"C:/Users/TAN MIE/AppData/Local/Android/Sdk/platform-tools/adb.exe" shell am start -n vn.info.lptech.wmshoanam/.MainActivity
```

### 6.2 🔴 Hai cái bẫy đã mất thời gian vì không biết trước

| Bẫy | Triệu chứng | Cách đúng |
|---|---|---|
| **Fast Refresh không ăn** | Sửa mã xong, màn hình vẫn chạy bản cũ, tưởng bản vá vô tác dụng | `am force-stop` rồi `am start` lại — chỉ restart mới nạp bundle mới |
| **`--reset-cache` im lặng bỏ qua** | Metro đã chiếm cổng 8081 thì lệnh mới không làm gì | Kill tiến trình giữ cổng 8081 **trước**, rồi mới `--reset-cache` |

### 6.3 Build lại APK (chỉ khi đổi mã native hoặc thêm thư viện)

Build Gradle **trên Windows hỏng** ở máy này (`java.nio` Pipe). Đường đang dùng
là **WSL2**:

```bash
wsl -d Ubuntu
```

Rồi trong WSL:

```bash
export JAVA_HOME=~/toolchain/jdk-17
export ANDROID_HOME=~/Android/Sdk
export ANDROID_SDK_ROOT=~/Android/Sdk
export PATH=~/toolchain/node/bin:$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH
cd "/mnt/c/Users/TAN MIE/Documents/GitHub/Mini_App_WMS_Hoa_Nam/apps/wms-mobile/android"
./gradlew assembleDebug -PreactNativeArchitectures=arm64-v8a
```

- APK ra ở `android/app/build/outputs/apk/debug/app-debug.apk`
- Lần build **đầu** mất **1h12** — thư mục nằm trên `/mnt/c` nên Gradle không
  hard link được. Các lần sau nhanh hơn nhiều nhờ cache ấm.
- `-PreactNativeArchitectures=arm64-v8a` chỉ dựng 1 ABI thay vì 4, đủ cho máy
  thật và nhanh hơn hẳn.
- ⚠️ **`adb` vẫn phải chạy từ Windows**, kể cả khi build bằng WSL. WSL không
  thấy thiết bị USB.

### 6.4 Kiểm tra trước khi giao

```bash
cd "C:/Users/TAN MIE/Documents/GitHub/Mini_App_WMS_Hoa_Nam/apps/wms-mobile" && npx tsc --noEmit && npx eslint src/ __tests__/ && npx jest --ci
```

Bộ test mất khoảng **3–6 phút**.

### 6.5 Lái app bằng script (dùng khi kiểm thử tự động)

Script nằm ở [`apps/wms-mobile/tools/device/`](../../apps/wms-mobile/tools/device):

| Script | Việc |
|---|---|
| `app.sh state` | Metro sống chưa, máy có khoá không, app đang ở đâu — **hỏi cái này trước mọi thứ** |
| `app.sh restart` | Tắt hẳn rồi mở lại (cách duy nhất nạp bundle JS mới) |
| `ui.sh [chữ]` | Đọc cây giao diện thật, in `text` kèm toạ độ tâm |
| `tap.sh "chữ"` | Tìm chữ đó rồi chạm đúng tâm |
| `hidekb.sh` | Đóng bàn phím **chỉ khi nó đang mở** |
| `shot.sh` | Chụp màn hình về máy tính |
| `log.sh net\|err\|-c` | Đọc/xoá log app |

Hướng dẫn đầy đủ kèm bảng tra sự cố:
[`04-device-debug-guide.md`](04-device-debug-guide.md).

> ⚠️ **`uiautomator dump` bỏ sót Text nhiều dòng.** Dùng nó để **bấm đúng chỗ**;
> muốn khẳng định "có hiện chữ hay không" thì phải **chụp màn hình**.
>
> ⚠️ **Dùng `hidekb.sh`, đừng bấm Back bừa** để đóng bàn phím. Bấm Back lúc bàn
> phím đã đóng sẽ lùi màn hình, và đã có lần thoát hẳn app giữa chừng.

---

## 7. Đã sửa trong phiên 2026-09-06 (chưa commit)

26 tệp nguồn và test đã đổi. Mười lỗi tìm ra khi chạy thật:

| # | Lỗi | Trạng thái |
|---|---|---|
| L‑01 | Bộ gõ Telex **ăn ký tự** trong ô nhập mã (`TEST` thành `TÉT`) | ✅ sửa, đo lại trên máy |
| L‑02 | Bắt buộc chọn bệnh lỗi cộng danh mục WMS rỗng bằng **không tạo được hồ sơ bảo hành nào** | ✅ sửa, đo lại |
| L‑03 | `Idempotency-Key` bằng SĐT cộng **độ dài** mô tả, hai hồ sơ khác nhau trùng khoá | ✅ sửa, đo lại |
| L‑04 | Android rủ **lưu SĐT khách vào Google Password Manager** | ✅ sửa, đo lại |
| L‑05 | Gửi `defect_ids: []` thay vì bỏ hẳn khoá | ✅ sửa |
| L‑06 | `GET /api/v1/defects` trả **200 nhưng rỗng** | 🔵 chờ backend |
| L‑07 | Chú thích mã nói `/defects` đang 403, thực tế đã 200 | ✅ sửa |
| L‑08 | Tạo xong hồ sơ thì **mất dấu**, không mở lại được | ✅ sửa phía app; sắp xếp/phân trang chờ backend |
| L‑09 | Trên thẻ danh sách **chỉ một dòng chữ** bấm được | ✅ sửa 2 màn, đo lại |
| L‑10 | Nút **Back của Android đóng hẳn app** ở mọi màn | ✅ sửa, đo lại |

Chi tiết bằng chứng: [`04-live-run-report.md`](04-live-run-report.md), mục
"Lần chạy thứ tư".

### Tệp mới trong phiên này

- `src/ui/CodeInput.tsx` — ô nhập mã máy đọc, chặn Telex
- `src/app/useHardwareBack.ts` — ngăn xếp handler nút Back
- `__tests__/codeInput.test.tsx`, `__tests__/hardwareBack.test.tsx`

---

## 8. Dữ liệu test đã đưa vào WMS `dev-test`

| Loại | Mã | Ghi chú |
|---|---|---|
| Phiếu nhập | `PN-20260906145004-1KGO` | 2/2 mã, SKU thật `DCEP281` và `DCPM50`, **chờ duyệt** |
| Hồ sơ bảo hành #1 | tạo 15:30, nhánh mất tem | khách *Khach Kiem Thu App* · `0987001122` |
| Hồ sơ bảo hành #2 | `WC-20260906160324-MMS7` | khách *Kiem Thu Hai* · `0987003344`, đã đẩy qua **RECEIVED → CHECKING → REPAIRING** |

---

## 9. Đang tắc — không phải việc của app

| # | Việc | Ai gỡ |
|---|---|---|
| 25 | `/api/v1/defects` trả 200 nhưng **danh mục rỗng** | backend WMS |
| 24 | Danh sách bảo hành `per_page=25`, **không tham số sắp xếp**, nên hồ sơ tạm (`WC-<timestamp>`) rơi khỏi trang đầu | backend WMS |
| 28 | `POST inbound/record` **hết 30 giây** với 8 sản phẩm (2 sản phẩm thì xong) | backend WMS |
| 29 | Đối chiếu phiếu "Hihii" 8 sản phẩm có được tạo hay không | người có quyền vào WMS |
| 30 | nginx `client_max_body_size` **1 MB**, tải ảnh đính kèm ăn **413** | hạ tầng |
| 31 | Khách quay lại lần hai với **đúng máy, đúng lỗi** — có tạo hồ sơ mới không? | **bạn quyết** |
| 22 | `provinces.open-api.vn` là dịch vụ ngoài, không SLA, mà Tỉnh/Phường là trường bắt buộc | **bạn quyết** |
| 21 | `recipient_type` cho phiếu xuất, hiện gộp vào `note` | backend WMS |
| — | Đầu quét **cứng** của PDA | chưa có máy để thử |

Danh sách đầy đủ: [`USER-ACTION-REQUIRED.md`](../../USER-ACTION-REQUIRED.md).

---

## 10. Việc còn dở trong lượt chạy

1. **Luồng xuất kho** — chưa chạy hết. Cần mã có thật; `DCCS20083-2` chỉ là dữ
   liệu giả trong test nên WMS trả `SKU_NOT_FOUND`. Nay đã có `DCEP281` và
   `DCPM50` lấy từ phiếu nhập thật.
2. **Post Receipt** phiếu `PN-20260906145004-1KGO` — đây là lệnh **tăng tồn kho
   thật**, chưa bấm.
3. **Đính kèm ảnh** hồ sơ bảo hành — chặn bởi mục 30 (nginx 1 MB).
