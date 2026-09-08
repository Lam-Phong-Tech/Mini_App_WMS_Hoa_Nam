/**
 * Gia hạn phiên ngầm — khoá ba ràng buộc do NGƯỜI DÙNG nêu ngày 2026-09-05 sau
 * khi họ đọc mã nguồn WMS và đo thật trên staging.
 *
 * Mỗi ràng buộc ở đây tương ứng một cách app **làm hỏng ca làm việc của thủ
 * kho** nếu code sai. Tên test ghi rõ triệu chứng, để người sửa sau biết mình
 * đang phá cái gì.
 *
 * ❗ Không test nào gọi mạng. Toàn bộ dùng transport giả.
 */

import {
  MIN_REFRESH_LEAD_MS,
  PROACTIVE_REFRESH_RATIO,
  getRefreshAttempts,
  isRefreshing,
  needsProactiveRefresh,
  parseRefreshPayload,
  recoverAfterRestart,
  refreshDueAtMs,
  refreshSession,
  resetRefreshState,
  sessionFromRefresh,
} from '../src/auth/tokenRefresh';
import {
  clearRefreshInFlight,
  clearSession,
  getRefreshInFlight,
  getSession,
  markRefreshInFlight,
  setSession,
  type Session,
} from '../src/auth/session';
import {
  SKEW_IGNORE_MS,
  getClockSkewMs,
  hasServerTime,
  readServerTimestamp,
  recordServerTime,
  resetServerClock,
  serverNow,
} from '../src/auth/serverClock';
import { isGateExemptAuthPath } from '../src/api/client';
import { AppError } from '../src/errors/AppError';
import {
  createMemoryBackend,
  createStorage,
  setAppStorageForTesting,
} from '../src/storage/storage';

/** Số đo thật từ staging: TTL hợp đồng 60 phút. */
const TTL_SEC = 3600;
const TTL_MS = TTL_SEC * 1000;
const T0 = 1_756_000_000_000;

function okPayload(suffix: string) {
  return {
    data: {
      access_token: 'access-' + suffix,
      refresh_token: 'refresh-' + suffix,
      expires_in: TTL_SEC,
    },
    meta: { timestamp: new Date(T0).toISOString() },
  };
}

beforeEach(() => {
  setAppStorageForTesting(createStorage(createMemoryBackend()));
  resetRefreshState();
  resetServerClock();
  clearSession();
  clearRefreshInFlight();
});

// ---------------------------------------------------------------------------

describe('đọc phản hồi gia hạn', () => {
  it('đọc được cả khi bọc trong "data" lẫn khi ở gốc', () => {
    const flat = { access_token: 'a', refresh_token: 'r', expires_in: 60 };
    expect(parseRefreshPayload(flat).access_token).toBe('a');
    expect(parseRefreshPayload({ data: flat }).refresh_token).toBe('r');
  });

  it('thiếu expires_in thì ném lỗi, KHÔNG tự đoán TTL', () => {
    // Đoán TTL là cách chắc chắn để token chết giữa ca mà app không biết.
    expect(() =>
      parseRefreshPayload({ access_token: 'a', refresh_token: 'r' }),
    ).toThrow(AppError);
  });

  it('hạn tính từ expires_in, không decode JWT', () => {
    const session = sessionFromRefresh(
      { access_token: 'a', refresh_token: 'r', expires_in: TTL_SEC },
      T0,
    );
    expect(session.issuedAtMs).toBe(T0);
    expect(session.expiresAtMs).toBe(T0 + TTL_MS);
  });
});

// ---------------------------------------------------------------------------
// RÀNG BUỘC 1 — single-flight
// ---------------------------------------------------------------------------

describe('ràng buộc 1 — single-flight, nếu hỏng thì thủ kho bị đá ra giữa ca', () => {
  it('mười request cùng gặp 401 chỉ tạo MỘT lượt gia hạn', async () => {
    setSession({ accessToken: 'cu', refreshToken: 'refresh-cu' });
    let sent = 0;
    const send = async () => {
      sent += 1;
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 5);
      });
      return okPayload('moi');
    };

    const all = await Promise.all(
      Array.from({ length: 10 }, () => refreshSession({ send, now: () => T0 })),
    );

    // Nếu con số này > 1: lượt thứ hai là replay của refresh token đã bị thu
    // hồi ⇒ máy chủ huỷ SẠCH mọi phiên của người dùng đó.
    expect(sent).toBe(1);
    expect(getRefreshAttempts()).toBe(1);
    // Cả mười bên gọi nhận cùng một phiên.
    for (const session of all) {
      expect(session.accessToken).toBe('access-moi');
    }
  });

  it('gia hạn xong thì mở khoá, lượt sau gọi được bình thường', async () => {
    setSession({ accessToken: 'cu', refreshToken: 'refresh-cu' });
    const send = async () => okPayload('1');
    await refreshSession({ send, now: () => T0 });
    expect(isRefreshing()).toBe(false);

    setSession({ accessToken: 'access-1', refreshToken: 'refresh-1' });
    await refreshSession({ send: async () => okPayload('2'), now: () => T0 });
    expect(getRefreshAttempts()).toBe(2);
  });

  it('lượt gia hạn thất bại cũng mở khoá, không kẹt vĩnh viễn', async () => {
    setSession({ accessToken: 'cu', refreshToken: 'refresh-cu' });
    await expect(
      refreshSession({
        send: async () => {
          throw new AppError({ kind: 'network', message: 'mất mạng' });
        },
        now: () => T0,
      }),
    ).rejects.toThrow(AppError);
    expect(isRefreshing()).toBe(false);
  });

  it('không có refresh token thì từ chối ngay, không gửi gì', async () => {
    setSession({ accessToken: 'cu' });
    let sent = 0;
    await expect(
      refreshSession({
        send: async () => {
          sent += 1;
          return okPayload('x');
        },
        now: () => T0,
      }),
    ).rejects.toThrow(AppError);
    expect(sent).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// RÀNG BUỘC 3 — ngưỡng gia hạn chủ động
// ---------------------------------------------------------------------------

describe('ràng buộc 3 — gia hạn ở ~20% TTL còn lại, không polling', () => {
  const session: Session = {
    accessToken: 'a',
    refreshToken: 'r',
    issuedAtMs: T0,
    expiresAtMs: T0 + TTL_MS,
  };

  it('mốc gia hạn đúng bằng 20% TTL trước hạn', () => {
    expect(refreshDueAtMs(session)).toBe(
      T0 + TTL_MS - TTL_MS * PROACTIVE_REFRESH_RATIO,
    );
  });

  it('chưa tới ngưỡng thì KHÔNG gia hạn — tránh đụng rate limit 30 lần/phút/IP', () => {
    // Cả kho NAT chung một IP: polling là cách nhanh nhất để khoá toàn bộ máy quét.
    expect(needsProactiveRefresh(session, T0 + TTL_MS * 0.5)).toBe(false);
  });

  it('qua ngưỡng thì gia hạn', () => {
    expect(needsProactiveRefresh(session, T0 + TTL_MS * 0.85)).toBe(true);
  });

  it('TTL rất ngắn vẫn giữ được phần đệm tối thiểu', () => {
    const shortTtl: Session = {
      ...session,
      expiresAtMs: T0 + 10_000, // 10 giây: 20% chỉ là 2 giây, ngắn hơn một lượt gửi
    };
    const due = refreshDueAtMs(shortTtl);
    expect(due).toBeDefined();
    // Sàn MIN_REFRESH_LEAD_MS đẩy mốc lùi tới tận lúc phát hành ⇒ gia hạn ngay.
    expect(due).toBe(T0);
    expect(MIN_REFRESH_LEAD_MS).toBeGreaterThan(10_000);
  });

  it('thiếu issuedAtMs thì KHÔNG gia hạn bừa', () => {
    // Không biết TTL gốc thì không suy ra được 20% — im lặng còn hơn bịa.
    expect(refreshDueAtMs({ accessToken: 'a', expiresAtMs: T0 })).toBeUndefined();
    expect(
      needsProactiveRefresh({ accessToken: 'a', refreshToken: 'r' }, T0),
    ).toBe(false);
  });

  it('phiên không có refresh token thì không bao giờ gia hạn chủ động', () => {
    const noRefresh: Session = { ...session, refreshToken: undefined };
    expect(needsProactiveRefresh(noRefresh, T0 + TTL_MS)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Khôi phục sau khi app bị kill
// ---------------------------------------------------------------------------

describe('app bị kill giữa lúc gia hạn — không được dùng lại token cũ', () => {
  it('thấy dấu dở dang thì xoá phiên và ép đăng nhập lại', () => {
    setSession({ accessToken: 'cu', refreshToken: 'refresh-cu' });
    markRefreshInFlight(T0);

    const result = recoverAfterRestart();

    expect(result.outcome).toBe('forced_relogin');
    // Dùng lại refresh token có thể đã bị thu hồi ⇒ máy chủ huỷ sạch mọi phiên
    // của người dùng, kể cả trên thiết bị khác. Thà bắt đăng nhập lại một lần.
    expect(getSession()).toBeUndefined();
    expect(getRefreshInFlight()).toBeUndefined();
  });

  it('không có dấu thì không đụng gì tới phiên', () => {
    setSession({ accessToken: 'cu', refreshToken: 'refresh-cu' });
    expect(recoverAfterRestart().outcome).toBe('clean');
    expect(getSession()?.accessToken).toBe('cu');
  });

  it('gia hạn thành công thì xoá dấu — lần mở sau không bị ép đăng nhập oan', async () => {
    setSession({ accessToken: 'cu', refreshToken: 'refresh-cu' });
    await refreshSession({ send: async () => okPayload('moi'), now: () => T0 });
    expect(getRefreshInFlight()).toBeUndefined();
    expect(recoverAfterRestart().outcome).toBe('clean');
  });

  it('máy chủ từ chối thẳng (401) thì xoá dấu và bỏ phiên luôn', async () => {
    setSession({ accessToken: 'cu', refreshToken: 'refresh-cu' });
    await expect(
      refreshSession({
        send: async () => {
          throw new AppError({ kind: 'auth', status: 401, message: 'chết' });
        },
        now: () => T0,
      }),
    ).rejects.toThrow(AppError);
    // Máy chủ đã trả lời rõ ⇒ không còn gì mơ hồ để khôi phục.
    expect(getRefreshInFlight()).toBeUndefined();
    expect(getSession()).toBeUndefined();
  });

  it('mất mạng thì GIỮ dấu — chưa biết máy chủ đã thu hồi hay chưa', async () => {
    setSession({ accessToken: 'cu', refreshToken: 'refresh-cu' });
    await expect(
      refreshSession({
        send: async () => {
          throw new AppError({ kind: 'network', message: 'mất mạng' });
        },
        now: () => T0,
      }),
    ).rejects.toThrow(AppError);
    // Cùng nguyên tắc với outbox: đã gửi đi thì không mặc định là chưa gửi.
    expect(getRefreshInFlight()).toBeDefined();
    expect(recoverAfterRestart().outcome).toBe('forced_relogin');
  });
});

// ---------------------------------------------------------------------------
// Đồng hồ máy chủ
// ---------------------------------------------------------------------------

describe('đồng hồ máy chủ — máy quét Android chạy sai giờ là chuyện thường', () => {
  it('chưa nhận giờ máy chủ thì báo rõ là chưa đồng bộ', () => {
    expect(hasServerTime()).toBe(false);
  });

  it('bù đúng độ lệch khi đồng hồ máy chạy sai vài ngày', () => {
    const deviceNow = T0;
    const serverIso = new Date(T0 + 3 * 24 * 3600 * 1000).toISOString();
    recordServerTime(serverIso, deviceNow);
    expect(hasServerTime()).toBe(true);
    expect(serverNow(deviceNow)).toBe(T0 + 3 * 24 * 3600 * 1000);
  });

  it('bỏ qua lệch nhỏ — đó là độ trễ mạng, không phải đồng hồ sai', () => {
    recordServerTime(new Date(T0 + 800).toISOString(), T0);
    expect(getClockSkewMs()).toBe(0);
    expect(SKEW_IGNORE_MS).toBeGreaterThan(800);
  });

  it('timestamp hỏng không làm hỏng đồng hồ của cả app', () => {
    recordServerTime(new Date(T0 + 10 * 60_000).toISOString(), T0);
    const before = getClockSkewMs();
    recordServerTime('không phải ngày tháng', T0);
    recordServerTime(undefined, T0);
    recordServerTime({ nested: true }, T0);
    expect(getClockSkewMs()).toBe(before);
  });

  it('đọc được meta.timestamp ở cả hai biến thể envelope', () => {
    const iso = '2026-09-05T17:09:13+07:00';
    expect(readServerTimestamp({ data: [], links: {}, meta: { timestamp: iso } })).toBe(iso);
    expect(readServerTimestamp({ data: {}, meta: { timestamp: iso } })).toBe(iso);
    expect(readServerTimestamp({ data: {} })).toBeUndefined();
    expect(readServerTimestamp(null)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Ngoại lệ cổng chặn ghi
// ---------------------------------------------------------------------------

describe('ngoại lệ cổng — hẹp đúng ba đường auth, không hơn', () => {
  it('cho qua đúng ba đường auth', () => {
    expect(isGateExemptAuthPath('/api/v1/auth/login')).toBe(true);
    expect(isGateExemptAuthPath('/api/v1/auth/refresh')).toBe(true);
    expect(isGateExemptAuthPath('/api/v1/auth/logout')).toBe(true);
  });

  it('KHÔNG cho qua endpoint nghiệp vụ — GATE_01 §11 #4 còn nguyên hiệu lực', () => {
    for (const path of [
      '/api/v1/mini-app/inbound-documents',
      '/api/v1/inbound-documents/1/scan',
      '/api/v1/mini-app/outbound-documents/1/post-issue',
      '/api/v1/roles/1',
    ]) {
      expect(isGateExemptAuthPath(path)).toBe(false);
    }
  });

  it('so khớp tuyệt đối, không phải tiền tố — chặn đường đi vòng', () => {
    expect(isGateExemptAuthPath('/api/v1/auth/refresh/../inbound-documents')).toBe(
      false,
    );
    expect(isGateExemptAuthPath('/api/v1/auth/login-as-admin')).toBe(false);
    expect(isGateExemptAuthPath('/api/v1/auth/refresh?x=1')).toBe(false);
  });
});
