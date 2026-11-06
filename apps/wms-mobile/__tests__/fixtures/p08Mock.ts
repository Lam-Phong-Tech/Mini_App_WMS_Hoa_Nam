/** MOCK HTTP ONLY — pinned projection, no credentials, no live backend evidence. */
import type { ApiResponse, RequestOptions } from '../../src/api/client';
import { createP08MockHistory } from '../../src/services/wms/p08History';
import type {
  P08Context,
  P08Event,
  P08Meta,
  P08PageMeta,
  P08Source,
  P08Summary,
} from '../../src/services/wms/p08Types';
import type { ReadClient } from '../../src/services/wms/readOnlyClient';

export const id = (n: number) =>
  `10000000-0000-4000-8000-${n.toString().padStart(12, '0')}`;
export const context = (): P08Context => ({
  session: {
    userId: id(1),
    authSessionId: id(2),
    activeWarehouseId: id(3),
    accessToken: 'mock-http-access-not-a-credential',
  },
  user: {
    id: id(1),
    auth_session_id: id(2),
    active_warehouse_id: id(3),
    warehouse_context: { status: 'READY' },
    available_warehouses: [{ warehouse_id: id(3), status: 'ACTIVE' }],
    permissions: [
      'history.read',
      'documents.read',
      'inbound.view',
      'outbound.view',
      'warranty.view',
      'inventory.view',
      'inventory.trace',
    ],
  },
});
export function event(
  n = 10,
  source: P08Source = 'DOCUMENT',
  parent = 9,
): P08Event {
  const owner =
    source === 'DOCUMENT'
      ? `/api/v1/mini-app/inbound-documents/${id(parent)}`
      : source === 'WARRANTY'
      ? `/api/v1/mini-app/warranty-cases/${id(parent)}`
      : source === 'NFC'
      ? `/api/v1/mini-app/nfc-tags/${id(parent)}`
      : null;
  return {
    activityId: source + ':' + id(n),
    recordId: source + ':' + id(parent),
    eventId: id(n),
    source,
    sourceTable: source === 'SCAN' ? 'scan_events' : 'document_status_history',
    business: source === 'DOCUMENT' ? 'INBOUND' : source,
    status: source === 'SCAN' ? 'ACCEPTED' : 'WAITING_APPROVAL',
    label: 'mock hoạt động ' + n,
    action: source === 'SCAN' ? 'SCAN' : 'SUBMIT',
    time: '2026-10-10T08:00:00+07:00',
    timeStatus: 'SOURCE_TIMESTAMP',
    codeId: null,
    rawCode: null,
    rawCodePolicy: 'OMITTED_MAY_CONTAIN_PII_OR_SECRETS',
    quantity: null,
    detail: {
      canOpen: owner !== null,
      url: owner,
      ownerPermissionRechecked: true,
    },
    attachments: {
      canOpen: source === 'DOCUMENT' || source === 'WARRANTY',
      url:
        source === 'DOCUMENT' || source === 'WARRANTY'
          ? owner + '/attachments'
          : null,
      policy: 'OWNER_ENDPOINT_REAUTHORIZATION_NO_STORAGE_URL',
    },
    isConfirmationReceipt: false,
  };
}
export function meta(paged = true): P08Meta | P08PageMeta {
  return {
    contract: 'mini-app-p08-v1',
    warehouseId: id(3),
    timezone: 'Asia/Ho_Chi_Minh',
    countUnit: 'ACTIVITY',
    sources: {
      DOCUMENT: { status: 'INCLUDED' },
      WARRANTY: { status: 'INCLUDED' },
      NFC: { status: 'INCLUDED' },
      SCAN: {
        status: 'INCLUDED',
        adapters: { scan_events: 'INCLUDED', scan_record_events: 'INCLUDED' },
      },
    },
    dateMode: 'ALL',
    total: 3,
    request_id: 'mock-request',
    timestamp: '2026-10-10T08:00:00+07:00',
    asOf: '2026-10-10T08:00:00+07:00',
    snapshot: {
      id: id(100),
      observed_at: '2026-10-10T08:00:00+07:00',
      consistency: 'SINGLE_RESPONSE_DATABASE_SNAPSHOT',
      cross_request_snapshot: false,
    },
    organizationScope: {},
    tenantIsolation: 'SINGLE_TENANT_DATABASE_REQUIRED',
    scopePolicy: 'PERSISTED_OWNER_WAREHOUSE_BEFORE_DEDUP_AND_TOTAL',
    coveragePolicy: 'ONLY_PERSISTED_SCOPED_EVENTS_NOT_ALL_BUSINESS_RECORDS',
    nfcLegacyPolicy: 'EXCLUDED_WHEN_ASSIGNMENT_WAREHOUSE_NOT_RECORDED',
    paginationConsistency: 'KEYSET_UPPER_BOUND_NOT_FROZEN_SNAPSHOT',
    historyExportAvailable: false,
    ...(paged ? { limit: 20, hasMore: false, nextCursor: null } : {}),
  };
}
export function summary(): P08Summary {
  return {
    grandTotal: 3,
    availableTotal: 3,
    countUnit: 'ACTIVITY',
    groups: ['INBOUND', 'OUTBOUND', 'WARRANTY', 'NFC', 'SCAN', 'OTHER'].map(
      (business, i) => ({
        business: business as P08Summary['groups'][number]['business'],
        availableTotal: i ? 0 : 3,
      }),
    ),
    statusTotals: [
      { source: 'DOCUMENT', status: 'WAITING_APPROVAL', total: 3 },
    ],
    coverage: 'COMPLETE_FOR_AUTHORIZED_SUPPORTED_SCOPE',
    quantity: null,
    quantityStatus: 'NOT_AN_ACTIVITY_COUNT',
  };
}
export function harness(transform: (body: any, url: URL) => void = () => {}) {
  let current = context();
  const calls: { path: string; options: unknown }[] = [];
  const client: ReadClient = {
    async get<T>(
      path: string,
      options?: Omit<RequestOptions, 'path' | 'method'>,
    ): Promise<ApiResponse<T>> {
      calls.push({ path, options });
      const url = new URL('https://mock.invalid' + path),
        m: any = meta(!url.pathname.endsWith('/summary'));
      m.limit = Number(url.searchParams.get('limit') || 20);
      m.dateMode = url.searchParams.get('date_mode') || 'ALL';
      let data: any;
      if (url.pathname.endsWith('/summary')) data = summary();
      else if (url.pathname.includes('/scan-sessions/')) {
        const batch = url.pathname.split('/').pop()!;
        data = {
          sessionId: batch,
          sessionType: 'SCAN_BATCH',
          sourceTables: ['scan_batch'],
          total: 3,
          accepted: 1,
          duplicate: 1,
          other: 1,
          statusTotals: { ACCEPTED: 1, DUPLICATE: 1, RESOLVED: 1 },
          quantity: null,
          quantityStatus: 'NOT_RECORDED_IN_SCAN_EVIDENCE',
          acceptedStatusValues: ['ACCEPTED'],
          duplicateStatusValues: ['DUPLICATE'],
          events: [event(10, 'SCAN', Number(batch.slice(-12)))],
        };
      } else if (/\/records\//.test(url.pathname)) {
        const parent = decodeURIComponent(url.pathname.split('/').pop()!),
          source = parent.split(':')[0] as P08Source,
          e = event(10, source, Number(parent.slice(-12)));
        const selected = url.searchParams.get('activityId');
        data = {
          recordId: parent,
          selectedActivity: selected
            ? { ...e, activityId: selected, eventId: selected.split(':')[1] }
            : null,
          events: [e],
        };
      } else data = [event(10), event(11), event(10)];
      const body = { success: true, data, meta: m };
      transform(body, url);
      return { status: 200, data: body as T };
    },
  };
  return {
    client,
    calls,
    readContext: () => current,
    setContext: (c: P08Context) => {
      current = c;
    },
    api: createP08MockHistory(() => current, client),
  };
}
