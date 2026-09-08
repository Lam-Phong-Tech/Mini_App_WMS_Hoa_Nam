/**
 * Tiện ích cho các test **quét mã nguồn** tìm thứ bị cấm.
 *
 * ## Vì sao tách ra khỏi `__tests__/`
 *
 * Hai test đang cần cùng một bộ lọc chú thích: `wmsContract.test.ts` canh
 * `If-Match`, `outboundGeo.test.tsx` canh việc token WMS không rời khỏi WMS.
 * Nhân bản một hàm **an toàn** ra hai chỗ là cách chắc chắn nhất để một bản có
 * lỗi mà bản kia vẫn xanh — và khi đó cái đỏ lẽ ra phải đỏ thì lại im.
 *
 * Đặt ngoài `__tests__/` vì jest coi mọi tệp trong đó là test suite và sẽ báo
 * lỗi "không có test nào".
 */

/**
 * Bỏ chú thích khối và chú thích dòng, giữ nguyên phần code.
 *
 * **Nhắc tên** một lệnh cấm trong chú thích là ngược lại với vi phạm nó — một
 * tệp giải thích *"vì sao KHÔNG dùng `apiClient`"* phải qua được, còn một tệp
 * thật sự gọi `apiClient` thì không.
 *
 * ⚠️ Đây là bộ lọc chuỗi, không phải trình phân tích cú pháp: một dấu `//` nằm
 * trong chuỗi (ví dụ `'https://…'`) sẽ bị coi là mở đầu chú thích và phần còn
 * lại của dòng bị bỏ. Chấp nhận được cho mục đích ở đây — nó chỉ khiến bộ quét
 * **bỏ sót**, và các test dùng nó đều kiểm cả chiều dương lẫn chiều âm.
 */
export function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}
