import {
  historyInstant,
  historyDay,
  historyClock,
  historyStatus,
  historyAction,
  historySource,
  historyCount,
} from '../src/features/history/historyPresentation';
import { p08TimeLabel } from '../src/features/history/p08Dates';
test.each([
  '2026-10-14 07:18:40+00',
  '2026-10-14T07:18:40Z',
  '2026-10-14T14:18:40+07:00',
  '2026-10-14T07:18:40+0000',
])('history timestamp %s keeps the same instant exactly once', v => {
  expect(historyInstant(v)).toBe('14/10/2026 14:18:40');
  expect(historyDay(v)).toBe('14/10/2026');
  expect(historyClock(v)).toBe('14:18');
});
test('P08 never silently assigns machine timezone or response filtering timezone to a naive detail timestamp', () => {
  expect(p08TimeLabel('2026-10-15 03:45:57', 'Asia/Ho_Chi_Minh')).toBe(
    '2026-10-15 03:45:57 · Múi giờ chưa xác minh',
  );
  expect(p08TimeLabel('2026-10-15 03:45:57', 'UTC')).toBe(
    '2026-10-15 03:45:57 · Múi giờ chưa xác minh',
  );
  expect(historyClock('2026-10-15 03:45:57')).toBe('—');
  expect(historyInstant('2026-02-30T00:00:00Z')).toContain(
    'Thời gian chưa hợp lệ',
  );
});
test('labels translate recorded outcomes without equating resolved/valid/accepted or other/rejected', () => {
  expect(historyStatus('RESOLVED')).toBe('Đã phân giải');
  expect(historyStatus('VALID')).toBe('Hợp lệ');
  expect(historyStatus('ACCEPTED')).toBe('Được chấp nhận');
  expect(historyStatus('OTHER')).toBe('Kết quả khác');
  expect(historyStatus(null)).toBe('Chưa ghi nhận kết quả');
  expect(historyStatus('FUTURE_STATUS')).toBe('Chưa có nhãn trạng thái');
  expect(historyAction('scan_start')).toBe('Bắt đầu quét');
  expect(historySource('RECEIPT_DOCUMENT')).toBe('Nhập kho');
  expect(historyCount(null)).toBe('—');
  expect(historyCount(0)).toBe('0');
  expect(historyCount(undefined)).toBe('—');
});
