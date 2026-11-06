import {
  apiClient,
  type ApiResponse,
  type RequestOptions,
} from '../../api/client';
import { getSession, type Session } from '../../auth/session';
import {
  P06_RELEASE,
  P06_PUBLIC_IMAGE_ORIGINS,
  P06_VERIFIED_PUBLIC_CDN_ORIGINS,
  p06RuntimeCandidateMatches,
} from '../../config/p06Release';
import {
  AppError,
  extractErrorCode,
  extractErrorMessage,
  extractRequestId,
  toAppError,
} from '../../errors/AppError';
import type { ReadClient } from './readOnlyClient';
import { logger } from '../../logging/logger';
import type {
  P06Card,
  P06Context,
  P06Detail,
  P06Event,
  P06GalleryImage,
  P06Identity,
  P06IdentityType,
  P06ListCard,
  P06ListMeta,
  P06ListQuery,
  P06Meta,
  P06PageMeta,
  P06Response,
  P06Scope,
  P06Stock,
  P06TimelineMeta,
  P06TimelineQuery,
} from './p06Types';
export * from './p06Types';
export const P06_BASE = '/api/v1/mini-app/catalog';
export const P06_CONTRACT = 'mini-app-p06-v1';
type Options = Pick<RequestOptions, 'signal' | 'timeoutMs'>;
type Obj = Record<string, unknown>;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const object = (v: unknown): v is Obj =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const text = (v: unknown): v is string =>
  typeof v === 'string' && v.trim().length > 0;
const nullableText = (v: unknown) => v === null || typeof v === 'string';
const uuid = (v: unknown) => typeof v === 'string' && UUID.test(v);
const qty = (v: unknown) =>
  v === null || (typeof v === 'number' && Number.isFinite(v));
const integer = (v: unknown, min = 0) =>
  Number.isSafeInteger(v) && (v as number) >= min;
const instant = (v: unknown) =>
  typeof v === 'string' &&
  /T.*(?:Z|[+-]\d\d:\d\d)$/.test(v) &&
  Number.isFinite(Date.parse(v));
const nullableInstant = (v: unknown) => v === null || instant(v);
const oneOf = (v: unknown, values: readonly unknown[]) => values.includes(v);
function check(
  condition: unknown,
  code = 'P06_INVALID_RESPONSE',
): asserts condition {
  if (!condition)
    throw new AppError({
      kind: 'parse',
      code,
      message:
        'Dữ liệu tra cứu chưa xác minh đúng hợp đồng, định danh hoặc kho.',
    });
}
function queryError(): never {
  throw new AppError({
    kind: 'config',
    code: 'P06_INVALID_QUERY',
    message: 'Tham số tra cứu chưa hợp lệ.',
  });
}
export function p06Scope(session = getSession()): P06Scope {
  if (!text(session?.userId) || !text(session?.authSessionId))
    throw new AppError({
      kind: 'auth',
      code: 'AUTH_SESSION_REQUIRED',
      message: 'Cần xác nhận lại phiên đăng nhập.',
    });
  if (!uuid(session?.activeWarehouseId))
    throw new AppError({
      kind: 'config',
      code: 'WAREHOUSE_CONTEXT_REQUIRED',
      message: 'Cần xác nhận kho làm việc.',
    });
  return {
    actorId: session.userId,
    authSessionId: session.authSessionId,
    warehouseId: session.activeWarehouseId!,
  };
}
export function p06ScopeKey(session: Session | undefined): string {
  return JSON.stringify([
    session?.userId,
    session?.authSessionId,
    session?.activeWarehouseId,
    Boolean(session?.accessToken),
  ]);
}
export function p06Identity(card: P06Card): P06Identity {
  return {
    type: card.card_type,
    id: card.card_type === 'ITEM' ? card.item_id! : card.sku_id,
  };
}
export function p06IdentityKey(identity: P06Identity): string {
  return `${identity.type}:${identity.id}`;
}
export function p06Unique<T>(rows: readonly T[], key: (row: T) => string): T[] {
  // Replace a repeated identity with its latest projection without duplicating rows.
  return [...new Map(rows.map(row => [key(row), row])).values()];
}
function metaOf(response: ApiResponse<unknown>): {
  data: unknown;
  meta: P06Meta;
} {
  const body = response.data;
  if (response.status < 200 || response.status >= 300)
    throw new AppError({
      kind: 'http',
      status: response.status,
      code: extractErrorCode(body),
      requestId: extractRequestId(body),
      message: extractErrorMessage(body) || 'Không đọc được dữ liệu tra cứu.',
    });
  check(
    object(body) &&
      body.success === true &&
      Object.hasOwn(body, 'data') &&
      object(body.meta),
  );
  const m = body.meta,
    snap = m.snapshot;
  check(
    m.contract === P06_CONTRACT &&
      text(m.request_id) &&
      instant(m.timestamp) &&
      object(snap) &&
      uuid(snap.id) &&
      instant(snap.observed_at) &&
      oneOf(snap.consistency, [
        'SINGLE_RESPONSE_DATABASE_SNAPSHOT',
        'ENCLOSING_TRANSACTION',
      ]) &&
      snap.cross_request_snapshot === false,
  );
  check(
    m.card_metadata_revision === undefined ||
      m.card_metadata_revision === 'p06-card-master-r1' ||
      m.card_metadata_revision === 'p06-card-master-r2',
    'P06_METADATA_REVISION_UNSUPPORTED',
  );
  return { data: body.data, meta: m as unknown as P06Meta };
}
function parseContext(v: unknown, scope: P06Scope): P06Context {
  check(
    object(v) &&
      v.actor_id === scope.actorId &&
      v.auth_session_id === scope.authSessionId,
    'P06_SESSION_MISMATCH',
  );
  check(
    object(v.warehouse_context) &&
      oneOf(v.warehouse_context.status, [
        'READY',
        'REQUIRED',
        'UNAVAILABLE',
        'NO_SESSION',
      ]) &&
      nullableText(v.warehouse_context.error_code) &&
      (v.active_warehouse_id === null || uuid(v.active_warehouse_id)) &&
      nullableText(v.warehouse_status) &&
      v.read_only === true &&
      Array.isArray(v.available_warehouses) &&
      v.available_warehouses.every(
        w =>
          object(w) &&
          uuid(w.warehouse_id) &&
          text(w.code) &&
          text(w.name) &&
          text(w.status),
      ),
  );
  check(
    object(v.permissions) &&
      [
        'skus',
        'items',
        'stock',
        'ledger',
        'warranty_view',
        'warranty_manage',
        'label_print_permission',
      ].every(k => typeof (v.permissions as Obj)[k] === 'boolean'),
  );
  check(
    Array.isArray(v.identity_types) &&
      v.identity_types.join(',') === 'SKU,ITEM' &&
      v.sku_scope === 'GLOBAL_MASTER_WITH_SELECTED_WAREHOUSE_STOCK' &&
      v.item_scope ===
        'SELECTED_WAREHOUSE_HISTORY_OR_PERMITTED_WARRANTY_NOT_CURRENT_LOCATION' &&
      v.tab_field === 'sku_type' &&
      Array.isArray(v.tab_values) &&
      v.tab_values.join(',') === 'ALL,PRODUCT,COMPONENT' &&
      object(v.location_breakdown) &&
      v.location_breakdown.supported === false &&
      v.location_breakdown.level === 'WAREHOUSE' &&
      v.location_breakdown.reason === 'NO_LOCATION_BALANCE_MODEL' &&
      object(v.label_print) &&
      v.label_print.action_exposed === false &&
      v.label_print.target_id === null &&
      v.label_print.required_target_type === 'LABEL_SNAPSHOT',
  );
  // 7d661813 uses one authoritative permission projection for context/detail.
  const rights = v.permissions as Obj;
  check(
    (rights.skus === true ||
      (rights.items === false && rights.stock === false)) &&
      (rights.warranty_manage === false || rights.warranty_view === true),
    'P06_PERMISSION_PROJECTION_MISMATCH',
  );
  if (v.warehouse_context.status === 'READY')
    check(
      v.active_warehouse_id === scope.warehouseId,
      'WAREHOUSE_CONTEXT_MISMATCH',
    );
  return v as unknown as P06Context;
}
export function p06ContextReadError(context: P06Context): AppError | undefined {
  if (context.warehouse_context.status === 'NO_SESSION')
    return new AppError({
      kind: 'auth',
      status: 401,
      code: context.warehouse_context.error_code || 'AUTH_SESSION_REQUIRED',
      message: 'Cần xác nhận lại phiên đăng nhập.',
    });
  if (
    context.warehouse_context.status !== 'READY' ||
    !uuid(context.active_warehouse_id) ||
    context.warehouse_status !== 'ACTIVE'
  )
    return new AppError({
      kind: 'http',
      status: 409,
      code:
        context.warehouse_context.error_code ||
        (context.warehouse_status === 'INACTIVE'
          ? 'WAREHOUSE_INACTIVE'
          : 'WAREHOUSE_CONTEXT_REQUIRED'),
      message: 'Kho làm việc chưa sẵn sàng. Xác nhận lại tại màn phiên.',
    });
  return undefined;
}
function parseCard(
  v: unknown,
  type: P06IdentityType,
  revision?: P06Meta['card_metadata_revision'],
): P06Card {
  check(
    object(v) &&
      v.card_type === type &&
      uuid(v.sku_id) &&
      text(v.sku_code) &&
      text(v.sku_name) &&
      oneOf(v.sku_type, ['PRODUCT', 'COMPONENT']) &&
      oneOf(v.sku_status, ['ACTIVE', 'INACTIVE']) &&
      nullableText(v.unit) &&
      integer(v.version) &&
      nullableInstant(v.updated_at) &&
      v.current_location === null &&
      v.current_location_status === 'NOT_ASSERTED' &&
      ['item_code', 'serial_number', 'item_status', 'item_condition'].every(k =>
        nullableText(v[k]),
      ),
  );
  check(
    type === 'SKU'
      ? [
          'item_id',
          'item_code',
          'serial_number',
          'item_status',
          'item_condition',
        ].every(k => v[k] === null)
      : uuid(v.item_id),
  );
  const master: Partial<
    Pick<P06Card, 'category_name' | 'brand_name' | 'description'>
  > = {};
  for (const key of ['category_name', 'brand_name', 'description'] as const) {
    if (Object.prototype.hasOwnProperty.call(v, key)) {
      // Optional labels must not make an otherwise valid product disappear,
      // and objects/arrays must never reach a native Text node.
      master[key] = typeof v[key] === 'string' ? v[key] : null;
    }
  }
  const card = { ...v, ...master } as unknown as P06Card;
  // Status semantics apply only to the recognized additive owner revision.
  // Legacy optional labels remain compatible without accepting unversioned reasons.
  delete card.metadata_status;
  if (revision === 'p06-card-master-r1' || revision === 'p06-card-master-r2') {
    const status = v.metadata_status;
    check(object(status), 'P06_METADATA_INVALID');
    const absent = ['NOT_ASSIGNED', 'REFERENCE_NOT_FOUND', 'LABEL_UNAVAILABLE'];
    const current = [
      'CURRENT_ACTIVE_MASTER',
      'CURRENT_INACTIVE_MASTER',
      'CURRENT_MASTER_STATUS_UNKNOWN',
    ];
    for (const field of ['category_name', 'brand_name'] as const) {
      check(
        (absent.includes(String(status[field])) && v[field] === null) ||
          (current.includes(String(status[field])) && text(v[field])),
        'P06_METADATA_INVALID',
      );
    }
    const descriptionValid =
      revision === 'p06-card-master-r1'
        ? status.description === 'SOURCE_NOT_DEFINED' && v.description === null
        : (status.description === 'CURRENT_PV_PROFILE' && text(v.description)) ||
          (oneOf(status.description, [
            'PROFILE_NOT_FOUND',
            'PROFILE_AMBIGUOUS',
            'DESCRIPTION_UNAVAILABLE',
          ]) && v.description === null);
    check(descriptionValid, 'P06_METADATA_INVALID');
    card.metadata_status = {
      category_name: status.category_name as NonNullable<
        P06Card['metadata_status']
      >['category_name'],
      brand_name: status.brand_name as NonNullable<
        P06Card['metadata_status']
      >['brand_name'],
      description: status.description as NonNullable<
        P06Card['metadata_status']
      >['description'],
    };
  }
  return card;
}
function parseStock(
  v: unknown,
  sku: string,
  scope: P06Scope,
  m: P06Meta,
): P06Stock {
  check(
    object(v) &&
      v.sku_id === sku &&
      v.warehouse_id === scope.warehouseId &&
      oneOf(v.status, ['CONFIRMED', 'EMPTY', 'INCOMPLETE', 'MISMATCH']) &&
      [
        'total_qty',
        'available_qty',
        'reserved_qty',
        'unavailable_qty',
        'ledger_total',
      ].every(k => qty(v[k])) &&
      v.quantity_source === 'INVENTORY_BALANCE_PROJECTION' &&
      v.reservation_basis ===
        'BALANCE_RESERVED_QTY_NOT_LIVE_SCAN_MATCH_COUNT' &&
      typeof v.version === 'string' &&
      /^[a-f0-9]{64}$/i.test(v.version) &&
      v.version_kind === 'CONTENT_FINGERPRINT' &&
      nullableInstant(v.updated_at) &&
      nullableInstant(v.ledger_event_at) &&
      v.snapshot_id === m.snapshot.id &&
      v.observed_at === m.snapshot.observed_at &&
      v.location_level === 'WAREHOUSE' &&
      v.location_breakdown === null &&
      v.location_breakdown_status === 'NOT_TRACKED' &&
      Array.isArray(v.by_stock_status) &&
      v.by_stock_status.every(
        b =>
          object(b) &&
          uuid(b.balance_id) &&
          text(b.stock_status) &&
          ['on_hand_qty', 'available_qty', 'reserved_qty'].every(k =>
            qty(b[k]),
          ) &&
          (b.version === null || integer(b.version)) &&
          nullableInstant(b.updated_at),
      ),
  );
  if (v.status === 'EMPTY')
    check(
      [
        'total_qty',
        'available_qty',
        'reserved_qty',
        'unavailable_qty',
        'ledger_total',
      ].every(k => v[k] === 0),
    );
  if (v.status === 'CONFIRMED')
    check(
      [
        'total_qty',
        'available_qty',
        'reserved_qty',
        'unavailable_qty',
        'ledger_total',
      ].every(k => typeof v[k] === 'number'),
    );
  return v as unknown as P06Stock;
}
function stockFields(
  v: Obj,
  card: P06Card,
  c: P06Context,
  s: P06Scope,
  m: P06Meta,
) {
  const expected =
    card.card_type === 'ITEM'
      ? 'USE_SKU_STOCK_ENDPOINT'
      : c.permissions.stock
      ? 'INCLUDED'
      : 'FORBIDDEN';
  check(v.stock_availability === expected);
  if (expected === 'INCLUDED') return parseStock(v.stock, card.sku_id, s, m);
  check(v.stock === null);
  return null;
}
function parseImages(v: unknown): P06GalleryImage[] {
  check(Array.isArray(v));
  return v.map(image => {
    check(
      object(image) &&
        uuid(image.image_id) &&
        image.owner_type === 'SKU' &&
        nullableText(image.full_url) &&
        image.thumbnail_url === null &&
        image.thumbnail_status === 'NOT_GENERATED' &&
        integer(image.order) &&
        typeof image.is_primary === 'boolean' &&
        nullableText(image.alt_text) &&
        (image.version === null || integer(image.version)) &&
        nullableInstant(image.updated_at) &&
        oneOf(image.access, ['PUBLIC', 'UNKNOWN', 'UNAVAILABLE']) &&
        image.expires_at === null &&
        oneOf(image.expiry_policy, ['NO_SIGNED_EXPIRY', 'UNKNOWN']),
    );
    if (image.access === 'PUBLIC')
      check(text(image.full_url) && image.expiry_policy === 'NO_SIGNED_EXPIRY');
    return image as unknown as P06GalleryImage;
  });
}
function pageMeta(
  m: P06Meta,
  s: P06Scope,
  page: number,
  perPage: number,
): P06PageMeta {
  const v = m as unknown as Obj;
  check(
    v.warehouse_id === s.warehouseId &&
      v.page === page &&
      v.per_page === perPage &&
      integer(v.total) &&
      integer(v.last_page, 1) &&
      v.last_page === Math.max(1, Math.ceil((v.total as number) / perPage)),
  );
  return m as P06PageMeta;
}
function listQuery(
  type: P06IdentityType,
  input: P06ListQuery,
  s: P06Scope,
): NonNullable<RequestOptions['query']> {
  const result: NonNullable<RequestOptions['query']> = {
    warehouse_id: s.warehouseId,
  };
  const allowed = [
    'keyword',
    'serial',
    'item_code',
    'sku_id',
    'status',
    'sku_type',
    'page',
    'per_page',
    ...(type === 'ITEM' ? ['item_status'] : []),
  ];
  for (const [key, value] of Object.entries(input)) {
    if (!allowed.includes(key)) queryError();
    if (value === undefined || (typeof value === 'string' && !value.trim()))
      continue;
    if (
      ['keyword', 'serial', 'item_code'].includes(key) &&
      (typeof value !== 'string' ||
        value.trim().length > (key === 'item_code' ? 512 : 200))
    )
      queryError();
    if (
      (key === 'sku_id' && !uuid(value)) ||
      (key === 'status' && !oneOf(value, ['ACTIVE', 'INACTIVE', 'ALL'])) ||
      (key === 'sku_type' && !oneOf(value, ['ALL', 'PRODUCT', 'COMPONENT'])) ||
      (key === 'item_status' &&
        (typeof value !== 'string' || !/^[A-Z_]{1,40}$/.test(value)))
    )
      queryError();
    if (
      (key === 'page' || key === 'per_page') &&
      (!integer(value, 1) || (key === 'per_page' && (value as number) > 100))
    )
      queryError();
    result[key] = typeof value === 'string' ? value.trim() : value;
  }
  return { ...result, page: result.page ?? 1, per_page: result.per_page ?? 20 };
}
function timelineQuery(
  input: P06TimelineQuery,
  s: P06Scope,
): NonNullable<RequestOptions['query']> {
  if (Object.keys(input).some(k => !['source', 'page', 'per_page'].includes(k)))
    queryError();
  const source = input.source ?? 'ALL',
    page = input.page ?? 1,
    perPage = input.per_page ?? 20;
  if (
    !oneOf(source, ['ALL', 'LEDGER', 'WARRANTY']) ||
    !integer(page, 1) ||
    !integer(perPage, 1) ||
    perPage > 100
  )
    queryError();
  return { warehouse_id: s.warehouseId, source, page, per_page: perPage };
}
export function p06ImageUri(
  image: P06GalleryImage,
  origins: readonly string[] = P06_PUBLIC_IMAGE_ORIGINS,
): string | undefined {
  if (image.access === 'UNAVAILABLE' || !image.full_url) return undefined;
  try {
    const url = new URL(image.full_url);
    // A URI only, never auth headers. No arbitrary URL, credentials, or resizing query.
    const verifiedPublicCdn =
      P06_VERIFIED_PUBLIC_CDN_ORIGINS.includes(url.origin) &&
      /\.(?:jpe?g|png|webp)$/i.test(url.pathname) &&
      [...url.searchParams.keys()].every(key => key === 'v') &&
      !url.hash;
    if (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      origins.includes(url.origin) &&
      (image.access === 'PUBLIC' ||
        (image.access === 'UNKNOWN' && verifiedPublicCdn))
    )
      return image.full_url;
  } catch {
    /* malformed image remains a placeholder */
  }
  return undefined;
}
/** Choose the authored primary image among displayable sources; no synthetic thumbnail. */
export function p06PrimaryImage(
  images: readonly P06GalleryImage[],
): P06GalleryImage | undefined {
  return (
    images.find(image => image.is_primary && p06ImageUri(image)) ||
    images.find(image => p06ImageUri(image))
  );
}
export function p06ErrorState(
  error: unknown,
):
  | 'auth'
  | 'forbidden'
  | 'not-found'
  | 'context'
  | 'unavailable'
  | 'pending'
  | 'input' {
  const e = toAppError(error);
  if (
    [
      'blocked_by_edge',
      'parse',
      'network',
      'timeout',
      'wrong_environment',
    ].includes(e.kind)
  )
    return 'unavailable';
  if (e.kind === 'blocked_by_gate') return 'pending';
  if (e.status === 401 || e.kind === 'auth') return 'auth';
  if (e.status === 403) return 'forbidden';
  if (e.status === 404) return 'not-found';
  if (
    e.status === 409 ||
    e.code?.startsWith('WAREHOUSE_CONTEXT') ||
    e.code === 'WAREHOUSE_INACTIVE'
  )
    return 'context';
  if (
    e.status === 422 ||
    e.code === 'P06_EMPTY_EXACT' ||
    e.code === 'P06_INVALID_QUERY'
  )
    return 'input';
  return 'unavailable';
}
/** Only explicit dependency injection can exercise pre-release HTTP in tests/isolated preview. */
export function createP06CatalogService(
  client: ReadClient = apiClient,
  readSession: () => Session | undefined = getSession,
  enabled: () => boolean = () => P06_RELEASE.productionEnabled,
  // Owner-specific read bridge retains its own DEV scope, never a write grant.
  runtimeMatches: (
    sha: unknown,
    tier: unknown,
  ) => boolean = p06RuntimeCandidateMatches,
) {
  function guard(s: P06Scope, signal?: AbortSignal) {
    if (!enabled())
      throw new AppError({
        kind: 'blocked_by_gate',
        code: 'P06_PENDING_RELEASE',
        message: 'Tra cứu đang chờ kiểm thử và triển khai.',
      });
    const session = readSession();
    const current = {
      actorId: session?.userId,
      authSessionId: session?.authSessionId,
      warehouseId: session?.activeWarehouseId || '',
    };
    if (
      !session?.accessToken ||
      signal?.aborted ||
      JSON.stringify(current) !== JSON.stringify(s)
    )
      throw new AppError({
        kind: 'cancelled',
        code: 'P06_SESSION_CHANGED',
        message: 'Không dùng dữ liệu phiên hoặc kho cũ.',
      });
  }
  function scoped(c: P06Context, type: P06IdentityType, permission?: 'stock') {
    const contextError = p06ContextReadError(c);
    if (contextError) throw contextError;
    const s = p06Scope(readSession());
    check(
      c.actor_id === s.actorId && c.auth_session_id === s.authSessionId,
      'P06_SESSION_MISMATCH',
    );
    if (
      c.warehouse_context.status !== 'READY' ||
      c.active_warehouse_id !== s.warehouseId ||
      c.warehouse_status !== 'ACTIVE'
    )
      throw new AppError({
        kind: 'http',
        status: 409,
        code: c.warehouse_context.error_code || 'WAREHOUSE_CONTEXT_REQUIRED',
        message: 'Kho làm việc chưa sẵn sàng. Xác nhận lại tại màn phiên.',
      });
    if (
      !c.permissions.skus ||
      (type === 'ITEM' && !c.permissions.items) ||
      (permission && !c.permissions[permission])
    )
      throw new AppError({
        kind: 'http',
        status: 403,
        code: 'P06_PERMISSION_DENIED',
        message: 'Bạn chưa có quyền xem dữ liệu này.',
      });
    return s;
  }
  function identity(i: P06Identity) {
    if (!oneOf(i.type, ['SKU', 'ITEM']) || !uuid(i.id)) queryError();
    return `${P06_BASE}/${
      i.type === 'SKU' ? 'skus' : 'items'
    }/${encodeURIComponent(i.id)}`;
  }
  async function read(
    path: string,
    s: P06Scope,
    query?: RequestOptions['query'],
    options: Options = {},
  ) {
    if (
      Object.keys(options).some(key => !['signal', 'timeoutMs'].includes(key))
    )
      queryError();
    guard(s, options.signal);
    // apiClient owns origin, bearer access token, timeout and auth refresh.
    const r = await client.get<unknown>(path, {
      ...(query ? { query } : {}),
      headers: {
        Accept: 'application/json',
        'X-P06-Card-Metadata-Revision': 'p06-card-master-r2',
      },
      signal: options.signal,
      timeoutMs: options.timeoutMs,
    });
    guard(s, options.signal);
    return metaOf(r);
  }
  return {
    async context(options: Options = {}): Promise<P06Response<P06Context>> {
      if (!enabled())
        throw new AppError({
          kind: 'blocked_by_gate',
          code: 'P06_PENDING_RELEASE',
          message: 'Tra cứu đang chờ kiểm thử và triển khai.',
        });
      // Verify DEV identity, not equality to an evidence SHA. Owner responses
      // still pass the strict contract/schema/scope parser below.
      if (client === apiClient) {
        const health = await client.get<unknown>('/api/v1/health', {
          signal: options.signal,
          timeoutMs: options.timeoutMs,
        });
        const payload =
          object(health.data) && object(health.data.data)
            ? health.data.data
            : undefined;
        const build =
          payload && object(payload.build) ? payload.build : undefined;
        if (
          health.status !== 200 ||
          !object(health.data) ||
          health.data.success !== true ||
          !runtimeMatches(build?.sha, health.header?.('X-WMS-Deployment-Tier'))
        ) {
          throw new AppError({
            kind: 'blocked_by_gate',
            code: 'P06_RUNTIME_CANDIDATE_NOT_APPROVED',
            requestId:
              health.header?.('X-Request-ID') || extractRequestId(health.data),
            message:
              'Chưa xác minh được định danh môi trường DEV/TEST cho P06.',
          });
        }
      }
      const session = readSession();
      if (!text(session?.userId) || !text(session?.authSessionId))
        throw new AppError({
          kind: 'auth',
          code: 'AUTH_SESSION_REQUIRED',
          message: 'Cần xác nhận lại phiên.',
        });
      const s = {
        actorId: session.userId,
        authSessionId: session.authSessionId,
        warehouseId: session.activeWarehouseId || '',
      };
      const r = await read(`${P06_BASE}/context`, s, undefined, options);
      return { ...r, data: parseContext(r.data, s) };
    },
    async list(
      c: P06Context,
      type: P06IdentityType,
      input: P06ListQuery = {},
      options: Options = {},
    ): Promise<P06Response<P06ListCard[], P06ListMeta>> {
      const s = scoped(c, type),
        q = listQuery(type, input, s);
      if ((q.serial || q.item_code) && !c.permissions.items)
        throw new AppError({
          kind: 'http',
          status: 403,
          code: 'P06_PERMISSION_DENIED',
          message: 'Bạn chưa có quyền tra cứu hiện vật.',
        });
      const r = await read(
          `${P06_BASE}/${type === 'SKU' ? 'skus' : 'items'}`,
          s,
          q,
          options,
        ),
        m = pageMeta(
          r.meta,
          s,
          q.page as number,
          q.per_page as number,
        ) as P06ListMeta;
      check(
        Array.isArray(r.data) &&
          r.data.length <= m.per_page &&
          m.count_unit === type &&
          object(m.tab_totals) &&
          ['ALL', 'PRODUCT', 'COMPONENT'].every(k =>
            integer((m.tab_totals as unknown as Obj)[k]),
          ) &&
          m.tab_totals.ALL === m.tab_totals.PRODUCT + m.tab_totals.COMPONENT &&
          m.total ===
            m.tab_totals[(q.sku_type || 'ALL') as keyof typeof m.tab_totals] &&
          m.scope_policy ===
            (type === 'SKU'
              ? 'GLOBAL_SKU_MASTER_SCOPED_STOCK'
              : 'WAREHOUSE_HISTORY_NOT_CURRENT_LOCATION'),
      );
      const data = r.data.map(v => {
        const card = parseCard(v, type, m.card_metadata_revision);
        check(object(v));
        check(!q.sku_id || card.sku_id === q.sku_id);
        check(
          !q.sku_type || q.sku_type === 'ALL' || card.sku_type === q.sku_type,
        );
        check(q.status === 'ALL' || card.sku_status === (q.status || 'ACTIVE'));
        if (type === 'ITEM') {
          check(!q.item_status || card.item_status === q.item_status);
          check(
            !q.serial ||
              card.serial_number?.trim().toLowerCase() ===
                String(q.serial).trim().toLowerCase(),
          );
        }
        return {
          ...card,
          stock: stockFields(v, card, c, s, m),
          stock_availability: v.stock_availability,
        } as P06ListCard;
      });
      check(m.total !== 0 || data.length === 0);
      check(m.total >= data.length);
      return { data, meta: m };
    },
    async detail(
      c: P06Context,
      i: P06Identity,
      options: Options = {},
    ): Promise<P06Response<P06Detail>> {
      const s = scoped(c, i.type),
        r = await read(
          identity(i),
          s,
          { warehouse_id: s.warehouseId },
          options,
        ),
        v = r.data;
      check(
        object(v) && (r.meta as unknown as Obj).warehouse_id === s.warehouseId,
      );
      const card = parseCard(v.card, i.type, r.meta.card_metadata_revision);
      check(
        p06IdentityKey(p06Identity(card)) === p06IdentityKey(i),
        'P06_IDENTITY_MISMATCH',
      );
      const stock = stockFields(v, card, c, s, r.meta),
        gallery = parseImages(v.gallery),
        cap = v.capabilities;
      check(
        v.gallery_owner_type === 'SKU' &&
          object(cap) &&
          object(cap.warranty) &&
          object(cap.label_print),
      );
      const w = cap.warranty,
        p = cap.label_print;
      check(
        w.view_permitted === c.permissions.warranty_view &&
          w.manage_permitted === c.permissions.warranty_manage &&
          w.target_type === (i.type === 'ITEM' ? 'ITEM' : null) &&
          w.target_id === (i.type === 'ITEM' ? i.id : null) &&
          w.action_exposed === false &&
          w.reason === 'P06_READ_ONLY_OWNER_FLOW_REVALIDATES' &&
          p.permission_granted === c.permissions.label_print_permission &&
          p.target_type === 'LABEL_SNAPSHOT' &&
          p.target_id === null &&
          p.action_exposed === false &&
          p.reason === 'LABEL_TARGET_REQUIRED_NO_P06_PRINT_API',
      );
      if (
        client === apiClient &&
        (card.category_name == null || card.brand_name == null)
      ) {
        const availability = (key: 'category_name' | 'brand_name') =>
          !Object.prototype.hasOwnProperty.call(card, key)
            ? 'MISSING'
            : typeof card[key] === 'string'
            ? 'TEXT'
            : 'NULL_OR_INVALID';
        // Response diagnostics only: no product/user text, body, token or key.
        logger.warn('P06_MASTER_FIELDS_UNAVAILABLE', {
          requestId: r.meta.request_id,
          categoryName: availability('category_name'),
          brandName: availability('brand_name'),
        });
      }
      return {
        data: { ...v, card, stock, gallery } as unknown as P06Detail,
        meta: r.meta,
      };
    },
    async stock(
      c: P06Context,
      skuId: string,
      options: Options = {},
    ): Promise<P06Response<P06Stock>> {
      const s = scoped(c, 'SKU', 'stock'),
        r = await read(
          `${identity({ type: 'SKU', id: skuId })}/stock`,
          s,
          { warehouse_id: s.warehouseId },
          options,
        );
      return { ...r, data: parseStock(r.data, skuId, s, r.meta) };
    },
    async gallery(
      c: P06Context,
      skuId: string,
      options: Options = {},
    ): Promise<P06Response<P06GalleryImage[]>> {
      const s = scoped(c, 'SKU'),
        r = await read(
          `${identity({ type: 'SKU', id: skuId })}/gallery`,
          s,
          { warehouse_id: s.warehouseId },
          options,
        ),
        m = r.meta as unknown as Obj;
      const data = parseImages(r.data);
      check(
        m.owner_type === 'SKU' && m.sku_id === skuId && m.total === data.length,
      );
      return { ...r, data };
    },
    async timeline(
      c: P06Context,
      i: P06Identity,
      input: P06TimelineQuery = {},
      options: Options = {},
    ): Promise<P06Response<P06Event[], P06TimelineMeta>> {
      const s = scoped(c, i.type),
        q = timelineQuery(input, s),
        rights = {
          LEDGER: c.permissions.ledger,
          WARRANTY: c.permissions.warranty_view,
        };
      if (
        q.source === 'ALL'
          ? !rights.LEDGER && !rights.WARRANTY
          : !rights[q.source as keyof typeof rights]
      )
        throw new AppError({
          kind: 'http',
          status: 403,
          code: 'P06_TIMELINE_FORBIDDEN',
          message: 'Bạn chưa có quyền xem nguồn lịch sử này.',
        });
      const r = await read(`${identity(i)}/timeline`, s, q, options),
        m = pageMeta(
          r.meta,
          s,
          q.page as number,
          q.per_page as number,
        ) as P06TimelineMeta;
      check(
        object(m.sources) &&
          m.linkage_policy === 'EXPLICIT_IDS_ONLY' &&
          m.unlinked_warranty_policy === 'EXCLUDED_NO_INFERRED_SKU_OR_ITEM' &&
          m.quantity_policy === 'LEDGER_QTY_DELTA_WARRANTY_NULL' &&
          Array.isArray(r.data) &&
          r.data.length <= m.per_page,
      );
      for (const src of ['LEDGER', 'WARRANTY'] as const)
        check(
          m.sources[src] ===
            (!rights[src]
              ? 'FORBIDDEN'
              : q.source === 'ALL' || q.source === src
              ? 'INCLUDED'
              : 'NOT_REQUESTED'),
        );
      const data = r.data.map(v => {
        check(
          object(v) &&
            oneOf(v.source, ['LEDGER', 'WARRANTY']) &&
            text(v.source_event_id) &&
            v.event_id === `${v.source}:${v.source_event_id}` &&
            m.sources[v.source as 'LEDGER' | 'WARRANTY'] === 'INCLUDED' &&
            nullableInstant(v.occurred_at) &&
            text(v.event_type) &&
            qty(v.signed_quantity) &&
            (v.item_id === null || uuid(v.item_id)) &&
            nullableText(v.from_status) &&
            nullableText(v.to_status),
        );
        check(
          v.source === 'WARRANTY'
            ? v.signed_quantity === null &&
                v.quantity_applicability === 'NOT_APPLICABLE'
            : v.quantity_applicability === 'STOCK_DELTA',
        );
        if (!c.permissions.items) check(v.item_id === null);
        if (i.type === 'ITEM')
          check(v.item_id === i.id, 'P06_IDENTITY_MISMATCH');
        const d = v.document;
        check(
          d === null ||
            (object(d) &&
              uuid(d.id) &&
              nullableText(d.type) &&
              nullableText(d.number) &&
              nullableText(d.current_status) &&
              typeof d.can_open === 'boolean'),
        );
        return v as unknown as P06Event;
      });
      check(m.total !== 0 || data.length === 0);
      check(m.total >= data.length);
      return { data, meta: m };
    },
  };
}
export type P06CatalogService = ReturnType<typeof createP06CatalogService>;
export const p06Catalog = createP06CatalogService();
