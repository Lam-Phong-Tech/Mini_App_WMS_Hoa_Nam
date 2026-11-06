import { p09Date } from '../src/features/warranty/p09Date';

it.each([
  '2026-10-08T15:52:34Z',
  '2026-10-08T22:52:34+07:00',
  '2026-10-08 22:52:34+07',
  '2026-10-08 22:52:34.123456+0700',
  '2026-10-08 15:52:34+00',
])('shows the same Vietnam instant for ISO and PostgreSQL: %s', value => {
  expect(p09Date(value)).toBe('08/10/2026 22:52');
});
it('handles date rollover and negative source offset', () => {
  expect(p09Date('2026-10-08 20:15:00-02')).toBe('09/10/2026 05:15');
});
it.each([
  undefined,
  null,
  '',
  '2026-10-08 22:52:34',
  '2026-10-08',
  '2026-02-30 22:52:34+07',
  '2026-10-08 25:00:00+07',
  'bad timestamp',
])('does not invent missing/ambiguous time: %s', value => {
  expect(p09Date(value)).toBe('Chưa có dữ liệu');
});
