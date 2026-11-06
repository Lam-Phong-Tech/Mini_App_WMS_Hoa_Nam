import { apiClient, type RequestOptions } from '../../api/client';
import { getActiveSession } from '../../auth/session';
import { p12DevEnabled } from '../../config/p12Release';
import { getCurrentEnvironment, type AppEnvironment } from '../../config/env';
import { AppError } from '../../errors/AppError';
import { p12Scope, type Context } from '../../features/documents/p12/service';
import type { Scope } from '../../features/documents/p12/contract';
import type { CurrentUser } from './types';
import type { ReadClient } from './readOnlyClient';
import { fetchCurrentUser } from './queries';
import { EXPLICIT_READ_HEADER, readAssert } from './explicitReadFields';
import {
  parseWebQueue,
  webQueueQuery,
  type WebQueueQuery,
} from './p13WebQueue';
import {
  boxQuery,
  parseBoxes,
  P18_BOX_CONTRACT,
  type BoxQuery,
} from './p18Boxes';
import { ownerUuid } from '../../app/ownerNavigation';

export function canReadBoxes(rights: readonly string[]) {
  return (
    rights.includes('sku.view') &&
    ['container.view', 'putaway.view', 'putaway.manage'].some(p =>
      rights.includes(p),
    )
  );
}
export function createBeReleasedReads(
  getContext: () => Context,
  deps: {
    client?: ReadClient;
    environment?: AppEnvironment;
    freshUser?: (signal?: AbortSignal) => Promise<CurrentUser>;
  } = {},
) {
  const client = deps.client ?? apiClient,
    environment = deps.environment ?? getCurrentEnvironment(),
    freshUser = deps.freshUser ?? (signal => fetchCurrentUser({ signal }));
  const scope = () =>
    p12Scope({ ...getContext(), session: getActiveSession() });
  const key = (s: Scope) => JSON.stringify(s);
  async function read<T>(
    owner: 'p13' | 'p18-boxes',
    path: string,
    query: NonNullable<RequestOptions['query']>,
    parse: (value: unknown, s: Scope) => T,
    signal?: AbortSignal,
  ): Promise<T> {
    if (!p12DevEnabled(environment))
      throw new AppError({
        kind: 'blocked_by_gate',
        code: 'BE_RELEASE_DEV_ONLY',
        message: 'Nguồn mới chỉ mở trên DEV/TEST.',
      });
    const captured = scope(),
      ownerKey = key(captured);
    const allowed = (s: Scope) =>
      owner === 'p18-boxes'
        ? canReadBoxes(s.rights)
        : [
            'inbound.view',
            'outbound.view',
            'warranty.view',
            'warranty.manage',
          ].some(p => s.rights.includes(p));
    if (!allowed(captured))
      throw new AppError({
        kind: 'http',
        status: 403,
        code: 'READ_FORBIDDEN',
        message: 'Không có quyền đọc nguồn này.',
      });
    const controller = new AbortController(),
      abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const current = () => {
      if (controller.signal.aborted || key(scope()) !== ownerKey)
        throw new AppError({
          kind: 'cancelled',
          code: 'READ_SCOPE_CHANGED',
          message: 'Phiên, kho hoặc quyền đã thay đổi. Cần đọc lại dữ liệu.',
        });
    };
    try {
      return await Promise.race([
        (async () => {
          current();
          const user = await freshUser(controller.signal);
          current();
          const fresh = p12Scope({ session: getActiveSession(), user });
          if (
            user.status !== 'ACTIVE' ||
            key(fresh) !== ownerKey ||
            !allowed(fresh)
          )
            throw new AppError({
              kind: 'http',
              status: 403,
              code: 'READ_RIGHTS_CHANGED',
              message:
                'Quyền hoặc phạm vi đã thay đổi. Vui lòng xác nhận lại phiên.',
            });
          const response = await client.get<unknown>(path, {
            query,
            beAppRead: owner,
            signal: controller.signal,
            headers: {
              ...EXPLICIT_READ_HEADER,
              ...(owner === 'p18-boxes'
                ? { 'X-Container-Read-Contract': P18_BOX_CONTRACT }
                : {}),
            },
          });
          current();
          const header = (name: string) => response.header?.(name),
            cache = header('Cache-Control') ?? '',
            vary = (header('Vary') ?? '')
              .toLowerCase()
              .split(',')
              .map(v => v.trim());
          readAssert(
            response.status === 200 &&
              cache.includes('private') &&
              cache.includes('no-store') &&
              header('Content-Type')?.split(';')[0] === 'application/json' &&
              header('X-Content-Type-Options') === 'nosniff' &&
              header('X-Read-Fields-Contract') === 'explicit-read-fields-v1' &&
              ['authorization', 'origin', 'x-read-fields-contract'].every(h =>
                vary.includes(h),
              ) &&
              !header('ETag') &&
              !header('Last-Modified'),
            'READ_PRIVATE_HEADERS_INVALID',
          );
          return parse(response.data, fresh);
        })(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            abort();
            reject(
              new AppError({
                kind: 'timeout',
                message: 'Đọc dữ liệu quá thời gian. Vui lòng thử lại.',
              }),
            );
          }, 15000);
        }),
      ]);
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
    }
  }
  return {
    scopeKey: () => key(scope()),
    webQueue(input: Partial<WebQueueQuery> = {}, signal?: AbortSignal) {
      const q = webQueueQuery(input),
        s = scope();
      return read(
        'p13',
        '/api/v1/mini-app/documents',
        { ...q, warehouse_id: s.warehouseId },
        (value, fresh) => parseWebQueue(value, fresh, q),
        signal,
      );
    },
    boxes(input: Partial<BoxQuery> = {}, signal?: AbortSignal) {
      const q = boxQuery(input),
        s = scope();
      return read(
        'p18-boxes',
        '/api/v1/containers',
        {
          warehouse_id: s.warehouseId,
          sku_type: q.skuType,
          ...(q.keyword ? { keyword: q.keyword } : {}),
          page: q.page,
          per_page: q.perPage,
        },
        (value, fresh) => parseBoxes(value, fresh, q),
        signal,
      );
    },
    box(id: string, signal?: AbortSignal) {
      readAssert(ownerUuid(id), 'BOX_TARGET_INVALID');
      const s = scope();
      return read(
        'p18-boxes',
        '/api/v1/containers/' + id,
        { warehouse_id: s.warehouseId },
        (value, fresh) => parseBoxes(value, fresh, boxQuery(), id).items[0],
        signal,
      );
    },
  };
}
export type BeReleasedReads = ReturnType<typeof createBeReleasedReads>;
