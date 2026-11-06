import {
  VIETNAM_TIMEZONE,
  formatVietnamClock,
  formatVietnamDate,
  formatVietnamDateTime,
  formatVietnamDateValue,
  parseVietnamTimestamp,
  vietnamDateKey,
} from '../src/time/vietnamTime';
import { parseDocumentTimestamp } from '../src/services/wms/documentTimestamps';
import {
  formatP04DateTime,
  formatP04ScanTime,
} from '../src/features/inbound/p04Date';
import { p06Date } from '../src/features/lookup/P06Presentation';
import { p09Date } from '../src/features/warranty/p09Date';
import {
  notificationTime,
  notificationShortTime,
} from '../src/features/notifications/p13Presentation';
import { historyInstant } from '../src/features/history/historyPresentation';
import { securityTime } from '../src/features/profile/P11SecurityScreens';
import { defaultOutboundName } from '../src/features/outbound/outboundDraft';
import {
  recordServerTime,
  resetServerClock,
  hasServerTime,
  getClockSkewMs,
} from '../src/auth/serverClock';

const moment = '2026-09-30T17:00:01.123456Z';
const display = '01/10/2026 00:00';

describe('P01–P24 Vietnam display time, independent of the device timezone', () => {
  it.each([
    moment,
    '2026-10-01T00:00:01.123456+07:00',
    '2026-10-01 00:00:01.123456+07',
    '2026-10-01 00:00:01.123456+0700',
    '2026-09-30T15:00:01.123456-02:00',
  ])('preserves the same explicit source instant: %s', raw => {
    expect(VIETNAM_TIMEZONE).toBe('Asia/Ho_Chi_Minh');
    const parsed = parseVietnamTimestamp(raw);
    expect(parsed.status).toBe('RECORDED');
    expect(parsed.raw).toBe(raw);
    if (parsed.status !== 'RECORDED') throw Error('Expected source instant');
    expect(parsed.epochMs).toBe(Date.parse(moment));
    expect(parsed.microsecond).toBe(123456);
    expect(formatVietnamDateTime(raw)).toBe(display);
    expect(formatVietnamDateTime(raw, { seconds: true })).toBe(display + ':01');
    expect(formatVietnamClock(raw, { seconds: true })).toBe('00:00:01');
    expect(formatVietnamDate(raw)).toBe('01/10/2026');
    expect(vietnamDateKey(raw)).toBe('2026-10-01');
  });
  it.each([
    null,
    undefined,
    '',
    '2026-10-01',
    '2026-10-01 00:00:01',
    '2026-10-01T00:00:01',
    '2026-02-30T00:00:00Z',
    '2026-02-29T00:00:00Z',
    '2026-10-01T24:00:00Z',
    '2026-10-01T00:00:00+24:00',
    '2026-10-01T00:00:00+07:60',
    '2026-10-01T00:00:00.1234567Z',
    'not-a-date',
    NaN,
    Infinity,
  ])(
    'never invents a zone/epoch/zero for missing, naive or invalid time: %s',
    raw => {
      expect(formatVietnamDateTime(raw)).toBe('—');
      expect(formatVietnamClock(raw)).toBe('—');
      expect(vietnamDateKey(raw)).toBeNull();
    },
  );
  it('handles leap day, year rollover and midnight in 24h format', () => {
    expect(formatVietnamDateTime('2024-02-28T17:00:00Z')).toBe(
      '29/02/2024 00:00',
    );
    expect(formatVietnamDateTime('2026-12-31T17:00:00Z')).toBe(
      '01/01/2027 00:00',
    );
    expect(formatVietnamClock('2026-09-30T16:59:59Z', { seconds: true })).toBe(
      '23:59:59',
    );
  });
  it('does not loosen P12 RFC3339 parsing to accept naive or SQL-contract values', () => {
    expect(parseDocumentTimestamp('2026-10-01 00:00:01+07').status).toBe(
      'INVALID',
    );
    expect(parseDocumentTimestamp('2026-10-01T00:00:01').status).toBe(
      'INVALID',
    );
  });
  it('keeps date-only business fields as calendar dates and converts only explicit instants', () => {
    expect(formatVietnamDateValue('2026-10-01')).toBe('01/10/2026');
    expect(formatVietnamDateValue('2026-02-30')).toBe('—');
    expect(formatVietnamDateValue(moment)).toBe(display);
    expect(formatVietnamDateValue('2026-10-01 00:00:01')).toBe('—');
  });
  it('parses an explicit timestamp once for formatting and preserves the raw microseconds', () => {
    const parse = jest.spyOn(Date, 'parse');
    try {
      expect(formatVietnamDateTime(moment)).toBe(display);
      expect(parse).toHaveBeenCalledTimes(1);
      expect(parse).toHaveBeenCalledWith(moment);
    } finally {
      parse.mockRestore();
    }
  });
  it('all owner display adapters render one Vietnam instant without adding 7 hours twice', () => {
    expect(formatP04DateTime(moment)).toBe(display);
    expect(formatP04ScanTime(Date.parse(moment))).toBe('00:00:01');
    expect(p06Date(moment)).toBe(display);
    expect(p09Date(moment)).toBe(display);
    expect(notificationTime(moment)).toBe(display);
    expect(notificationShortTime(moment, Date.parse(moment))).toBe('00:00');
    expect(
      notificationShortTime(moment, Date.parse('2026-09-30T16:59:59Z')),
    ).toBe('01/10');
    expect(securityTime(moment)).toBe(display + ':01');
    // Server query timezone must not override the app's Vietnam display.
    expect(historyInstant(moment, 'UTC')).toBe(display + ':01');
    expect(historyInstant('2026-10-01 00:00:01')).toContain(
      'Múi giờ chưa xác minh',
    );
  });
  it('new outbound display names use Vietnam time without rewriting frozen requests', () => {
    expect(defaultOutboundName(new Date(moment))).toBe(
      'Phiếu xuất 00:00 01/10',
    );
  });
  it('does not change an explicitly zoned but incorrect BE instant to hide the P13 source defect', () => {
    const raw = '2026-10-20T13:49:36+00:00';
    expect(formatVietnamDateTime(raw, { seconds: true })).toBe(
      '20/10/2026 20:49:36',
    );
    expect(parseVietnamTimestamp(raw).raw).toBe(raw);
  });
  it('never adjusts the shared server clock from naive metadata or invalid dates', () => {
    resetServerClock();
    recordServerTime('2026-10-01 00:00:01', Date.parse(moment));
    expect(hasServerTime()).toBe(false);
    recordServerTime('2026-02-30T00:00:00Z', Date.parse(moment));
    expect(hasServerTime()).toBe(false);
    recordServerTime(
      '2026-10-01T00:00:01+07:00',
      Date.parse('2026-09-30T17:00:01Z'),
    );
    expect(hasServerTime()).toBe(true);
    expect(getClockSkewMs()).toBe(0);
    resetServerClock();
  });
});
