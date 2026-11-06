import {
  apiClient,
  type RequestOptions,
  type ApiResponse,
} from '../../../api/client';
import {
  getActiveSession,
  getSessionGeneration,
  type Session,
} from '../../../auth/session';
import { getCurrentEnvironment } from '../../../config/env';
import { AppError } from '../../../errors/AppError';
import type { CurrentUser } from '../../../services/wms/types';
import { fetchCurrentUser } from '../../../services/wms/queries';
import { parseDocumentTimestamp } from '../../../services/wms/documentTimestamps';
import { BUILD_PROFILE } from '../../../config/buildProfile';
import {
  stockListQuery,
  warrantyQuery,
  evidenceQuery,
  attachmentQuery,
  supplierQuery,
  sourcePath,
  parseStockList,
  parseStockDetail,
  parseWarranty,
  parseScans,
  parseAttachments,
  parseSuppliers,
  parseWarrantyReceipt,
  validateReadTarget,
  requireValue,
  uuid,
  type Source,
  type Scope,
  type Query,
  type Document,
  type File,
  type Receipt,
  type Raw,
} from './contract';
import { mixedQuery, parseMixed } from './mixed';
import { P12_TIMELINE_CONTRACT, P12_TIMELINE_HEADER } from './timelineHandoff';

export interface Context {
  session?: Session;
  user?: CurrentUser;
}
export function p12CanCreate(type: Source, rights: readonly string[]): boolean {
  return type === 'inbound'
    ? rights.includes('inbound.create') && rights.includes('inbound.scan')
    : type === 'outbound'
    ? (rights.includes('outbound.request.manual_create') ||
        rights.includes('outbound.import')) &&
      rights.includes('outbound.scan')
    : rights.includes('warranty.manage');
}
export interface Journal {
  owner: 'P09';
  requestId: string;
  actorId: string;
  authSessionId: string;
  warehouseId: string;
}
interface Client {
  get<T>(
    path: string,
    options?: Omit<RequestOptions, 'path' | 'method'>,
  ): Promise<ApiResponse<T>>;
}
export function p12Scope(context: Context): Scope {
  const s = context.session,
    u = context.user;
  requireValue(
    s &&
      u &&
      uuid(s.userId) &&
      uuid(s.authSessionId) &&
      uuid(s.activeWarehouseId) &&
      u.id === s.userId &&
      u.auth_session_id === s.authSessionId &&
      u.active_warehouse_id === s.activeWarehouseId &&
      u.warehouse_context?.status === 'READY' &&
      u.available_warehouses?.some(
        w => w.warehouse_id === s.activeWarehouseId && w.status === 'ACTIVE',
      ) &&
      Array.isArray(u.permissions),
    'P12_CONTEXT_REQUIRED',
    'Cần xác nhận lại phiên và kho làm việc.',
  );
  return {
    actorId: s.userId,
    authSessionId: s.authSessionId,
    warehouseId: s.activeWarehouseId,
    rights: [...u.permissions!].sort(),
    generation: getSessionGeneration(),
  };
}
const key = (scope: Scope) => JSON.stringify(scope);
export function createP12Service(
  getContext: () => Context,
  {
    client = apiClient,
    origin = getCurrentEnvironment().apiBaseUrl,
    timeoutMs = 15000,
    timelineContract,
    revalidateUser = signal => fetchCurrentUser({ signal }),
  }: {
    client?: Client;
    origin?: string;
    timeoutMs?: number;
    /** Opt-in source candidate. AppShell leaves this unset until release acceptance. */
    timelineContract?: typeof P12_TIMELINE_CONTRACT;
    revalidateUser?: (signal?: AbortSignal) => Promise<CurrentUser>;
  } = {},
) {
  requireValue(
    timelineContract === undefined || timelineContract === P12_TIMELINE_CONTRACT,
    'P12_TIMELINE_CONTRACT_UNSUPPORTED',
  );
  const scope = () =>
    p12Scope({ ...getContext(), session: getActiveSession() });
  const allowed = (type: Source, extras: string[] = []) => {
    const s = scope();
    requireValue(
      (type === 'warranty'
        ? ['warranty.view', 'warranty.manage']
        : [type + '.view']
      ).some(p => s.rights.includes(p)) &&
        extras.every(p => s.rights.includes(p)),
      'READ_FORBIDDEN',
      'Chưa có quyền đọc nguồn này.',
    );
    return s;
  };
  async function read<T>(
    path: string,
    query: Query,
    parse: (body: unknown, s: Scope) => T,
    signal?: AbortSignal,
    binary = false,
    headers?: Record<string, string>,
  ) {
    const s = scope(),
      owner = key(s),
      controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    try {
      return await Promise.race([
        (async () => {
          const r = await client.get<unknown>(path, {
            query,
            p12Read: true,
            signal: controller.signal,
            ...(headers ? { headers } : {}),
            ...(binary ? { responseType: 'blob' as const } : {}),
          });
          requireValue(
            !controller.signal.aborted && key(scope()) === owner,
            'P12_STALE_SCOPE',
            'Phiên hoặc nguồn đã thay đổi.',
          );
          const cache = r.header?.('Cache-Control') ?? '';
          requireValue(
            cache.includes('private') && cache.includes('no-store'),
            'PRIVATE_CACHE_REQUIRED',
          );
          if (binary)
            requireValue(
              r.header?.('X-Content-Type-Options') === 'nosniff',
              'INVALID_BINARY_HEADERS',
            );
          if (!binary)
            requireValue(
              r.header?.('Content-Type')?.split(';')[0] === 'application/json',
              'INVALID_JSON_CONTENT_TYPE',
            );
          if (headers?.[P12_TIMELINE_HEADER])
            requireValue(
              r.header?.('Vary')?.toLowerCase().split(',').some(
                value => value.trim() === P12_TIMELINE_HEADER.toLowerCase(),
              ),
              'P12_TIMELINE_VARY_REQUIRED',
            );
          if (path === '/api/v1/mini-app/documents')
            requireValue(
              r.header?.('X-Content-Type-Options') === 'nosniff' &&
                r
                  .header?.('Vary')
                  ?.toLowerCase()
                  .split(',')
                  .some(v => v.trim() === 'authorization'),
              'MIXED_PRIVATE_HEADERS_REQUIRED',
            );
          const data = parse(r.data, s);
          // Narrow DEV evidence requested for this read acceptance. Project only
          // canonical keys/raw document time, never body/query/PII/auth/cursor.
          if (
            !binary &&
            BUILD_PROFILE === 'dev-test' &&
            origin === 'https://khohoanamdev.lptech.info.vn' &&
            (r.data as { meta?: Raw })?.meta?.timestamp_contract ===
              'document-timestamps-v1'
          ) {
            const value = data as {
              items?: Document[];
              id?: string;
              type?: Source;
              createdAt?: string | null;
              rowKey?: string;
              meta?: Raw;
            };
            const rows = Array.isArray(value.items)
              ? value.items
              : value.id
              ? [value]
              : [];
            const observedAt = new Date().toISOString();
            // Android truncates a single log message near 4KB. Bounded chunks
            // retain the complete ordered projection even for a 100-row page.
            for (let offset = 0; offset < Math.max(1, rows.length); offset += 4)
              console.info(
                '[p12:timestamp-read] ' +
                  JSON.stringify({
                    tested_at: observedAt,
                    path,
                    http_status: r.status,
                    request_id:
                      r.header?.('X-Request-ID') ??
                      (r.data as { meta?: Raw })?.meta?.request_id ??
                      null,
                    timestamp_contract:
                      value.meta?.timestamp_contract ??
                      'document-timestamps-v1',
                    cursor_version: value.meta?.cursor_version ?? null,
                    total: value.meta?.total ?? null,
                    returned_count: rows.length,
                    row_offset: offset,
                    rows: rows.slice(offset, offset + 4).map(row => ({
                      uuid: row.id,
                      source: row.type ?? null,
                      row_key: row.rowKey ?? null,
                      raw_created_at: row.createdAt,
                      state:
                        row.createdAt === undefined
                          ? 'MISSING'
                          : row.createdAt === null
                          ? 'NOT_RECORDED'
                          : 'RECORDED',
                    })),
                  }),
              );
          }
          return Object.assign(data as object, {
            responseHeaders: {
              etag: r.header?.('ETag') ?? null,
              cacheControl: cache,
              requestId: r.header?.('X-Request-ID') ?? null,
            },
          }) as T;
        })(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(
              new AppError({
                kind: 'timeout',
                code: 'P12_READ_TIMEOUT',
                message: 'Đọc dữ liệu quá thời gian. Có thể thử đọc lại.',
              }),
            );
          }, timeoutMs);
          controller.signal.addEventListener(
            'abort',
            () =>
              reject(
                new AppError({
                  kind: 'cancelled',
                  message: 'Đã dừng yêu cầu đọc.',
                }),
              ),
            { once: true },
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
    }
  }
  return {
    scope,
    canCreate(type: Source) {
      try {
        return p12CanCreate(type, scope().rights);
      } catch {
        return false;
      }
    },
    async revalidateScope(signal?: AbortSignal) {
      const previous = scope(),
        before = key(previous);
      const nextUser = await revalidateUser(signal);
      requireValue(
        !signal?.aborted && getSessionGeneration() === previous.generation,
        'P12_STALE_SCOPE',
      );
      const next = p12Scope({ session: getActiveSession(), user: nextUser });
      requireValue(
        before === key(next) && before === key(scope()),
        'P12_CONTEXT_REVALIDATE_CHANGED',
        'Phiên, kho hoặc quyền đã thay đổi. Xác nhận lại nguồn trước khi đọc chứng từ.',
      );
      return true;
    },
    scopeKey: () => {
      try {
        return key(scope());
      } catch {
        return '';
      }
    },
    list(type: Source, input: Query = {}, signal?: AbortSignal) {
      const s = allowed(type),
        q =
          type === 'warranty'
            ? warrantyQuery('list', { warehouse_id: s.warehouseId, ...input })
            : stockListQuery(type, { warehouse_id: s.warehouseId, ...input });
      if (type === 'warranty' && q.search === '') delete q.search;
      requireValue(q.warehouse_id === s.warehouseId, 'SCOPE_MISMATCH');
      return read(
        sourcePath(type),
        q,
        (b, c) => {
          if (type === 'warranty')
            return parseWarranty(b, 'list', null, c, { origin });
          const page = parseStockList(b, type, q, { origin,rights:c.rights });
          requireValue(
            page.items.every(row => row.warehouseId === c.warehouseId),
            'SCOPE_MISMATCH',
          );
          return page;
        },
        signal,
      );
    },
    mixed(input: Query = {}, signal?: AbortSignal) {
      const s = scope();
      requireValue(
        s.rights.some(p =>
          [
            'inbound.view',
            'outbound.view',
            'warranty.view',
            'warranty.manage',
          ].includes(p),
        ),
        'READ_FORBIDDEN',
      );
      const q = mixedQuery({ ...input, warehouse_id: s.warehouseId });
      return read(
        '/api/v1/mini-app/documents',
        q,
        (b, c) => parseMixed(b, q, c, origin),
        signal,
      );
    },
    detail(type: Source, id: string, signal?: AbortSignal) {
      const s = allowed(type);
      const requestedTimeline = type === 'warranty' ? undefined : timelineContract;
      return read(
        sourcePath(type, id),
        type === 'warranty' || requestedTimeline
          ? { warehouse_id: s.warehouseId }
          : {},
        (b, c) =>
          type === 'warranty'
            ? parseWarranty(b, 'detail', id, c, { origin })
            : parseStockDetail(b, type, id, c.warehouseId, {
                origin,
                rights: c.rights,
                timelineContract: requestedTimeline,
              }),
        signal,
        false,
        requestedTimeline ? { [P12_TIMELINE_HEADER]: requestedTimeline } : undefined,
      );
    },
    scans(type: Source, id: string, input: Query = {}, signal?: AbortSignal) {
      allowed(type);
      requireValue(
        type !== 'warranty',
        'P09_SCAN_MAPPING_PENDING',
        'Nguồn sản phẩm bảo hành chưa được chốt.',
      );
      const q = evidenceQuery(input);
      return read(
        sourcePath(type, id) + '/scan-entries',
        q,
        b => parseScans(b, type, id, q),
        signal,
      );
    },
    files(type: Source, id: string, input: Query = {}, signal?: AbortSignal) {
      const s = allowed(type, type === 'warranty' ? ['documents.read'] : []),
        q =
          type === 'warranty'
            ? warrantyQuery('attachments', {
                warehouse_id: s.warehouseId,
                ...input,
              })
            : attachmentQuery(input);
      return read(
        sourcePath(type, id) + '/attachments',
        q,
        (b, c) =>
          type === 'warranty'
            ? parseWarranty(b, 'attachments', id, c)
            : parseAttachments(b, type, id, q),
        signal,
      );
    },
    events(id: string, input: Query = {}, signal?: AbortSignal) {
      const s = allowed('warranty'),
        q = warrantyQuery('events', { warehouse_id: s.warehouseId, ...input });
      return read(
        sourcePath('warranty', id) + '/events',
        q,
        (b, c) => parseWarranty(b, 'events', id, c),
        signal,
      );
    },
    suppliers(input: Query = {}, signal?: AbortSignal) {
      const s = scope();
      requireValue(
        s.rights.some(p =>
          ['inbound.view', 'inbound.create', 'inbound.scan'].includes(p),
        ),
        'READ_FORBIDDEN',
      );
      const q = supplierQuery(input);
      return read(
        '/api/v1/mini-app/inbound/suppliers',
        q,
        b => parseSuppliers(b, q),
        signal,
      );
    },
    receipt(journal: Journal, signal?: AbortSignal) {
      const s = allowed('warranty');
      requireValue(
        journal.owner === 'P09' &&
          uuid(journal.requestId) &&
          journal.actorId === s.actorId &&
          journal.authSessionId === s.authSessionId &&
          journal.warehouseId === s.warehouseId,
        'RECEIPT_OWNER_CONTEXT_REQUIRED',
      );
      return read(
        '/api/v1/mini-app/warranty-requests/' + journal.requestId,
        { warehouse_id: s.warehouseId },
        (b, c) => ({
          ...parseWarrantyReceipt(b, journal.requestId, c, { origin }),
          scope: key(c),
        }),
        signal,
      );
    },
    receiptDetail(r: Receipt & { scope: string }, signal?: AbortSignal) {
      const s = allowed('warranty');
      requireValue(
        r.scope === key(s) &&
          r.receipt.state === 'SUCCEEDED' &&
          uuid(r.caseId) &&
          r.caseId === r.receipt.warranty_case_id &&
          r.caseId === r.source.warranty_case_id &&
          r.readTarget,
        'RECEIPT_TARGET_NOT_READY',
      );
      validateReadTarget(r.readTarget, 'warranty', r.caseId, s.warehouseId, {
        origin,
        context: s,
      });
      return this.detail('warranty', r.caseId, signal);
    },
    download(parent: Document, file: File, signal?: AbortSignal) {
      const s = allowed(
          parent.type,
          parent.type === 'warranty'
            ? ['documents.read', 'warranty.pii.view']
            : [],
        ),
        id = file.attachment_id ?? file.id;
      requireValue(
        parent.warehouseId === s.warehouseId &&
          parent.source.deleted_at == null &&
          uuid(id) &&
          file.status === 'ACTIVE',
        'FILE_UNAVAILABLE',
      );
      let path: string;
      if (parent.type === 'warranty') {
        requireValue(
          file.warranty_case_id === parent.id &&
            file.can_download === true &&
            typeof file.download_url === 'string',
          'FILE_UNAVAILABLE',
        );
        const url = new URL(file.download_url, origin);
        requireValue(
          url.origin === new URL(origin).origin &&
            url.pathname ===
              '/api/v1/mini-app/warranty-attachments/' + id + '/download' &&
            !url.search &&
            !url.hash,
          'READ_TARGET_MISMATCH',
        );
        path = url.pathname;
      } else {
        requireValue(
          parent.source.doc_type ===
            (parent.type === 'inbound' ? 'receipt' : 'issue') &&
            file.document_id === parent.id &&
            file.document_type === parent.type.toUpperCase(),
          'ATTACHMENT_PARENT_MISMATCH',
        );
        path = '/api/v1/mini-app/document-attachments/' + id + '/download';
      }
      return read(
        path,
        {},
        body => {
          const blob = body as Blob;
          requireValue(
            blob &&
              blob.size > 0 &&
              blob.type === file.content_type &&
              [
                'application/pdf',
                'image/png',
                'image/jpeg',
                'image/webp',
              ].includes(blob.type),
            'INVALID_BINARY',
          );
          requireValue(
            file.file_size_bytes == null || file.file_size_bytes === blob.size,
            'BINARY_SIZE_MISMATCH',
            'Kích thước tài liệu không khớp nguồn đã đọc.',
          );
          return {
            blob,
            name: file.file_name ?? 'chung-tu',
            mime: blob.type,
            scope: key(s),
          };
        },
        signal,
        true,
      );
    },
    normalize(type: Source, row: Document | Raw): Document {
      if ('type' in row) return row as Document;
      const r = row as Raw;
      const createdTimestamp = parseDocumentTimestamp(r.created_at);
      requireValue(
        createdTimestamp.status !== 'INVALID',
        'DOCUMENT_TIMESTAMP_INVALID',
      );
      return {
        type,
        id: r.warranty_case_id as string,
        warehouseId: r.warehouse_id as string,
        ...(Object.hasOwn(r, 'created_at')
          ? { createdAt: r.created_at as string | null }
          : {}),
        createdTimestamp,
        p12: r.p12 as Document['p12'],
        source: r,
      };
    },
  };
}
export type P12Service = ReturnType<typeof createP12Service>;
