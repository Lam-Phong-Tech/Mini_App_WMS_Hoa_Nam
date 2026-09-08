/**
 * Kiểm chứng đủ 8 khả năng bắt buộc của parser Keyboard Wedge —
 * docs/migration/01-scanner-architecture-requirements.md §3.
 */

import {
  KeyboardWedgeParser,
  type WedgeParserConfig,
} from '../src/scanner/keyboardWedge';
import type { ScanDetectedResult } from '../src/scanner/types';

function makeParser(config: Partial<WedgeParserConfig> = {}) {
  const parser = new KeyboardWedgeParser(config);
  const results: ScanDetectedResult[] = [];
  parser.onScan(result => results.push(result));
  parser.setEnabled(true);
  return { parser, results };
}

describe('§3 mục 1 — suffix Enter', () => {
  it.each([
    ['\n', 'LF'],
    ['\r', 'CR'],
  ])('kết thúc chuỗi bằng %s (%s)', terminator => {
    const { parser, results } = makeParser({ suffixes: ['ENTER'] });
    parser.pushText('ABC123' + terminator);
    expect(results.map(r => r.code)).toEqual(['ABC123']);
  });

  it('CRLF chỉ sinh đúng một sự kiện', () => {
    const { parser, results } = makeParser({ suffixes: ['ENTER'] });
    parser.pushText('ABC123\r\n');
    expect(results).toHaveLength(1);
    expect(results[0].code).toBe('ABC123');
  });
});

describe('§3 mục 2 — suffix Tab', () => {
  it('nhận \\t là ký tự kết thúc', () => {
    const { parser, results } = makeParser({ suffixes: ['TAB'] });
    parser.pushText('SKU-9\t');
    expect(results.map(r => r.code)).toEqual(['SKU-9']);
  });
});

describe('§3 mục 3 — custom suffix cấu hình được', () => {
  it('dùng ký tự tuỳ chọn mà không sửa code', () => {
    const { parser, results } = makeParser({ suffixes: [{ custom: '#' }] });
    parser.pushText('LOT-77#');
    expect(results.map(r => r.code)).toEqual(['LOT-77']);
  });

  it('Enter KHÔNG kết thúc chuỗi khi suffix cấu hình là ký tự khác', () => {
    const { parser, results } = makeParser({ suffixes: [{ custom: '#' }] });
    parser.pushText('LOT-77\n');
    expect(results).toHaveLength(0);
  });
});

describe('§3 mục 4 — timeout kết thúc chuỗi cấu hình được', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('tự kết thúc sau N ms im lặng khi thiết bị không gửi suffix', () => {
    const { parser, results } = makeParser({
      suffixes: ['ENTER'],
      endOfScanTimeoutMs: 100,
    });
    parser.pushText('NO-SUFFIX');
    expect(results).toHaveLength(0);

    jest.advanceTimersByTime(100);
    expect(results.map(r => r.code)).toEqual(['NO-SUFFIX']);
  });

  it('timeout = 0 nghĩa là tắt', () => {
    const { parser, results } = makeParser({ endOfScanTimeoutMs: 0 });
    parser.pushText('NO-SUFFIX');
    jest.advanceTimersByTime(10000);
    expect(results).toHaveLength(0);
  });
});

describe('§3 mục 5 — loại ký tự điều khiển', () => {
  it('bỏ ký tự điều khiển khỏi mã kết quả', () => {
    const { parser, results } = makeParser({ suffixes: ['ENTER'] });
    parser.pushText('AB\x00C\x1F12\x7F3\n');
    expect(results[0].code).toBe('ABC123');
  });

  it('giữ nguyên ký tự in được ngoài ASCII', () => {
    const { parser, results } = makeParser({ suffixes: ['ENTER'] });
    parser.pushText('KHO-Đ1\n');
    expect(results[0].code).toBe('KHO-Đ1');
  });
});

describe('§3 mục 6 — chống xử lý hai lần', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('suffix và timeout không thể cùng phát một lần quét', () => {
    const { parser, results } = makeParser({
      suffixes: ['ENTER'],
      endOfScanTimeoutMs: 100,
    });
    parser.pushText('ONCE\n');
    jest.advanceTimersByTime(1000);
    expect(results).toHaveLength(1);
  });

  it('flush trên buffer rỗng không phát sự kiện', () => {
    const { parser, results } = makeParser();
    parser.flush();
    parser.flush();
    expect(results).toHaveLength(0);
  });

  it('cửa sổ chống trùng chặn mã giống nhau khi được bật', () => {
    const { parser, results } = makeParser({
      suffixes: ['ENTER'],
      dedupeWindowMs: 500,
    });
    parser.pushText('SAME\n', 1000);
    parser.pushText('SAME\n', 1200);
    expect(results).toHaveLength(1);

    parser.pushText('SAME\n', 1700);
    expect(results).toHaveLength(2);
  });

  it('mặc định KHÔNG chặn trùng — tránh lặp rủi ro R-06 của Mini App cũ', () => {
    const { parser, results } = makeParser({ suffixes: ['ENTER'] });
    parser.pushText('SKU-1\n', 1000);
    parser.pushText('SKU-1\n', 1010);
    expect(results).toHaveLength(2);
  });
});

describe('§3 mục 7 — buffer tuần tự', () => {
  it('gom đúng thứ tự khi ký tự đến rời rạc', () => {
    const { parser, results } = makeParser({ suffixes: ['ENTER'] });
    for (const character of 'A1B2C3') {
      parser.pushText(character);
    }
    parser.pushText('\n');
    expect(results[0].code).toBe('A1B2C3');
  });

  it('hai lần quét liên tiếp không trộn vào nhau', () => {
    const { parser, results } = makeParser({ suffixes: ['ENTER'] });
    parser.pushText('FIRST\nSECOND\n');
    expect(results.map(r => r.code)).toEqual(['FIRST', 'SECOND']);
  });
});

describe('§3 mục 8 — bật/tắt theo màn hình', () => {
  it('không nhận ký tự khi đang tắt', () => {
    const { parser, results } = makeParser({ suffixes: ['ENTER'] });
    parser.setEnabled(false);
    parser.pushText('IGNORED\n');
    expect(results).toHaveLength(0);
  });

  it('đổi trạng thái sẽ xoá buffer còn sót của màn trước', () => {
    const { parser, results } = makeParser({ suffixes: ['ENTER'] });
    parser.pushText('PARTIAL');
    expect(parser.peekBuffer()).toBe('PARTIAL');

    parser.setEnabled(false);
    parser.setEnabled(true);
    expect(parser.peekBuffer()).toBe('');

    parser.pushText('NEW\n');
    expect(results.map(r => r.code)).toEqual(['NEW']);
  });
});

describe('§4 mục 1 — nguồn quét phải phản ánh nguồn thật', () => {
  it('kết quả mang source KEYBOARD_WEDGE, không phải nhãn mặc định', () => {
    const { parser, results } = makeParser({ suffixes: ['ENTER'] });
    parser.pushText('X\n');
    expect(results[0].source).toBe('KEYBOARD_WEDGE');
  });
});

describe('minCodeLength', () => {
  it('bỏ qua chuỗi ngắn hơn ngưỡng', () => {
    const { parser, results } = makeParser({
      suffixes: ['ENTER'],
      minCodeLength: 4,
    });
    parser.pushText('AB\n');
    expect(results).toHaveLength(0);

    parser.pushText('ABCD\n');
    expect(results.map(r => r.code)).toEqual(['ABCD']);
  });
});
