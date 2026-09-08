/**
 * `CodeInput` — ô nhập **mã máy đọc** (QR, barcode, serial, SKU, mã tem).
 *
 * ## 🔴 Vì sao không dùng thẳng `Input`
 *
 * Bàn phím tiếng Việt (Gboard, kiểu gõ Telex) **ăn mất ký tự** trong ô nhập chữ
 * thường. Đo trên Xiaomi 12 Pro ngày 2026-09-06, màn "Nhập mã thủ công":
 *
 * | Gõ vào | Ô nhận được | Vì sao |
 * |---|---|---|
 * | `TEST` | `TÉT` | Telex: `e` + `s` = `é`, chữ `s` biến mất |
 * | `MAF`  | `MÀ`  | `a` + `f` = `à` |
 * | `HAS`  | `HÁ`  | `a` + `s` = `á` |
 *
 * Đây là hỏng **âm thầm**: người dùng gõ đúng mã trên tem, ô hiện một chuỗi
 * khác, WMS trả `SKU_NOT_FOUND`, và không ai hiểu vì sao. Không sửa được ở tầng
 * xử lý chuỗi — bỏ dấu `TÉT` ra chỉ được `TET`, ký tự `S` đã mất hẳn.
 *
 * `autoCorrect={false}` **không** chặn được: Telex là bộ gõ (input method),
 * không phải sửa lỗi chính tả.
 *
 * ## Cách chặn
 *
 * `keyboardType="visible-password"` → Android `TYPE_TEXT_VARIATION_VISIBLE_PASSWORD`.
 * Bàn phím tắt hẳn phần ghép dấu và gợi ý cho ô này. Đo lại cùng máy, cùng ô:
 * gõ `TEST` → nhận `TEST`.
 *
 * "Visible password" chỉ là tên hằng số inputType của Android; ô vẫn hiện chữ
 * bình thường, **không** che dấu như ô mật khẩu.
 *
 * ## Chỗ nào dùng
 *
 * Mọi ô mà nội dung là **mã do máy sinh ra**. Ô nhập tiếng Việt thật (tên
 * người, ghi chú, tìm kiếm theo tên) thì **không** dùng — ở đó Telex là thứ
 * người dùng cần.
 */

import React from 'react';
import { Input, type InputProps } from './Input';

export type CodeInputProps = Omit<
  InputProps,
  'keyboardType' | 'autoCorrect' | 'autoCapitalize' | 'spellCheck'
>;

export function CodeInput(props: CodeInputProps): React.ReactElement {
  return (
    <Input
      {...props}
      // Thứ tự quan trọng: đặt sau `props` để bên gọi không vô tình ghi đè.
      keyboardType="visible-password"
      autoCapitalize="characters"
      autoCorrect={false}
      spellCheck={false}
    />
  );
}
