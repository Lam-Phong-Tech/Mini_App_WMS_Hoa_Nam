/**
 * Kiểm chứng các tầng nền còn lại: logging an toàn, chuẩn hoá lỗi, storage,
 * cấu hình môi trường.
 */

import { createLogger, redact, REDACTED } from '../src/logging/logger';
import {
  AppError,
  extractErrorCode,
  extractErrorMessage,
  messageForUser,
  toAppError,
} from '../src/errors/AppError';
import { createMemoryBackend, createStorage } from '../src/storage/storage';
import {
  ENVIRONMENTS,
  getCurrentEnvironment,
  listEnvironments,
} from '../src/config/env';
import { BUILD_PROFILE } from '../src/config/buildProfile';

describe('logging an toàn', () => {
  it('che giá trị của khoá nhạy cảm', () => {
    const output = redact({
      Authorization: 'Bearer abc',
      password: '123456',
      api_key: 'k',
      username: 'thukho',
    }) as Record<string, unknown>;

    expect(output.Authorization).toBe(REDACTED);
    expect(output.password).toBe(REDACTED);
    expect(output.api_key).toBe(REDACTED);
    expect(output.username).toBe('thukho');
  });

  it('che khoá nhạy cảm ở tầng lồng bên trong', () => {
    const output = redact({ request: { headers: { token: 'secret' } } }) as {
      request: { headers: Record<string, unknown> };
    };
    expect(output.request.headers.token).toBe(REDACTED);
  });

  it('che query param nhạy cảm trong URL', () => {
    expect(redact('https://a.test/x?token=abc&page=2')).toBe(
      'https://a.test/x?token=' + REDACTED + '&page=2',
    );
  });

  it('không ghi log dưới ngưỡng', () => {
    const lines: string[] = [];
    const log = createLogger({
      minLevel: 'warn',
      sink: (level, message) => lines.push(level + ':' + message),
    });

    log.debug('bỏ qua');
    log.info('bỏ qua');
    log.warn('giữ lại');
    log.error('giữ lại');

    expect(lines).toEqual(['warn:giữ lại', 'error:giữ lại']);
  });

  it('context đi qua sink đã được che', () => {
    const captured: unknown[] = [];
    const log = createLogger({
      minLevel: 'debug',
      sink: (_level, _message, context) => captured.push(context),
    });

    log.debug('gửi', { headers: { Authorization: 'Bearer x' } });
    expect(captured[0]).toEqual({ headers: { Authorization: REDACTED } });
  });
});

describe('chuẩn hoá lỗi', () => {
  it('đọc mã lỗi theo cả ba dạng client đang gặp', () => {
    expect(extractErrorCode({ error_code: 'A' })).toBe('A');
    expect(extractErrorCode({ code: 'B' })).toBe('B');
    expect(extractErrorCode({ error: { code: 'C' } })).toBe('C');
    expect(extractErrorCode({})).toBeUndefined();
    expect(extractErrorCode(null)).toBeUndefined();
  });

  it('đọc thông điệp lỗi theo nhiều dạng', () => {
    expect(extractErrorMessage({ message: 'M' })).toBe('M');
    expect(extractErrorMessage({ error: { message: 'N' } })).toBe('N');
    expect(extractErrorMessage({ error: 'O' })).toBe('O');
    expect(extractErrorMessage({})).toBeUndefined();
  });

  it('AbortError thành kind cancelled', () => {
    const error = new Error('x');
    error.name = 'AbortError';
    expect(toAppError(error).kind).toBe('cancelled');
  });

  it('giữ nguyên AppError sẵn có', () => {
    const original = new AppError({ kind: 'network', message: 'x' });
    expect(toAppError(original)).toBe(original);
  });

  it('mọi kind đều có thông điệp tiếng Việt cho người dùng', () => {
    const kinds = [
      'network',
      'timeout',
      'cancelled',
      'http',
      'parse',
      'auth',
      'config',
      'unknown',
    ] as const;

    for (const kind of kinds) {
      const message = messageForUser(new AppError({ kind, message: 'gốc' }));
      expect(message.length).toBeGreaterThan(0);
    }
  });

  it('blocked_by_gate giữ nguyên lý do để người vận hành biết Gate nào chặn', () => {
    const message = messageForUser(
      new AppError({
        kind: 'blocked_by_gate',
        message: 'Bị chặn bởi Gate WMS',
      }),
    );
    expect(message).toBe('Bị chặn bởi Gate WMS');
  });
});

describe('storage', () => {
  it('đọc ghi được chuỗi, số, boolean và object', () => {
    const storage = createStorage(createMemoryBackend());

    storage.setString('s', 'giá trị');
    storage.setNumber('n', 42);
    storage.setBoolean('b', true);
    storage.setObject('o', { a: 1 });

    expect(storage.getString('s')).toBe('giá trị');
    expect(storage.getNumber('n')).toBe(42);
    expect(storage.getBoolean('b')).toBe(true);
    expect(storage.getObject('o')).toEqual({ a: 1 });
  });

  it('khoá chưa có trả undefined', () => {
    const storage = createStorage(createMemoryBackend());
    expect(storage.getString('x')).toBeUndefined();
    expect(storage.getNumber('x')).toBeUndefined();
    expect(storage.getBoolean('x')).toBeUndefined();
    expect(storage.getObject('x')).toBeUndefined();
  });

  it('JSON hỏng thì coi như chưa có, không ném lỗi', () => {
    const storage = createStorage(
      createMemoryBackend({ o: 'không-phải-json' }),
    );
    expect(storage.getObject('o')).toBeUndefined();
  });

  it('xoá và kiểm tra tồn tại', () => {
    const storage = createStorage(createMemoryBackend());
    storage.setString('k', 'v');
    expect(storage.has('k')).toBe(true);

    storage.remove('k');
    expect(storage.has('k')).toBe(false);
    expect(storage.keys()).toEqual([]);
  });
});

describe('cấu hình môi trường', () => {
  it('KHÔNG môi trường nào bật cờ mở toàn bộ 175 endpoint ghi', () => {
    // Người dùng duyệt BA thao tác nhập kho, không duyệt 175 cái. Bật cờ này sẽ
    // mở cả `DELETE /api/v1/roles/{id}`. Đường đi hợp lệ là danh sách trắng ở
    // `api/writeGate.ts`, không phải cờ môi trường.
    for (const environment of listEnvironments()) {
      expect(environment.wmsGateApproved).toBe(false);
    }
  });

  it('lớp môi trường ĐÃ được xác minh bằng bằng chứng hạ tầng', () => {
    // 🔧 2026-09-06: mục 3 Gate WMS đóng. Hạ tầng cung cấp bảng tách tier ở
    // cổng Nginx, stack và database — không còn phải suy luận từ tên miền.
    for (const environment of listEnvironments()) {
      expect(environment.environmentClassVerified).toBe(true);
    }
  });

  it('đúng HAI môi trường, khớp bảng hạ tầng', () => {
    expect(listEnvironments().map(item => item.name).sort()).toEqual([
      'customer-production',
      'dev-test',
    ]);
    expect(ENVIRONMENTS['dev-test'].apiBaseUrl).toBe(
      'https://khohoanamdev.lptech.info.vn',
    );
    expect(ENVIRONMENTS['customer-production'].apiBaseUrl).toBe(
      'https://khohoanamdev.bigk.click',
    );
  });

  it('🔒 KHÔNG có đường nào đổi môi trường lúc chạy', () => {
    // Mục 6: "Không dùng menu/toggle đổi URL trong app." `setCurrentEnvironment`
    // đã bị XOÁ chứ không chỉ ẩn — còn hàm là còn đường gọi.
    const module = require('../src/config/env') as Record<string, unknown>;
    expect(module.setCurrentEnvironment).toBeUndefined();
  });

  it('môi trường suy ra từ build profile, không từ storage', () => {
    expect(getCurrentEnvironment().name).toBe(BUILD_PROFILE);
    expect(getCurrentEnvironment().expectedTier).toBe(BUILD_PROFILE);
  });

  it('🔒 nhánh chính mặc định là DEV/TEST, không phải kho khách hàng', () => {
    // Nếu ai đó quên hoàn nguyên sau khi cắt bản Customer, test này đỏ.
    expect(BUILD_PROFILE).toBe('dev-test');
  });
});
