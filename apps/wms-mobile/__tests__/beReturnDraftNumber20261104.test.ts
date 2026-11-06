import { p03DraftNumberRead } from '../src/services/wms/p03DraftNumberRead';
const row = (patch: Record<string, unknown> = {}) => ({
  operation: 'OUTBOUND',
  business_document_id: null,
  document_no: 'PX-20261104-0001',
  document_no_availability: 'AVAILABLE',
  document_no_source: 'outbound_draft_numbers.doc_no',
  document_no_reason: null,
  ...patch,
});
test('current persisted number is distinct from free title; legacy receipt fields remain untouched', () => {
  const v = row({ title: 'Tên người nhập', form: { name: 'PX-FAKE' } }),
    before = JSON.stringify(v);
  expect(p03DraftNumberRead(v)).toMatchObject({
    availability: 'AVAILABLE',
    number: 'PX-20261104-0001',
  });
  expect(JSON.stringify(v)).toBe(before);
  expect(
    p03DraftNumberRead({
      operation: 'OUTBOUND',
      document_no: 'old-wrapper',
      title: 'PX-FAKE',
    }),
  ).toBeUndefined();
});
test('unavailable current business source never falls back to a retained reservation/title', () => {
  const v = row({
    business_document_id: '11111111-1111-4111-8111-111111111111',
    document_no: null,
    document_no_availability: 'SOURCE_UNAVAILABLE',
    document_no_source: null,
    document_no_reason: 'BUSINESS_DOCUMENT_NOT_IN_SCOPE',
    title: 'PX-OLD',
  });
  expect(p03DraftNumberRead(v)).toEqual({
    availability: 'SOURCE_UNAVAILABLE',
    number: null,
    source: null,
    reason: 'BUSINESS_DOCUMENT_NOT_IN_SCOPE',
  });
  expect(() =>
    p03DraftNumberRead(row({ business_document_id: v.business_document_id })),
  ).toThrow();
});
test.each([
  { document_no_source: 'inbound_draft_numbers.doc_no' },
  { document_no: null },
  { document_no_reason: 'NO_PERSISTED_DRAFT_NUMBER' },
  { operation: 'WARRANTY' },
  { document_no_source: 'form.name' },
  { document_no_availability: 'AVAILABLE', document_no_source: null },
  {
    business_document_id: 'not-a-uuid',
    document_no_source: 'stock_documents.doc_no',
  },
])('contradictory or untrusted number projection fails closed: %j', patch =>
  expect(() => p03DraftNumberRead(row(patch))).toThrow(),
);
test('explicit unnumbered source stays null and partial metadata is rejected', () => {
  expect(
    p03DraftNumberRead(
      row({
        document_no: null,
        document_no_availability: 'NOT_ASSIGNED',
        document_no_source: null,
        document_no_reason: 'NO_PERSISTED_DRAFT_NUMBER',
      }),
    ),
  ).toMatchObject({ availability: 'NOT_ASSIGNED', number: null });
  expect(() =>
    p03DraftNumberRead({
      operation: 'OUTBOUND',
      document_no_availability: 'AVAILABLE',
    }),
  ).toThrow();
});
