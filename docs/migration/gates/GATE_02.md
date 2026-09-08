# GATE 02 — Kiến trúc và nền móng ứng dụng React Native

| | |
|---|---|
| **Trạng thái** | ✅ **PASS** |
| **Token** | ✅ **Đã phát hành** — xem §7 |
| **Ngày nghiệm thu** | 2026-09-05 — người dùng gửi `APPROVE_GATE_02` |
| **Điều kiện** | **8/8 đạt** |
| **Build** | ✅ **`BUILD SUCCESSFUL in 1h 12m 41s`**, 257 task, exit **0** — qua WSL2 (§3.4) |
| **APK** | `app-debug.apk` · 156.931.379 byte |
| **BUILD_ID** | `f87d1c42f406ed107033f67bf35789e7ed491e43425aa0b5f4c00f291788ba77` |
| **Chạy thật** | ✅ Xiaomi 12 Pro · Android 13 (API 33) · arm64-v8a — 2 màn, 0 lỗi logcat (§3.6) |
| **Lý do chặn cũ** *(đã gỡ)* | ~~Không build được APK trên Windows~~ — vẫn đúng với Windows, nhưng **đã vòng qua bằng WSL2** (§3.4) |
| **Gate trước** | `GATE_01_PASS\|sha=663114aff6804e50b77b88e05dda9f9c784d6fff\|platform=REACT_NATIVE\|ui_scope=NEW_APP` |
| **Commit nguồn** | `663114aff6804e50b77b88e05dda9f9c784d6fff` — khớp `HEAD`, `src/` **0 thay đổi** |
| **Thư mục đích** | `apps/wms-mobile/` (người dùng chốt) |
| **applicationId** | `vn.info.lptech.wmshoanam` (người dùng cung cấp 2026-09-05) |

> Cả 8 điều kiện đạt → Gate ghi `READY_FOR_USER_APPROVAL`. Người dùng kiểm tra và
> gửi `APPROVE_GATE_02` ngày 2026-09-05 → Gate chuyển `PASS`, token phát hành ở §7.
>
> ⚠️ **`PASS` ≠ sẵn sàng production** — xem §6.2.

---

## 1. Đối chiếu 8 điều kiện Gate 02

| # | Điều kiện | Trạng thái | Bằng chứng |
|:--:|---|:--:|---|
| 1 | Ứng dụng đích **build thành công** | ✅ **ĐẠT** | `./gradlew assembleDebug` **trong WSL2** → `BUILD SUCCESSFUL in 1h 12m 41s`, 257 task, exit **0**. APK đã kiểm chứng. Xem §3.4.<br>⚠️ Trên **Windows** vẫn exit 1 — máy chưa sửa (§3, §3.1) |
| 2 | Lint / static analysis bắt buộc đạt | ✅ ĐẠT | `npx eslint .` → exit **0**, 0 lỗi 0 cảnh báo *(chạy lại 2026-09-05: exit 0)* |
| 3 | Unit-test nền móng đạt | ✅ ĐẠT | `npx jest --ci` → exit **0**, **62/62** passed, 4/4 suite *(chạy lại 2026-09-05: 62/62, 6.9 s)* |
| 4 | Navigation, theme, environment hoạt động | ✅ **ĐẠT** | **Đã chạy trên thiết bị thật** — Xiaomi 12 Pro / Android 13 / arm64-v8a. Chuyển được giữa 2 màn, header + nút back đúng, theme nhất quán, 3 môi trường hiển thị đúng cờ Gate. Logcat **0 lỗi**. Ảnh chụp màn hình: §3.6 |
| 5 | Không mock/TODO/hàm rỗng che phần chưa hoàn thành | ✅ ĐẠT | Xem §2 |
| 6 | Không có secret trong mã nguồn | ✅ ĐẠT | `src/` không chứa token/mật khẩu/khoá; keystore chưa tạo |
| 7 | Không có thay đổi ngoài phạm vi | ✅ ĐẠT | Xem §4 |
| 8 | Tài liệu kiến trúc khớp implementation | ✅ ĐẠT | 4 tài liệu `02-*.md`, mỗi khẳng định đều dẫn file/lệnh |

**Kết quả: 8/8 ĐẠT → `READY_FOR_USER_APPROVAL`, người dùng duyệt 2026-09-05 → `PASS`.**

Bổ sung ngoài yêu cầu tối thiểu: `npx tsc --noEmit` → exit **0**.

---

## 2. Điều kiện 5 — không che giấu phần chưa làm

Ba hạng mục chưa hoàn thành được **nêu tên thẳng**, không có file rỗng hay hàm
giả nào đứng thay:

| Hạng mục chưa làm | Cách xử lý |
|---|---|
| **Camera scan adapter** | Không tạo file `CameraSource.ts` rỗng. Ghi rõ ở [02-architecture.md §5.3](../02-architecture.md) là thuộc Prompt 3, vì cần thêm dependency native và **không có thiết bị nào để kiểm chứng** |
| **Luồng đăng nhập** | `session.ts` chỉ giữ và phát tán phiên; **không có** hàm `login()` giả. Luồng thật bị chặn bởi `GATE_WMS_API_INTEGRATION` |
| **Mã hoá storage** | MMKV chạy không mã hoá; ghi rõ trong `storage.ts` và bảng "Hạn chế đã biết" |

Ba mock tồn tại (`react-native-mmkv`, `netinfo`, `safe-area-context`) chỉ thay
**tầng native khi chạy Jest** — lý do từng cái ở
[02-dependency-decisions.md §5](../02-dependency-decisions.md). Toàn bộ logic nền
móng được test bằng hiện thực thật.

Hai màn hình `DiagnosticsScreen` và `ScanTestScreen` là **màn chẩn đoán nền móng**,
không phải màn nghiệp vụ và không thay thế tính năng nào — Prompt 2 §5 cho phép
"một màn hình shell hoặc smoke screen đủ để xác minh navigation và theme".

---

## 3. Điều kiện 1 — hành trình từ CHƯA ĐẠT tới ĐẠT

`./gradlew assembleDebug` hỏng ngay khi khởi động daemon:

```
java.io.IOException: Unable to establish loopback connection
```

Truy tới gốc: **`java.nio.channels.Pipe.open()` hỏng trên máy build này.**

```
Caused by: java.net.SocketException: Invalid argument: connect
    at java.base/sun.nio.ch.UnixDomainSockets.connect0(Native Method)
    at java.base/sun.nio.ch.PipeImpl$Initializer$LoopbackConnector.run(PipeImpl.java:133)
```

Chính xác hơn: **`java.nio.channels.Selector.open()` hỏng trên _mọi_ JDK có trên
máy này** — cả Microsoft JDK 17.0.19 lẫn Android Studio JBR 25.0.2. Đổi JDK
**không** cứu được (JBR qua được `Pipe.open()` nhưng vẫn hỏng `Selector.open()`).

Thủ phạm: driver lọc file `TbCardinal.sys` của **ThreatBook Agent** vẫn Running
trong khi hai service quản lý `safeSrv` / `tbGuardSrv` đã Stopped.

Lỗi **tái hiện được bằng JDK thuần, không cần Gradle** — nên không liên quan tới
mã nguồn, cấu hình Gradle hay dependency của dự án. Chi tiết kiểm chứng, 6 cách
đã thử và hướng khắc phục: [02-build-runbook.md §4](../02-build-runbook.md).

> ⚠️ Khắc phục đòi hỏi **thay đổi cài đặt hệ thống/bảo mật** (ngoại lệ diệt virus,
> `netsh winsock reset` quyền Administrator, luật firewall). Tôi không tự thực
> hiện — cần người dùng quyết định.

**Hệ quả:** chưa có bằng chứng nào cho việc mã nguồn biên dịch được ở tầng
Android/Kotlin/C++. TypeScript, lint và test đều sạch, nhưng đó **không thay thế**
được một lần build thật.

### 3.1 Kiểm chứng lại 2026-09-05 — tình trạng không đổi

| Lệnh | Exit | Ghi chú |
|---|:--:|---|
| `./gradlew assembleDebug` | **1** | cùng lỗi loopback |
| `./gradlew assembleDebug --no-daemon` | **1** | Gradle 9.4.1 vẫn fork "single-use Daemon" → không né được |
| `java PipeTest.java` (JDK thuần, 8 dòng, không Gradle) | 0 | `Pipe.open() = FAIL` · **`Selector.open() = FAIL`** |
| `Get-Service` / `Get-CimInstance Win32_SystemDriver` | 0 | `safeSrv` Stopped · `tbGuardSrv` Stopped · **`TbCardinal.sys` Running** |

Lỗi tái hiện bằng **8 dòng Java thuần**, không dùng Gradle và không dùng
dependency nào của dự án → khẳng định lại: **không phải lỗi mã nguồn.**
Chi tiết ở [02-build-runbook.md §4.6](../02-build-runbook.md).

### 3.2 ✅ Bằng chứng mới — tầng JS/TS build được cho Android

```
npx react-native bundle --platform android --dev false --entry-file index.js
→ exit 0 · index.android.bundle 1.347.571 byte · 19 asset · Metro v0.87.0
```

Toàn bộ mã TypeScript/React resolve, transform và đóng gói được ở chế độ
**production** cho Android. Đây là bằng chứng thật, thu được lần đầu ở đợt này.

> ❌ **Nhưng không đủ cho điều kiện 1.** Bundle JS không chứng minh phần native
> (Kotlin/C++/Gradle), việc đóng gói APK, chữ ký, hay app khởi chạy trên thiết bị.
> Lúc đó điều kiện 1 vẫn **CHƯA ĐẠT** — xem [runbook §4.9](../02-build-runbook.md). *(Về sau đã đạt nhờ WSL2, §3.4.)*

### 3.3 ❌ Android Studio không phải lối thoát — đã thử

| Kiểm chứng 2026-09-05 | Kết quả |
|---|---|
| JBR đi kèm Android Studio | `openjdk 25.0.2` |
| `Pipe.open()` bằng JBR | ✅ OK ← 🪤 bẫy |
| **`Selector.open()` bằng JBR** | ❌ **FAIL** |
| `./gradlew assembleDebug -Dorg.gradle.java.home="…/Android Studio/jbr"` | ❌ **exit 1** |

Android Studio không có cơ chế build riêng — nó gọi đúng Gradle wrapper của dự án.
Lệnh trên mô phỏng chính xác điều IDE làm. Chi tiết: [runbook §4.7](../02-build-runbook.md).

### 3.4 🎉 BUILD THÀNH CÔNG qua WSL2 — 2026-09-05

Đã triển khai đường vòng WSL2 nêu ở §3.5. **Kết quả: build được.**

#### Toolchain đã dựng trong WSL2 (toàn bộ trong `$HOME`, **không cần sudo**)

| Thành phần | Phiên bản | Vị trí |
|---|---|---|
| Ubuntu | 26.04 LTS · kernel 6.18.33.2-microsoft-standard-WSL2 | — |
| JDK | Temurin **17.0.20.1** | `~/toolchain/jdk-17` |
| Node | **v24.19.0** | `~/toolchain/node` |
| cmdline-tools | **19.0** | `~/Android/Sdk/cmdline-tools/latest` |
| Platform | **android-37.0** | `~/Android/Sdk/platforms` |
| Build-tools | **37.0.0** | `~/Android/Sdk/build-tools` |
| NDK | **27.1.12297006** | `~/Android/Sdk/ndk` |
| CMake | **3.22.1** | `~/Android/Sdk/cmake` |
| | **SDK tổng: 2,5 GB** | |

> 🎯 **Phép thử quyết định:** `Selector.open()` trong WSL2 → **OK**. Trên Windows → FAIL.
> `TbCardinal.sys` là filter driver của Windows, không chạm được nhân Linux của WSL2.

#### Kết quả build

| | |
|---|---|
| Lệnh | `./gradlew assembleDebug` (chạy trong WSL2, tại chính cây repo trên `/mnt/c`) |
| Kết quả | **`BUILD SUCCESSFUL in 1h 12m 41s`** |
| Task | **257 actionable tasks: 257 executed** |
| Exit code | **0** |
| Đường dẫn APK | `apps/wms-mobile/android/app/build/outputs/apk/debug/app-debug.apk` |

#### APK đã kiểm chứng

| Thuộc tính | Giá trị | Đối chiếu |
|---|---|---|
| Kích thước | **156.931.379 byte** (150 MB) | debug + 4 ABI + chưa strip symbol |
| **BUILD_ID (sha256)** | **`f87d1c42f406ed107033f67bf35789e7ed491e43425aa0b5f4c00f291788ba77`** | — |
| `package` | `vn.info.lptech.wmshoanam` | ✅ khớp applicationId người dùng cung cấp |
| `compileSdkVersion` | `37` | ✅ khớp `build.gradle` |
| `targetSdkVersion` | `36` | ✅ khớp |
| `application-label` | **`Quản lý kho`** | ✅ khớp `app-config.json` của Mini App gốc |
| `native-code` | `arm64-v8a` · `armeabi-v7a` · `x86` · `x86_64` | ✅ đủ 4 ABI theo `gradle.properties` |
| Thư viện `.so` | 16 file mỗi ABI | New Architecture + Hermes |
| Chữ ký | `apksigner verify` → **YES** (debug keystore) | ✅ |
| JS bundle trong APK | **không có** | ✅ đúng với bản debug — nạp qua Metro |
| Tổng entry | 1.048 | — |

#### Ghi chú vận hành

- ⏱️ **1h 12m là chậm bất thường.** Nguyên nhân: thư mục build nằm trên `/mnt/c` (lớp 9p), còn Gradle cache ở ổ Linux → không hard link được, log đầy dòng `Hard link … failed. Doing a slower copy instead`. **Không phải lỗi.** Muốn nhanh hơn nhiều thì đặt dự án trong ổ Linux của WSL.
- ✅ APK **không lọt vào Git**: `apps/wms-mobile/.gitignore:27` chặn `build/`; `git status` trên thư mục đó rỗng.
- ⚠️ Đây là **debug build ký bằng debug keystore**, không phải bản phát hành. Q10 (APK ký số nội bộ) vẫn chưa đụng tới.

### 3.6 ✅ Điều kiện 4 — đã chạy trên thiết bị thật, 2026-09-05

#### Thiết bị

| | |
|---|---|
| Máy | Xiaomi **2206122SC** (12 Pro) |
| Android | **13** — API **33** (≥ `minSdk 24` ✅) |
| ABI | `arm64-v8a` — có trong APK ✅ |
| Cài đặt | `adb install -r` → **`Success`**, exit **0** |
| Tiến trình | `pidof vn.info.lptech.wmshoanam` → có PID |
| Metro | phục vụ `./index.js` bundle **100%** qua `adb reverse tcp:8081` |
| **Logcat** | **0 lỗi** — `grep -iE "ReactNativeJS\|AndroidRuntime\|FATAL"` rỗng, cả lúc khởi động lẫn lúc chuyển màn |

#### Màn 1 — `DiagnosticsScreen`

| Hạng mục Prompt 2 | Quan sát trên máy |
|---|---|
| **Theme + design token** | Nút chính màu tím `#7367f0` đúng `colors.primary`; nền `#f8f7fa` đúng `surfaceCanvas`; bo góc, khoảng cách, typography khớp `theme/tokens.ts` |
| **Cấu hình môi trường** | Hiện đủ 3 môi trường; đang chọn *Máy cục bộ* → `http://127.0.0.1:8000` |
| **🔒 Cưỡng chế Gate ở runtime** | Hiện thẳng **`GATE_WMS_API_INTEGRATION: chưa PASS`** và nhãn *"WMS (lớp môi trường CHƯA xác minh)"* — `GATE_01 §11` rule 4 và rule 8 được cưỡng chế **thật khi chạy**, không chỉ trong unit test |
| **Connectivity abstraction** | wifi · đã kết nối: có · ra được Internet: có · gửi được yêu cầu: có |
| Tiếng Việt | hiển thị đúng dấu, không vỡ chữ |

#### Màn 2 — `ScanTestScreen` (chuyển màn thành công)

| Hạng mục | Quan sát |
|---|---|
| **Navigation** | Chuyển được từ màn 1 sang màn 2 bằng `createNativeStackNavigator` |
| Header native stack | Hiện tiêu đề **"Kiểm tra đầu quét"** đúng `options.title` trong `RootNavigator.tsx`, kèm **nút back** |
| Theme của header | Nền `surface`, chữ `textStrong` — đúng `screenOptions` khai báo trong `RootNavigator.tsx` |
| Keyboard wedge listener | *Trạng thái nguồn: **running*** · ô nhập *"Sẵn sàng nhận"* · *Đã nhận: 0* |

> ⚠️ **Không được suy diễn quá:** listener ở trạng thái `running` chỉ chứng minh **tầng phần mềm** đã sẵn sàng nhận ký tự. **Chưa có đầu quét phần cứng nào được bắn thử.** Hành vi scanner thật, prefix/suffix thật vẫn thuộc `GATE_PDA_HARDWARE_CERTIFICATION` và Gate đó **chưa PASS**.

#### Hạn chế của đợt xác minh này

| # | Chưa làm được | Lý do |
|:--:|---|---|
| 1 | Tự động hoá thao tác chạm | MIUI chặn `adb shell input` → `SecurityException: INJECT_EVENTS`, exit 255. Toggle *Gỡ lỗi USB (Cài đặt bảo mật)* của Xiaomi không có hiệu lực. Thao tác chuyển màn do **người dùng bấm tay** |
| 2 | Test trên PDA thật | Chưa có thiết bị — `GATE_PDA_HARDWARE_CERTIFICATION` |
| 3 | Gọi API nghiệp vụ | Bị chặn có chủ đích bởi `wmsGateApproved: false` |

### 3.5 Vì sao chọn WSL2 — cơ sở kỹ thuật

`TbCardinal.sys` là filter driver của **Windows**; WSL2 chạy nhân Linux thật nên không bị chạm.
Đã kiểm chứng: **AF_UNIX socket hoạt động bình thường trong WSL2 Ubuntu** — đúng cơ chế đang
hỏng trên Windows. Nhưng WSL chưa có JDK lẫn Android SDK (~2–3 GB cần cài).
Cần người dùng quyết định. Chi tiết: [runbook §4.8](../02-build-runbook.md).

---

## 4. Điều kiện 7 — phạm vi thay đổi

### 4.1 File tạo mới — toàn bộ nằm trong `apps/wms-mobile/` và `docs/migration/`

| Nhóm | Số file |
|---|:--:|
| Mã nguồn `src/` (13 module) | 20 |
| Test `__tests__/` | 4 |
| Mock `__mocks__/` | 2 |
| Cấu hình app (`package.json`, `jest.*`, `app.json`, `index.js`, `tsconfig.json`, `.eslintrc.js`, `.prettierrc.js`, `babel/metro.config.js`) | 10 |
| Dự án Android (`android/**`) | do CLI sinh |
| Tài liệu `docs/migration/02-*.md` + Gate này | 5 |

### 4.2 File của Mini App cũ bị sửa

**Không có.** `git status` trên `src/`, `backend/app/Http`, `routes/` → 0 thay đổi.

### 4.2b File sửa ở đợt 2026-09-05 — chỉ 2 file, đều trong `apps/wms-mobile/`

| File | Thay đổi | Lý do |
|---|---|---|
| `package.json` | `react-native-safe-area-context`: `"^5.5.2"` → `"5.9.1"`<br>gỡ `@react-native/new-app-screen": "0.87.1"` | D-01, D-02 — §5b.7 |
| `package-lock.json` | do `npm install` sinh lại | đồng bộ với `package.json` |

**Không có file mã nguồn nào bị sửa.** Bundle production giống hệt từng byte trước/sau (§5b.7c).

### 4.3 File do template sinh ra rồi bị xoá — có lý do

| File | Lý do |
|---|---|
| `ios/` | GATE_01 Q2: iOS ngoài phạm vi, không thiết kế/build/test — ✅ tái xác nhận 2026-09-05 ([GATE_01 §0](GATE_01.md)) |
| `Gemfile` | chỉ phục vụ CocoaPods (iOS) |
| `App.tsx` (gốc) | thay bằng `src/app/App.tsx` |
| `__tests__/App.test.tsx` (mẫu) | thay bằng test thật |

### 4.4 Sửa do lỗi công cụ

`@react-native-community/cli` sinh sai cây thư mục Kotlin
(`java/com/vn.info.lptech.wmshoanam/`) khi package name không bắt đầu bằng `com.`.
Đã chuyển về `java/vn/info/lptech/wmshoanam/`. Khai báo `package` trong file `.kt`
vốn đã đúng.

---

## 5. Ba lệnh cấm GATE_01 §11 — đã cưỡng chế bằng code

Không dựa vào kỷ luật lập trình viên; nằm trong đường thực thi và có test bảo vệ:

| Rule | Cưỡng chế ở đâu | Test |
|:--:|---|:--:|
| 6 — cấm header `Idempotency-Key` | `FORBIDDEN_HEADERS` + `assertNoForbiddenHeaders()` | 3 ca |
| 4 — cấm mutation khi Gate WMS chưa PASS | cờ `wmsGateApproved`, chặn mọi method ngoài GET/HEAD, **không gọi `fetch`** | 6 ca |
| 8 — cấm tự xác định môi trường `khohoanamdev.bigk.click` | cờ `environmentClassVerified: false` | 2 ca |
| — không tự retry request ghi | client **không có** cơ chế retry | 1 ca |

Cả 3 môi trường hiện đều `wmsGateApproved: false`; có test khẳng định điều đó
không bị đổi lén.

---

## 5b. So sánh phạm vi thực tế với phạm vi Prompt 2

Đối chiếu từng yêu cầu với mã nguồn thật (kiểm chứng lại 2026-09-05).

### 5b.1 Điều kiện khởi động — 5/5 đạt

| # | Điều kiện | Kết quả |
|:--:|---|---|
| 1 | `docs/migration/gates/GATE_01.md` tồn tại | ✅ `PASS` |
| 2 | Token khớp SHA / nền tảng / phạm vi | ✅ `sha=663114aff…` khớp `git rev-parse HEAD` · `platform=REACT_NATIVE` · `ui_scope=NEW_APP` |
| 3 | Kiểm tra working tree trước khi sửa | ✅ `git status --porcelain=v1` — thay đổi đều có sẵn từ trước (retention hotfix, xoá `docs/design/`, `apps/`), **không có gì trong `src/`** |
| 4 | Gate 01 PASS, token hợp lệ, báo cáo đủ | ✅ |
| 5 | Mã nguồn có đổi sau audit không | ✅ **Không** — `git diff --stat HEAD -- src/` rỗng → không cần báo cáo chênh lệch |

### 5b.2 §1 Khởi tạo ứng dụng đích

| Yêu cầu | Thực tế | Bằng chứng |
|---|---|---|
| Đúng nền tảng đã duyệt | React Native + TypeScript | `react-native 0.87.1`, `typescript ^6.0.3` |
| Ghi rõ SDK / runtime / package manager / build tool | ✅ | RN 0.87.1 · React 19.2.3 · Node ≥ 22.11.0 (`engines`) · npm · Gradle 9.4.1 · JDK 17.0.19 |
| Thiết lập Android | ✅ | `minSdkVersion = 24` · `compileSdkVersion = 37` · `targetSdkVersion = 36` |
| Chỉ thiết lập iOS nếu trong phạm vi | ✅ **Không thiết lập** | GATE_01 Q2 `CHỈ Android` (tái xác nhận 2026-09-05) |
| applicationId đã xác minh, không bịa | ✅ | `vn.info.lptech.wmshoanam` — người dùng cung cấp 2026-09-05 |
| Bảo toàn repo gốc và lịch sử | ✅ | 0 commit, 0 file Mini App cũ bị sửa |

### 5b.3 §2 Kiến trúc mã nguồn — 13/13 module

| Hạng mục | File |
|---|---|
| App bootstrap | `src/app/App.tsx` |
| Navigation | `src/navigation/RootNavigator.tsx` · `types.ts` |
| Theme & design tokens | `src/theme/ThemeProvider.tsx` · `tokens.ts` |
| API client | `src/api/client.ts` |
| Auth/session abstraction | `src/auth/session.ts` |
| Error handling | `src/errors/AppError.ts` · `ErrorBoundary.tsx` |
| Logging an toàn | `src/logging/logger.ts` |
| Storage abstraction | `src/storage/storage.ts` |
| Connectivity abstraction | `src/connectivity/connectivity.ts` |
| Scanner abstraction | `src/scanner/` — `types.ts` · `keyboardWedge.ts` · `KeyboardWedgeSource.ts` · `useKeyboardWedge.ts` |
| Feature modules | `src/features/diagnostics/` |
| Shared UI components | `src/ui/` — 6 component |
| Cấu hình theo môi trường | `src/config/env.ts` |

**Không có abstraction thừa:** mỗi module đều có call-site trong app hoặc test.

### 5b.4 §3 Nền tảng UI — 5/5 primitive + 7/7 nhóm token

| ZaUI → RN | File | Hiện thực |
|---|---|---|
| `Page` → screen wrapper + `SafeAreaView` | `src/ui/Page.tsx:81` | `SafeAreaView edges={['top','bottom']}` |
| `Box` → `View` | `src/ui/Box.tsx:9` | `View` + token spacing |
| `Button` → `Pressable` chuẩn hoá | `src/ui/Button.tsx:62` | `Pressable` |
| `List` → `FlatList`/`SectionList` | `src/ui/List.tsx:53` | ⚠️ **`FlashList`** — Prompt 2 gợi ý `FlatList`, nhưng **GATE_01 Q1 ràng buộc bắt buộc dùng FlashList**. Gate thắng; wrapper cố tình không mở đường dùng `FlatList` |
| `Input` → `TextInput` + wrapper validation | `src/ui/Input.tsx:12,31` | `TextInput` + `errorText`/`helperText`/`label` |

Design token — đủ 7 nhóm Prompt 2 yêu cầu: `colors` · `spacing` · `typography` · `radius` · `elevation` · `touchTarget` · `breakpoints` (`src/theme/tokens.ts`). Nguồn: `src/css/app.scss` của Mini App + `docs/ui-system-x-vuexy.md` — **không sáng tạo lại nhận diện thương hiệu**.

### 5b.5 §4 API foundation

| Yêu cầu | Thực tế |
|---|---|
| Axios *"nếu đã được duyệt"* | ⚠️ **Không dùng** — chưa được duyệt nên không thêm dependency. Dùng `fetch` của RN. Lý do ghi tại `src/api/client.ts:4` |
| Base URL theo environment | ✅ `src/config/env.ts` — 3 môi trường |
| Interceptor | ⚠️ **Tương đương, không phải cơ chế đăng ký được.** `fetch` không có API interceptor; mọi thứ đi qua một hàm `request()` tập trung: gắn `Authorization`, chặn header cấm, chặn theo Gate, logging |
| Timeout | ✅ `AbortController` + `setTimeout`, cấu hình theo môi trường |
| Huỷ request | ✅ nhận `signal` bên ngoài, **phân biệt được** `cancelled` với `timeout` |
| Parse lỗi | ✅ `AppError` — 8 loại: `config` `blocked_by_gate` `cancelled` `timeout` `network` `parse` `auth` `http` |
| Logging an toàn | ✅ `logger.ts:20` che `authorization\|token\|password\|secret\|api-key\|cookie\|session\|credential\|otp\|pin`; `:69` che cả query string |
| Không hard-code secret | ✅ `grep -rniE "password\|secret\|api[_-]?key"` → chỉ khớp chính regex che dữ liệu |
| Không tắt TLS/SSL | ✅ 0 kết quả |

### 5b.6 §5 Chất lượng nền móng

| Yêu cầu | Kết quả | Exit |
|---|---|:--:|
| Static analysis / lint | `npx eslint .` — 0 lỗi 0 cảnh báo | **0** |
| Formatter | Prettier 2.8.8 + `.prettierrc.js`, script `format` | — |
| Unit-test setup | Jest 29 + `@react-native/jest-preset`, 4 suite **62 test** | **0** |
| Build tái tạo được | ⚠️ cấu hình có (`gradle.properties`, lockfile), **nhưng chưa chạy được lần nào** | **1** |
| Smoke screen xác minh navigation + theme | `DiagnosticsScreen` + `ScanTestScreen`, 2 route stack | **0** (qua test render) |
| Không dùng màn giả thay tính năng thật | ✅ 0 TODO/FIXME · 0 `mock` trong `src/` · 0 hàm rỗng | — |

Bổ sung ngoài yêu cầu: `npx tsc --noEmit` → exit **0**.

### 5b.7 ✅ Hai điểm dependency — đã phát hiện và ĐÃ SỬA

Phát hiện ở đợt kiểm chứng 2026-09-05, **đã sửa cùng ngày** sau khi người dùng phê duyệt. Kết quả kiểm chứng ở §5b.7c.

#### D-01 · 🟠 Một dependency runtime không ghim phiên bản

Prompt 2: *"Dependency mới phải có mục đích, **phiên bản cố định**…"*

| | |
|---|---|
| Gói | `react-native-safe-area-context` |
| Khai báo trong `package.json` | `"^5.5.2"` — **dải caret, không ghim** |
| Thực tế đã cài | **`5.9.1`** |

10/11 dependency runtime còn lại đều ghim đúng. Riêng gói này đã **trôi 4 phiên bản minor** so với con số ghi trong `package.json`.

**Hệ quả:** `npm install` trên máy khác có thể kéo về bản khác với bản đang được test ở đây → mất tính "build tái tạo được" (Prompt 2 §5). `package-lock.json` che được rủi ro này **chỉ khi** dùng `npm ci`, không phải `npm install`.

**Đã sửa:** đổi `"^5.5.2"` → `"5.9.1"` — ghim đúng bản đang chạy, **không nâng cấp gì**. Lockfile xác nhận `"version": "5.9.1"`.

#### D-02 · 🟠 Một dependency runtime không được dùng ở đâu cả

Prompt 2: *"Không tạo abstraction không được sử dụng"* · *"Dependency mới phải có **mục đích**"*

| | |
|---|---|
| Gói | `@react-native/new-app-screen@0.87.1` |
| Vị trí | `dependencies` (runtime, không phải devDependencies) |
| Số call-site | **0** — `grep -rn "new-app-screen" src/ __tests__/ index.js` → exit 1 |

Đây là màn hình chào mặc định của template React Native. `App.tsx` đã thay bằng `RootNavigator`, nhưng dependency thì chưa gỡ.

**Đã sửa:** gỡ khỏi `dependencies`. `npm install` báo *"removed 1 package"* — đúng một gói, không đụng gói nào khác.

#### 5b.7c Kiểm chứng sau khi sửa — 2026-09-05

| Kiểm tra | Kết quả | Exit |
|---|---|:--:|
| `npm install` | `removed 1 package, and audited 892 packages` | **0** |
| `react-native-safe-area-context` đã cài | `5.9.1` — khớp đúng con số vừa ghim | — |
| `@react-native/new-app-screen` trong `node_modules/` | **không còn** | — |
| `grep -c "new-app-screen" package-lock.json` | **0** | — |
| `npx tsc --noEmit` | không lỗi kiểu | **0** |
| `npx eslint .` | 0 lỗi, 0 cảnh báo | **0** |
| `npx jest --ci` | **62/62 pass**, 4/4 suite | **0** |
| `npx react-native bundle --platform android --dev false` | 1.347.571 byte, 19 asset | **0** |

**Bằng chứng quyết định — bundle production giống hệt từng byte:**

```
cmp <bundle trước khi sửa> <bundle sau khi sửa>  →  không khác biệt
1.347.571 byte  ==  1.347.571 byte
```

`@react-native/new-app-screen` **không đóng góp một byte nào** vào bundle → khẳng định lại nó thực sự không được dùng. Việc ghim `safe-area-context` cũng không đổi gì vì bản `5.9.1` vốn đã được cài.

Sao lưu `package.json` + `package-lock.json` trước khi sửa được giữ ở thư mục scratchpad ngoài repository.

> ℹ️ `npm install` báo `14 vulnerabilities (6 moderate, 8 high)`. Đây là tình trạng **có sẵn từ trước**, không phải do thay đổi này gây ra. ❌ **Không chạy `npm audit fix --force`** — Prompt 2 cấm *"nâng cấp hay thay đổi dependency không liên quan"*. Cần xử lý riêng, có phê duyệt.

### 5b.8 Kết luận phạm vi

**Đã làm đủ phạm vi nền móng Prompt 2, không lấn sang Prompt 3.** Ba khác biệt so với chữ nghĩa của Prompt 2 đều **có lý do và đã ghi rõ**, không phải bỏ sót:

1. `FlashList` thay `FlatList` — ràng buộc GATE_01 Q1 cao hơn gợi ý của Prompt 2.
2. Không dùng Axios — Prompt 2 ghi *"nếu đã được duyệt"*, chưa duyệt.
3. Interceptor là hàm tập trung, không phải cơ chế đăng ký — giới hạn của `fetch`.

**Chưa khởi chạy trên bất kỳ môi trường nào:** không có APK, không có thiết bị thật, không có emulator. Navigation/theme/environment mới chỉ xác minh qua test render và test môi trường, **chưa chạy trên máy Android nào**.

---

## 6. Danh sách việc — đã hoàn tất

| # | Việc | Trạng thái |
|:--:|---|---|
| ~~1~~ | ~~Sửa lỗi `Pipe.open()` trên máy build Windows~~ | ⏭️ **Không cần nữa** — đã vòng qua bằng WSL2 (§3.4). Máy Windows **vẫn hỏng**, xem [runbook §4.5](../02-build-runbook.md) nếu sau này muốn sửa |
| ~~2~~ | ~~Chạy `./gradlew assembleDebug` đạt exit 0~~ | ✅ **Xong** — `BUILD SUCCESSFUL in 1h 12m 41s`, 257 task (§3.4) |
| ~~3~~ | ~~Ghi lại `BUILD_ID`~~ | ✅ **Xong** — `f87d1c42f406ed107033f67bf35789e7ed491e43425aa0b5f4c00f291788ba77` |
| ~~4~~ | ~~Kết nối thiết bị để xác minh app khởi chạy~~ | ✅ **Xong** — Xiaomi 12 Pro / Android 13, 2 màn, 0 lỗi logcat (§3.6) |
| ~~5~~ | ~~Quyết định có sửa **D-01** và **D-02** không~~ | ✅ **Xong** — người dùng phê duyệt 2026-09-05 |
| ~~6~~ | ~~Sửa `package.json`, chạy `npm install`, chạy lại lint/test~~ | ✅ **Xong** — §5b.7c |

### 6.1 ✅ Đã nghiệm thu

Người dùng gửi `APPROVE_GATE_02` ngày 2026-09-05. Token phát hành ở §7.

### 6.2 ⚠️ `READY_FOR_USER_APPROVAL` ≠ sẵn sàng production

| # | Chưa được xác nhận | Gate chặn |
|:--:|---|---|
| 1 | Bất kỳ máy **PDA** nào — chưa test máy nào; đầu quét phần cứng chưa bắn thử lần nào | `GATE_PDA_HARDWARE_CERTIFICATION` |
| 2 | Contract / môi trường / xác thực WMS API — **chưa gọi endpoint nghiệp vụ nào** | `GATE_WMS_API_INTEGRATION` |
| 3 | Bản phát hành ký số nội bộ — mới chỉ có debug APK ký bằng debug keystore | Q10, chưa làm |
| 4 | Toàn bộ màn hình nghiệp vụ | Prompt 3 |
| 5 | Build trên máy Windows | máy vẫn hỏng `Selector.open()` |

---

## 7. Token

```
GATE_02_PASS|sha=663114aff6804e50b77b88e05dda9f9c784d6fff|target=ANDROID_REACT_NATIVE|build=f87d1c42f406ed107033f67bf35789e7ed491e43425aa0b5f4c00f291788ba77
```

Phát hành 2026-09-05 sau khi người dùng gửi `APPROVE_GATE_02`.

### 7.1 Kiểm tra toàn vẹn trước khi phát hành

| Mục | Giá trị | Kết quả |
|---|---|:--:|
| `git rev-parse HEAD` | `663114aff6804e50b77b88e05dda9f9c784d6fff` | ✅ khớp SHA ghi trong Gate |
| `sha256sum app-debug.apk` | `f87d1c42f406ed107033f67bf35789e7ed491e43425aa0b5f4c00f291788ba77` | ✅ khớp `BUILD_ID` từng byte |
| `git diff --stat HEAD -- src/` | rỗng | ✅ mã nguồn Mini App không đổi |

### 7.2 Giải nghĩa trường token

| Trường | Giá trị | Nguồn |
|---|---|---|
| `sha` | `663114aff…` | Commit nguồn được khảo sát ở Gate 01, không đổi suốt Prompt 2 |
| `target` | `ANDROID_REACT_NATIVE` | GATE_01 Q1 (React Native) + Q2 (**chỉ Android**) |
| `build` | `f87d1c42…` | sha256 của APK debug thật, build bằng WSL2 |

---

## 8. Vẫn giữ nguyên hiệu lực từ GATE_01

`GATE_PDA_HARDWARE_CERTIFICATION` và `GATE_WMS_API_INTEGRATION` **chưa PASS**.
Toàn bộ 12 điều cấm ở [GATE_01 §11](GATE_01.md) còn nguyên hiệu lực. Prompt 2
không làm thay đổi bất kỳ điều nào trong số đó.
