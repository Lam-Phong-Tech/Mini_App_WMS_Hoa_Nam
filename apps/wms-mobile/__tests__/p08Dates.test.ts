import {
  p08QuickDate,
  p08ValidDate,
  p08DateLabel,
  p08MoveDay,
  p08PickerBounds,
  p08CalendarDays,
  p08TimeLabel,
} from '../src/features/history/p08Dates';
describe('P08 calendar shortcuts from response timezone', () => {
  it('validates calendar dates and displays Vietnamese labels without changing ISO query values', () => {
    expect(p08ValidDate('2026-02-30')).toBe(false);
    expect(p08ValidDate('2024-02-29')).toBe(true);
    expect(p08ValidDate('2026-02-29')).toBe(false);
    expect(p08ValidDate('10/10/2026')).toBe(false);
    expect(p08DateLabel('2026-10-10')).toBe('10/10/2026');
    expect(p08DateLabel('')).toBe('Chọn ngày');
  });
  it('locks future and day91 in picker, and applies the opposite endpoint boundary', () => {
    expect(p08MoveDay('2026-10-10', -90)).toBe('2026-07-12');
    expect(p08PickerBounds('2026-10-10', 'date')).toEqual({
      min: '2026-07-13',
      max: '2026-10-10',
    });
    const bounds = p08PickerBounds('2026-10-10', 'date');
    expect(
      (Date.parse(bounds.max) - Date.parse(bounds.min)) / 86400000 + 1,
    ).toBe(90);
    expect(p08PickerBounds('2026-10-10', 'from', '', '2026-09-09').max).toBe(
      '2026-09-09',
    );
    expect(p08PickerBounds('2026-10-10', 'to', '2026-09-09').min).toBe(
      '2026-09-09',
    );
    expect(() => p08MoveDay('2026-02-30', 1)).toThrow();
  });
  it('uses Monday first and complete rows for leap/non-leap month layouts', () => {
    const leap = p08CalendarDays('2024-02');
    expect(leap.length % 7).toBe(0);
    expect(leap.filter(Boolean)).toHaveLength(29);
    expect(p08CalendarDays('2026-10').slice(0, 4)).toEqual([
      null,
      null,
      null,
      '2026-10-01',
    ]);
    expect(() => p08CalendarDays('2026-13')).toThrow();
  });
  it('shows PostgreSQL short-offset timestamps in response timezone', () => {
    expect(p08TimeLabel('2026-10-11 21:40:07+00', 'Asia/Ho_Chi_Minh')).toBe(
      '12/10/2026 04:40:07',
    );
    expect(p08TimeLabel('bad', 'Asia/Ho_Chi_Minh')).toBe('bad');
  });
  it('uses backend timezone at click, across Vietnam midnight/month boundary', () => {
    const at = Date.parse('2026-09-30T17:01:00Z');
    expect(p08QuickDate(1, 'Asia/Ho_Chi_Minh', at)).toEqual({
      date_mode: 'DATE',
      date: '2026-10-01',
    });
    expect(p08QuickDate(7, 'Asia/Ho_Chi_Minh', at)).toEqual({
      date_mode: 'RANGE',
      from: '2026-09-25',
      to: '2026-10-01',
    });
    expect(p08QuickDate(1, 'UTC', at)).toEqual({
      date_mode: 'DATE',
      date: '2026-09-30',
    });
  });
  it('N days inclusive does not become quantity or page count', () => {
    const range = p08QuickDate(
      90,
      'Asia/Ho_Chi_Minh',
      Date.parse('2026-10-10T05:00:00Z'),
    );
    if (range.date_mode !== 'RANGE') throw Error('Expected range');
    expect((Date.parse(range.to) - Date.parse(range.from)) / 86400000 + 1).toBe(
      90,
    );
  });
});
