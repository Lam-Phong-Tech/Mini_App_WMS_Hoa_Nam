# 02 — Runbook build / lint / test

Thư mục làm việc: `apps/wms-mobile/`

---

## 1. Yêu cầu môi trường

| Thành phần | Phiên bản đã xác minh trên máy build | Lệnh kiểm tra |
|---|---|---|
| Node | v24.19.0 | `node -v` |
| npm | 11.17.0 | `npm -v` |
| JDK | OpenJDK 17.0.19 LTS (Microsoft) | `java -version` |
| `JAVA_HOME` | `C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot\` | `echo $JAVA_HOME` |
| Android SDK | `C:\Users\TAN MIE\AppData\Local\Android\Sdk` | `echo $ANDROID_HOME` |
| Android platforms | android-28 … android-37.0 | `ls $ANDROID_HOME/platforms` |
| Build tools | 34.0.0 · 35.0.0 · 35.0.1 · 36.0.0 | `ls $ANDROID_HOME/build-tools` |
| Gradle | 9.4.1 (qua wrapper, tự tải) | `./gradlew --version` |

---

## 2. Lệnh

```bash
cd apps/wms-mobile
npm install
```

| Việc | Lệnh | Ý nghĩa |
|---|---|---|
| Kiểm tra kiểu | `npm run typecheck` | `tsc --noEmit` |
| Lint | `npm run lint` | `eslint .` |
| Sửa lint tự động | `npm run lint:fix` | |
| Định dạng | `npm run format` | `prettier --write .` |
| Test | `npm test` | `jest` |
| Metro dev server | `npm start` | |
| Chạy trên máy/emulator | `npm run android` | cần thiết bị kết nối |
| Build APK debug | `cd android && ./gradlew assembleDebug` | ⚠️ xem §4 |

---

## 2b. ✅ Build APK — quy trình đang dùng (WSL2)

> Build Android trên Windows **không chạy được** trên máy này (§4). Đường đang dùng là **WSL2**.
> Toolchain nằm trọn trong `$HOME` của WSL, **không cần sudo**, không đụng gì tới Windows.

### 2b.1 Toolchain đã dựng sẵn (chỉ làm một lần — đã xong)

| Thành phần | Phiên bản | Vị trí trong WSL |
|---|---|---|
| JDK | Temurin 17.0.20.1 | `~/toolchain/jdk-17` |
| Node | v24.19.0 | `~/toolchain/node` |
| Android SDK | cmdline-tools 19.0 | `~/Android/Sdk` |
| Platform | android-37.0 | `~/Android/Sdk/platforms` |
| Build-tools | 37.0.0 | `~/Android/Sdk/build-tools` |
| NDK | 27.1.12297006 | `~/Android/Sdk/ndk` |
| CMake | 3.22.1 | `~/Android/Sdk/cmake` |

### 2b.2 Lệnh build

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
./gradlew assembleDebug
```

APK ra ở `apps/wms-mobile/android/app/build/outputs/apk/debug/app-debug.apk` — thấy được từ cả Windows lẫn WSL, và **đã bị `.gitignore` chặn** nên không lọt vào Git.

### 2b.3 Kết quả lần build đầu — 2026-09-05

| | |
|---|---|
| Kết quả | **`BUILD SUCCESSFUL in 1h 12m 41s`** · 257 task · exit **0** |
| APK | 156.931.379 byte (150 MB) |
| **BUILD_ID (sha256)** | `f87d1c42f406ed107033f67bf35789e7ed491e43425aa0b5f4c00f291788ba77` |
| package | `vn.info.lptech.wmshoanam` · versionCode 1 · versionName 1.0 |
| compileSdk / targetSdk | 37 / 36 |
| Nhãn app | `Quản lý kho` |
| ABI | `arm64-v8a` · `armeabi-v7a` · `x86` · `x86_64` — 16 file `.so` mỗi ABI |
| Chữ ký | `apksigner verify` → **YES** (debug keystore) |
| JS bundle trong APK | **không có** — đúng với bản debug, nạp qua Metro |

### 2b.4 ⏱️ Vì sao lâu, và cách rút ngắn

1h12 là **chậm bất thường**. Thư mục build nằm trên `/mnt/c` (lớp 9p) còn Gradle cache ở ổ Linux, nên không hard link được — log đầy dòng `Hard link … failed. Doing a slower copy instead`. **Không phải lỗi.**

| Cách rút ngắn | Ảnh hưởng |
|---|---|
| Build lại lần sau (cache đã ấm) | nhanh hơn nhiều, phần lớn task được `UP-TO-DATE` |
| `-PreactNativeArchitectures=arm64-v8a` | chỉ build 1 ABI thay vì 4 — nhanh gấp mấy lần, đủ để test trên máy thật |
| Đặt dự án trong ổ Linux của WSL | nhanh nhất, nhưng tách khỏi cây repo trên Windows |

---

## 2c. 🔒 Build profile — chọn tier trước khi dựng

🔒 Người dùng chốt 2026-09-06 mục 6: *"Không dùng menu/toggle đổi URL trong app.
Tách build profile DEV/TEST và Customer/Production."*

Một APK **chỉ** nói chuyện được với một tier. Không có cách nào đổi từ trong app
— `setCurrentEnvironment` đã bị xoá hẳn và nút đổi môi trường đã gỡ khỏi màn
Chẩn đoán.

| Profile | Giá trị trong `src/config/buildProfile.ts` | Base URL | Stack |
|---|---|---|---|
| DEV/TEST | `'dev-test'` ← **mặc định nhánh chính** | `khohoanamdev.lptech.info.vn` | Green |
| Khách hàng | `'customer-production'` | `khohoanamdev.bigk.click` | Blue |

### 🔧 Hai bẫy quy trình gặp ngày 2026-09-06

1. **PATH của Windows tràn vào WSL.** Truyền chuỗi lệnh lồng
   `Git Bash → wsl → bash` làm PATH có dấu cách và `\` bị mangle, `export` hỏng
   với hàng chục dòng *"not a valid identifier"*. ⇒ **Viết script ra file** rồi
   `wsl bash <đường-dẫn>`; nhớ `sed -i 's/$//'` bỏ CRLF.
2. **Metro cache cũ.** Lần chạy đầu app không gọi `/api/v1/health` — Metro đang
   phục vụ bundle cũ từ phiên trước. `--reset-cache` **im lặng không chạy** nếu
   cổng 8081 đã bận. ⇒ Kill tiến trình trên 8081 trước, rồi mới `--reset-cache`.
   Thấy thiếu một request mới thêm thì **nghi bundle trước, đừng nghi code**.

### Cắt bản Khách hàng

⚠️ **Mục 5: chỉ phát hành sau khi nghiệm thu DEV/TEST xong.**

1. Sửa `BUILD_PROFILE` thành `'customer-production'`.
2. `npm run typecheck && npm test` — bộ test đối chiếu profile với base URL, nên
   sai cặp là đỏ ngay.
3. Build release theo §2b.
4. **Hoàn nguyên về `'dev-test'` trong cùng một lần commit.**

Bước 4 không phải hình thức: có một test khoá giá trị mặc định là `'dev-test'`
(`__tests__/foundation.test.ts`), nên quên hoàn nguyên sẽ làm CI đỏ chứ không
âm thầm để nhánh chính trỏ vào kho khách hàng.

### Hằng số này KHÔNG phải thứ giữ an toàn

Nó chỉ chọn base URL. Chốt chặn thật là **header máy chủ trả về** ở
`GET /api/v1/health` — một bản dựng trỏ nhầm host sẽ bị chính máy chủ đó tố
cáo, và app khoá quét lẫn Post Receipt. Xem `GATE_WMS §2f.3`.

---

## 3. Kết quả đã chạy thật — 2026-09-05

| Lệnh | Exit code | Kết quả |
|---|:--:|---|
| `npx prettier --write` | **0** | 30 file được định dạng |
| `npx tsc --noEmit` | **0** | không lỗi kiểu |
| `npx eslint .` | **0** | 0 lỗi, 0 cảnh báo |
| `npx jest --ci` | **0** | **62 passed / 62 total**, 4 suite, 5.4 s |
| `./gradlew assembleDebug` (Windows) | **1** | ❌ **THẤT BẠI** — xem §4 |
| `./gradlew assembleDebug` (**WSL2**) | **0** | ✅ **BUILD SUCCESSFUL in 1h 12m 41s**, 257 task — xem §2b |

### 3.1 Phân bố test

| Suite | Số test | Nội dung |
|---|:--:|---|
| `keyboardWedge.test.ts` | 20 | đủ 8 khả năng bắt buộc của spec scanner §3 |
| `apiClient.test.ts` | 22 | ba lệnh cấm GATE_01 §11, timeout, huỷ, phân tích lỗi |
| `foundation.test.ts` | 19 | logging an toàn, chuẩn hoá lỗi, storage, môi trường |
| `App.test.tsx` | 1 | dựng được cây provider + navigator, render màn đầu |
| **Tổng** | **62** | 4 suite, `success: true` |

---

## 4. 🔴 Build Android KHÔNG chạy được trên máy này

### 4.1 Triệu chứng

```
FAILURE: Build failed with an exception.
* What went wrong:
java.io.IOException: Unable to establish loopback connection
```

Xảy ra ngay khi Gradle khởi động daemon, **trước khi biên dịch dòng mã nào**.

### 4.2 Nguyên nhân gốc — đã truy ra

Từ `~/.gradle/daemon/9.4.1/daemon-*.log`:

```
Caused by: java.net.SocketException: Invalid argument: connect
    at java.base/sun.nio.ch.UnixDomainSockets.connect0(Native Method)
    at java.base/sun.nio.ch.UnixDomainSockets.connect(UnixDomainSockets.java:148)
    at java.base/sun.nio.ch.SocketChannelImpl.connect(SocketChannelImpl.java:851)
    at java.base/java.nio.channels.SocketChannel.open(SocketChannel.java:285)
    at java.base/sun.nio.ch.PipeImpl$Initializer$LoopbackConnector.run(PipeImpl.java:133)
```

**`java.nio.channels.Pipe.open()` hỏng trên máy này.** Mọi `Selector` của Java đều
cần `Pipe`, nên Gradle không khởi động được daemon.

### 4.3 Đã kiểm chứng: KHÔNG phải lỗi của dự án

| Kiểm chứng | Kết quả |
|---|---|
| Loopback TCP IPv4 ở tầng OS (Node) | ✅ OK |
| Loopback TCP IPv6 `::1` ở tầng OS (Node) | ✅ OK |
| `ServerSocket` + `Socket` loopback bằng **Java** | ✅ OK |
| **`java.nio.channels.Pipe.open()` bằng Java** | ❌ **LỖI** |
| `./gradlew --version` | ✅ OK (không cần daemon) |
| `./gradlew assembleDebug` | ❌ LỖI |

Lỗi tái hiện **bên ngoài Gradle**, chỉ với JDK thuần → không liên quan tới mã
nguồn, cấu hình Gradle hay dependency của dự án. Mọi build Gradle trên máy này
đều sẽ hỏng như vậy.

### 4.4 Đã thử, không ăn thua

| Cách thử | Kết quả |
|---|---|
| Chạy ngoài sandbox của công cụ | vẫn lỗi |
| `-Djava.net.preferIPv4Stack=true` | vẫn lỗi |
| `-Djdk.nio.channels.pipe.useUnixDomainSockets=false` | vẫn lỗi |
| `-Djdk.net.usePlainSocketImpl=true` | vẫn lỗi |
| Đổi `java.io.tmpdir` — thử 4 vị trí: `AppData\Local\Temp`, `C:\Temp`, `C:\Windows\Temp`, trong repo | vẫn lỗi cả 4 → chặn toàn bộ AF_UNIX, không theo đường dẫn |
| **Đổi sang JDK khác** (Android Studio JBR 25.0.2) qua `JAVA_HOME` + `org.gradle.java.home` | vẫn lỗi — xem §4.4.1 |
| `./gradlew assembleDebug --no-daemon` *(thử 2026-09-05)* | vẫn lỗi, exit 1. Gradle 9.4.1 báo thẳng: *"a single-use Daemon process will be forked"* — `--no-daemon` **không** loại bỏ tiến trình con, nên vẫn cần `Selector.open()` |

#### 4.4.1 ⚠️ Bẫy: `Pipe.open()` không phải phép thử đủ

Phép thử đúng là **`Selector.open()`**, không phải `Pipe.open()`:

| JDK | `Pipe.open()` | `Selector.open()` ← Gradle dùng cái này |
|---|:--:|:--:|
| Microsoft JDK 17.0.19 (`JAVA_HOME` hiện tại) | ❌ | ❌ |
| Android Studio JBR 25.0.2 | ✅ **OK** | ❌ **LỖI** |

JDK 25 dựng `Pipe` bằng cơ chế khác nên qua được, nhưng `Selector.open()` →
`WEPollSelectorProvider` → `PipeImpl` vẫn bị chặn. **Đổi JDK không giải quyết được.**

Stack của daemon khi chạy JBR 25 (`~/.gradle/daemon/9.4.1/daemon-*.log`):

```
Caused by: java.io.IOException: Unable to establish loopback connection
    at java.base/sun.nio.ch.PipeImpl$Initializer.init(Unknown Source)
    at java.base/sun.nio.ch.WEPollSelectorImpl.<init>(Unknown Source)
    at java.base/java.nio.channels.Selector.open(Unknown Source)
    at org.gradle.internal.remote.internal.inet.SocketConnection$SocketInputStream.<init>
```

#### 4.4.2 Thủ phạm đã xác định

| | |
|---|---|
| Driver | `TbCardinal.sys` — **File System filter driver** của ThreatBook Agent |
| Nhóm | `TbProtect Activity Monitor` · Start=1 (nạp cùng hệ thống) |
| Trạng thái | 🔴 **Running** |
| Service `safeSrv` (ThreatBook Agent Safe Service) | ⚪ **Stopped** |
| Service `tbGuardSrv` (ThreatBook Agent Guard Service) | ⚪ **Stopped** |
| Tiến trình ThreatBook | không có |

Driver giám sát vẫn nạp trong nhân, nhưng hai service ra quyết định của nó đã dừng.
AF_UNIX trên Windows cần tạo file socket trên đĩa — đúng thứ một *file system*
filter driver chặn được, và Java nhận `Invalid argument: connect`.

Windows Firewall **không** liên quan: không có luật nào chặn `java.exe`
(kiểm tra bằng `Get-NetFirewallApplicationFilter`).

### 4.5 👤 Việc người dùng cần làm

Đây là hỏng ở tầng hệ thống. Ba việc dưới đây đều **thay đổi cài đặt hệ thống /
bảo mật**, nên tôi không tự thực hiện — cần bạn quyết định và tự chạy:

1. **Nghi ngờ số một — phần mềm bảo mật chặn AF_UNIX của `java.exe`.**
   Thêm ngoại lệ cho thư mục JDK vào phần mềm diệt virus / endpoint protection:
   `C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot\`

2. **Winsock hỏng.** Chạy PowerShell **quyền Administrator**, sau đó **khởi động lại máy**:

   ```
   netsh winsock reset
   ```

3. **Kiểm tra Windows Defender Firewall** xem có luật chặn `java.exe` không.

**Cách xác nhận đã sửa xong** — dùng `Selector.open()`, KHÔNG dùng `Pipe.open()`
(xem bẫy ở §4.4.1). Thấy `SELECTOR: OK` là được:

```bash
printf '%s\n' 'try { var s = java.nio.channels.Selector.open(); System.out.println("SELECTOR: OK"); s.close(); } catch (Throwable t) { System.out.println("SELECTOR: LOI - " + t); }' '/exit' | jshell -s -
```

Sau khi thấy `SELECTOR: OK`, chạy lại:

```bash
cd apps/wms-mobile/android && ./gradlew assembleDebug
```

APK sẽ nằm ở `apps/wms-mobile/android/app/build/outputs/apk/debug/app-debug.apk`.

### 4.6 Lần kiểm chứng lại thứ hai — 2026-09-05

Chạy lại toàn bộ để xác nhận tình trạng máy **không** tự khỏi. Kết quả y hệt:

| Lệnh | Exit | Kết quả |
|---|:--:|---|
| `./gradlew assembleDebug` | **1** | `java.io.IOException: Unable to establish loopback connection` |
| `./gradlew assembleDebug --no-daemon` | **1** | cùng lỗi |
| `java PipeTest.java` — **JDK thuần, không Gradle** | 0 | `Pipe.open() = FAIL` · `Selector.open() = FAIL` |

Chương trình kiểm chứng chỉ 8 dòng, không dùng Gradle, không dùng dependency nào của dự án:

```java
import java.nio.channels.Pipe;
import java.nio.channels.Selector;
public class PipeTest {
  public static void main(String[] a) {
    try { Pipe.open();     System.out.println("Pipe.open()     = OK"); }
    catch (Throwable t) {  System.out.println("Pipe.open()     = FAIL -> " + t); }
    try { Selector.open(); System.out.println("Selector.open() = OK"); }
    catch (Throwable t) {  System.out.println("Selector.open() = FAIL -> " + t); }
  }
}
```

JDK đang dùng: `openjdk 17.0.19 2026-04-21 LTS` (Microsoft-13877129).

Trạng thái ThreatBook **không đổi** (`Get-Service` + `Get-CimInstance Win32_SystemDriver`):

| Thành phần | Trạng thái |
|---|:--:|
| `safeSrv` — ThreatBook Agent Safe Service | ⚪ Stopped |
| `tbGuardSrv` — ThreatBook Agent Guard Service | ⚪ Stopped |
| `TbCardinal.sys` — `C:\Windows\system32\Drivers\TbCardinal.sys` | 🔴 **Running** |

→ Dừng hai service **không** gỡ được driver khỏi nhân. Việc khắc phục vẫn nằm ở §4.5 và **cần quyền Administrator**.

### 4.7 ❌ Build qua Android Studio — ĐÃ THỬ, KHÔNG ĂN THUA

Câu hỏi rất tự nhiên: *"Mở Android Studio bấm build thì sao?"* — đã kiểm chứng thật 2026-09-05, **không được**.

Android Studio **không có** cơ chế build riêng. Nó gọi đúng Gradle wrapper của dự án, chỉ khác là dùng JDK do IDE cấu hình (mặc định là JBR đi kèm). Vì vậy nó gặp đúng một lỗi.

| Kiểm chứng | Kết quả |
|---|---|
| Android Studio đã cài | ✅ `C:\Program Files\Android\Android Studio` |
| JBR đi kèm | `openjdk 25.0.2` (build 25.0.2+-15348964-b329.117) |
| `Pipe.open()` bằng JBR | ✅ **OK** ← 🪤 **cái bẫy** |
| **`Selector.open()` bằng JBR** | ❌ **FAIL** — `Unable to establish loopback connection` |
| `./gradlew assembleDebug -Dorg.gradle.java.home="…/Android Studio/jbr"` | ❌ **exit 1**, đúng lỗi cũ |

Lệnh cuối cùng mô phỏng **chính xác** điều Android Studio làm khi bạn đặt Gradle JDK = JBR. Kết quả giống hệt.

> 🪤 **Đừng để `Pipe.open() = OK` đánh lừa.** JDK 25 dựng `Pipe` theo cơ chế khác nên qua được, nhưng Gradle gọi `Selector.open()` → `WEPollSelectorImpl` → `PipeImpl` và vẫn bị chặn. Xem §4.4.1.

**Kết luận: mọi lối vào đều đi qua Gradle, mà Gradle cần `Selector.open()`.** Android Studio, dòng lệnh, `--no-daemon`, đổi JDK — hỏng như nhau.

### 4.8 💡 WSL2 — đường vòng khả thi, CHƯA triển khai

`TbCardinal.sys` là **file system filter driver của Windows**. WSL2 chạy nhân Linux thật trong máy ảo nhẹ, nên driver này **không chạm tới** syscall bên trong đó.

Kiểm chứng 2026-09-05:

| Kiểm tra | Kết quả |
|---|---|
| WSL đã cài | ✅ `Ubuntu` (WSL **2**) · `docker-desktop` — cả hai đang Stopped |
| **AF_UNIX socket trong WSL** — đúng cơ chế đang hỏng trên Windows | ✅ **CHẠY ĐƯỢC** (`bind` + `connect` + truyền dữ liệu thành công) |
| JDK trong WSL | ❌ chưa cài |
| Android SDK trong WSL | ❌ chưa cài |

AF_UNIX hoạt động trong WSL là **dấu hiệu mạnh** rằng JDK ở đó sẽ qua được `Selector.open()`, tức Gradle build được.

**Nhưng cần cài thêm** (~2–3 GB): OpenJDK 17 · Android SDK command-line tools · platform 37 · build-tools · chấp nhận SDK licenses.

> ⚠️ Đây là **thay đổi hệ thống đáng kể**, tôi không tự thực hiện — cần người dùng quyết định. Ưu điểm: không phải đụng tới phần mềm bảo mật của công ty. Nhược điểm: phải dựng lại toàn bộ toolchain Android trong WSL.

### 4.9 ✅ Bằng chứng mới: tầng JS/TS build được cho Android

Không build được APK **không** có nghĩa là không có bằng chứng gì. Metro đóng gói bundle **production** cho Android thành công:

```bash
npx react-native bundle --platform android --dev false \
  --entry-file index.js \
  --bundle-output <scratch>/index.android.bundle \
  --assets-dest <scratch>/assets
```

| | |
|---|---|
| Exit code | **0** |
| Bundle | `index.android.bundle` — **1.347.571 byte** |
| Asset | 19 file, copy xong |
| Metro | v0.87.0 |

**Cái này chứng minh:** toàn bộ mã TypeScript/React của app resolve, transform và đóng gói được ở chế độ production cho nền tảng Android — không có import hỏng, không có lỗi cú pháp, không có module thiếu.

**Cái này KHÔNG chứng minh:** phần native (Kotlin/C++/Gradle), việc đóng gói APK, chữ ký, hay app chạy được trên thiết bị. ❌ Không được coi đây là thay thế cho một lần build thật.

> Bundle được ghi ra thư mục scratchpad **ngoài repository**, không đưa vào Git.

---

## 5. Chưa kiểm chứng được

| # | Hạng mục | Vì sao |
|:--:|---|---|
| 1 | APK build ra | §4 — Gradle không chạy được trên máy này |
| 2 | Ứng dụng khởi chạy trên thiết bị | `adb devices` → **không có thiết bị hay emulator nào kết nối** |
| 3 | Navigation/theme trên màn hình thật | như trên — mới chỉ xác minh qua unit test render |
| 4 | Hành vi đầu quét PDA thật | chưa có máy PDA nào; chặn bởi `GATE_PDA_HARDWARE_CERTIFICATION` |
| 5 | Gọi API WMS thật | chặn bởi `GATE_WMS_API_INTEGRATION` |
