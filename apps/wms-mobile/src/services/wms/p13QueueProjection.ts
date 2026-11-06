import { ownerUuid, type OwnerDocumentTarget } from '../../app/ownerNavigation';
import {
  readAssert,
  readObject,
  readInteger,
  readInstant,
  type ReadField,
} from './explicitReadFields';
export const P13_PROJECTION_CONTRACT = 'p13-queue-projection-v1';
export const P13_PROJECTION_REVISION = 'be04-r1-20261104';
type FieldReader = <T>(
  path: string,
  valid: (v: unknown) => v is T,
) => ReadField<T>;
type Comparison = 'VERSION_AND_STATUS_MATCH' | 'DIFFERS' | 'NOT_VERIFIABLE';
export interface QueueQuantity {
  unit: string | null;
  skuId: string | null;
  lineCount: number;
  planned: number | null;
  scanned: number | null;
}
export type QueueProjection =
  | { available: false; reason: string }
  | {
      available: true;
      version: number | null;
      asOf: string;
      lineCount: number;
      quantities: QueueQuantity[];
      creator: {
        id: string | null;
        name: ReadField<string>;
        jobTitle: ReadField<string>;
        capturedAt: string | null;
      };
      ownerComparison?: Comparison;
      currentStatus?: string | null;
    };
export interface QueueProjectionOptions {
  mode?: 'aggregate' | 'owner';
  rights?: readonly string[];
  ownerVersion?: unknown;
  ownerStatus?: unknown;
  currentStatus?: string | null;
  field?: FieldReader;
}
const text = (v: unknown): v is string =>
  typeof v === 'string' && !!v.trim() && v.length <= 1000;
const finite = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v);
const anyValue = (_v: unknown): _v is unknown => true;
function check(v: unknown): asserts v {
  readAssert(v, 'P13_QUEUE_PROJECTION_INVALID');
}
/** Two wire representations share one validator; omission metadata is read, never rehydrated into the wire. */
export function parseQueueProjection(
  value: unknown,
  target: OwnerDocumentTarget,
  options: QueueProjectionOptions = {},
): QueueProjection | undefined {
  if (value === undefined) return;
  const d = readObject(value),
    mode = options.mode ?? 'aggregate';
  const nullable = <T>(
    node: Record<string, unknown>,
    key: string,
    path: string,
    valid: (v: unknown) => v is T,
  ): T | null => {
    if (options.field) {
      const f = options.field(path, valid);
      return f.supplied ? f.value : null;
    }
    check(Object.hasOwn(node, key));
    const v = node[key];
    if (v === null) return null;
    check(valid(v));
    return v as T;
  };
  check(
    d.contract === P13_PROJECTION_CONTRACT &&
      d.revision === P13_PROJECTION_REVISION &&
      d.line_count_unit === 'LINE',
  );
  const read = readObject(d.read_target),
    query = readObject(read.query),
    resource =
      target.kind === 'warranty'
        ? 'warranty-cases'
        : target.kind + '-documents';
  check(
    ownerUuid(target.id) &&
      ownerUuid(target.warehouseId) &&
      read.method === 'GET' &&
      read.path === '/api/v1/mini-app/' + resource + '/' + target.id &&
      Object.keys(query).length === 1 &&
      query.warehouse_id === target.warehouseId,
  );
  const version = nullable(
      d,
      'document_version',
      '/document_version',
      readInteger,
    ),
    asOf = nullable(d, 'as_of', '/as_of', readInstant);
  if (d.availability !== 'RECORDED') {
    check(
      [
        'NOT_APPLICABLE',
        'SOURCE_NOT_HYDRATED',
        'CURRENT_OWNER_NOT_AVAILABLE',
      ].includes(String(d.availability)) &&
        version === null &&
        asOf === null &&
        nullable(d, 'version_source', '/version_source', text) === null &&
        nullable(d, 'line_count', '/line_count', readInteger) === null &&
        nullable(d, 'quantity_summary', '/quantity_summary', anyValue) ===
          null &&
        nullable(d, 'creator', '/creator', anyValue) === null,
    );
    check(target.kind !== 'warranty' || d.availability === 'NOT_APPLICABLE');
    return { available: false, reason: String(d.availability) };
  }
  check(
    target.kind !== 'warranty' &&
      asOf !== null &&
      d.version_source === 'stock_documents.version' &&
      d.version_availability ===
        (version === null ? 'NOT_RECORDED' : 'RECORDED') &&
      readInteger(d.line_count) &&
      d.read_target_semantics ===
        'CURRENT_OWNER_GET_COMPARE_DOCUMENT_VERSION_NOT_HISTORICAL_VERSION_PIN',
  );
  const q = readObject(d.quantity_summary);
  check(
    q.availability === 'RECORDED' &&
      q.source === 'stock_document_lines.qty_planned+scanned_qty' &&
      q.unit_semantics === 'CURRENT_SOURCE_SKU_UNIT_NOT_HISTORICAL_SNAPSHOT' &&
      q.unknown_unit_policy === 'NOT_COMPARABLE_WITHOUT_UNIT' &&
      q.count_semantics ===
        'SOURCE_LINE_QUANTITIES_NOT_PRODUCT_COMPONENT_OR_SCAN_ENTRY_COUNT' &&
      Array.isArray(q.by_unit) &&
      nullable(
        q,
        'cross_unit_total',
        '/quantity_summary/cross_unit_total',
        finite,
      ) === null,
  );
  const unitSource = nullable(
    q,
    'unit_source',
    '/quantity_summary/unit_source',
    text,
  );
  check(unitSource === null || unitSource === 'sku.unit');
  const keys = new Set<string>();
  let lines = 0,
    unknown = 0;
  const units = new Set<string>();
  const quantities = (q.by_unit as unknown[]).map(
    (raw, index): QueueQuantity => {
      const g = readObject(raw),
        p = '/quantity_summary/by_unit/' + index,
        unit = nullable(g, 'unit', p + '/unit', text),
        skuId = nullable(
          g,
          'sku_id_when_unit_unknown',
          p + '/sku_id_when_unit_unknown',
          ownerUuid,
        );
      check(
        readInteger(g.line_count) &&
          g.line_count > 0 &&
          (unit === null ? skuId !== null : skuId === null) &&
          typeof g.planned_quantity_complete === 'boolean' &&
          typeof g.scanned_quantity_complete === 'boolean',
      );
      const planned = nullable(
          g,
          'planned_quantity',
          p + '/planned_quantity',
          finite,
        ),
        scanned = nullable(
          g,
          'scanned_quantity',
          p + '/scanned_quantity',
          finite,
        );
      check(
        g.planned_quantity_complete === (planned !== null) &&
          g.scanned_quantity_complete === (scanned !== null),
      );
      const key = JSON.stringify([unit, unit === null ? skuId : null]);
      check(!keys.has(key));
      keys.add(key);
      lines += g.line_count as number;
      if (unit === null) unknown += g.line_count as number;
      else units.add(unit);
      return {
        unit,
        skuId,
        lineCount: g.line_count as number,
        planned,
        scanned,
      };
    },
  );
  check(
    lines === d.line_count &&
      q.unknown_unit_line_count === unknown &&
      q.unit_complete === (unknown === 0) &&
      q.mixed_units === units.size > 1 &&
      q.unit_availability ===
        (unitSource === null
          ? 'SOURCE_UNAVAILABLE'
          : unknown === 0
          ? 'RECORDED'
          : 'PARTIAL'),
  );
  const c = readObject(d.creator),
    actor = nullable(c, 'actor_id', '/creator/actor_id', ownerUuid);
  check(
    c.actor_id_source === 'stock_documents.created_by' &&
      [
        'SNAPSHOT_RECORDED',
        'ACTOR_NOT_RECORDED',
        'HISTORICAL_SNAPSHOT_NOT_RECORDED',
        'SOURCE_UNAVAILABLE',
      ].includes(String(c.availability)) &&
      c.job_title_semantics === 'BUSINESS_TITLE_SNAPSHOT_NOT_IAM_ROLE' &&
      c.current_directory_substitution === false,
  );
  const name = nullable(c, 'display_name', '/creator/display_name', text),
    title = nullable(c, 'job_title', '/creator/job_title', text),
    snapshotSource = nullable(
      c,
      'snapshot_source',
      '/creator/snapshot_source',
      text,
    ),
    event = nullable(
      c,
      'event_id',
      '/creator/event_id',
      (v): v is string | number => text(v) || readInteger(v),
    ),
    capturedAt = nullable(
      c,
      'captured_at',
      '/creator/captured_at',
      readInstant,
    );
  if (c.availability === 'SNAPSHOT_RECORDED')
    check(
      actor !== null &&
        snapshotSource === 'stock_document_event_evidence:CREATED' &&
        event !== null,
    );
  else
    check(
      name === null &&
        title === null &&
        snapshotSource === null &&
        event === null &&
        capturedAt === null,
    );
  check((actor === null) === (c.availability === 'ACTOR_NOT_RECORDED'));
  const label = (v: string | null, status: unknown): ReadField<string> => {
    if (v !== null) {
      check(
        status === 'SNAPSHOT_RECORDED' &&
          mode === 'owner' &&
          options.rights?.includes('iam.user.view') === true &&
          c.availability === 'SNAPSHOT_RECORDED',
      );
      return { supplied: true, value: v };
    }
    check(
      [
        'NOT_RECORDED',
        'REDACTED_PII_PERMISSION',
        'SOURCE_UNAVAILABLE',
      ].includes(String(status)),
    );
    return { supplied: false, status: String(status) };
  };
  let comparison: Comparison | undefined;
  if (mode === 'owner') {
    const snap = readObject(d.owner_snapshot),
      rootVersion = nullable(
        snap,
        'document_version',
        '/owner_snapshot/document_version',
        readInteger,
      ),
      rootStatus = nullable(
        snap,
        'canonical_status',
        '/owner_snapshot/canonical_status',
        text,
      );
    comparison = snap.comparison as Comparison;
    check(
      ['VERSION_AND_STATUS_MATCH', 'DIFFERS', 'NOT_VERIFIABLE'].includes(
        comparison,
      ) &&
        snap.semantics === 'MAY_BE_CACHED_OTHER_OWNER_FIELDS_NOT_REFRESHED' &&
        rootVersion ===
          (readInteger(options.ownerVersion) ? options.ownerVersion : null) &&
        rootStatus ===
          (typeof options.ownerStatus === 'string'
            ? options.ownerStatus
            : null),
    );
    const expected =
      rootVersion === null || version === null
        ? 'NOT_VERIFIABLE'
        : rootVersion === version && rootStatus === options.currentStatus
        ? 'VERSION_AND_STATUS_MATCH'
        : 'DIFFERS';
    check(comparison === expected);
  }
  return {
    available: true,
    version,
    asOf: asOf!,
    lineCount: d.line_count as number,
    quantities,
    creator: {
      id: actor,
      name: label(name, c.display_name_availability),
      jobTitle: label(title, c.job_title_availability),
      capturedAt,
    },
    ...(comparison ? { ownerComparison: comparison } : {}),
    ...(options.currentStatus !== undefined
      ? { currentStatus: options.currentStatus }
      : {}),
  };
}
export function parseQueueDisplay(
  value: unknown,
  projection: QueueProjection | undefined,
  target: OwnerDocumentTarget,
) {
  if (target.kind === 'warranty') return undefined;
  if (projection === undefined) {
    if (
      value &&
      typeof value === 'object' &&
      (value as Record<string, unknown>).mapping_revision ===
        'be04-display-r1-20261104'
    )
      check(false);
    return undefined;
  }
  const d = readObject(value);
  check(
    d.mapping_contract === 'p12-p13-p16-status-v1' &&
      d.mapping_revision === 'be04-display-r1-20261104',
  );
  if (!projection.available) {
    check(
      d.availability === 'CURRENT_PROJECTION_UNAVAILABLE' &&
        d.label === null &&
        d.document_version === null,
    );
    return { availability: 'UNAVAILABLE' as const, label: null, value: null };
  }
  check(
    d.availability === 'MAPPED' &&
      text(d.label) &&
      (d.value === null || text(d.value)) &&
      d.document_version === projection.version &&
      d.as_of === projection.asOf &&
      d.semantics === 'STATUS_AND_READINESS_NOT_HANDOFF_OR_CHECK_EVIDENCE' &&
      (projection.currentStatus === undefined ||
        d.canonical_status === projection.currentStatus),
  );
  if (
    projection.ownerComparison &&
    projection.ownerComparison !== 'VERSION_AND_STATUS_MATCH'
  )
    return {
      availability:
        projection.ownerComparison === 'DIFFERS'
          ? ('STALE' as const)
          : ('UNAVAILABLE' as const),
      label: null,
      value: null,
    };
  return {
    availability: 'MAPPED' as const,
    label: d.label as string,
    value: d.value as string | null,
  };
}
