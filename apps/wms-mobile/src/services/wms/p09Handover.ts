import { AppError } from '../../errors/AppError';
import { vietnamDateKey } from '../../time/vietnamTime';

export const P09_HANDOVER_CONTRACT = 'p09-warranty-handover-v1';
export interface P09Handover {
  receiver: string;
  handover_date: string;
  handover_checked: boolean;
  note: string;
}
export interface P09HandoverSnapshot extends Omit<P09Handover, 'note'> {
  contract: typeof P09_HANDOVER_CONTRACT;
  receiver_masked: boolean;
  note: string | null;
  note_redacted: boolean;
  returned_at: string | null;
  returned_at_source: 'warranty_case.returned_at_server_time';
}
function calendarDate(value: string): boolean {
  const epoch = Date.parse(value + 'T00:00:00Z');
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(epoch) &&
    new Date(epoch).toISOString().slice(0, 10) === value
  );
}
export function validHandoverDate(value: string, now = Date.now()): boolean {
  const today = vietnamDateKey(now);
  return calendarDate(value) && !!today && value <= today;
}
export function handoverErrors(values: P09Handover) {
  const errors: Partial<Record<keyof P09Handover, string>> = {};
  if (
    typeof values.receiver !== 'string' ||
    !values.receiver.trim() ||
    values.receiver.length > 200
  )
    errors.receiver = 'Nhập người nhận, tối đa 200 ký tự.';
  if (
    typeof values.handover_date !== 'string' ||
    !validHandoverDate(values.handover_date)
  )
    errors.handover_date = 'Nhập ngày hợp lệ, không sau hôm nay (YYYY-MM-DD).';
  if (values.handover_checked !== true)
    errors.handover_checked =
      'Cần xác nhận đã kiểm tra hoạt động của thiết bị.';
  if (
    typeof values.note !== 'string' ||
    !values.note.trim() ||
    values.note.length > 2000
  )
    errors.note = 'Nhập ghi chú bàn giao, tối đa 2.000 ký tự.';
  return errors;
}
export function handoverBody(values: P09Handover) {
  if (
    Object.keys(values).some(
      key =>
        !['receiver', 'handover_date', 'handover_checked', 'note'].includes(
          key,
        ),
    ) ||
    Object.keys(handoverErrors(values)).length
  )
    throw new AppError({
      kind: 'config',
      code: 'P09_HANDOVER_VALIDATION',
      message: 'Thông tin bàn giao chưa hợp lệ.',
    });
  return {
    status: 'RETURNED',
    receiver: values.receiver.trim(),
    handover_date: values.handover_date,
    handover_checked: true,
    note: values.note.trim(),
  };
}
export function readHandoverSnapshot(
  value: unknown,
  permissions: readonly string[],
): P09HandoverSnapshot | undefined {
  if (value === undefined || value === null) return undefined;
  const v = value as Partial<P09HandoverSnapshot>;
  if (
    typeof value !== 'object' ||
    Array.isArray(value) ||
    v.contract !== P09_HANDOVER_CONTRACT ||
    typeof v.receiver !== 'string' ||
    typeof v.handover_date !== 'string' ||
    !calendarDate(v.handover_date) ||
    v.handover_checked !== true ||
    typeof v.receiver_masked !== 'boolean' ||
    typeof v.note_redacted !== 'boolean' ||
    !(v.note === null || typeof v.note === 'string') ||
    !(v.returned_at === null || typeof v.returned_at === 'string') ||
    v.returned_at_source !== 'warranty_case.returned_at_server_time' ||
    (!permissions.includes('warranty.pii.view') &&
      (!v.receiver_masked || !v.note_redacted || v.note !== null))
  )
    throw new AppError({
      kind: 'parse',
      code: 'P09_HANDOVER_SNAPSHOT_INVALID',
      message:
        'Thông tin bàn giao chưa khớp nguồn hoặc chính sách bảo vệ dữ liệu.',
    });
  return {
    contract: P09_HANDOVER_CONTRACT,
    receiver: v.receiver,
    receiver_masked: v.receiver_masked,
    handover_date: v.handover_date,
    handover_checked: true,
    note: v.note ?? null,
    note_redacted: v.note_redacted,
    returned_at: v.returned_at ?? null,
    returned_at_source: 'warranty_case.returned_at_server_time',
  };
}
