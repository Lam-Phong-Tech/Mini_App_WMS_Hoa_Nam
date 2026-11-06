export const P09_SYMPTOMS = [
  ['power-off', 'Máy không lên nguồn'],
  ['power-unstable', 'Nguồn chập chờn / Tự tắt máy'],
  ['no-print', 'Không in được'],
  ['faint-print', 'Bản in mờ / Không rõ nét'],
  ['broken-print', 'Bản in bị sọc / Đứt nét'],
  ['label-offset', 'In lệch tem / Sai vị trí'],
  ['paper-jam', 'Kẹt giấy / Kẹt tem'],
  ['paper-sensor', 'Không nhận giấy / Tem'],
  ['cutter', 'Không cắt giấy / Lỗi dao cắt'],
  ['no-scan', 'Không quét được mã vạch'],
  ['unstable-scan', 'Quét mã chậm / Chập chờn'],
  ['usb', 'Không kết nối USB'],
  ['lan', 'Không kết nối mạng LAN'],
  ['bluetooth', 'Không kết nối Bluetooth'],
  ['wifi', 'Không kết nối Wi-Fi'],
  ['button', 'Nút bấm không hoạt động'],
  ['physical', 'Hư vỏ máy / Cổng kết nối'],
  ['other', 'Khác'],
] as const;
export function p09Fold(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .trim();
}
