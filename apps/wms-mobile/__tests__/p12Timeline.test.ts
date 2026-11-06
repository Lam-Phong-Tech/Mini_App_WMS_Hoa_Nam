import {
  timelineTime,
  timelineEventTitle,
} from '../src/features/documents/p12/timeline';
test.each([
  '2026-10-07T01:30:00.123456Z',
  '2026-10-07T08:30:00+07:00',
  '2026-10-07 08:30:00+07',
  '2026-10-07T08:30:00+0700',
])('date is first and the instant is converted once: %s', value => {
  expect(timelineTime(value)).toBe('07/10/2026 08:30');
});
test.each([
  null,
  undefined,
  '2026-10-07 08:30:00',
  '2026-02-30T08:30:00Z',
  '2026-10-07T25:30:00Z',
])(
  'missing/naive/invalid time never becomes a status-derived date: %s',
  value => {
    expect(timelineTime(value)).toBe('Chưa có thời điểm ghi nhận');
  },
);
test('only explicit action keys are localized, without changing their semantics', () => {
  expect(timelineEventTitle('scan_start')).toBe('Bắt đầu quét sản phẩm');
  expect(timelineEventTitle('post_receipt')).toBe('Ghi sổ phiếu nhập');
  expect(timelineEventTitle('post_issue')).toBe('Ghi sổ phiếu xuất');
  expect(timelineEventTitle('submit')).toBe('Gửi phiếu');
  expect(timelineEventTitle('future.posted')).toBe(
    'Hoạt động khác (chưa có nhãn)',
  );
  expect(timelineEventTitle(null)).toBe('Hoạt động khác (chưa có nhãn)');
});
