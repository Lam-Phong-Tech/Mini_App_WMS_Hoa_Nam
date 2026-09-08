/**
 * Preflight tier — luồng bắt buộc người dùng chốt 2026-09-06.
 *
 * Đây là chốt chặn **quan trọng nhất** của đợt này: nó là thứ duy nhất đứng
 * giữa một bản dựng trỏ nhầm host và một lệnh tăng tồn kho không hoàn tác được.
 * Vì vậy mỗi mục trong sáu mục của luồng đều có test riêng, và các ca "không rõ
 * ràng" (thiếu header, giá trị lạ, không gọi được) đều phải **chặn**, không
 * được đoán thoáng.
 */

import {
  HEALTH_PATH,
  MESSAGE_WRONG_ENVIRONMENT,
  TIER_CHECK_TIMEOUT_MS,
  assertTierMatched,
  checkDeploymentTier,
  getLastTierCheck,
  requireTierForWrite,
  resetTierCheckForTesting,
  scanningAllowed,
} from '../src/services/wms/tierCheck';
import {
  CLIENT_TIER_HEADER,
  TIER_RESPONSE_HEADER,
  isDeploymentTier,
} from '../src/config/deployment';
import { BUILD_PROFILE } from '../src/config/buildProfile';
import { ENVIRONMENTS, getCurrentEnvironment } from '../src/config/env';
import { AppError } from '../src/errors/AppError';
import { classifyFailure } from '../src/sync/syncEngine';

interface Call {
  path: string;
  timeoutMs?: number;
}

/** Client giả trả về một header tier cho trước. */
function clientReporting(tier?: string) {
  const calls: Call[] = [];
  const get = async <T,>(
    path: string,
    options: { timeoutMs?: number } = {},
  ) => {
    calls.push({ path, timeoutMs: options.timeoutMs });
    return {
      status: 200,
      data: {} as T,
      header: (name: string) =>
        name.toLowerCase() === TIER_RESPONSE_HEADER.toLowerCase()
          ? tier
          : undefined,
    };
  };
  return { get, calls };
}

beforeEach(() => {
  resetTierCheckForTesting();
});

// ---------------------------------------------------------------------------

describe('mục 2 — preflight lúc app mở', () => {
  it('gọi đúng /api/v1/health', async () => {
    const { get, calls } = clientReporting('dev-test');
    await checkDeploymentTier({ get });
    expect(calls[0]?.path).toBe(HEALTH_PATH);
    expect(HEALTH_PATH).toBe('/api/v1/health');
  });

  it('dùng timeout ngắn hơn timeout chung — nó chặn cả màn hình', async () => {
    const { get, calls } = clientReporting('dev-test');
    await checkDeploymentTier({ get });
    expect(calls[0]?.timeoutMs).toBe(TIER_CHECK_TIMEOUT_MS);
    expect(TIER_CHECK_TIMEOUT_MS).toBeLessThan(
      getCurrentEnvironment().requestTimeoutMs,
    );
  });

  it('header khớp ⇒ matched, và CHO quét', async () => {
    const { get } = clientReporting(BUILD_PROFILE);
    const result = await checkDeploymentTier({ get });
    expect(result.status).toBe('matched');
    expect(result.reported).toBe(BUILD_PROFILE);
    expect(scanningAllowed(result)).toBe(true);
  });

  it('nhớ được kết quả lần gần nhất', async () => {
    expect(getLastTierCheck().status).toBe('unchecked');
    const { get } = clientReporting(BUILD_PROFILE);
    await checkDeploymentTier({ get });
    expect(getLastTierCheck().status).toBe('matched');
  });

  it('ghi mốc thời gian để biết kết quả cũ tới đâu', async () => {
    const { get } = clientReporting(BUILD_PROFILE);
    const result = await checkDeploymentTier({ get, now: () => 1_700_000 });
    expect(result.checkedAt).toBe(1_700_000);
  });
});

// ---------------------------------------------------------------------------

describe('mục 4 — mọi trường hợp KHÔNG rõ ràng đều phải chặn', () => {
  it.each([
    ['tier khác', 'customer-production', 'mismatched'],
    ['không có header', undefined, 'missing'],
    ['header rỗng', '   ', 'missing'],
    ['giá trị lạ', 'staging', 'missing'],
    ['giá trị lạ hoa thường lẫn lộn', 'Dev-Test', 'missing'],
  ])('%s ⇒ %s', async (_label, reported, expected) => {
    const { get } = clientReporting(reported);
    const result = await checkDeploymentTier({ get });
    expect(result.status).toBe(expected);
    // Không trạng thái nào ngoài `matched` được cho quét.
    expect(scanningAllowed(result)).toBe(false);
    expect(() => assertTierMatched(result)).toThrow(AppError);
  });

  it('không gọi được /health ⇒ unreachable, vẫn chặn', async () => {
    const result = await checkDeploymentTier({
      get: async () => {
        throw new AppError({ kind: 'network', message: 'mất mạng' });
      },
    });
    expect(result.status).toBe('unreachable');
    expect(scanningAllowed(result)).toBe(false);
    expect(() => assertTierMatched(result)).toThrow(AppError);
  });

  it('checkDeploymentTier KHÔNG bao giờ ném — màn hình chỉ cần vẽ', async () => {
    // Trộn "báo lỗi" vào "lấy trạng thái" sẽ bắt mọi màn hình phải try/catch chỉ
    // để hiện một dòng chữ. Ném lỗi là việc của `assertTierMatched`.
    await expect(
      checkDeploymentTier({
        get: async () => {
          throw new Error('vỡ bất ngờ');
        },
      }),
    ).resolves.toMatchObject({ status: 'unreachable' });
  });

  it('chưa kiểm lần nào cũng bị chặn — im lặng không phải là đồng ý', () => {
    expect(() => assertTierMatched(getLastTierCheck())).toThrow(AppError);
  });

  it('thông báo dùng nguyên văn "Sai môi trường"', async () => {
    const { get } = clientReporting('customer-production');
    const result = await checkDeploymentTier({ get });
    let message = '';
    try {
      assertTierMatched(result);
    } catch (error) {
      message = (error as AppError).message;
    }
    expect(message).toContain(MESSAGE_WRONG_ENVIRONMENT);
    // Nói RÕ máy chủ khai gì và bản dựng chờ gì — thủ kho báo lại được cho IT.
    expect(message).toContain('customer-production');
  });

  it('🔒 lỗi mang kind wrong_environment, KHÔNG phải blocked_by_gate', async () => {
    const { get } = clientReporting('customer-production');
    const result = await checkDeploymentTier({ get });
    try {
      assertTierMatched(result);
      throw new Error('lẽ ra phải ném');
    } catch (error) {
      expect((error as AppError).kind).toBe('wrong_environment');
    }
  });

  it('🔒 "không retry" — hàng đợi xếp vào failed, không phải pending', () => {
    // `pending` nghĩa là "chờ điều kiện đổi rồi gửi lại". Điều kiện ở đây là
    // BẢN DỰNG, không đổi được lúc chạy ⇒ để `pending` là hứa hão.
    const classified = classifyFailure(
      new AppError({ kind: 'wrong_environment', message: 'Sai môi trường' }),
    );
    expect(classified.state).toBe('failed');
  });
});

// ---------------------------------------------------------------------------

describe('mục 3 — kiểm LẠI trước mỗi thao tác ghi', () => {
  it('requireTierForWrite luôn gọi mạng, không dùng kết quả cũ', async () => {
    const { get, calls } = clientReporting(BUILD_PROFILE);
    await checkDeploymentTier({ get });
    await requireTierForWrite({ get });
    await requireTierForWrite({ get });
    // Ba lần hỏi cho ba lần gọi — không có cache nào cắt bớt.
    expect(calls).toHaveLength(3);
  });

  it('ném ngay khi tier sai', async () => {
    const { get } = clientReporting('customer-production');
    await expect(requireTierForWrite({ get })).rejects.toMatchObject({
      kind: 'wrong_environment',
    });
  });
});

// ---------------------------------------------------------------------------

describe('mục 1, 5, 6 — một bản dựng, một tier', () => {
  it('bản dựng hiện tại là DEV/TEST và chỉ trỏ lptech.info.vn', () => {
    expect(BUILD_PROFILE).toBe('dev-test');
    expect(getCurrentEnvironment().apiBaseUrl).toBe(
      'https://khohoanamdev.lptech.info.vn',
    );
  });

  it('mỗi tier kỳ vọng đúng tier của chính nó', () => {
    for (const environment of Object.values(ENVIRONMENTS)) {
      expect(environment.expectedTier).toBe(environment.name);
    }
  });

  it('🔒 bản Customer chỉ trỏ bigk.click, không lẫn host', () => {
    expect(ENVIRONMENTS['customer-production'].apiBaseUrl).toBe(
      'https://khohoanamdev.bigk.click',
    );
    expect(ENVIRONMENTS['dev-test'].apiBaseUrl).not.toContain('bigk.click');
  });

  it('chỉ có HAI tier hợp lệ', () => {
    expect(isDeploymentTier('dev-test')).toBe(true);
    expect(isDeploymentTier('customer-production')).toBe(true);
    for (const bad of ['staging', 'production', 'green', 'blue', '', null]) {
      expect(isDeploymentTier(bad)).toBe(false);
    }
  });
});

describe('header khai client tier', () => {
  it('tên header đúng như hạ tầng chờ', () => {
    expect(CLIENT_TIER_HEADER).toBe('X-WMS-Client-Tier');
    expect(TIER_RESPONSE_HEADER).toBe('X-WMS-Deployment-Tier');
  });
});

// ---------------------------------------------------------------------------
// Đo thật 2026-09-06 — cả hai host đều đã bật header
// ---------------------------------------------------------------------------

describe('🔒 khớp tên header KHÔNG phân biệt hoa thường', () => {
  /**
   * Đo thật ngày 2026-09-06:
   *
   * | Host | Tên header trả về |
   * |---|---|
   * | `lptech.info.vn` (nginx) | `X-WMS-Deployment-Tier` |
   * | `bigk.click` (Cloudflare) | `x-wms-deployment-tier` — **viết thường** |
   *
   * Cloudflare chuẩn hoá tên header về chữ thường. Nếu chỗ tra header phân biệt
   * hoa thường thì bản **Customer** sẽ luôn thấy "thiếu header" ⇒ khoá sạch
   * quét và Post Issue, trong khi máy chủ vẫn khai đúng tier.
   *
   * `Headers.get()` theo chuẩn Fetch là không phân biệt hoa thường, và RN cũng
   * vậy. Test này khoá lại điều đó ở phía app.
   */
  function clientReportingWithName(headerName: string, tier: string) {
    return async <T,>(_path: string, _options: { timeoutMs?: number } = {}) => ({
      status: 200,
      data: {} as T,
      header: (name: string) =>
        name.toLowerCase() === headerName.toLowerCase() ? tier : undefined,
    });
  }

  it.each([
    ['nginx viết hoa', 'X-WMS-Deployment-Tier'],
    ['Cloudflare viết thường', 'x-wms-deployment-tier'],
    ['viết lẫn lộn', 'X-Wms-Deployment-Tier'],
  ])('%s vẫn đọc được', async (_label, headerName) => {
    const result = await checkDeploymentTier({
      get: clientReportingWithName(headerName, BUILD_PROFILE),
    });
    expect(result.status).toBe('matched');
  });

  it('🔒 KHÔNG đọc tier từ thân phản hồi', async () => {
    // Đo thật: `/health` của Green trả `"environment":"production"` trong body,
    // dù tier là `dev-test`. Đó đúng là cái bẫy APP_ENV đã gây hiểu nhầm suốt
    // mấy ngày. Đọc body thay vì header là tự tạo lại chính lỗi đó.
    const result = await checkDeploymentTier({
      get: async <T,>() => ({
        status: 200,
        data: { data: { environment: 'production' } } as T,
        header: () => undefined,
      }),
    });
    // Không có header ⇒ `missing`, KHÔNG được suy ra từ body.
    expect(result.status).toBe('missing');
  });
});
