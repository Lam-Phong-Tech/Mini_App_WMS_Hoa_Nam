import {
  documentStatusPresentation,
  documentOwnerStatusPresentation,
} from '../src/features/documents/p12/presentation';
import {
  listQuery,
  initialFilters,
} from '../src/features/documents/p12/controller';
import { stockListQuery } from '../src/features/documents/p12/contract';
const label = 'Chờ xử lý trên Web',
  filter = 'WAITING_WEB_PROCESSING';
const doc = (type: 'inbound' | 'outbound', mini = 'WAITING_APPROVAL'): any => ({
  type,
  source: { status: 'SCANNING', version: 2 },
  p12: {
    status: {
      canonical: 'SCANNING',
      mini_app: mini,
      readiness: { ready_for_issue: mini === 'READY_TO_ISSUE' },
      waiting_for_web: null,
    },
  },
});
test.each(['inbound', 'outbound'] as const)(
  '%s legacy owner and mapped display use the same user-approved waiting wording without creating handoff evidence',
  type => {
    const d = doc(type);
    expect(documentStatusPresentation(d).label).toBe(label);
    expect(documentOwnerStatusPresentation(d).label).toBe(label);
    d.displayStatus = {
      availability: 'MAPPED',
      value: 'WAITING_APPROVAL',
      label: 'Chờ duyệt ' + type,
    };
    expect(documentStatusPresentation(d).label).toBe(label);
    expect(d.p12.status.waiting_for_web).toBeNull();
    expect(d.webHandoff).toBeUndefined();
  },
);
test('outbound explicit readiness label is waiting work on Web, never SCANNING inference', () => {
  expect(
    documentStatusPresentation(doc('outbound', 'READY_TO_ISSUE')).label,
  ).toBe(label);
  expect(documentStatusPresentation(doc('outbound', 'PICKING')).label).not.toBe(
    label,
  );
});
test.each(['inbound', 'outbound'] as const)(
  '%s waiting filter uses only supported owner query and leaves canonical all query alone',
  source => {
    const q = listQuery({
      ...initialFilters(),
      source,
      status: filter,
      q: 'TEST',
      from: '2026-10-01',
      to: '2026-11-04',
    });
    expect(q).toMatchObject(
      source === 'inbound'
        ? { status: 'WAITING_APPROVAL' }
        : { ready_for_issue: true },
    );
    if (source === 'outbound') expect(q).not.toHaveProperty('status');
    expect(stockListQuery(source, q)).toBeDefined();
    expect(listQuery({ ...initialFilters(), source })).not.toHaveProperty(
      'status',
    );
  },
);
test('stale, source failure, terminal and draft are not relabeled as a waiting transaction', () => {
  const d = doc('inbound');
  d.displayStatus = { availability: 'STALE', value: null, label: null };
  expect(documentStatusPresentation(d).label).toBe('Cần đọc lại phiên bản');
  d.displayStatus = { availability: 'UNAVAILABLE', value: null, label: null };
  expect(documentStatusPresentation(d).label).toBe('Chờ xác minh trạng thái');
  delete d.displayStatus;
  d.p12.status.canonical = 'POSTED';
  expect(documentStatusPresentation(d).label).toBe('Đã ghi sổ');
  d.p12.status.canonical = 'DRAFT';
  d.p12.status.mini_app = 'DRAFT';
  expect(documentStatusPresentation(d).label).toBe('Nháp');
});
