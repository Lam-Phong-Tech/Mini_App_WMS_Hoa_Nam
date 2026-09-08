/**
 * Danh mục Tỉnh/Thành và Phường/Xã cho form phiếu xuất.
 *
 * Nguồn: `https://provinces.open-api.vn` — **dịch vụ công cộng bên thứ ba**,
 * đúng nguồn Mini App đang chạy dùng (mô tả luồng xuất, 2026-09-06).
 *
 * ## 🔒 Vì sao KHÔNG dùng `apiClient`
 *
 * `apiClient` gắn `Authorization: Bearer <token WMS>` vào mọi request có phiên,
 * cộng thêm `X-WMS-Client-Tier`. Gọi dịch vụ bên ngoài qua nó là **gửi token
 * kho hàng cho một máy chủ không liên quan** — rò rỉ thật, âm thầm, và không ai
 * phát hiện cho tới khi có sự cố.
 *
 * ⇒ Dùng `fetch` trần, **không** header xác thực nào. Hàm `fetchJson` dưới đây
 * cố ý không nhận tham số `headers` để không ai thêm vào sau này.
 *
 * ## Chỉ gửi đi cái gì
 *
 * Một mã tỉnh dạng số khi tra phường. **Không** tên người nhận, không số điện
 * thoại, không địa chỉ, không mã hàng. Chiều ngược lại chỉ nhận về danh mục
 * hành chính công khai.
 *
 * ## Cache 24 giờ
 *
 * Đúng như mô tả. Danh mục hành chính đổi vài lần một năm, còn thủ kho tạo
 * hàng chục phiếu mỗi ngày — gọi mạng mỗi lần là phí, và tệ hơn: nó biến một
 * dịch vụ ngoài tầm kiểm soát thành phụ thuộc cứng của việc tạo phiếu.
 *
 * ⚠️ **Rủi ro còn lại, không che giấu:** Tỉnh và Phường là trường **bắt buộc**.
 * Nếu dịch vụ này chết và cache đã hết hạn, thủ kho **không tạo được phiếu
 * xuất**. Đây là rủi ro có sẵn trong thiết kế hiện tại chứ không phải do bản
 * port sinh ra; đã ghi vào `USER-ACTION-REQUIRED.md`. Cache cũ vì vậy được
 * **dùng tiếp khi gọi mạng hỏng**, thay vì vứt đi đúng lúc cần nhất.
 */

import { getAppStorage } from '../../storage/storage';
import { AppError, toAppError } from '../../errors/AppError';
import { logger, type Logger } from '../../logging/logger';

const BASE_URL = 'https://provinces.open-api.vn/api/v2';

/** Đủ nhanh để không treo form, đủ dài cho mạng 3G ở kho. */
export const GEO_TIMEOUT_MS = 10_000;

/** 24 giờ, đúng như Mini App đang chạy. */
export const GEO_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const KEY_PROVINCES = 'geo.provinces';
const KEY_WARDS_PREFIX = 'geo.wards.';

export interface GeoUnit {
  readonly code: string;
  readonly name: string;
}

interface CacheEnvelope {
  readonly at: number;
  readonly items: readonly GeoUnit[];
}

/**
 * `fetch` trần, không header xác thực.
 *
 * Cố ý **không** nhận tham số `headers` — xem chú thích đầu tệp.
 */
async function fetchJson(url: string, timeoutMs: number): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new AppError({
        kind: 'http',
        status: response.status,
        message: 'Danh mục hành chính trả về HTTP ' + String(response.status),
      });
    }
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Bóc danh sách đơn vị hành chính từ phản hồi.
 *
 * Chịu được **cả hai** dạng: mảng phẳng (danh sách tỉnh) và object có `wards`.
 * Còn nhận cả dạng cũ `districts[].wards` — sau lần sáp nhập 2025 API v2 trả
 * `wards` thẳng, nhưng một endpoint đổi shape giữa chừng mà app chết cứng thì
 * đắt hơn nhiều so với mấy dòng phòng thủ này.
 */
export function extractUnits(payload: unknown): readonly GeoUnit[] {
  const toUnit = (raw: unknown): GeoUnit | undefined => {
    if (typeof raw !== 'object' || raw === null) {
      return undefined;
    }
    const item = raw as { code?: unknown; name?: unknown };
    const code =
      typeof item.code === 'number' || typeof item.code === 'string'
        ? String(item.code)
        : undefined;
    const name = typeof item.name === 'string' ? item.name.trim() : undefined;
    if (code === undefined || name === undefined || name === '') {
      return undefined;
    }
    return { code, name };
  };

  if (Array.isArray(payload)) {
    return payload.map(toUnit).filter((unit): unit is GeoUnit => unit !== undefined);
  }

  if (typeof payload === 'object' && payload !== null) {
    const container = payload as { wards?: unknown; districts?: unknown };
    if (Array.isArray(container.wards)) {
      return extractUnits(container.wards);
    }
    if (Array.isArray(container.districts)) {
      return container.districts.flatMap(district =>
        extractUnits((district as { wards?: unknown }).wards ?? []),
      );
    }
  }

  return [];
}

function readCache(key: string, now: number): readonly GeoUnit[] | undefined {
  const raw = getAppStorage().getString(key);
  if (raw === undefined) {
    return undefined;
  }
  try {
    const cached = JSON.parse(raw) as CacheEnvelope;
    if (!Array.isArray(cached.items) || cached.items.length === 0) {
      return undefined;
    }
    return now - cached.at < GEO_CACHE_TTL_MS ? cached.items : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Cache đã hết hạn nhưng vẫn còn dữ liệu — dùng khi gọi mạng hỏng.
 *
 * Danh mục hành chính cũ một ngày gần như chắc chắn vẫn đúng. Bắt thủ kho ngồi
 * chờ vì một dịch vụ bên ngoài đang chết, trong khi câu trả lời nằm sẵn trên
 * máy, là đánh đổi sai.
 */
function readStaleCache(key: string): readonly GeoUnit[] | undefined {
  const raw = getAppStorage().getString(key);
  if (raw === undefined) {
    return undefined;
  }
  try {
    const cached = JSON.parse(raw) as CacheEnvelope;
    return Array.isArray(cached.items) && cached.items.length > 0
      ? cached.items
      : undefined;
  } catch {
    return undefined;
  }
}

function writeCache(key: string, items: readonly GeoUnit[], now: number): void {
  getAppStorage().setString(key, JSON.stringify({ at: now, items }));
}

export interface GeoDeps {
  readonly request?: (url: string, timeoutMs: number) => Promise<unknown>;
  readonly now?: () => number;
  readonly log?: Logger;
}

export interface GeoResult {
  readonly items: readonly GeoUnit[];
  /** Dữ liệu lấy từ cache **quá hạn** vì gọi mạng hỏng. */
  readonly stale: boolean;
}

async function load(
  key: string,
  url: string,
  deps: GeoDeps,
): Promise<GeoResult> {
  const request = deps.request ?? fetchJson;
  const now = (deps.now ?? Date.now)();
  const log = deps.log ?? logger;

  const fresh = readCache(key, now);
  if (fresh !== undefined) {
    return { items: fresh, stale: false };
  }

  try {
    const items = extractUnits(await request(url, GEO_TIMEOUT_MS));
    if (items.length === 0) {
      throw new AppError({
        kind: 'parse',
        message: 'Danh mục hành chính trả về danh sách rỗng.',
      });
    }
    writeCache(key, items, now);
    return { items, stale: false };
  } catch (cause) {
    const stale = readStaleCache(key);
    if (stale !== undefined) {
      log.warn('Dùng danh mục hành chính đã quá hạn vì gọi mạng hỏng.', {
        key,
        reason: toAppError(cause).message,
      });
      return { items: stale, stale: true };
    }
    throw toAppError(cause);
  }
}

export function fetchProvinces(deps: GeoDeps = {}): Promise<GeoResult> {
  return load(KEY_PROVINCES, BASE_URL + '/', deps);
}

/**
 * Phường/xã của một tỉnh. **Chỉ gọi sau khi đã chọn tỉnh** — mô tả 2026-09-06.
 */
export function fetchWards(
  provinceCode: string,
  deps: GeoDeps = {},
): Promise<GeoResult> {
  if (provinceCode.trim() === '') {
    return Promise.resolve({ items: [], stale: false });
  }
  return load(
    KEY_WARDS_PREFIX + provinceCode,
    BASE_URL + '/p/' + encodeURIComponent(provinceCode) + '?depth=2',
    deps,
  );
}
