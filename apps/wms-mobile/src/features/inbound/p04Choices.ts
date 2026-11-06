// UI choices explicitly requested by the user on 2026-10-07. These are not
// production API capabilities until the server advertises/persists them.
export const P04_INBOUND_CHOICES = [
  { id: 'PRODUCT' as const, label: 'Nhập sản phẩm' },
  { id: 'COMPONENT' as const, label: 'Nhập linh kiện' },
  { id: 'OTHER' as const, label: 'Khác' },
];
export type P04InboundChoice = (typeof P04_INBOUND_CHOICES)[number]['id'];
export const P04_NUMBER_TEMPLATE = 'PN-YYYYMMDD-STT · Chưa cấp';
