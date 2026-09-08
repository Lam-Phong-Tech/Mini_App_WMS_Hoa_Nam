#!/bin/bash
# Chạm vào phần tử có chữ khớp (khớp ĐẦU TIÊN), rồi chờ.
#
# Dùng: tap.sh "Ghi nhận nhập" [giây-chờ]
#
# ⚠️ BẪY ĐÃ DÍNH: "khớp đầu tiên" nghĩa là nếu một chữ xuất hiện hai chỗ — ví dụ
# "Kiểm tra" vừa là nhãn bước trên stepper vừa là nút ở cuối màn — script sẽ bấm
# nhãn stepper (ở trên) chứ không phải nút. Gặp cảnh đó thì chạy `ui.sh "chữ"`
# xem có mấy dòng, rồi bấm thẳng toạ độ:
#   "$ADB" shell input tap 409 2482

source "$(dirname "${BASH_SOURCE[0]}")/_env.sh"
WAIT="${2:-3}"

line=$("$DEVICE_TOOLS/ui.sh" "$1" | head -1)
if [ -z "$line" ]; then
  echo "KHÔNG THẤY: $1"
  exit 1
fi

x=$(echo "$line" | awk '{print $(NF-1)}')
y=$(echo "$line" | awk '{print $NF}')

# Toạ độ 0 0 = phần tử nằm ngoài màn hình. Bấm vào đó là bấm nhầm góc trên trái.
if [ "$x" = "0" ] && [ "$y" = "0" ]; then
  echo "NGOÀI MÀN HÌNH: $1 — cuộn tới rồi thử lại"
  exit 2
fi

echo "tap '$1' → $x $y"
"$ADB" shell input tap "$x" "$y"
sleep "$WAIT"
