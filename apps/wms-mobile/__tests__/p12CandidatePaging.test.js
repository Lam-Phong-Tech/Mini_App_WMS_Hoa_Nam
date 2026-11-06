import {
  createP12Controller,
  initialFilters,
} from '../src/features/documents/p12/controller';
import { parseMixed } from '../src/features/documents/p12/mixed';
import { parseStockDetail } from '../src/features/documents/p12/contract';
import * as m from './fixtures/p12Protocol';
import * as mix from './fixtures/p12Mixed';

const failed = (code, status) => Object.assign(Error(code), { code, status });
function fixture() {
  const calls = [],
    rows = Array.from({ length: 25 }, (_, i) => mix.row('INBOUND', 100 + i));
  let key = 'scope-A';
  const api = {
    scopeKey: () => key,
    revalidateScope: jest.fn(async () => {
      calls.push('owner');
      return true;
    }),
    mixed: jest.fn(async q => {
      calls.push('mixed');
      return parseMixed(
        mix.response(q, rows),
        q,
        m.context(),
        'https://p12.invalid',
      );
    }),
    detail: jest.fn(async () =>
      parseStockDetail(m.detail(m.stock()), 'inbound', m.business, m.warehouse),
    ),
    files: jest.fn(async () => {
      calls.push('files');
      return {
        items: [],
        meta: {},
        paging: { total: 0, page: 1, perPage: 20 },
      };
    }),
  };
  return {
    api,
    calls,
    controller: createP12Controller(api),
    changeScope: () => {
      key = 'scope-B';
    },
  };
}

test.each([
  ['READ_FORBIDDEN', 403],
  ['DOCUMENTS_ACCESS_DENIED', 403],
  ['READ_FORBIDDEN', undefined],
])(
  'permission failure %s/%s revalidates owner before retry, retaining filters',
  async (code, status) => {
    const f = fixture();
    await f.controller.filters({
      ...initialFilters(),
      q: 'PN',
      status: 'INBOUND:SCANNING',
    });
    f.api.mixed.mockRejectedValueOnce(failed(code, status));
    expect(await f.controller.more()).toBe(false);
    expect(f.controller.snapshot().list.data).toBeUndefined();
    f.calls.length = 0;
    expect(await f.controller.retry()).toBe(true);
    expect(f.calls).toEqual(['owner', 'mixed']);
    expect(f.api.mixed.mock.calls.at(-1)[0]).toMatchObject({
      cursor: 'start',
      q: 'PN',
      status: 'INBOUND:SCANNING',
    });
    f.controller.dispose();
  },
);

test('child file403 preserves authorized parent, but retry must pass auth owner first', async () => {
  const f = fixture();
  await f.controller.open('inbound', m.business);
  const parent = f.controller.snapshot().detail.data;
  f.api.files.mockRejectedValueOnce(failed('ATTACHMENT_READ_DENIED', 403));
  await f.controller.tab('files');
  expect(f.controller.snapshot().detail.data).toBe(parent);
  expect(f.controller.snapshot().files.data).toBeUndefined();
  f.calls.length = 0;
  await f.controller.retry();
  expect(f.calls).toEqual(['owner', 'files']);
  expect(f.controller.snapshot().detail.data).toBe(parent);
  f.controller.dispose();
});

test('a rejected revalidation sends no new read and cannot expose protected parent cache', async () => {
  const f = fixture();
  await f.controller.load();
  await f.controller.open('inbound', m.business);
  f.api.files.mockRejectedValueOnce(failed('ATTACHMENT_READ_DENIED', 403));
  await f.controller.tab('files');
  f.api.revalidateScope.mockRejectedValue(
    failed('P12_CONTEXT_REVALIDATE_CHANGED'),
  );
  const readCount = f.api.files.mock.calls.length;
  await f.controller.retry();
  expect(f.api.files).toHaveBeenCalledTimes(readCount);
  expect(f.controller.snapshot().detail.data).toBeUndefined();
  expect(f.controller.snapshot().list.data).toBeUndefined();
  expect(f.controller.snapshot().detailTarget).toEqual({
    type: 'inbound',
    id: m.business,
  });
  f.controller.dispose();
});
test('same-query refresh is single-flight and a recoverable failure retains verified rows', async () => {
  const f = fixture();
  await f.controller.load();
  const verified = f.controller.snapshot().list.data;
  let finish;
  f.api.mixed.mockImplementationOnce(
    () => new Promise(resolve => (finish = resolve)),
  );
  const first = f.controller.load(),
    second = f.controller.load();
  expect(await second).toBe(false);
  expect(f.api.mixed).toHaveBeenCalledTimes(2);
  finish(verified);
  await first;
  f.api.mixed.mockRejectedValueOnce(failed('NETWORK_TEMPORARY', 503));
  expect(await f.controller.load()).toBe(false);
  expect(f.controller.snapshot().list).toMatchObject({
    status: 'error',
    data: verified,
  });
  f.controller.dispose();
});
test('visible query invalidates the older pending read before debounce dispatch', async () => {
  const f = fixture();
  const completed = await f.api.mixed({ cursor: 'start' });
  let finish;
  f.api.mixed.mockImplementationOnce(
    () => new Promise(resolve => (finish = resolve)),
  );
  const old = f.controller.load();
  f.controller.previewQuery('new visible query');
  expect(f.controller.snapshot()).toMatchObject({
    pendingQuery: 'new visible query',
    list: { status: 'pending' },
  });
  finish(completed);
  expect(await old).toBe(false);
  expect(f.controller.snapshot().list.data).toBeUndefined();
  await f.controller.filters({
    ...initialFilters(),
    q: 'new visible query',
  });
  expect(f.controller.snapshot().pendingQuery).toBeUndefined();
  f.controller.dispose();
});
test('reopening with a pending visible query cannot read the older committed filter', async () => {
  const f = fixture();
  await f.controller.load();
  f.controller.previewQuery('retained visible query');
  const saved = f.controller.snapshot(),
    before = f.api.mixed.mock.calls.length;
  f.controller.dispose();
  const restored = createP12Controller(f.api, saved);
  expect(await restored.load()).toBe(false);
  expect(f.api.mixed).toHaveBeenCalledTimes(before);
  expect(restored.snapshot().list.data).toBeUndefined();
  await restored.filters({
    ...restored.snapshot().filters,
    q: 'retained visible query',
  });
  expect(f.api.mixed.mock.calls.at(-1)[0].q).toBe('retained visible query');
  restored.dispose();
});
test('page-one empty data with positive total is an error, never a no-results panel', async () => {
  const f = fixture();
  const page = await f.api.mixed({ cursor: 'start' });
  f.api.mixed.mockResolvedValueOnce({
    ...page,
    items: [],
    paging: { ...page.paging, total: 3 },
  });
  expect(await f.controller.load()).toBe(false);
  expect(f.controller.snapshot().list).toMatchObject({
    status: 'error',
    code: 'P12_LIST_COUNT_MISMATCH',
  });
  f.controller.dispose();
});

test('revalidation callback from a replaced scope cannot resume the previous read', async () => {
  const f = fixture();
  await f.controller.load();
  f.api.mixed.mockRejectedValueOnce(failed('DENIED', 403));
  await f.controller.more();
  f.api.revalidateScope.mockImplementationOnce(async () => {
    f.changeScope();
    return true;
  });
  const count = f.api.mixed.mock.calls.length;
  expect(await f.controller.retry()).toBe(false);
  expect(f.api.mixed).toHaveBeenCalledTimes(count);
  expect(f.controller.snapshot().scope).toBe('scope-B');
  expect(f.controller.snapshot().list.data).toBeUndefined();
  f.controller.dispose();
});

test('append after a child denial cannot restore old list data when fresh rights changed', async () => {
  const f = fixture();
  await f.controller.load();
  await f.controller.open('inbound', m.business);
  f.api.files.mockRejectedValueOnce(failed('ATTACHMENT_READ_DENIED', 403));
  await f.controller.tab('files');
  f.controller.back();
  f.api.revalidateScope.mockRejectedValue(
    failed('P12_CONTEXT_REVALIDATE_CHANGED'),
  );
  const count = f.api.mixed.mock.calls.length;
  expect(await f.controller.more()).toBe(false);
  expect(f.api.mixed).toHaveBeenCalledTimes(count);
  expect(f.controller.snapshot().list.data).toBeUndefined();
  f.controller.dispose();
});
