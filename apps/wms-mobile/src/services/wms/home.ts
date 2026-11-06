/** P02 revision 2. Read-only; pending scope/sort capabilities stay closed. */
import { AppError } from '../../errors/AppError';
import { apiClient } from '../../api/client';
import { UUID_PATTERN, validShiftTimestamp } from './workShift';
import type { ReadClient, ReadOptions } from './readOnlyClient';
import type { CurrentUser, Warehouse } from './types';
import type { InboundDocument, OutboundDocument, Page, ApiMeta } from './types';
import { mapCurrentUser } from './queries';
import { getCurrentEnvironment } from '../../config/env';
import { p12DevEnabled } from '../../config/p12Release';
import type { DocumentTimestamp } from './documentTimestamps';
import type { DocumentStatusPresentation } from '../../features/documents/p12/presentation';
import {
  P02_CONTRACT,
  p02DevReadEnabled,
  verifyP02Runtime,
} from '../../config/p02Release';

export const HOME_SUMMARY_PATH = '/api/v1/mini-app/dashboard/summary';
export const OPEN_WARRANTY_STATUSES = [
  'RECEIVED',
  'CHECKING',
  'REPAIRING',
  'COMPLETED',
] as const;

// Summary v2 is prepared from 701e9352, independently gated until deployment
// and live reads are verified. Recent uses the existing P12 runtime gate.
const devRelease = getCurrentEnvironment().expectedTier === 'dev-test';
export const HOME_CAPABILITIES = Object.freeze({
  stockSummary: p02DevReadEnabled(),
  warehouseListFilter: devRelease,
  stableCreatedAtSort: devRelease,
  warrantyWarehouseScope: false,
  recentAggregate: p12DevEnabled(),
});
export type HomeCapabilities = {
  readonly [K in keyof typeof HOME_CAPABILITIES]: boolean;
};
export type RecentKind = 'inbound' | 'outbound' | 'warranty';
export interface RecentDocument {
  readonly id: string;
  readonly number: string | null;
  readonly type: RecentKind;
  readonly status?: string;
  readonly miniAppStatus?: string;
  readonly createdAt?: string | null;
  readonly timestamp?: DocumentTimestamp;
  readonly displayMappingPending?: boolean;
  readonly statusPresentation?: DocumentStatusPresentation;
}
export interface HomeStockSummary {
  readonly warehouseId: string;
  readonly inbound: {
    readonly pending: number;
    readonly posted: number;
  } | null;
  readonly outbound: {
    readonly pending: number;
    readonly posted: number;
  } | null;
  readonly authorizationScope: 'GLOBAL' | 'WAREHOUSE_SCOPED';
  readonly warranty: {
    readonly open: number;
    readonly ownershipComplete: boolean;
  } | null;
}
const object = (v: unknown): Record<string, unknown> | undefined =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : undefined;
export const validCount = (v: unknown): v is number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
const text = (v: unknown): string | undefined =>
  typeof v === 'string' && v.trim() ? v : undefined;
function invalid(route: string, message: string): never {
  throw new AppError({ kind: 'parse', route, message });
}

export function hasHomePermission(
  user: CurrentUser | undefined,
  ...permissions: string[]
): boolean {
  return permissions.some(p => user?.permissions?.includes(p) === true);
}
export function confirmedHomeWarehouse(user: CurrentUser): string | undefined {
  if (user.warehouse_context && user.warehouse_context.status !== 'READY')
    return undefined;
  const id = user.active_warehouse_id;
  if (typeof id !== 'string' || !UUID_PATTERN.test(id)) return undefined;
  // null=unrestricted, []=no warehouses, undefined=unverified. Never select a warehouse.
  if (
    user.warehouse_scope_ids !== null &&
    user.warehouse_scope_ids?.includes(id) !== true
  )
    return undefined;
  return id;
}
export function parseHomeStockSummary(
  value: unknown,
  warehouseId: string,
  meta: unknown,
): HomeStockSummary {
  const r = object(value);
  if (
    object(meta)?.contract !== P02_CONTRACT ||
    r?.warehouse_id !== warehouseId ||
    r.data_scope !== 'WAREHOUSE_SCOPED' ||
    !['GLOBAL', 'WAREHOUSE_SCOPED'].includes(String(r.authorization_scope))
  ) {
    return invalid(
      HOME_SUMMARY_PATH,
      'Tổng công việc chưa được xác nhận cho đúng kho.',
    );
  }
  if (
    !validCount(r.pending_approval_count) ||
    !validCount(r.posted_count) ||
    typeof r.timezone !== 'string' ||
    typeof r.date !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(r.date) ||
    !Number.isFinite(Date.parse(r.date + 'T00:00:00Z')) ||
    new Date(r.date + 'T00:00:00Z').toISOString().slice(0, 10) !== r.date
  )
    return invalid(HOME_SUMMARY_PATH, 'Schema KPI chưa khớp contract P02.');
  const part = (v: unknown): HomeStockSummary['inbound'] => {
    if (v === null) return null;
    const p = object(v);
    if (
      !validCount(p?.pending_approval_count) ||
      !validCount(p?.posted_count)
    ) {
      return invalid(
        HOME_SUMMARY_PATH,
        'Chỉ số công việc thiếu dữ liệu hợp lệ.',
      );
    }
    return { pending: p.pending_approval_count, posted: p.posted_count };
  };
  let warranty: HomeStockSummary['warranty'] = null;
  if (r.warranty !== null) {
    const w = object(r.warranty),
      owner = object(w?.warehouse_scope);
    if (
      !validCount(w?.open_count) ||
      JSON.stringify(w?.open_statuses) !==
        JSON.stringify(OPEN_WARRANTY_STATUSES) ||
      owner?.contract !== 'warranty-owner-v1' ||
      owner.warehouse_id !== warehouseId ||
      owner.unassigned_policy !== 'EXCLUDED' ||
      typeof owner.ownership_complete !== 'boolean'
    )
      return invalid(
        HOME_SUMMARY_PATH,
        'Nguồn KPI bảo hành chưa khớp contract hoặc kho.',
      );
    warranty = {
      open: w.open_count,
      ownershipComplete: owner.ownership_complete,
    };
  }
  return {
    warehouseId,
    inbound: part(r.inbound),
    outbound: part(r.outbound),
    authorizationScope:
      r.authorization_scope as HomeStockSummary['authorizationScope'],
    warranty,
  };
}
async function verifiedData(
  path: string,
  options: ReadOptions,
  client: ReadClient,
): Promise<unknown> {
  const response = await client.get<unknown>(path, options),
    body = object(response.data);
  if (
    response.status !== 200 ||
    body?.success !== true ||
    !Object.hasOwn(body, 'data')
  ) {
    return invalid(path, 'Phản hồi đọc chưa xác nhận dữ liệu thành công.');
  }
  return body.data;
}
export async function fetchHomeUser(
  options: ReadOptions = {},
  client: ReadClient = apiClient,
): Promise<CurrentUser> {
  return mapCurrentUser(await verifiedData('/api/v1/auth/me', options, client));
}
export async function fetchHomeStockSummary(
  warehouseId: string,
  options: ReadOptions = {},
  client: ReadClient = apiClient,
): Promise<HomeStockSummary> {
  if (client === apiClient) await verifyP02Runtime();
  if (!UUID_PATTERN.test(warehouseId))
    throw new AppError({
      kind: 'config',
      message: 'Chưa xác nhận UUID kho.',
      route: HOME_SUMMARY_PATH,
    });
  const query = options.query ?? {};
  if (
    Object.keys(query).some(key => !['warehouse_id', 'date'].includes(key)) ||
    (query.warehouse_id !== undefined && query.warehouse_id !== warehouseId)
  )
    throw new AppError({
      kind: 'config',
      route: HOME_SUMMARY_PATH,
      message: 'Bộ lọc KPI không hợp lệ.',
    });
  const response = await client.get<unknown>(HOME_SUMMARY_PATH, {
    ...options,
    query: { ...query, warehouse_id: warehouseId.toLowerCase() },
  });
  const envelope = object(response.data);
  if (response.status !== 200 || envelope?.success !== true)
    return invalid(HOME_SUMMARY_PATH, 'Chưa xác minh phản hồi KPI.');
  return parseHomeStockSummary(
    envelope.data,
    warehouseId.toLowerCase(),
    envelope.meta,
  );
}
export async function fetchHomeWarehouse(
  warehouseId: string,
  options: ReadOptions = {},
  client: ReadClient = apiClient,
): Promise<Warehouse> {
  if (!UUID_PATTERN.test(warehouseId))
    throw new AppError({ kind: 'config', message: 'Chưa xác nhận UUID kho.' });
  const path = '/api/v1/warehouses/' + encodeURIComponent(warehouseId),
    r = object(await verifiedData(path, options, client));
  if (r?.id !== warehouseId)
    return invalid(path, 'Hồ sơ kho không khớp context đã xác nhận.');
  return {
    id: warehouseId,
    name: text(r.name),
    code: text(r.code),
    status: text(r.status),
  };
}
export async function fetchHomeUnreadCount(
  options: ReadOptions = {},
  client: ReadClient = apiClient,
): Promise<number> {
  const path = '/api/v1/notifications/unread-count',
    r = object(await verifiedData(path, options, client));
  if (!validCount(r?.unread_count))
    return invalid(path, 'Chưa xác minh được số thông báo chưa đọc.');
  return r.unread_count;
}
export function warehouseActivity(
  warehouse: Warehouse | undefined,
): boolean | undefined {
  return warehouse?.status === 'ACTIVE'
    ? true
    : warehouse?.status === 'INACTIVE'
    ? false
    : undefined;
}
export function aggregatePending(
  summary: HomeStockSummary,
  user: CurrentUser,
): number | undefined {
  if (
    !hasHomePermission(user, 'inbound.view') ||
    !hasHomePermission(user, 'outbound.view') ||
    summary.inbound === null ||
    summary.outbound === null
  )
    return undefined;
  const total = summary.inbound.pending + summary.outbound.pending;
  return validCount(total) ? total : undefined;
}
/** Available only once the deployed warehouse filter is certified. No Web alias. */
export async function fetchHomePendingPage<K extends 'inbound' | 'outbound'>(
  kind: K,
  warehouseId: string,
  page = 1,
  options: ReadOptions = {},
  client: ReadClient = apiClient,
  capabilities: HomeCapabilities = HOME_CAPABILITIES,
): Promise<Page<K extends 'inbound' ? InboundDocument : OutboundDocument>> {
  if (!capabilities.warehouseListFilter)
    throw new AppError({
      kind: 'blocked_by_gate',
      message: 'Lọc danh sách theo kho chưa được xác nhận triển khai.',
    });
  if (
    !UUID_PATTERN.test(warehouseId) ||
    !Number.isSafeInteger(page) ||
    page < 1
  )
    throw new AppError({
      kind: 'config',
      message: 'Context hoặc trang danh sách không hợp lệ.',
    });
  const path =
    kind === 'inbound'
      ? '/api/v1/mini-app/inbound-documents'
      : '/api/v1/mini-app/outbound-documents';
  const response = await client.get<unknown>(path, {
    ...options,
    query: {
      warehouse_id: warehouseId,
      page,
      per_page: 50,
      ...(kind === 'inbound'
        ? { status: 'WAITING_APPROVAL' }
        : { ready_for_issue: 1 }),
    },
  });
  const envelope = object(response.data),
    meta = object(envelope?.meta);
  if (
    response.status !== 200 ||
    envelope?.success !== true ||
    !Array.isArray(envelope.data) ||
    !validCount(meta?.total)
  )
    return invalid(path, 'Danh sách chưa trả tổng đã xác minh.');
  return { items: envelope.data, meta: meta as ApiMeta };
}
/** Exact ID/type/timestamp DTO; canonical and Mini App status are never conflated. */
export function mergeHomeRecent(
  sources: readonly { type: RecentKind; items: readonly unknown[] }[],
): RecentDocument[] {
  const rows = new Map<string, RecentDocument>();
  for (const { type, items } of sources)
    for (const raw of items) {
      const r = object(raw),
        id = text(type === 'warranty' ? r?.warranty_case_id : r?.id),
        number = text(type === 'warranty' ? r?.warranty_case_code : r?.doc_no),
        at = text(r?.created_at);
      if (!id || !number || !at || !validShiftTimestamp(at)) continue;
      rows.set(type + ':' + id, {
        id,
        number,
        type,
        createdAt: at,
        status: text(r?.status),
        miniAppStatus: text(r?.mini_app_status),
      });
    }
  return [...rows.values()]
    .sort(
      (a, b) =>
        Date.parse(b.createdAt!) - Date.parse(a.createdAt!) ||
        a.type.toUpperCase().localeCompare(b.type.toUpperCase()) ||
        b.id.localeCompare(a.id),
    )
    .slice(0, 3);
}
