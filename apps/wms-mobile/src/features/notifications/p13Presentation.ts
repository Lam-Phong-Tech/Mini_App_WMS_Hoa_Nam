import type { NotificationItem } from '../../services/wms/notifications';
import type { HnHomeIconName } from '../../ui/HnHomeIcon';
import { vietnamTimeParts } from '../../time/vietnamTime';

export function notificationTime(value: string | null): string {
  const p = vietnamTimeParts(value);
  if (!p) return 'Chưa ghi nhận';
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`;
}
export function notificationShortTime(
  value: string | null,
  now: number,
): string {
  const p = vietnamTimeParts(value),
    today = vietnamTimeParts(now);
  if (!p) return '—';
  return today &&
    p.day === today.day &&
    p.month === today.month &&
    p.year === today.year
    ? `${p.hour}:${p.minute}`
    : `${p.day}/${p.month}`;
}
export function notificationKind(item: NotificationItem): {
  label: string;
  icon: HnHomeIconName;
} {
  const s = item.subject;
  if (
    s?.mapping_revision === 'p13-notifications-r2' &&
    s.mapping_status === 'MAPPED' &&
    s.identity_source === 'PERSISTED_NOTIFICATION_EVENT_AND_PAYLOAD'
  ) {
    if (s.business_type === 'INBOUND')
      return { label: 'Phiếu nhập kho', icon: 'document' };
    if (s.business_type === 'OUTBOUND')
      return { label: 'Phiếu xuất kho', icon: 'document' };
    if (s.business_type === 'WARRANTY')
      return { label: 'Hồ sơ bảo hành', icon: 'tool' };
  }
  return { label: '—', icon: 'bell' };
}
