#!/bin/bash
# Điều khiển vòng đời app trên máy thật.
#
# Dùng: app.sh restart  → tắt hẳn rồi mở lại (CÁCH DUY NHẤT nạp bundle JS mới)
#       app.sh start    → mở
#       app.sh stop     → tắt hẳn
#       app.sh state    → đang ở đâu, máy có khoá không, Metro có sống không
#
# ⚠️ QUAN TRỌNG NHẤT: **Fast Refresh không ăn** trong lần chạy đo được
# 2026-09-06. Sửa mã xong, màn hình vẫn chạy bundle cũ — đã suýt kết luận sai
# rằng một bản vá vô tác dụng. Chỉ `restart` mới nạp bundle mới.

source "$(dirname "${BASH_SOURCE[0]}")/_env.sh"

start() {
  "$ADB" shell am start -n "$APP_ID/$APP_ACTIVITY" >/dev/null 2>&1
}

case "${1:-state}" in
  stop)
    "$ADB" shell am force-stop "$APP_ID"
    echo "đã tắt $APP_ID"
    ;;
  start)
    start
    echo "đã mở $APP_ID"
    ;;
  restart)
    "$ADB" shell am force-stop "$APP_ID"
    "$ADB" logcat -c
    start
    echo "đã khởi động lại — chờ ~20s cho bundle tải xong"
    ;;
  state)
    echo -n "Metro:      "
    curl -s -m 5 http://localhost:8081/status || echo "KHÔNG CHẠY  ← bản debug sẽ ra màn đỏ"
    echo
    echo -n "reverse:    "; "$ADB" reverse --list | head -1
    echo -n "khoá màn:   "; "$ADB" shell dumpsys deviceidle 2>/dev/null | grep -i mScreenLocked | tr -d ' '
    echo -n "đang focus: "; "$ADB" shell dumpsys window 2>/dev/null | grep -i mCurrentFocus | head -1
    echo -n "pid app:    "; "$ADB" shell pidof "$APP_ID" || echo "chưa chạy"
    ;;
  *)
    echo "Dùng: app.sh restart|start|stop|state"
    exit 1
    ;;
esac
