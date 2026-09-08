#!/bin/bash
# Đóng bàn phím — CHỈ KHI nó đang mở.
#
# ⚠️ Vì sao phải kiểm tra trước: bấm Back lúc bàn phím đã đóng sẽ **lùi màn
# hình**. Đã có lần chuỗi Back liên tiếp thoát hẳn app giữa lúc điền phiếu, mất
# toàn bộ dữ liệu vừa gõ.
#
# ⚠️ Bẫy liên quan: gõ xong mà không đóng bàn phím thì cú chạm tiếp theo rơi
# **vào bàn phím** chứ không vào ô định nhắm. Đã có lần số điện thoại chui vào
# ô tên khách vì thế.

source "$(dirname "${BASH_SOURCE[0]}")/_env.sh"

for i in 1 2 3; do
  shown=$("$ADB" shell dumpsys input_method 2>/dev/null | grep -c "mInputShown=true")
  [ "$shown" = "0" ] && exit 0
  "$ADB" shell input keyevent 4
  sleep 1
done
