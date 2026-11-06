import {
  parseQueueProjection,
  parseQueueDisplay,
} from '../src/services/wms/p13QueueProjection';
import {
  queueProjection,
  queueTarget,
} from './fixtures/beQueueProjection20261104';
import { project } from './fixtures/beReleasedReads20261024';
import { explicitRead } from '../src/services/wms/explicitReadFields';
test('line count, quantity0, missing scanned quantity and current SKU-unit semantics remain distinct', () => {
  const q = parseQueueProjection(queueProjection(), queueTarget)!;
  expect(q.available).toBe(true);
  if (!q.available) throw Error();
  expect(q.version).toBe(0);
  expect(q.lineCount).toBe(2);
  expect(q.quantities[0]).toMatchObject({
    unit: 'Cái',
    planned: 0,
    scanned: null,
  });
  expect(q.creator.name).toEqual({ supplied: false, status: 'NOT_RECORDED' });
});
test('explicit representation retains omitted fields with availability and does not rehydrate the wire', () => {
  const wire = project({
      success: true,
      data: queueProjection(),
      meta: { contract: 'test-queue' },
    }),
    before = JSON.stringify(wire),
    r = explicitRead(wire, 'test-queue');
  const parsed = parseQueueProjection(r.body.data, queueTarget, {
    field: <T>(p: string, t: (v: unknown) => v is T) => r.field('/data' + p, t),
  })!;
  expect(parsed.available && parsed.quantities[0].scanned).toBeNull();
  expect(JSON.stringify(wire)).toBe(before);
});
test('separate units and unknown SKU units never become a cross-unit total', () => {
  const q = queueProjection() as any;
  q.line_count = 3;
  q.quantity_summary.by_unit = [
    {
      unit: 'kg',
      sku_id_when_unit_unknown: null,
      line_count: 1,
      planned_quantity: 1.5,
      scanned_quantity: 0,
      planned_quantity_complete: true,
      scanned_quantity_complete: true,
    },
    {
      unit: 'Cái',
      sku_id_when_unit_unknown: null,
      line_count: 1,
      planned_quantity: 2,
      scanned_quantity: 1,
      planned_quantity_complete: true,
      scanned_quantity_complete: true,
    },
    {
      unit: null,
      sku_id_when_unit_unknown: queueTarget.id,
      line_count: 1,
      planned_quantity: 3,
      scanned_quantity: 0,
      planned_quantity_complete: true,
      scanned_quantity_complete: true,
    },
  ];
  q.quantity_summary.mixed_units = true;
  q.quantity_summary.unknown_unit_line_count = 1;
  q.quantity_summary.unit_complete = false;
  q.quantity_summary.unit_availability = 'PARTIAL';
  const parsed = parseQueueProjection(q, queueTarget)!;
  expect(parsed.available && parsed.quantities).toHaveLength(3);
  expect(parsed).not.toHaveProperty('totalQuantity');
});
test.each([
  'target',
  'unit-total',
  'group-count',
  'creator',
  'completeness',
] as const)('contradictory %s is rejected', kind => {
  const q = queueProjection() as any;
  if (kind === 'target') q.read_target.query.warehouse_id = 'foreign';
  if (kind === 'unit-total') q.quantity_summary.cross_unit_total = 0;
  if (kind === 'group-count') q.quantity_summary.by_unit[0].line_count = 3;
  if (kind === 'creator') q.creator.display_name = 'Current caller';
  if (kind === 'completeness')
    q.quantity_summary.by_unit[0].scanned_quantity_complete = true;
  expect(() => parseQueueProjection(q, queueTarget)).toThrow();
});
test('aggregate never exposes historical creator labels, while an authorized owner snapshot can', () => {
  const q = queueProjection() as any;
  Object.assign(q.creator, {
    availability: 'SNAPSHOT_RECORDED',
    display_name: 'Nhân viên TEST',
    job_title: 'Thủ kho TEST',
    display_name_availability: 'SNAPSHOT_RECORDED',
    job_title_availability: 'SNAPSHOT_RECORDED',
    snapshot_source: 'stock_document_event_evidence:CREATED',
    event_id: queueTarget.id,
    captured_at: '2026-11-03T04:00:00Z',
  });
  q.owner_snapshot = {
    document_version: 0,
    canonical_status: 'SCANNING',
    comparison: 'VERSION_AND_STATUS_MATCH',
    semantics: 'MAY_BE_CACHED_OTHER_OWNER_FIELDS_NOT_REFRESHED',
  };
  expect(() => parseQueueProjection(q, queueTarget)).toThrow();
  const p = parseQueueProjection(q, queueTarget, {
    mode: 'owner',
    rights: ['iam.user.view'],
    ownerVersion: 0,
    ownerStatus: 'SCANNING',
    currentStatus: 'SCANNING',
  })!;
  expect(p.available && p.creator.name).toEqual({
    supplied: true,
    value: 'Nhân viên TEST',
  });
});
test('cached owner mismatch cannot be labeled as a coherent current state', () => {
  const q = queueProjection() as any;
  q.document_version = 2;
  q.owner_snapshot = {
    document_version: 1,
    canonical_status: 'SCANNING',
    comparison: 'DIFFERS',
    semantics: 'MAY_BE_CACHED_OTHER_OWNER_FIELDS_NOT_REFRESHED',
  };
  const p = parseQueueProjection(q, queueTarget, {
    mode: 'owner',
    ownerVersion: 1,
    ownerStatus: 'SCANNING',
    currentStatus: 'POSTED',
  })!;
  const display = {
    mapping_contract: 'p12-p13-p16-status-v1',
    mapping_revision: 'be04-display-r1-20261104',
    availability: 'MAPPED',
    value: 'COMPLETED',
    label: 'Đã nhập kho',
    canonical_status: 'POSTED',
    document_version: 2,
    as_of: q.as_of,
    semantics: 'STATUS_AND_READINESS_NOT_HANDOFF_OR_CHECK_EVIDENCE',
  };
  expect(parseQueueDisplay(display, p, queueTarget)).toMatchObject({
    availability: 'STALE',
    label: null,
  });
});
test('absent legacy projection and source unavailable are not zero quantities or generated labels', () => {
  expect(parseQueueProjection(undefined, queueTarget)).toBeUndefined();
  const q = {
    contract: 'p13-queue-projection-v1',
    revision: 'be04-r1-20261104',
    availability: 'CURRENT_OWNER_NOT_AVAILABLE',
    document_version: null,
    version_availability: 'CURRENT_OWNER_NOT_AVAILABLE',
    version_source: null,
    as_of: null,
    line_count: null,
    line_count_unit: 'LINE',
    quantity_summary: null,
    creator: null,
    read_target: queueProjection().read_target,
  };
  expect(parseQueueProjection(q, queueTarget)).toMatchObject({
    available: false,
    reason: 'CURRENT_OWNER_NOT_AVAILABLE',
  });
});
