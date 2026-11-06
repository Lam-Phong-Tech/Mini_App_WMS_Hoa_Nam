import {
  parsePartnerSnapshot,
  validSupplierRecordedAt,
} from '../src/features/documents/p12/partnerSnapshot';
import { documentTime } from '../src/features/documents/p12/P12Screen';
const target = {
  kind: 'inbound' as const,
  id: '11111111-1111-4111-8111-111111111111',
  warehouseId: '22222222-2222-4222-8222-222222222222',
};
const supplier = () => ({
  status: 'SNAPSHOT_RECORDED',
  id: '33333333-3333-4333-8333-333333333333',
  name: 'NCC TEST',
  name_status: 'SNAPSHOT_RECORDED',
  version: 1,
  recorded_at: '2026-11-03T19:16:58.000000Z',
  source: 'mini_app_inbound_record_metadata',
});
const partner = () => ({
  display_name: 'NCC TEST',
  availability: 'RECORDED',
  redacted: false,
  role: 'SUPPLIER',
  source: 'mini_app_inbound_record_metadata',
  supplier_snapshot: supplier(),
  provenance: {
    contract: 'p12-partner-snapshot-v1',
    revision: 'p12-partner-snapshot-r1-20261104',
    document_id: target.id,
    warehouse_id: target.warehouseId,
    document_version: 2,
    semantics: 'RECORD_SNAPSHOT_NOT_DOCUMENT_TITLE_OR_CURRENT_DIRECTORY',
  },
});
test('displayed supplier is exactly the recorded snapshot, never title or current directory', () => {
  const p = partner(),
    before = JSON.stringify(p);
  const d = parsePartnerSnapshot(p, target, { expectedVersion: 2 });
  expect(d?.displayName).toBe('NCC TEST');
  expect(d?.supplier?.recorded_at).toBe(p.supplier_snapshot.recorded_at);
  expect(JSON.stringify(p)).toBe(before);
  expect(d).not.toHaveProperty('writerRevision');
  p.supplier_snapshot.name = 'PN-20261103-0004';
  p.display_name = p.supplier_snapshot.name;
  expect(parsePartnerSnapshot(p, target)?.displayName).toBe('PN-20261103-0004');
});
test('NOT_SELECTED is a known choice and not the same as a missing source', () => {
  const p = partner() as any;
  Object.assign(p, { display_name: null, availability: 'NOT_RECORDED' });
  Object.assign(p.supplier_snapshot, {
    status: 'NOT_SELECTED',
    id: null,
    name: null,
    name_status: 'NOT_SELECTED',
    version: null,
  });
  expect(parsePartnerSnapshot(p, target)?.supplier?.status).toBe(
    'NOT_SELECTED',
  );
  Object.assign(p.supplier_snapshot, {
    status: 'SOURCE_UNAVAILABLE',
    name_status: 'SOURCE_UNAVAILABLE',
    recorded_at: null,
  });
  expect(() =>
    parsePartnerSnapshot(p, target, { mode: 'aggregate' }),
  ).toThrow();
  p.availability = 'SOURCE_UNAVAILABLE';
  expect(
    parsePartnerSnapshot(p, target, { mode: 'owner' })?.supplier?.status,
  ).toBe('SOURCE_UNAVAILABLE');
});
test('contracted legacy NOT_RECORDED has null partner source and remains readable without a made-up supplier', () => {
  const p: any = partner();
  Object.assign(p, {
    display_name: null,
    availability: 'NOT_RECORDED',
    source: null,
  });
  Object.assign(p.supplier_snapshot, {
    status: 'NOT_RECORDED',
    id: null,
    name: null,
    name_status: 'NOT_RECORDED',
    version: null,
    recorded_at: null,
    source: null,
  });
  expect(parsePartnerSnapshot(p, target)?.supplier?.status).toBe(
    'NOT_RECORDED',
  );
  expect(parsePartnerSnapshot(p, target)?.displayName).toBeNull();
  p.source = 'stock_documents.doc_no';
  expect(() => parsePartnerSnapshot(p, target)).toThrow();
});
test('outbound current recipient has no supplier snapshot and optional provenance on deployed wire', () => {
  const p: any = {
    display_name: 'Người nhận TEST',
    availability: 'RECORDED',
    redacted: false,
    role: 'RECIPIENT',
    source: 'stock_documents.recipient_name',
  };
  expect(
    parsePartnerSnapshot(p, { ...target, kind: 'outbound' })?.displayName,
  ).toBe('Người nhận TEST');
  p.provenance = {
    ...partner().provenance,
    document_id: '44444444-4444-4444-8444-444444444444',
  };
  expect(() =>
    parsePartnerSnapshot(p, { ...target, kind: 'outbound' }),
  ).toThrow();
});
test.each([
  'identity',
  'warehouse',
  'version',
  'name',
  'source',
  'marker',
] as const)('wrong %s does not become a supplier snapshot', kind => {
  const p = partner() as any;
  if (kind === 'identity')
    p.provenance.document_id = '44444444-4444-4444-8444-444444444444';
  if (kind === 'warehouse')
    p.provenance.warehouse_id = p.provenance.document_id;
  if (kind === 'version') p.provenance.document_version = 3;
  if (kind === 'name') p.display_name = 'Current directory';
  if (kind === 'source') p.source = 'stock_documents.source_name';
  if (kind === 'marker') p.provenance.contract = 'wrong';
  expect(() =>
    parsePartnerSnapshot(p, target, { expectedVersion: 2 }),
  ).toThrow();
});
test('historical suspicious timestamp stays the original instant; explicit offsets are parsed once', () => {
  expect(validSupplierRecordedAt('2026-11-03T19:16:58.000000Z')).toBe(true);
  expect(validSupplierRecordedAt('2026-11-04T02:16:58+07:00')).toBe(true);
  expect(validSupplierRecordedAt('2026-11-03 19:16:58')).toBe(false);
  expect(documentTime('2026-11-03T19:16:58.000000Z')).toBe('04/11/2026 02:16');
  expect(documentTime('2026-11-04T02:16:58+07:00')).toBe('04/11/2026 02:16');
});
test('legacy partner and warranty redaction remain independent from the new snapshot contract', () => {
  expect(
    parsePartnerSnapshot(
      { display_name: 'Legacy', availability: 'RECORDED', redacted: false },
      target,
    ),
  ).toBeUndefined();
  const w = { ...target, kind: 'warranty' as const };
  expect(
    parsePartnerSnapshot(
      {
        display_name: null,
        availability: 'WITHHELD_IN_AGGREGATE',
        redacted: true,
      },
      w,
      {
        contract: 'p12-partner-snapshot-v1',
        revision: 'p12-partner-snapshot-r1-20261104',
      },
    )?.displayName,
  ).toBeNull();
});
