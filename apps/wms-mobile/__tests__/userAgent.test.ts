/**
 * User-Agent và phân biệt 403-Cloudflare với 401-ứng dụng.
 *
 * Bối cảnh: quản trị hạ tầng cấu hình Cloudflare ngày 2026-09-05 để cho qua
 * request có `User-Agent` **bắt đầu bằng** `WMSHoaNam-Android/` trên
 * `khohoanamdev.bigk.click`.
 *
 * ⚠️ **Hai điểm trong mô tả của hạ tầng KHÔNG khớp phép đo cùng ngày:**
 *
 * 1. Họ nói client ngoài allowlist nhận `403` kèm `Cf-Mitigated: challenge`.
 *    Đo thật: 403 **không mang** header đó. Dấu hiệu thật là thân JSON
 *    `error_code: 1010` (kiểu **số**) + `error_name` + `ray_id`.
 * 2. Họ nói rule chặn mọi client ngoài allowlist. Đo thật: `okhttp`, `curl`,
 *    UA trình duyệt và cả **chuỗi rỗng** đều qua được; chỉ `Python-urllib` và
 *    *không gửi UA* bị chặn.
 *
 * Fixture dưới đây lấy nguyên văn từ phép đo, không lấy từ mô tả.
 *
 * ⚠️ Test trong tệp này bảo vệ **một hợp đồng với hạ tầng bên ngoài**, không
 * phải một chi tiết nội bộ. Test đỏ ở đây nghĩa là app sắp bị chặn 403 toàn bộ
 * ngay khi cài lên máy thủ kho — triệu chứng trông y hệt lỗi đăng nhập.
 */

import {
  APP_REQUEST_ID_HEADER,
  APP_VERSION,
  EDGE_MITIGATED_HEADER,
  USER_AGENT,
  USER_AGENT_PREFIX,
  isEdgeBlocked,
} from '../src/api/userAgent';
import { AppError, messageForUser } from '../src/errors/AppError';
import { createApiClient } from '../src/api/client';
import type { AppEnvironment } from '../src/config/env';
import { ENVIRONMENTS } from '../src/config/env';

declare const __dirname: string;

const environment: AppEnvironment = {
  name: 'dev-test',
  label: 'thử',
  apiBaseUrl: 'https://example.invalid',
  requestTimeoutMs: 1000,
  expectedTier: 'dev-test',
  environmentClassVerified: false,
  wmsGateApproved: false,
  behindEdgeProxy: false,
};

const silentLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

describe('User-Agent — chuỗi Cloudflare đang allowlist', () => {
  it('giữ đúng tiền tố quản trị đã cấu hình', () => {
    // Đổi tiền tố này = app 403 toàn bộ trên production. Chỉ đổi sau khi quản
    // trị Cloudflare cập nhật rule trước.
    expect(USER_AGENT_PREFIX).toBe('WMSHoaNam-Android/');
    expect(USER_AGENT.startsWith(USER_AGENT_PREFIX)).toBe(true);
  });

  it('có phần phiên bản sau dấu gạch chéo', () => {
    expect(USER_AGENT).toBe('WMSHoaNam-Android/' + APP_VERSION);
    expect(APP_VERSION.length).toBeGreaterThan(0);
  });

  it('khớp versionName trong build.gradle — hai nơi không được lệch', () => {
    const fs = require('fs');

    const path = require('path');
    const gradle = fs.readFileSync(
      path.join(__dirname, '..', 'android', 'app', 'build.gradle'),
      'utf8',
    );
    const match = /versionName\s+"([^"]+)"/.exec(gradle);
    expect(match).not.toBeNull();
    expect(APP_VERSION).toBe(match?.[1]);
  });
});

describe('client gắn User-Agent vào mọi request', () => {
  it('gửi đúng chuỗi đã allowlist', async () => {
    let seen: Record<string, string> | undefined;
    const client = createApiClient({
      environment,
      log: silentLogger,
      fetchImpl: (async (
        _url: string,
        init: { headers: Record<string, string> },
      ) => {
        seen = init.headers;
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ data: {}, meta: {} }),
        };
      }) as never,
      getSession: () => undefined,
    });

    await client.get('/x');
    expect(seen?.['User-Agent']).toBe(USER_AGENT);
  });

  it('bên gọi KHÔNG ghi đè được — allowlist phụ thuộc chuỗi này', async () => {
    let seen: Record<string, string> | undefined;
    const client = createApiClient({
      environment,
      log: silentLogger,
      fetchImpl: (async (
        _url: string,
        init: { headers: Record<string, string> },
      ) => {
        seen = init.headers;
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ data: {}, meta: {} }),
        };
      }) as never,
      getSession: () => undefined,
    });

    await client.get('/x', { headers: { 'User-Agent': 'curl/8.0' } });
    expect(seen?.['User-Agent']).toBe(USER_AGENT);
  });
});

describe('403 của Cloudflare KHÁC 403/401 của ứng dụng', () => {
  function headersWith(map: Record<string, string>) {
    return { get: (name: string) => map[name.toLowerCase()] ?? null };
  }

  /**
   * Nguyên văn thân phản hồi 403 đo được trên production 2026-09-05
   * (UA `Python-urllib/3.12`). Rút gọn, giữ đúng KIỂU của từng trường.
   */
  const REAL_CLOUDFLARE_403 = {
    title: 'Error 1010: Access denied',
    status: 403,
    detail:
      "The site owner has blocked access based on your browser's signature.",
    error_code: 1010,
    error_name: 'browser_signature_banned',
    error_category: 'access_denied',
    ray_id: 'a3655321af89fe05',
  };

  /** Header thật của phản hồi đó: KHÔNG có Cf-Mitigated, KHÔNG có x-request-id. */
  const REAL_CLOUDFLARE_HEADERS = headersWith({
    'cf-ray': 'a3655321af89fe05-SIN',
    server: 'cloudflare',
    'content-type': 'application/json; charset=utf-8',
  });

  /** 403 do CHÍNH ứng dụng trả (ví dụ thủ kho gọi endpoint PII). */
  const APP_403_BODY = {
    success: false,
    error_code: 'FORBIDDEN',
    message: 'Không có quyền.',
    meta: { request_id: '43dd8342-8216-456b-b6ae-f572e1e116ea' },
  };
  const APP_HEADERS = headersWith({
    'x-request-id': '43dd8342-8216-456b-b6ae-f572e1e116ea',
    'x-powered-by': 'PHP/8.3.33',
    server: 'cloudflare',
  });

  it('nhận ra 403 THẬT của Cloudflare — dù KHÔNG có header Cf-Mitigated', () => {
    // Quản trị hạ tầng mô tả dấu hiệu là `Cf-Mitigated: challenge`. Đo thật trên
    // chính production thì header đó KHÔNG có. Nếu chỉ dựa vào nó, app sẽ hiểu
    // nhầm 403 của Cloudflare thành lỗi ứng dụng và báo sai cho thủ kho.
    expect(REAL_CLOUDFLARE_HEADERS.get('cf-mitigated')).toBeNull();
    expect(
      isEdgeBlocked(403, REAL_CLOUDFLARE_HEADERS, REAL_CLOUDFLARE_403),
    ).toBe(true);
  });

  it('phân biệt bằng KIỂU của error_code: Cloudflare số, ứng dụng chuỗi', () => {
    expect(typeof REAL_CLOUDFLARE_403.error_code).toBe('number');
    expect(typeof APP_403_BODY.error_code).toBe('string');
  });

  it('403 của CHÍNH ứng dụng KHÔNG bị nhầm thành chặn ở biên', () => {
    // Nhầm thì bảo thủ kho gọi quản trị hạ tầng một cách vô ích, trong khi thật
    // ra họ chỉ thiếu quyền.
    expect(isEdgeBlocked(403, APP_HEADERS, APP_403_BODY)).toBe(false);
  });

  it('vẫn nhận ra khi Cloudflare trả HTML thay vì JSON', () => {
    // Không đọc được thân, nhưng vắng x-request-id đủ để biết ứng dụng không
    // đứng sau phản hồi này.
    expect(isEdgeBlocked(403, REAL_CLOUDFLARE_HEADERS, undefined)).toBe(true);
  });

  it('vẫn nhận ra qua Cf-Mitigated nếu Cloudflare có gắn', () => {
    expect(
      isEdgeBlocked(403, headersWith({ 'cf-mitigated': 'challenge' }), {}),
    ).toBe(true);
  });

  it('status khác 403 thì không bao giờ là chặn ở biên', () => {
    for (const status of [200, 401, 429, 500, 503]) {
      expect(
        isEdgeBlocked(status, REAL_CLOUDFLARE_HEADERS, REAL_CLOUDFLARE_403),
      ).toBe(false);
    }
  });

  it('client dựng kind blocked_by_edge, không phải http', async () => {
    const client = createApiClient({
      environment,
      log: silentLogger,
      fetchImpl: (async () => ({
        ok: false,
        status: 403,
        headers: REAL_CLOUDFLARE_HEADERS,
        text: async () => JSON.stringify(REAL_CLOUDFLARE_403),
      })) as never,
      getSession: () => undefined,
    });

    await expect(client.get('/x')).rejects.toMatchObject({
      kind: 'blocked_by_edge',
      status: 403,
    });
  });

  it('thông điệp KHÔNG bảo thủ kho đăng nhập lại — đăng nhập không cứu được', () => {
    const shown = messageForUser(
      new AppError({ kind: 'blocked_by_edge', status: 403, message: 'chặn' }),
    );
    expect(shown).not.toContain('đăng nhập lại');
    expect(shown).toContain('quản trị');
  });

  it('hằng số tên header giữ đúng dạng viết thường', () => {
    expect(EDGE_MITIGATED_HEADER).toBe('cf-mitigated');
    expect(APP_REQUEST_ID_HEADER).toBe('x-request-id');
  });
});

describe('môi trường — đã xác minh bằng bằng chứng hạ tầng (2026-09-06)', () => {
  it('hai tier tách nhau, mỗi tier một host', () => {
    // Trước đây mục 3 Gate WMS bỏ ngỏ vì ba lời khai mâu thuẫn. Nay hạ tầng
    // cung cấp bảng tách theo cổng Nginx + stack + database.
    expect(ENVIRONMENTS['dev-test'].apiBaseUrl).toBe(
      'https://khohoanamdev.lptech.info.vn',
    );
    expect(ENVIRONMENTS['customer-production'].apiBaseUrl).toBe(
      'https://khohoanamdev.bigk.click',
    );
  });

  it('chỉ host qua Cloudflare mới đánh dấu behindEdgeProxy', () => {
    // Người dùng xác nhận: "lptech.info.vn không qua Cloudflare".
    expect(ENVIRONMENTS['dev-test'].behindEdgeProxy).toBe(false);
    expect(ENVIRONMENTS['customer-production'].behindEdgeProxy).toBe(true);
  });

  it('không môi trường nào được bật cờ mở toàn bộ endpoint ghi', () => {
    expect(ENVIRONMENTS['dev-test'].wmsGateApproved).toBe(false);
    expect(ENVIRONMENTS['customer-production'].wmsGateApproved).toBe(false);
  });

  it('host origin trực tiếp là host mà contract test đã chạy vào', () => {
    expect(ENVIRONMENTS['dev-test'].apiBaseUrl).toBe(
      'https://khohoanamdev.lptech.info.vn',
    );
  });
});
