#!/bin/bash
# Đọc cây giao diện thật trên máy và in ra "text | tâm-x tâm-y".
#
# Vì sao cần: bấm theo toạ độ đoán từ ảnh chụp rất dễ trượt khi màn cuộn hoặc
# bàn phím bật lên. Đọc bounds thật từ uiautomator thì bấm đúng chỗ mọi lúc.
#
# Dùng: ui.sh            → liệt kê mọi text kèm toạ độ
#       ui.sh "Ghi nhận" → chỉ dòng khớp
#
# ⚠️ GIỚI HẠN ĐÃ ĐO: uiautomator **bỏ sót Text nhiều dòng**. Đã có lần bản dump
# không có dòng nội dung của banner, suýt báo nhầm là "banner mất chữ" — chụp
# màn hình thì chữ hiện đủ. Dùng script này để BẤM ĐÚNG CHỖ; muốn khẳng định
# "có hiện chữ hay không" thì phải dùng shot.sh.
#
# ⚠️ Phần tử nằm ngoài màn hình hiện về toạ độ 0 0 — không bấm được, phải cuộn.

source "$(dirname "${BASH_SOURCE[0]}")/_env.sh"

# Xoá tệp cũ TRƯỚC. Có lần dump thất bại lặng lẽ, script đọc lại tệp của mấy
# ngày trước và suýt báo sai rằng app đang hiện màn hình cũ.
"$ADB" shell "rm -f /sdcard/u.xml" >/dev/null 2>&1

for i in 1 2 3; do
  out=$("$ADB" shell "uiautomator dump --compressed /sdcard/u.xml" 2>&1)
  case "$out" in *dumped*) break;; esac
  sleep 2
done

"$ADB" shell "cat /sdcard/u.xml" 2>/dev/null \
| tr '>' '\n' \
| grep -oE 'text="[^"]*"[^<]*bounds="\[[0-9]+,[0-9]+\]\[[0-9]+,[0-9]+\]"' \
| sed -E 's/text="([^"]*)".*bounds="\[([0-9]+),([0-9]+)\]\[([0-9]+),([0-9]+)\]"/\1|\2 \3 \4 \5/' \
| awk -F'|' '$1 != "" {
    split($2, b, " ");
    cx = int((b[1] + b[3]) / 2);
    cy = int((b[2] + b[4]) / 2);
    printf "%-52s %5d %5d\n", substr($1, 1, 52), cx, cy;
  }' \
| { if [ -n "$1" ]; then grep -i -- "$1"; else cat; fi; }
