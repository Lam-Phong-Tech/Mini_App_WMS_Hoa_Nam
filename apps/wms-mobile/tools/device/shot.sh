#!/bin/bash
# Chụp màn hình máy thật về máy tính.
#
# Dùng: shot.sh [ten-tep.png]
#
# Đây là **nguồn sự thật** khi cần khẳng định "màn hình có hiện chữ này không".
# `ui.sh` bỏ sót Text nhiều dòng, nên chỉ dùng nó để bấm, không dùng để kết luận.

source "$(dirname "${BASH_SOURCE[0]}")/_env.sh"

OUT="${1:-shot-$(date +%H%M%S).png}"
"$ADB" exec-out screencap -p > "$OUT"

if [ ! -s "$OUT" ]; then
  echo "CHỤP HỎNG — kiểm tra máy có đang khoá màn hình không:" >&2
  "$ADB" shell dumpsys deviceidle 2>/dev/null | grep -i mScreenLocked >&2
  exit 1
fi

echo "$OUT ($(wc -c < "$OUT") byte)"
