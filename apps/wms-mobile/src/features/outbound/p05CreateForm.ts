// User 09/10/2026: create form, 1..99, public address dataset v2.
export interface P05CreateForm {
  name: string;
  recipientId: string;
  originalAddress: string;
  recipient: string;
  phone: string;
  province: string;
  provinceName: string;
  ward: string;
  wardName: string;
  address: string;
  plannedInput: string;
  group: string;
  /** Optional for old single-group drafts; group remains the first exact name. */
  groups?: string[];
  note: string;
}
export type P05CreateTextField = Exclude<keyof P05CreateForm, 'groups'>;
export function validP05Groups(
  f: Pick<P05CreateForm, 'group' | 'groups'>,
): boolean {
  if (f.groups === undefined)
    return typeof f.group === 'string' && (!f.group || !!f.group.trim());
  return (
    Array.isArray(f.groups) &&
    f.groups.length > 0 &&
    f.groups.every(v => typeof v === 'string' && !!v.trim()) &&
    new Set(f.groups).size === f.groups.length &&
    f.group === f.groups[0]
  );
}
export function p05SelectedGroups(
  f: Pick<P05CreateForm, 'group' | 'groups'>,
): readonly string[] {
  if (!validP05Groups(f)) return [];
  return f.groups ?? (f.group ? [f.group] : []);
}
export const emptyP05CreateForm = (): P05CreateForm => ({
  name: '',
  recipientId: '',
  originalAddress: '',
  recipient: '',
  phone: '',
  province: '',
  provinceName: '',
  ward: '',
  wardName: '',
  address: '',
  plannedInput: '1',
  group: '',
  note: '',
});

export const P05_PHONE_ERROR =
  'Số điện thoại phải có đúng 10 chữ số và bắt đầu bằng 03, 05, 07, 08 hoặc 09.';

/**
 * P05 chỉ lưu số di động nội địa 10 chữ số.
 *
 * Lọc ký tự không phải số ngay lúc nhập và chặn ở 10 chữ số. Không tự đổi
 * `+84` thành `0`: đó là thay đổi dữ liệu liên hệ mà người dùng chưa xác nhận.
 */
export function sanitiseP05Phone(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, 10);
}

export function validP05Phone(raw: string): boolean {
  return /^(?:03|05|07|08|09)[0-9]{8}$/.test(raw);
}
export function p05CreateErrors(
  f: P05CreateForm,
): Partial<Record<keyof P05CreateForm, string>> {
  const e: Partial<Record<keyof P05CreateForm, string>> = {};

  if (!f.recipientId || !f.recipient.trim())
    e.recipient = 'Chọn hoặc nhập tên người nhận.';
  if (!validP05Phone(f.phone)) e.phone = P05_PHONE_ERROR;
  if (!f.province || !f.provinceName) e.province = 'Chọn Tỉnh/Thành phố.';
  if (!f.ward || !f.wardName) e.ward = 'Chọn Phường/Xã thuộc tỉnh đã chọn.';
  if (!f.address.trim()) e.address = 'Nhập địa chỉ giao.';
  if (!/^[1-9][0-9]?$/.test(f.plannedInput))
    e.plannedInput =
      'Nhập số nguyên từ 1 đến 99, không dùng dấu, khoảng trắng hoặc số thập phân.';
  if (!validP05Groups(f) || !p05SelectedGroups(f).length)
    e.group = 'Chọn ít nhất một nhóm hàng hợp lệ từ danh mục.';
  if (f.note.length > 200) e.note = 'Ghi chú tối đa 200 ký tự.';
  return e;
}
export const p05DeliveryAddress = (f: P05CreateForm) =>
  [f.address.trim(), f.wardName, f.provinceName].filter(Boolean).join(', ');
export const p05FormSnapshot = (f: P05CreateForm) => ({
  p05_create: { ...f, address_dataset: 'provinces.open-api.vn/v2' },
});
export function p05StableJSON(v: unknown): string {
  const stable = (x: unknown): unknown =>
    Array.isArray(x)
      ? x.map(stable)
      : x && typeof x === 'object'
      ? Object.fromEntries(
          Object.entries(x)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, y]) => [k, stable(y)]),
        )
      : x;
  return JSON.stringify(stable(v));
}
