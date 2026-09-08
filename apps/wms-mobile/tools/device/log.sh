#!/bin/bash
# Đọc log của app, đã lọc sạch rác hệ thống.
#
# Dùng: log.sh          → mọi dòng JS của app
#       log.sh net      → chỉ lời gọi HTTP và lỗi HTTP
#       log.sh err      → chỉ cảnh báo và lỗi
#       log.sh -c       → xoá sạch log (làm TRƯỚC mỗi thao tác cần đo)
#
# ⚠️ App chỉ ghi log `debug` khi __DEV__. Bản release chỉ còn `warn` trở lên —
# xem `src/logging/logger.ts`. Nghĩa là muốn xem lời gọi HTTP thì phải chạy bản
# debug qua Metro.
#
# ⚠️ Thành công KHÔNG được ghi log. Không thấy dòng lỗi nào sau một lời gọi
# nghĩa là nó chạy được — đừng hiểu nhầm là "không có phản hồi".

source "$(dirname "${BASH_SOURCE[0]}")/_env.sh"

if [ "$1" = "-c" ]; then
  "$ADB" logcat -c
  echo "đã xoá log"
  exit 0
fi

# Bỏ các dòng header lặp lại của mỗi request cho dễ đọc.
NOISE='Accept:|User-Agent|X-WMS-Client-Tier|Content-Type|Authorization|headers'

case "$1" in
  net)
    "$ADB" logcat -d 2>/dev/null | grep -oE "HTTP (GET|POST|PUT|PATCH) [^']*|wms:warn.*"
    ;;
  err)
    "$ADB" logcat -d 2>/dev/null | grep "ReactNativeJS" | grep -iE "warn|error|lỗi" | grep -viE "$NOISE"
    ;;
  *)
    "$ADB" logcat -d 2>/dev/null | grep "ReactNativeJS" | grep -viE "$NOISE"
    ;;
esac
