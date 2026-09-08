#!/bin/bash
# Phần dùng chung của mọi script lái máy thật. Nạp bằng `source`.
#
# Hai thứ ở đây đều là bài học phải trả giá mới có:
#
# 1. `MSYS_NO_PATHCONV=1` — Git Bash trên Windows tự "sửa" mọi chuỗi trông giống
#    đường dẫn Unix thành đường dẫn Windows. Không tắt thì `/sdcard/u.xml` biến
#    thành `C:/Program Files/Git/sdcard/u.xml` và mọi lệnh adb shell hỏng vô cớ.
#
# 2. `adb` phải là bản **Windows**. Build bằng WSL vẫn được, nhưng WSL không
#    thấy thiết bị USB — chạy adb trong WSL ra "no devices found" trong khi máy
#    vẫn đang cắm.

export MSYS_NO_PATHCONV=1

# Cho phép ghi đè: ADB=/duong/dan/khac ./ui.sh
if [ -z "$ADB" ]; then
  for candidate in \
    "$LOCALAPPDATA/Android/Sdk/platform-tools/adb.exe" \
    "/c/Users/$USERNAME/AppData/Local/Android/Sdk/platform-tools/adb.exe" \
    "$ANDROID_HOME/platform-tools/adb.exe" \
    "$(command -v adb 2>/dev/null)"
  do
    if [ -n "$candidate" ] && [ -x "$candidate" ]; then
      ADB="$candidate"
      break
    fi
  done
fi

if [ -z "$ADB" ]; then
  echo "KHÔNG TÌM THẤY adb. Đặt biến ADB trỏ tới adb.exe của Windows." >&2
  exit 1
fi
export ADB

# Gói app đang lái. Đổi bằng biến môi trường nếu cần.
export APP_ID="${APP_ID:-vn.info.lptech.wmshoanam}"
export APP_ACTIVITY="${APP_ACTIVITY:-.MainActivity}"

# Thư mục chứa chính các script này — để script gọi nhau không phụ thuộc cwd.
export DEVICE_TOOLS="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
