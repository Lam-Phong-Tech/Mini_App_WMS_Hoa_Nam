import { id } from './p09Mock';
// Isolated structural fixture matching the supplied exact49 v3 envelope.
export const p23CountsFixture = () => ({
  total: 1,
  accepted: 0,
  duplicate: 0,
  other: 1,
  explicitRejected: 0,
  rejected: null,
  quantity: null,
  issuedQuantity: null,
  statusTotals: { RESOLVED: 1 },
  isConfirmationReceipt: false,
});
export const p23LatestFixture = () => ({
  eventId: id(7),
  status: 'RESOLVED',
  rawCode: 'OFFLINE-RAW',
  reason: 'Persisted reason',
  serial: null,
  sku: null,
  issuedQuantity: null,
  displayName: null,
  occurredAt: '2026-10-15 03:45:57',
  sourceTable: 'scan_events',
});
export const p23BatchFixture = () => ({
  sessionId: id(6),
  warehouseId: id(3),
  sessionType: 'SCAN_BATCH',
  sourceTable: 'scan_batch',
  batchNo: null,
  sourceType: 'RECEIPT_DOCUMENT',
  status: null,
  createdAt: '2026-10-15 03:45:57',
  startedAt: null,
  endedAt: null,
  timePolicy: 'CREATED_AT_IS_NOT_STARTED_AT_OR_ENDED_AT',
  session: {
    start: { value: null, status: 'NOT_RECORDED' },
    end: { value: null, status: 'NOT_RECORDED' },
    status: { value: null, status: 'NOT_RECORDED' },
  },
  latestEvent: p23LatestFixture(),
  latestEventStatus: 'AVAILABLE_RETAINED_EVENTS',
  counts: p23CountsFixture(),
  isConfirmationReceipt: false,
});
export const p23MetaFixture = () => ({
  contract: 'mini-app-p23-read-v3',
  warehouseId: id(3),
  countUnit: 'SCAN_SESSION',
  total: 1,
  availableTotal: 1,
  coverage: 'SUPPORTED_PERSISTED_BATCHES',
  scopePolicy: 'PERSISTED_BATCH_WAREHOUSE_BEFORE_DEDUP_FILTER_TOTAL',
  hasMore: false,
  nextCursor: null,
  nextPage: null,
  timezone: 'Asia/Ho_Chi_Minh',
});
export const p23DetailFixture = () => ({
  success: true,
  data: {
    sessionId: id(6),
    events: [
      {
        recordId: 'SCAN:' + id(6),
        eventId: id(7),
        activityId: 'SCAN:' + id(7),
        status: 'RESOLVED',
        action: 'SCAN',
        time: '2026-10-15 03:45:57',
        rawCode: null,
        quantity: null,
        isConfirmationReceipt: false,
      },
    ],
    p23: {
      contract: 'mini-app-p23-read-v3',
      // Detail keeps counts beside batch in data.p23, matching live P08/P23.
      batch: (() => {
        const batch: Partial<ReturnType<typeof p23BatchFixture>> = {
          ...p23BatchFixture(),
        };
        delete batch.counts;
        return batch;
      })(),
      counts: p23CountsFixture(),
    },
  },
  meta: {
    contract: 'mini-app-p08-v1',
    warehouseId: id(3),
    countUnit: 'ACTIVITY',
    total: 1,
    hasMore: false,
    nextCursor: null,
    timezone: 'Asia/Ho_Chi_Minh',
  },
});
