import { notificationDocumentTarget } from '../src/app/ownerNavigation';
const id = (n: number) =>
  'a0000000-0000-4000-8000-' + String(n).padStart(12, '0');
const subject = (type = 'INBOUND', path = 'inbound-documents') => ({
  mapping_revision: 'p13-notifications-r2',
  mapping_status: 'MAPPED',
  identity_source: 'PERSISTED_NOTIFICATION_EVENT_AND_PAYLOAD',
  requires_subject_revalidation: true,
  navigation_status: 'OWNER_REVALIDATION_REQUIRED',
  warehouse_id: id(1),
  business_id: id(2),
  business_type: type,
  read_target: {
    method: 'GET',
    path: '/api/v1/mini-app/' + path + '/' + id(2),
    query: { warehouse_id: id(1) },
  },
});
test.each([
  ['INBOUND', 'inbound-documents', 'inbound'],
  ['OUTBOUND', 'outbound-documents', 'outbound'],
  ['WARRANTY', 'warranty-cases', 'warranty'],
])('opens only projected %s owner identity', (type, path, kind) => {
  expect(notificationDocumentTarget(subject(type, path), id(1))).toEqual({
    kind,
    id: id(2),
    warehouseId: id(1),
  });
});
test.each([
  { mapping_revision: 'v1' },
  { mapping_status: 'PENDING' },
  { identity_source: 'TITLE' },
  { warehouse_id: id(99) },
  { business_id: 'BH-001' },
  { business_type: '__proto__' },
  {
    read_target: {
      method: 'POST',
      path: '/api/v1/mini-app/inbound-documents/' + id(2),
      query: { warehouse_id: id(1) },
    },
  },
  {
    read_target: {
      method: 'GET',
      path: 'https://other.invalid/api/v1/mini-app/inbound-documents/' + id(2),
      query: { warehouse_id: id(1) },
    },
  },
  {
    read_target: {
      method: 'GET',
      path: '/api/v1/mini-app/inbound-documents/' + id(2),
      query: { warehouse_id: id(1), token: 'never' },
    },
  },
])('rejects unverified/cross-scope navigation %j', patch => {
  expect(
    notificationDocumentTarget({ ...subject(), ...patch }, id(1)),
  ).toBeUndefined();
});
test('warehouse changes never reuse a subject link', () => {
  expect(notificationDocumentTarget(subject(), id(9))).toBeUndefined();
  expect(notificationDocumentTarget(subject(), undefined)).toBeUndefined();
});
