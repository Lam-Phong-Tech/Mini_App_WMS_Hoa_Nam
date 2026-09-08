/**
 * Kiểm chứng API client, đặc biệt là ba lệnh cấm của GATE_01 §11 được cưỡng chế
 * bằng code chứ không bằng kỷ luật.
 */

import {
  assertNoForbiddenHeaders,
  buildUrl,
  createApiClient,
} from '../src/api/client';
import {
  allowsIfMatch,
  approvedWriteFor,
} from '../src/api/writeGate';
import { AppError } from '../src/errors/AppError';
import type { AppEnvironment } from '../src/config/env';
import {
  clearSession,
  getSession,
  setSession,
} from '../src/auth/session';
import { resetRefreshState } from '../src/auth/tokenRefresh';
import { hasServerTime, resetServerClock } from '../src/auth/serverClock';
import {
  createMemoryBackend,
  createStorage,
  setAppStorageForTesting,
} from '../src/storage/storage';

const blockedEnvironment: AppEnvironment = {
  name: 'dev-test',
  label: 'Môi trường thử',
  apiBaseUrl: 'https://example.invalid',
  requestTimeoutMs: 1000,
  expectedTier: 'dev-test',
  environmentClassVerified: false,
  wmsGateApproved: false,
  behindEdgeProxy: false,
};

const approvedEnvironment: AppEnvironment = {
  ...blockedEnvironment,
  label: 'Môi trường đã qua Gate',
  wmsGateApproved: true,
};

const silentLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => (body === undefined ? '' : JSON.stringify(body)),
  };
}

function clientWith(
  environment: AppEnvironment,
  fetchImpl: unknown,
  session?: { accessToken: string },
) {
  return createApiClient({
    environment,
    fetchImpl: fetchImpl as typeof fetch,
    log: silentLogger,
    getSession: () => session as never,
  });
}

describe('buildUrl', () => {
  it('ghép base và path, chuẩn hoá dấu gạch chéo', () => {
    expect(buildUrl('https://a.test/', '/v1/x')).toBe('https://a.test/v1/x');
    expect(buildUrl('https://a.test', 'v1/x')).toBe('https://a.test/v1/x');
  });

  it('nối query và bỏ giá trị undefined', () => {
    const url = buildUrl('https://a.test', '/v1/x', {
      page: 2,
      q: 'kho hàng',
      skip: undefined,
    });
    expect(url).toBe('https://a.test/v1/x?page=2&q=kho%20h%C3%A0ng');
  });
});

describe('GATE_01 §11 rule 6 — cấm header Idempotency-Key', () => {
  it('assertNoForbiddenHeaders ném lỗi blocked_by_gate', () => {
    expect(() =>
      assertNoForbiddenHeaders({ 'Idempotency-Key': 'abc' }),
    ).toThrow(AppError);
  });

  it('không phân biệt hoa thường', () => {
    let captured: AppError | undefined;
    try {
      assertNoForbiddenHeaders({ 'idempotency-key': 'abc' });
    } catch (error) {
      captured = error as AppError;
    }
    expect(captured?.kind).toBe('blocked_by_gate');
  });

  it('header thường thì cho qua', () => {
    expect(() =>
      assertNoForbiddenHeaders({ Accept: 'application/json' }),
    ).not.toThrow();
  });
});

describe('GATE_01 §11 rule 4 — chặn mutation khi Gate WMS chưa PASS', () => {
  it.each(['POST', 'PUT', 'PATCH', 'DELETE'] as const)(
    'chặn %s và không hề gọi fetch',
    async method => {
      const fetchSpy = jest.fn();
      const client = clientWith(blockedEnvironment, fetchSpy);

      await expect(
        client.request({ method, path: '/x' }),
      ).rejects.toMatchObject({
        kind: 'blocked_by_gate',
      });
      expect(fetchSpy).not.toHaveBeenCalled();
    },
  );

  it('GET vẫn đi qua bình thường', async () => {
    const fetchSpy = jest.fn(async () => jsonResponse(200, { ok: true }));
    const client = clientWith(blockedEnvironment, fetchSpy);

    const response = await client.get<{ ok: boolean }>('/x');
    expect(response.status).toBe(200);
    expect(response.data).toEqual({ ok: true });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('cho phép mutation khi môi trường đã qua Gate', async () => {
    const fetchSpy = jest.fn(async () => jsonResponse(201, { id: 1 }));
    const client = clientWith(approvedEnvironment, fetchSpy);

    const response = await client.request({
      method: 'POST',
      path: '/x',
      body: { a: 1 },
    });
    expect(response.status).toBe(201);
  });
});

describe('không tự retry', () => {
  it('lỗi mạng chỉ gọi fetch đúng một lần', async () => {
    const fetchSpy = jest.fn(async () => {
      throw new Error('mạng hỏng');
    });
    const client = clientWith(blockedEnvironment, fetchSpy);

    await expect(client.get('/x')).rejects.toMatchObject({ kind: 'network' });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

describe('môi trường chưa cấu hình', () => {
  it('báo lỗi config thay vì gọi URL rỗng', async () => {
    const fetchSpy = jest.fn();
    const client = clientWith(
      { ...blockedEnvironment, apiBaseUrl: '' },
      fetchSpy,
    );

    await expect(client.get('/x')).rejects.toMatchObject({ kind: 'config' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('phân tích lỗi từ server', () => {
  it('401 thành kind auth', async () => {
    const client = clientWith(blockedEnvironment, async () =>
      jsonResponse(401, { message: 'hết hạn' }),
    );
    await expect(client.get('/x')).rejects.toMatchObject({
      kind: 'auth',
      status: 401,
    });
  });

  it.each([
    [{ error_code: 'E1' }, 'E1'],
    [{ code: 'E2' }, 'E2'],
    [{ error: { code: 'E3' } }, 'E3'],
  ])('đọc được mã lỗi từ %p', async (body, expected) => {
    const client = clientWith(blockedEnvironment, async () =>
      jsonResponse(400, body),
    );
    await expect(client.get('/x')).rejects.toMatchObject({ code: expected });
  });

  it('giữ error_code, route và request ID của 409 để đối chiếu WMS', async () => {
    const client = clientWith(approvedEnvironment, async () => ({
      ok: false,
      status: 409,
      headers: { get: (name: string) => (name === 'x-request-id' ? 'req-409-01' : null) },
      text: async () =>
        JSON.stringify({
          error_code: 'DUPLICATE_ITEM_IN_BATCH',
          message: 'Một ITEM xuất hiện hai lần trong lô.',
        }),
    }));

    await expect(
      client.request({ method: 'POST', path: '/api/v1/mini-app/inbound/record' }),
    ).rejects.toMatchObject({
      kind: 'http',
      status: 409,
      code: 'DUPLICATE_ITEM_IN_BATCH',
      route: '/api/v1/mini-app/inbound/record',
      requestId: 'req-409-01',
    });
  });

  it('phản hồi 200 không phải JSON thành kind parse', async () => {
    const client = clientWith(blockedEnvironment, async () => ({
      ok: true,
      status: 200,
      text: async () => 'không-phải-json',
    }));
    await expect(client.get('/x')).rejects.toMatchObject({ kind: 'parse' });
  });
});

describe('phiên đăng nhập', () => {
  it('gắn Authorization khi có phiên', async () => {
    const fetchSpy = jest.fn(async (_url: string, _init: RequestInit) =>
      jsonResponse(200, {}),
    );
    const client = clientWith(blockedEnvironment, fetchSpy, {
      accessToken: 'T0K3N',
    });

    await client.get('/x');
    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe(
      'Bearer T0K3N',
    );
  });

  it('không gắn Authorization khi chưa đăng nhập', async () => {
    const fetchSpy = jest.fn(async (_url: string, _init: RequestInit) =>
      jsonResponse(200, {}),
    );
    const client = clientWith(blockedEnvironment, fetchSpy, undefined);

    await client.get('/x');
    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    expect(
      (init.headers as Record<string, string>).Authorization,
    ).toBeUndefined();
  });
});

describe('timeout và huỷ', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  const abortingFetch = async (_url: string, init: RequestInit) =>
    new Promise((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => {
        const error = new Error('aborted');
        error.name = 'AbortError';
        reject(error);
      });
    });

  it('hết thời gian chờ thành kind timeout', async () => {
    const client = clientWith(blockedEnvironment, abortingFetch);
    const promise = client.get('/x', { timeoutMs: 500 });

    // Đẩy đồng hồ trước khi await: bộ đếm nội bộ sẽ abort và promise bị từ chối.
    jest.advanceTimersByTime(500);

    await expect(promise).rejects.toMatchObject({ kind: 'timeout' });
  });

  it('bên gọi huỷ thì thành kind cancelled', async () => {
    const client = clientWith(blockedEnvironment, abortingFetch);
    const controller = new AbortController();
    const promise = client.get('/x', {
      signal: controller.signal,
      timeoutMs: 9999,
    });

    controller.abort();

    await expect(promise).rejects.toMatchObject({ kind: 'cancelled' });
  });
});

// ---------------------------------------------------------------------------
// Ràng buộc 2 của người dùng (2026-09-05): 401 → gia hạn MỘT lượt → gửi lại MỘT lần
// ---------------------------------------------------------------------------

describe('401 → gia hạn ngầm rồi gửi lại đúng một lần', () => {
  const TTL_SEC = 3600;

  function refreshOk() {
    return {
      data: {
        access_token: 'access-moi',
        refresh_token: 'refresh-moi',
        expires_in: TTL_SEC,
      },
      meta: { timestamp: new Date().toISOString() },
    };
  }

  const unauthorized = {
    success: false,
    error_code: 'UNAUTHENTICATED',
    message: 'Chưa đăng nhập hoặc phiên đăng nhập đã hết hạn.',
  };

  beforeEach(() => {
    setAppStorageForTesting(createStorage(createMemoryBackend()));
    resetRefreshState();
    resetServerClock();
    setSession({ accessToken: 'cu', refreshToken: 'refresh-cu' });
  });

  afterEach(() => {
    clearSession();
  });

  it('gặp 401 thì gia hạn rồi gửi lại, thủ kho không thấy màn đăng nhập', async () => {
    const calls: string[] = [];
    const fetchImpl = async (url: string) => {
      calls.push(url);
      if (url.endsWith('/api/v1/auth/refresh')) {
        return jsonResponse(200, refreshOk());
      }
      // Lượt đầu 401, lượt sau (đã có token mới) thì 200.
      return calls.filter((c) => c.endsWith('/x')).length === 1
        ? jsonResponse(401, unauthorized)
        : jsonResponse(200, { data: { ok: true }, meta: {} });
    };

    const client = clientWith(blockedEnvironment, fetchImpl, {
      accessToken: 'cu',
    });
    const result = await client.get('/x');

    expect(result.status).toBe(200);
    expect(calls).toEqual([
      'https://example.invalid/x',
      'https://example.invalid/api/v1/auth/refresh',
      'https://example.invalid/x',
    ]);
    expect(getSession()?.accessToken).toBe('access-moi');
  });

  it('gia hạn xong vẫn 401 thì DỪNG — không lặp vô hạn', async () => {
    let refreshCount = 0;
    const fetchImpl = async (url: string) => {
      if (url.endsWith('/api/v1/auth/refresh')) {
        refreshCount += 1;
        return jsonResponse(200, refreshOk());
      }
      return jsonResponse(401, unauthorized);
    };

    const client = clientWith(blockedEnvironment, fetchImpl, {
      accessToken: 'cu',
    });

    await expect(client.get('/x')).rejects.toMatchObject({ kind: 'auth' });
    // Đúng MỘT lượt gia hạn. Nhiều hơn là replay ⇒ máy chủ huỷ sạch phiên.
    expect(refreshCount).toBe(1);
  });

  it('phiên không có refresh token thì 401 nổi thẳng lên, không gọi gia hạn', async () => {
    setSession({ accessToken: 'cu' });
    let refreshCalled = false;
    const fetchImpl = async (url: string) => {
      if (url.endsWith('/auth/refresh')) {
        refreshCalled = true;
      }
      return jsonResponse(401, unauthorized);
    };

    const client = clientWith(blockedEnvironment, fetchImpl, {
      accessToken: 'cu',
    });
    await expect(client.get('/x')).rejects.toMatchObject({ kind: 'auth' });
    expect(refreshCalled).toBe(false);
  });

  it('KHÔNG tự gửi lại request GHI — 401 sau khi đã tới máy chủ là mơ hồ', async () => {
    // Một POST nhận 401 không chứng minh được là chưa được xử lý. Tự gửi lại
    // là cách tạo phiếu trùng. Đây đúng là ranh giới pending/unknown của outbox.
    const approved = { ...approvedEnvironment };
    let posts = 0;
    const fetchImpl = async (url: string) => {
      if (url.endsWith('/api/v1/auth/refresh')) {
        return jsonResponse(200, refreshOk());
      }
      posts += 1;
      return jsonResponse(401, unauthorized);
    };

    const client = clientWith(approved, fetchImpl, { accessToken: 'cu' });
    await expect(
      client.request({ path: '/ghi', method: 'POST', body: {} }),
    ).rejects.toMatchObject({ kind: 'auth' });
    expect(posts).toBe(1);
  });

  it('chính lời gọi gia hạn bị 401 thì không tự gia hạn tiếp', async () => {
    let refreshCount = 0;
    const fetchImpl = async (url: string) => {
      if (url.endsWith('/api/v1/auth/refresh')) {
        refreshCount += 1;
        return jsonResponse(401, unauthorized);
      }
      return jsonResponse(401, unauthorized);
    };

    const client = clientWith(blockedEnvironment, fetchImpl, {
      accessToken: 'cu',
    });
    await expect(client.get('/x')).rejects.toMatchObject({ kind: 'auth' });
    expect(refreshCount).toBe(1);
  });

  it('ghi nhận giờ máy chủ từ phản hồi, kể cả phản hồi lỗi', async () => {
    const serverIso = new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString();
    const fetchImpl = async () =>
      jsonResponse(500, { ...unauthorized, meta: { timestamp: serverIso } });

    const client = clientWith(blockedEnvironment, fetchImpl, {
      accessToken: 'cu',
    });
    await expect(client.get('/x')).rejects.toMatchObject({ kind: 'http' });
    expect(hasServerTime()).toBe(true);
  });
});

describe('POST tới đường auth vẫn qua được cổng chặn ghi', () => {
  it('POST /api/v1/auth/refresh KHÔNG bị blocked_by_gate', async () => {
    setAppStorageForTesting(createStorage(createMemoryBackend()));
    const client = clientWith(blockedEnvironment, async () =>
      jsonResponse(200, { data: {}, meta: {} }),
    );
    await expect(
      client.request({ path: '/api/v1/auth/refresh', method: 'POST', body: {} }),
    ).resolves.toMatchObject({ status: 200 });
  });

  it('POST tới endpoint nghiệp vụ VẪN bị chặn', async () => {
    const client = clientWith(blockedEnvironment, async () =>
      jsonResponse(200, {}),
    );
    await expect(
      client.request({
        path: '/api/v1/mini-app/inbound-documents',
        method: 'POST',
        body: {},
      }),
    ).rejects.toMatchObject({ kind: 'blocked_by_gate' });
  });
});

/**
 * 🔓 `GATE_WMS §2e` — cổng ghi HẸP, duyệt ngày 2026-09-06.
 *
 * Người dùng duyệt **A và B**, trả lời rõ *"chưa duyệt C"*. Bộ test này là chỗ
 * biến câu trả lời ấy thành ràng buộc chạy được: nếu ai đó (kể cả tôi ở phiên
 * sau) thêm `post-receipt` hay `If-Match` mà không có Change Control mới, những
 * test dưới đây phải đỏ.
 *
 * `post-receipt` là lệnh **tăng tồn kho thật**. Nó xứng đáng có test riêng canh,
 * chứ không chỉ một dòng ghi chú trong tệp nguồn.
 */
describe('GATE_WMS §2e–§2h — cổng ghi hẹp', () => {
  const RESOLVE = '/api/v1/mini-app/inbound/resolve-code';
  const RECORD = '/api/v1/mini-app/inbound/record';
  // Đường dẫn THẬT lấy từ spec (`03-api-mapping.md`), có `{id}`. Test canh sai
  // đường thì không canh được gì — nên phải là đúng đường endpoint tăng tồn.
  //
  // 🔓 Từ `§2f` đường này ĐƯỢC duyệt. Điều còn phải canh không còn là "có bị
  // chặn không" mà là "khớp có đúng chỗ không": mọi `{id}` hợp lệ phải qua, và
  // mọi biến thể đi ngược thư mục phải chặn.
  const POST_RECEIPT = '/api/v1/mini-app/inbound-documents/9/post-receipt';

  function okClient() {
    return clientWith(blockedEnvironment, async () =>
      jsonResponse(200, { data: {}, meta: {} }),
    );
  }

  describe('hai thao tác ĐƯỢC duyệt', () => {
    it('POST resolve-code qua được cổng dù Gate WMS chưa PASS', async () => {
      await expect(
        okClient().request({ path: RESOLVE, method: 'POST', body: {} }),
      ).resolves.toMatchObject({ status: 200 });
    });

    it('POST record qua được cổng dù Gate WMS chưa PASS', async () => {
      await expect(
        okClient().request({ path: RECORD, method: 'POST', body: {} }),
      ).resolves.toMatchObject({ status: 200 });
    });

    it('query string không đổi danh tính endpoint', () => {
      expect(approvedWriteFor('POST', RECORD + '?debug=1')).toBe(
        'inbound.record',
      );
    });
  });

  describe('post-receipt — duyệt ở §2f, khớp theo TỪNG ĐOẠN', () => {
    it('POST post-receipt qua được cổng', async () => {
      await expect(
        okClient().request({ path: POST_RECEIPT, method: 'POST', body: {} }),
      ).resolves.toMatchObject({ status: 200 });
    });

    it.each([
      '/api/v1/mini-app/inbound-documents/1/post-receipt',
      '/api/v1/mini-app/inbound-documents/9999/post-receipt',
      '/api/v1/mini-app/inbound-documents/abc-123/post-receipt',
    ])('nhận mọi {id} hợp lệ: %s', path => {
      expect(approvedWriteFor('POST', path)).toBe('inbound.postReceipt');
    });

    it.each([
      // 🔒 Chống đi ngược thư mục. Một trong các đường này mà lọt thì cổng sẽ
      // ký duyệt cho đúng thứ nó sinh ra để chặn.
      '/api/v1/mini-app/inbound-documents/../roles/post-receipt',
      '/api/v1/mini-app/inbound-documents/./post-receipt',
      // Thiếu đoạn {id} ⇒ số đoạn không khớp.
      '/api/v1/mini-app/inbound-documents/post-receipt',
      // Thừa đoạn.
      '/api/v1/mini-app/inbound-documents/1/2/post-receipt',
      // Sai đoạn cuối.
      '/api/v1/mini-app/inbound-documents/1/post-issue',
      // Sai đoạn giữa — đây là đường XUẤT kho, chưa ai duyệt.
      '/api/v1/mini-app/outbound-documents/1/post-receipt',
    ])('CHẶN %s', path => {
      expect(approvedWriteFor('POST', path)).toBeUndefined();
    });

    it('vẫn khoá theo method — chỉ POST', () => {
      expect(approvedWriteFor('DELETE', POST_RECEIPT)).toBeUndefined();
      expect(approvedWriteFor('PATCH', POST_RECEIPT)).toBeUndefined();
    });

    it('được kèm CẢ Idempotency-Key lẫn If-Match', () => {
      expect(() =>
        assertNoForbiddenHeaders(
          { 'Idempotency-Key': 'wmshn-x', 'If-Match': '7' },
          POST_RECEIPT,
          'POST',
        ),
      ).not.toThrow();
    });
  });

  describe('method cũng phải khớp, không chỉ đường dẫn', () => {
    // Thứ được duyệt là hai thao tác POST. DELETE lên cùng đường dẫn là thao
    // tác KHÁC, hậu quả khác, và chưa ai duyệt nó.
    it.each(['DELETE', 'PUT', 'PATCH'] as const)(
      '%s tới record vẫn bị chặn',
      async method => {
        await expect(
          okClient().request({ path: RECORD, method, body: {} }),
        ).rejects.toMatchObject({ kind: 'blocked_by_gate' });
      },
    );

    it('approvedWriteFor phân biệt method', () => {
      expect(approvedWriteFor('POST', RECORD)).toBe('inbound.record');
      expect(approvedWriteFor('DELETE', RECORD)).toBeUndefined();
    });
  });

  describe('khớp tuyệt đối — không tiền tố, không lách bằng ../', () => {
    it.each([
      RECORD + '/extra',
      RECORD + 'X',
      '/api/v1/mini-app/inbound/record/../../roles/1',
      '/api/v1/roles/1',
      '/api/v1/mini-app/inbound-documents',
    ])('%s không được duyệt', path => {
      expect(approvedWriteFor('POST', path)).toBeUndefined();
    });
  });

  describe('Idempotency-Key — chỉ đúng một thao tác', () => {
    it('cho qua trên POST record', () => {
      expect(() =>
        assertNoForbiddenHeaders(
          { 'Idempotency-Key': 'wmshn-abc' },
          RECORD,
          'POST',
        ),
      ).not.toThrow();
    });

    it('bị cấm trên resolve-code — spec không khai header này cho nó', () => {
      expect(() =>
        assertNoForbiddenHeaders(
          { 'Idempotency-Key': 'wmshn-abc' },
          RESOLVE,
          'POST',
        ),
      ).toThrow(AppError);
    });

    it('bị cấm khi quên truyền method — ngoại lệ phải nói ra mới có', () => {
      expect(() =>
        assertNoForbiddenHeaders({ 'Idempotency-Key': 'wmshn-abc' }, RECORD),
      ).toThrow(AppError);
    });

    it('client thật gắn được header lên record', async () => {
      let sentHeaders: Record<string, string> = {};
      const client = clientWith(blockedEnvironment, async (
        _url: string,
        init: { headers: Record<string, string> },
      ) => {
        sentHeaders = init.headers;
        return jsonResponse(200, { data: {}, meta: {} });
      });
      await client.request({
        path: RECORD,
        method: 'POST',
        body: {},
        headers: { 'Idempotency-Key': 'wmshn-1' },
      });
      expect(sentHeaders['Idempotency-Key']).toBe('wmshn-1');
    });
  });

  describe('🔒 If-Match — chỉ hai lệnh đổi tồn kho', () => {
    it('chỉ post-receipt', () => {
      expect(allowsIfMatch('POST', POST_RECEIPT)).toBe(true);
    });

    it.each([RESOLVE, RECORD])('KHÔNG cho %s', path => {
      expect(allowsIfMatch('POST', path)).toBe(false);
    });

    it('bị chặn ở tầng header, không chỉ ở hàm kiểm', () => {
      // `allowsIfMatch` trả false là chưa đủ — phải có chốt lúc chạy. Trước
      // 2026-09-06 `if-match` KHÔNG nằm trong FORBIDDEN_HEADERS, nên lệnh cấm
      // chỉ được giữ bằng việc "không chỗ nào gửi".
      expect(() =>
        assertNoForbiddenHeaders({ 'If-Match': '7' }, RECORD, 'POST'),
      ).toThrow(AppError);
      expect(() =>
        assertNoForbiddenHeaders({ 'If-Match': '7' }, RESOLVE, 'POST'),
      ).toThrow(AppError);
    });

    it('post-issue CŨNG được — đó là lệnh đổi tồn kho thứ hai', () => {
      // 🔧 2026-09-06 (`§2h`): trước đó chỉ post-receipt. Nay hai thao tác
      // `post-*` đều gửi If-Match, và đó cũng đúng là hai lệnh đổi tồn kho.
      expect(
        allowsIfMatch('POST', '/api/v1/mini-app/outbound-documents/1/post-issue'),
      ).toBe(true);
    });

    it('không lách được bằng đường chưa duyệt', () => {
      expect(
        allowsIfMatch('POST', '/api/v1/mini-app/outbound-documents/1/unmatch'),
      ).toBe(false);
      expect(
        allowsIfMatch('POST', '/api/v1/mini-app/warranty-cases'),
      ).toBe(false);
    });
  });
});
