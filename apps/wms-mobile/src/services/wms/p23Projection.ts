/** Persisted v3 projections only. Never hydrate history from current catalog. */
import { AppError } from '../../errors/AppError';
import { ownerUuid } from '../../app/ownerNavigation';
export const P23_CONTRACT = 'mini-app-p23-read-v3';
type Row = Record<string, unknown>;
const row = (v: unknown): Row =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Row) : {};
const ensure = (ok: unknown, detail?: string): void => {
  if (!ok)
    throw new AppError({
      kind: 'parse',
      code: 'P23_PROJECTION_INVALID',
      message:
        'Lịch sử phiên chưa khớp bằng chứng nguồn v3. Không dùng dữ liệu thay thế.' +
        (detail ? ` (${detail})` : ''),
    });
};
const n = (v: unknown) =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
const text = (v: unknown): string | null => {
  ensure(v === null || typeof v === 'string');
  return v as string | null;
};

export interface P23LatestEvent {
  id: string;
  status: string | null;
  rawCode: string | null;
  reason: string | null;
  serial: string | null;
  sku: string | null;
  issuedQuantity: number | null;
  actor: string | null;
  occurredAt: string | null;
}
export function p23Counts(value: unknown): Row {
  const c = row(value);
  for (const key of [
    'total',
    'accepted',
    'duplicate',
    'other',
    'explicitRejected',
    'rejected',
    'quantity',
    'issuedQuantity',
  ]) {
    ensure(c[key] === null || n(c[key]), `counts.${key}`);
  }
  const totals = row(c.statusTotals);
  ensure(Object.values(totals).every(n));
  if (c.total !== null) {
    ensure(c.accepted === Number(totals.ACCEPTED ?? 0));
    ensure(c.duplicate === Number(totals.DUPLICATE ?? 0));
    ensure(c.explicitRejected === Number(totals.REJECTED ?? 0));
    ensure(
      c.other === Number(c.total) - Number(c.accepted) - Number(c.duplicate),
    );
  }
  // V3 has no authoritative rejected aggregate or scan posting quantity.
  ensure(
    c.rejected === null &&
      c.quantity === null &&
      c.issuedQuantity === null &&
      c.isConfirmationReceipt === false,
  );
  return c;
}
export function p23Latest(value: unknown): P23LatestEvent | null {
  if (value === null) return null;
  const e = row(value);
  ensure(
    ownerUuid(e.eventId) &&
      ['scan_events', 'scan_record_events'].includes(String(e.sourceTable)) &&
      (e.issuedQuantity === null || n(e.issuedQuantity)),
  );
  return {
    id: String(e.eventId),
    status: text(e.status),
    rawCode: text(e.rawCode),
    reason: text(e.reason),
    serial: text(e.serial),
    sku: text(e.sku),
    issuedQuantity: e.issuedQuantity as number | null,
    actor: text(e.displayName),
    occurredAt: text(e.occurredAt),
  };
}
export function p23Batch(
  value: unknown,
  warehouse: string,
  countsValue?: unknown,
) {
  const b = row(value),
    session = row(b.session);
  ensure(
    ownerUuid(b.sessionId) &&
      b.sessionType === 'SCAN_BATCH' &&
      b.warehouseId === warehouse &&
      ['scan_batch', 'scan_batches'].includes(String(b.sourceTable)) &&
      b.isConfirmationReceipt === false &&
      b.timePolicy === 'CREATED_AT_IS_NOT_STARTED_AT_OR_ENDED_AT',
  );
  const start = text(b.startedAt),
    end = text(b.endedAt),
    status = text(b.status);
  for (const [field, v] of [
    ['start', start],
    ['end', end],
    ['status', status],
  ] as const) {
    const projection = row(session[field]);
    ensure(
      projection.value === v &&
        (v === null
          ? projection.status === 'NOT_RECORDED'
          : typeof projection.status === 'string'),
    );
  }
  const latestStatus = text(b.latestEventStatus),
    latest = p23Latest(b.latestEvent);
  if (latestStatus === 'PARTIAL_SOURCE') ensure(latest === null);
  return {
    id: String(b.sessionId),
    number: text(b.batchNo),
    sourceType: text(b.sourceType),
    status,
    createdAt: text(b.createdAt),
    startedAt: start,
    endedAt: end,
    counts: p23Counts(countsValue ?? b.counts),
    latestEvent: latest,
    latestEventStatus: latestStatus,
  };
}
export function p23ListMeta(meta: Row): void {
  ensure(
    meta.contract === P23_CONTRACT &&
      meta.countUnit === 'SCAN_SESSION' &&
      meta.scopePolicy ===
        'PERSISTED_BATCH_WAREHOUSE_BEFORE_DEDUP_FILTER_TOTAL' &&
      ['SUPPORTED_PERSISTED_BATCHES', 'PARTIAL_SOURCE'].includes(
        String(meta.coverage),
      ) &&
      n(meta.availableTotal),
  );
  ensure(
    meta.coverage === 'PARTIAL_SOURCE'
      ? meta.total === null
      : n(meta.total) && meta.total === meta.availableTotal,
  );
}
