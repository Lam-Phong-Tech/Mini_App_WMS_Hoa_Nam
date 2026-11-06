import { parsePersistedWebHandoff } from '../src/services/wms/persistedWebHandoff';
import { documentStatusPresentation } from '../src/features/documents/p12/presentation';
const target = {
  kind: 'inbound' as const,
  id: '11111111-1111-4111-8111-111111111111',
  warehouseId: '22222222-2222-4222-8222-222222222222',
};
const h = () => ({
  contract: 'p13-web-post-queue-v1',
  revision: 'p13-web-post-queue-r2-20261104',
  state: 'WAITING_WEB_POST',
  document_id: target.id,
  canonical_status: 'SCANNING',
  current_document_version: 2,
  document_version_at_record: 2,
  document_version_match: true,
  semantics: 'PERSISTED_SUBMISSION_INTENT_NOT_WEB_DELIVERY_ACK',
  display_status: {
    value: 'WAITING_WEB_POST',
    label: 'Chờ xử lý trên Web',
    mapping_contract: 'p13-web-post-queue-v1',
    mapping_revision: 'p13-web-post-queue-r2-20261104',
  },
  current_waiting_for_web: true,
  source: 'mini_app_web_post_handoffs+stock_documents.status',
  warehouse_id: target.warehouseId,
  submitted_at: '2026-11-03T12:16:58.344021Z',
  reviewed_at: null,
  reviewed_status: 'NOT_RECORDED',
  posted_at: null,
  stock_effect: 'READ_ONLY_PROJECTION',
});
test('persisted handoff proof stays independent when the user-approved operational label is also used for pending readiness', () => {
  const parsed = parsePersistedWebHandoff(h(), target, {
    expectedVersion: 2,
    expectedCanonical: 'SCANNING',
  })!;
  expect(parsed.state).toBe('WAITING_WEB_POST');
  expect(parsed.label).toBe('Chờ xử lý trên Web');
  expect(parsed.versionMatch).toBe(true);
  const doc: any = {
    type: 'inbound',
    source: { version: 2 },
    p12: { status: { canonical: 'SCANNING', waiting_for_web: null } },
    displayStatus: {
      availability: 'MAPPED',
      label: 'Chờ duyệt nhập kho',
      value: 'WAITING_APPROVAL',
    },
    webHandoff: parsed,
  };
  expect(documentStatusPresentation(doc).label).toBe('Chờ xử lý trên Web');
  delete doc.webHandoff;
  expect(documentStatusPresentation(doc).label).toBe('Chờ xử lý trên Web');
  expect(doc.webHandoff).toBeUndefined();
  expect(doc.p12.status.waiting_for_web).toBeNull();
});
test('later current version preserves submitted intent and cannot make a stale root current', () => {
  const raw = h();
  raw.current_document_version = 3;
  raw.document_version_match = false;
  const parsed = parsePersistedWebHandoff(raw, target, {
    expectedVersion: 3,
    expectedCanonical: 'SCANNING',
  })!;
  expect(parsed).toMatchObject({
    currentVersion: 3,
    submittedVersion: 2,
    versionMatch: false,
  });
  const d: any = {
    type: 'inbound',
    source: { version: 1 },
    p12: { status: { canonical: 'SCANNING' } },
    displayStatus: { availability: 'STALE', label: null, value: null },
    webHandoff: parsed,
  };
  expect(documentStatusPresentation(d).label).toBe('Cần đọc lại phiên bản');
});
test.each([
  'document',
  'warehouse',
  'version',
  'comparison',
  'label',
  'canonical',
  'ack',
] as const)('wrong %s fails closed', kind => {
  const raw = h() as any;
  if (kind === 'document') raw.document_id = target.warehouseId;
  if (kind === 'warehouse') raw.warehouse_id = target.id;
  if (kind === 'version') raw.current_document_version = 3;
  if (kind === 'comparison') raw.document_version_match = false;
  if (kind === 'label') raw.display_status.value = 'POSTED';
  if (kind === 'canonical') raw.canonical_status = 'POSTED';
  if (kind === 'ack') raw.semantics = 'DELIVERED';
  expect(() =>
    parsePersistedWebHandoff(raw, target, {
      expectedVersion: 2,
      expectedCanonical: 'SCANNING',
    }),
  ).toThrow();
});
test('missing legacy intent never authorizes a label or invents a negative execution proof', () => {
  expect(parsePersistedWebHandoff(null, target)).toBeUndefined();
  expect(
    parsePersistedWebHandoff(
      { contract: 'p13-web-post-queue-v1', state: 'WAITING_WEB_POST' },
      target,
    ),
  ).toBeUndefined();
});
