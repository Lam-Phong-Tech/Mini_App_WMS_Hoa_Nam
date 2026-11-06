import { kpiAdmission, kpiFailure } from '../src/web/p02KpiDiagnostic';
import { AppError } from '../src/errors/AppError';
const wid = '11111111-1111-4111-8111-111111111111';
const me = {
  active_warehouse_id: wid,
  warehouse_context: { status: 'READY' },
  warehouse_scope_ids: null,
  permissions: ['inbound.view'],
};

test('safe admission uses existing Home warehouse/right rules, without inventing missing scope or permissions', () => {
  expect(kpiAdmission(me).code).toBe('P02_KPI_ADMITTED');
  expect(kpiAdmission({ ...me, warehouse_scope_ids: undefined }).code).toBe(
    'P02_WAREHOUSE_SCOPE_UNVERIFIED',
  );
  expect(kpiAdmission({ ...me, warehouse_scope_ids: [] }).code).toBe(
    'P02_WAREHOUSE_SCOPE_UNVERIFIED',
  );
  expect(kpiAdmission({ ...me, permissions: [] }).code).toBe(
    'P02_KPI_READ_NOT_GRANTED',
  );
});
test('account evidence omits identity, token, name, scope UUIDs and unrelated fields', () => {
  const result = JSON.stringify(
    kpiAdmission({
      ...me,
      name: 'private-name',
      id: 'private-id',
      auth_session_id: 'private-family',
    }),
  );
  expect(result).not.toMatch(/private-|11111111/);
  expect(result).toContain('UNRESTRICTED');
});
test('failure evidence omits arbitrary backend/error text and non-UUID correlation text', () => {
  const result = kpiFailure(
    new AppError({
      kind: 'http',
      status: 403,
      code: 'ACCESS_DENIED',
      message: 'private-user-token-customer-address',
      requestId: 'private-token',
    }),
  );
  expect(result.code).toBe('ACCESS_DENIED');
  expect(result.http).toBe(403);
  expect(result.request_id).toBeNull();
  expect(JSON.stringify(result)).not.toContain('private');
});
test('known local parser diagnosis and actual Request-ID remain available', () => {
  const result = kpiFailure(
    new AppError({
      kind: 'parse',
      message: 'Schema KPI chưa khớp contract P02.',
      requestId: wid,
    }),
  );
  expect(result.label).toBe('Schema KPI chưa khớp contract P02.');
  expect(result.request_id).toBe(wid);
});
test('runtime mismatch remains a blocked outcome; diagnostics supplies no counts', () => {
  const result = kpiFailure(
    new AppError({
      kind: 'blocked_by_gate',
      code: 'P02_RUNTIME_MISMATCH',
      message: 'private',
    }),
  );
  expect(result.code).toBe('P02_RUNTIME_MISMATCH');
  expect(result.kind).toBe('blocked_by_gate');
  expect(result).not.toHaveProperty('pending_count');
  expect(JSON.stringify(result)).not.toContain('private');
});

test('P12 plain parser Error preserves its owner code without leaking raw error text', () => {
  const error = Object.assign(new Error('private-customer-data'), {
    code: 'MIXED_TIME_MISMATCH',
  });
  expect(kpiFailure(error).code).toBe('MIXED_TIME_MISMATCH');
  expect(JSON.stringify(kpiFailure(error))).not.toContain('private');
  expect(kpiFailure(new TypeError('private')).code).toBe(
    'JAVASCRIPT_TYPE_ERROR',
  );
});
