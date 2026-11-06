import {
  fetchP04Suppliers,
  supplierErrorMessage,
} from '../src/features/inbound/p04Directory';
import { AppError } from '../src/errors/AppError';
import type { Session } from '../src/auth/session';
const warehouse = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const session: Session = {
  accessToken: 'fixture-only',
  userId: 'actor',
  authSessionId: 'session',
  activeWarehouseId: warehouse,
};
function setup(total = 0, page = 1) {
  const data = total
    ? [
        {
          id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
          name: 'Tên từ BE',
          status: 'ACTIVE',
          version: 2,
          updated_at: '2026-10-07T08:00:00Z',
        },
      ]
    : [];
  const body = {
    success: true,
    data,
    meta: {
      contract: 'mini-app-p04-v1',
      source: 'inbound_suppliers',
      scope: 'GLOBAL',
      page,
      per_page: 20,
      total,
      last_page: Math.max(1, Math.ceil(total / 20)),
    },
  };
  const client = { get: jest.fn(async () => ({ status: 200, data: body })) };
  const deps = {
    client: client as unknown as NonNullable<
      Parameters<typeof fetchP04Suppliers>[4]
    >['client'],
    getSession: () => session,
  };
  return { client, body, deps };
}
test('supplier GET keeps session guards but reads the global directory without a warehouse filter', async () => {
  const f = setup(41, 2);
  const r = await fetchP04Suppliers(warehouse, 'Tên NCC', 2, undefined, f.deps);
  expect(f.client.get).toHaveBeenCalledWith(
    '/api/v1/mini-app/inbound/suppliers',
    {
      query: {
        q: 'Tên NCC',
        status: 'ACTIVE',
        page: 2,
        per_page: 20,
      },
      signal: undefined,
    },
  );
  expect(r.total).toBe(41);
  expect(r.items).toHaveLength(1);
  expect(r.items[0]).toMatchObject({
    name: 'Tên từ BE',
    id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  });
});
test('empty directory is returned as empty with zero total and never fixture suppliers', async () => {
  const f = setup();
  await expect(
    fetchP04Suppliers(warehouse, '', 1, undefined, f.deps),
  ).resolves.toEqual({ items: [], total: 0 });
});

test('PostgreSQL supplier instants remain readable when the runtime only parses ISO timestamps', async () => {
  const parse = Date.parse;
  const strictRuntime = jest.spyOn(Date, 'parse').mockImplementation(value =>
    /^\d{4}-\d{2}-\d{2}T/.test(value) ? parse(value) : NaN,
  );
  try {
    const f = setup(1);
    f.body.data[0].updated_at = '2026-10-08 03:00:22+00';
    const result = await fetchP04Suppliers(warehouse, '', 1, undefined, f.deps);
    expect(result.items[0].updated_at).toBe('2026-10-08 03:00:22+00');
    expect(result.total).toBe(1);
  } finally {
    strictRuntime.mockRestore();
  }
});

test.each(['2026-10-08 03:00:22', '2026-02-30T03:00:22Z', 'not-a-date'])(
  'supplier timestamp without a valid explicit instant is rejected: %s',
  async updatedAt => {
    const f = setup(1);
    f.body.data[0].updated_at = updatedAt;
    await expect(
      fetchP04Suppliers(warehouse, '', 1, undefined, f.deps),
    ).rejects.toMatchObject({ code: 'INVALID_SUPPLIER_RESPONSE' });
  },
);
test('permission/context failures remain errors, never successful empty lists', async () => {
  for (const [status, code] of [
    [401, 'UNAUTHENTICATED'],
    [403, 'WAREHOUSE_ACCESS_DENIED'],
    [403, 'P04_OPERATION_DENIED'],
    [409, 'WAREHOUSE_CONTEXT_REQUIRED'],
    [409, 'WAREHOUSE_CONTEXT_MISMATCH'],
    [409, 'WAREHOUSE_INACTIVE'],
    [422, 'INBOUND_WAREHOUSE_NOT_SUPPORTED'],
  ] as const) {
    const f = setup();
    f.client.get.mockImplementation(async () => {
      throw new AppError({ kind: 'http', status, code, message: 'BE text' });
    });
    await expect(
      fetchP04Suppliers(warehouse, '', 1, undefined, f.deps),
    ).rejects.toMatchObject({ status, code });
    expect(
      supplierErrorMessage(
        new AppError({ kind: 'http', status, code, message: 'BE text' }),
      ),
    ).not.toBe('BE text');
  }
});
test('scope/meta/pagination and supplier fields fail closed on malformed responses', async () => {
  for (const patch of [
    { scope: 'WAREHOUSE' },
    { source: 'fixture' },
    { contract: 'wrong' },
    { page: 2 },
    { per_page: 100 },
    { total: -1 },
    { last_page: 0 },
  ]) {
    const f = setup();
    Object.assign(f.body.meta, patch);
    await expect(
      fetchP04Suppliers(warehouse, '', 1, undefined, f.deps),
    ).rejects.toMatchObject({ code: 'INVALID_SUPPLIER_RESPONSE' });
  }
  const f = setup(1);
  f.body.data[0].id = 'made-up';
  await expect(
    fetchP04Suppliers(warehouse, '', 1, undefined, f.deps),
  ).rejects.toMatchObject({ code: 'INVALID_SUPPLIER_RESPONSE' });
});
test('query limit and wrong warehouse are blocked before transport', async () => {
  const f = setup();
  await expect(
    fetchP04Suppliers(warehouse, 'x'.repeat(201), 1, undefined, f.deps),
  ).rejects.toMatchObject({ code: 'INVALID_SUPPLIER_QUERY' });
  await expect(
    fetchP04Suppliers('other', '', 1, undefined, f.deps),
  ).rejects.toMatchObject({ code: 'WAREHOUSE_CONTEXT_REQUIRED' });
  expect(f.client.get).not.toHaveBeenCalled();
});
test('response from a previous session cannot overwrite current supplier search', async () => {
  const f = setup();
  let current = session;
  f.deps.getSession = () => current;
  const get = f.client.get.getMockImplementation()!;
  f.client.get.mockImplementation(async () => {
    current = { ...session, authSessionId: 'new-session' };
    return get();
  });
  await expect(
    fetchP04Suppliers(warehouse, '', 1, undefined, f.deps),
  ).rejects.toMatchObject({ kind: 'cancelled' });
});
