/** P08 UI-render fixtures only.
 * Exact namespaced identities and read projections; no auth storage, API or hardware.
 */
import { AppError } from '../errors/AppError';
import type {
  P08State,
  P08View,
} from '../features/history/p08HistoryController';
import type {
  P08Batch,
  P08Context,
  P08Detail,
  P08Event,
  P08Filters,
  P08HistoryService,
  P08Meta,
  P08PageMeta,
  P08Response,
  P08Summary,
} from '../services/wms/p08Types';

export const p08PanelIds = [
  'P08.S01',
  'P08.S02',
  'P08.S03',
  'P08.S04',
] as const;
export type P08PanelId = (typeof p08PanelIds)[number];

const actorId = '08000000-0000-4000-8000-000000000001';
const authSessionId = '08000000-0000-4000-8000-000000000002';
const warehouseId = '08000000-0000-4000-8000-000000000003';
const scanSessionId = '08000000-0008-4008-8008-000000000001';
const permissions = [
  'documents.read',
  'history.read',
  'inbound.view',
  'inventory.trace',
  'inventory.view',
  'outbound.view',
  'physical_code.assign_rfid',
  'warranty.view',
] as const;
const scopeKey = JSON.stringify({
  actorId,
  authSessionId,
  warehouseId,
  permissions: [...permissions].sort(),
});
const filters: P08Filters = {
  date_mode: 'ALL',
  source: 'ALL',
  business: 'ALL',
};

export const p08Context: P08Context = {
  session: {
    accessToken: 'P08_UI_RENDER_ONLY_NOT_A_REAL_CREDENTIAL',
    expiresAtMs: 4102444800000,
    issuedAtMs: 1793145600000,
    userId: actorId,
    authSessionId,
    activeWarehouseId: warehouseId,
    userName: 'Nhân viên TEST UI',
  },
  user: {
    id: actorId,
    user_id: actorId,
    auth_session_id: authSessionId,
    active_warehouse_id: warehouseId,
    display_name: 'Nhân viên TEST UI',
    status: 'ACTIVE',
    permissions,
    warehouse_context: { status: 'READY' },
    available_warehouses: [
      {
        warehouse_id: warehouseId,
        code: 'KHO-TEST-UI',
        name: 'Kho Hoa Nam',
        status: 'ACTIVE',
      },
    ],
  },
};

export function isP08PanelId(panel: string): panel is P08PanelId {
  return p08PanelIds.some(id => id === panel);
}

function meta(total: number): P08Meta {
  return {
    contract: 'mini-app-p08-v1',
    warehouseId,
    timezone: 'Asia/Ho_Chi_Minh',
    countUnit: 'ACTIVITY',
    historyExportAvailable: false,
    sources: {
      DOCUMENT: { status: 'INCLUDED' },
      WARRANTY: { status: 'INCLUDED' },
      NFC: { status: 'INCLUDED' },
      SCAN: { status: 'INCLUDED' },
    },
    dateMode: 'ALL',
    total,
    request_id: null,
    timestamp: '2026-10-28T10:00:00+07:00',
    asOf: '2026-10-28T10:00:00+07:00',
    snapshot: {
      id: '08000000-0008-4008-8008-000000009999',
      observed_at: '2026-10-28T10:00:00+07:00',
      consistency: 'SINGLE_RESPONSE_DATABASE_SNAPSHOT',
      cross_request_snapshot: false,
    },
    organizationScope: {},
    tenantIsolation: 'SINGLE_TENANT_DATABASE_REQUIRED',
    scopePolicy: 'PERSISTED_OWNER_WAREHOUSE_BEFORE_DEDUP_AND_TOTAL',
    coveragePolicy: 'ONLY_PERSISTED_SCOPED_EVENTS_NOT_ALL_BUSINESS_RECORDS',
    nfcLegacyPolicy: 'EXCLUDED_WHEN_ASSIGNMENT_WAREHOUSE_NOT_RECORDED',
    paginationConsistency: 'KEYSET_UPPER_BOUND_NOT_FROZEN_SNAPSHOT',
  };
}

function pageMeta(total: number): P08PageMeta {
  return { ...meta(total), limit: 20, hasMore: false, nextCursor: null };
}

function event(input: {
  source: P08Event['source'];
  business: P08Event['business'];
  parent: string;
  event: string;
  table: string;
  action: string;
  status: string;
  label: string;
  time: string;
  codeId?: string;
}): P08Event {
  return {
    activityId: `${input.source}:${input.event}`,
    recordId: `${input.source}:${input.parent}`,
    eventId: input.event,
    source: input.source,
    sourceTable: input.table,
    business: input.business,
    status: input.status,
    action: input.action,
    label: input.label,
    time: input.time,
    timeStatus: 'SOURCE_TIMESTAMP',
    codeId: input.codeId ?? null,
    rawCode: null,
    quantity: null,
    rawCodePolicy: 'OMITTED_MAY_CONTAIN_PII_OR_SECRETS',
    detail: { canOpen: false, url: null, ownerPermissionRechecked: true },
    attachments: {
      canOpen: false,
      url: null,
      policy: 'OWNER_ENDPOINT_REAUTHORIZATION_NO_STORAGE_URL',
    },
    isConfirmationReceipt: false,
  };
}

const scanEvents: P08Event[] = [
  event({
    source: 'SCAN',
    business: 'SCAN',
    parent: scanSessionId,
    event: '08000000-0008-4008-8008-000000000011',
    table: 'scan_record_events',
    action: 'SCAN',
    status: 'ACCEPTED',
    label: 'Quét mã TEST UI',
    time: '2026-10-28T02:51:31Z',
    codeId: 'TEST-UI-CODE-001',
  }),
  event({
    source: 'SCAN',
    business: 'SCAN',
    parent: scanSessionId,
    event: '08000000-0008-4008-8008-000000000012',
    table: 'scan_record_events',
    action: 'SCAN',
    status: 'DUPLICATE',
    label: 'Đọc trùng TEST UI',
    time: '2026-10-28T02:52:10Z',
    codeId: 'TEST-UI-CODE-001',
  }),
  event({
    source: 'SCAN',
    business: 'SCAN',
    parent: scanSessionId,
    event: '08000000-0008-4008-8008-000000000013',
    table: 'scan_record_events',
    action: 'CHECK',
    status: 'RESOLVED',
    label: 'Đối chiếu TEST UI',
    time: '2026-10-28T02:53:04Z',
  }),
];

const listRows: P08Event[] = [
  event({
    source: 'DOCUMENT',
    business: 'INBOUND',
    parent: '08000000-0008-4008-8008-000000000101',
    event: '08000000-0008-4008-8008-000000000201',
    table: 'stock_document_events',
    action: 'RECEIVE',
    status: 'WAITING_APPROVAL',
    label: 'PN-20261102090731-TEST-UI-0001',
    time: '2026-11-02T02:59:00Z',
  }),
  event({
    source: 'DOCUMENT',
    business: 'OUTBOUND',
    parent: '08000000-0008-4008-8008-000000000102',
    event: '08000000-0008-4008-8008-000000000202',
    table: 'stock_document_events',
    action: 'POST',
    status: 'POSTED',
    label: 'PX-TEST-UI-0001',
    time: '2026-10-28T02:35:00Z',
  }),
  event({
    source: 'WARRANTY',
    business: 'WARRANTY',
    parent: '08000000-0008-4008-8008-000000000103',
    event: '08000000-0008-4008-8008-000000000203',
    table: 'warranty_case_events',
    action: 'CHECK',
    status: 'CHECKING',
    label: 'BH-TEST-UI-0001',
    time: '2026-10-28T02:30:00Z',
  }),
  event({
    source: 'NFC',
    business: 'NFC',
    parent: '08000000-0008-4008-8008-000000000104',
    event: '08000000-0008-4008-8008-000000000204',
    table: 'nfc_tag_events',
    action: 'ASSIGN_ITEM_NFC',
    status: 'SUCCESS',
    label: 'NFC-TEST-UI-0001',
    time: '2026-10-28T02:25:00Z',
  }),
  ...scanEvents,
].sort((a, b) => (b.time ?? '').localeCompare(a.time ?? ''));

const detail: P08Detail = {
  recordId: `SCAN:${scanSessionId}`,
  recordTarget: {
    recordId: `SCAN:${scanSessionId}`,
    source: 'SCAN',
    ownerId: scanSessionId,
    attachments: false,
    scanSession: true,
    nfcHistory: false,
  },
  selectedActivity: scanEvents[0],
  events: scanEvents,
};

const batch: P08Batch = {
  sessionId: scanSessionId,
  sessionType: 'SCAN_BATCH',
  sourceTables: ['scan_record_events'],
  total: 3,
  accepted: 1,
  duplicate: 1,
  other: 1,
  statusTotals: { ACCEPTED: 1, DUPLICATE: 1, RESOLVED: 1 },
  quantity: null,
  quantityStatus: 'NOT_RECORDED_IN_SCAN_EVIDENCE',
  acceptedStatusValues: ['ACCEPTED'],
  duplicateStatusValues: ['DUPLICATE'],
  events: scanEvents,
};

function summarize(rows: P08Event[]): P08Summary {
  const businesses = [
    'INBOUND',
    'OUTBOUND',
    'WARRANTY',
    'NFC',
    'SCAN',
    'OTHER',
  ] as const;
  return {
    grandTotal: rows.length,
    availableTotal: rows.length,
    countUnit: 'ACTIVITY',
    groups: businesses.map(business => ({
      business,
      availableTotal: rows.filter(e => e.business === business).length,
    })),
    statusTotals: [],
    coverage: 'COMPLETE_FOR_AUTHORIZED_SUPPORTED_SCOPE',
    quantity: null,
    quantityStatus: 'NOT_AN_ACTIVITY_COUNT',
  };
}
const summary = summarize(listRows);

function view(panel: P08PanelId): P08View {
  if (panel === 'P08.S01') {
    return {
      panel: 'S01',
      filters,
      rows: listRows,
      meta: pageMeta(listRows.length),
      loading: false,
      scrollY: 0,
    };
  }
  if (panel === 'P08.S02') {
    return {
      panel: 'S02',
      filters,
      recordId: detail.recordId,
      activityId: scanEvents[0].activityId,
      rows: [],
      detail,
      meta: pageMeta(scanEvents.length),
      loading: false,
      scrollY: 0,
    };
  }
  if (panel === 'P08.S03') {
    return {
      panel: 'S03',
      filters,
      batchId: scanSessionId,
      rows: [],
      batch,
      meta: pageMeta(batch.total),
      loading: false,
      scrollY: 0,
    };
  }
  return {
    panel: 'S04',
    filters,
    rows: [],
    summary,
    meta: meta(summary.availableTotal),
    loading: false,
    scrollY: 0,
  };
}

function cancelled(): AppError {
  return new AppError({
    kind: 'cancelled',
    message: 'P08_UI_RENDER_CANCELLED',
  });
}

function assertActive(signal?: AbortSignal) {
  if (signal?.aborted) throw cancelled();
}

function selectRows(filters: P08Filters) {
  return listRows.filter(
    e =>
      (!filters.source ||
        filters.source === 'ALL' ||
        e.source === filters.source) &&
      (!filters.business ||
        filters.business === 'ALL' ||
        e.business === filters.business) &&
      (!filters.status || e.status === filters.status) &&
      (!filters.keyword ||
        (e.label + ' ' + e.action)
          .toLowerCase()
          .includes(filters.keyword.toLowerCase())) &&
      (filters.date_mode === 'ALL' ||
        (filters.date_mode === 'DATE'
          ? e.time?.slice(0, 10) === filters.date
          : e.time &&
            e.time.slice(0, 10) >= filters.from &&
            e.time.slice(0, 10) <= filters.to)),
  );
}
function service(): P08HistoryService {
  return {
    scopeKey: () => scopeKey,
    records: async (filters, _paging, signal) => {
      assertActive(signal);
      const rows = selectRows(filters);
      return {
        data: rows,
        meta: { ...pageMeta(rows.length), dateMode: filters.date_mode },
      };
    },
    detail: async (recordId, activityId, _paging, signal) => {
      assertActive(signal);
      const events = listRows.filter(e => e.recordId === recordId);
      if (!events.length) throw new Error('P08_UI_RENDER_UNKNOWN_RECORD');
      const selectedActivity = activityId
        ? events.find(e => e.activityId === activityId) ?? null
        : null;
      if (activityId && !selectedActivity)
        throw new Error('P08_UI_RENDER_UNKNOWN_ACTIVITY');
      return {
        data: { recordId, selectedActivity, events },
        meta: pageMeta(events.length),
      };
    },
    session: async (batchId, _paging, signal) => {
      assertActive(signal);
      if (batchId !== scanSessionId)
        throw new Error('P08_UI_RENDER_UNEXPECTED_SESSION_ID');
      return { data: batch, meta: pageMeta(batch.total) };
    },
    summary: async (
      filters,
      signal,
    ): Promise<P08Response<P08Summary, P08Meta>> => {
      assertActive(signal);
      const data = summarize(selectRows(filters));
      return {
        data,
        meta: { ...meta(data.availableTotal), dateMode: filters.date_mode },
      };
    },
  };
}

const stayOnPanel = () => undefined;

export function createP08Fixture(panel: P08PanelId) {
  const state: P08State = { scope: scopeKey, current: view(panel), stack: [] };
  return {
    context: p08Context,
    service: service(),
    retainedState: { current: state as P08State | undefined },
    onBack: stayOnPanel,
    onOpenDocument: stayOnPanel,
    onOpenWarranty: stayOnPanel,
    onOpenNfc: stayOnPanel,
    onOpenSession: stayOnPanel,
    onSelectTab: stayOnPanel,
  };
}
