import { formatP04DateTime } from '../src/features/inbound/p04Date';

describe('P04 date display adapter', () => {
  it('formats server UTC timestamps in Vietnam time using the locked B04 pattern', () => {
    expect(formatP04DateTime('2026-10-07T17:26:35.047865Z')).toBe(
      '08/10/2026 00:26',
    );
  });

  it('accepts explicitly zoned SQL timestamps, but never guesses missing or invalid time', () => {
    expect(formatP04DateTime('2026-10-07 17:26:35+00:00')).toBe(
      '08/10/2026 00:26',
    );
    expect(formatP04DateTime('not-a-date')).toBe('Chưa xác minh thời điểm');
    expect(formatP04DateTime('2026-10-07 17:26:35')).toBe('Chưa xác minh thời điểm');
    expect(formatP04DateTime(undefined)).toBeUndefined();
  });
});
