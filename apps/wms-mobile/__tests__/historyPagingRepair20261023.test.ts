import {
  verifiedHistoryPage,
  type HistoryWindow,
} from '../src/features/history/historyPaging';

type Event = { id: string; text: string };
const row = (id: string): Event => ({ id, text: 'Persisted ' + id });
const first = (): HistoryWindow<Event> => ({
  items: [row('one')],
  meta: { total: 3, hasMore: true, nextCursor: 'second' },
});
const identity = (event: Event) => event.id;

test('timeline appends immutable events, keeps order and deduplicates exact overlaps', () => {
  const initial = verifiedHistoryPage(undefined, first(), {}, identity);
  const result = verifiedHistoryPage(
    initial,
    {
      items: [row('one'), row('two')],
      meta: { total: 3, hasMore: true, nextCursor: 'third' },
    },
    { cursor: 'second' },
    identity,
  );
  expect(result.items.map(identity)).toEqual(['one', 'two']);
  expect(
    verifiedHistoryPage(
      result,
      {
        items: [row('three')],
        meta: { total: 3, hasMore: false, nextCursor: null },
      },
      { cursor: 'third' },
      identity,
    ).items.map(identity),
  ).toEqual(['one', 'two', 'three']);
});

test('retrying the same accepted page is idempotent, not a new cursor hop', () => {
  const initial = verifiedHistoryPage(undefined, first(), {}, identity);
  const next = {
    items: [row('two')],
    meta: { total: 3, hasMore: true, nextCursor: 'third' },
  };
  const result = verifiedHistoryPage(
    initial,
    next,
    { cursor: 'second' },
    identity,
  );
  expect(
    verifiedHistoryPage(result, next, { cursor: 'second' }, identity),
  ).toBe(result);
  expect(() =>
    verifiedHistoryPage(
      result,
      { ...next, items: [] },
      { cursor: 'second' },
      identity,
    ),
  ).toThrow();
});

test.each(['total', 'identity', 'empty', 'cursor', 'cycle', 'missing prior'])(
  'history rejects %s inconsistency rather than mixing pages',
  mode => {
    const initial = verifiedHistoryPage(undefined, first(), {}, identity);
    const next = {
      items: [row('two')],
      meta: { total: 3, hasMore: true, nextCursor: 'third' },
    };
    let previous: HistoryWindow<Event> | undefined = initial;
    let request = { cursor: 'second' };
    if (mode === 'total') next.meta.total = 4;
    if (mode === 'identity') next.items = [{ ...row('one'), text: 'Changed' }];
    if (mode === 'empty') next.items = [];
    if (mode === 'cursor') next.meta.nextCursor = 'second';
    if (mode === 'missing prior') previous = undefined;
    if (mode === 'cycle') {
      previous = verifiedHistoryPage(initial, next, request, identity);
      request = { cursor: 'third' };
      next.items = [row('three')];
      next.meta.nextCursor = 'second';
    }
    expect(() =>
      verifiedHistoryPage(previous, next, request, identity),
    ).toThrow();
  },
);

test('offset pages also require the exact next page and stable total', () => {
  const initial = verifiedHistoryPage(
    undefined,
    {
      items: [row('one')],
      meta: { total: 2, hasMore: true, nextPage: 2 },
    },
    { page: 1 },
    identity,
  );
  expect(
    verifiedHistoryPage(
      initial,
      {
        items: [row('two')],
        meta: { total: 2, hasMore: false, nextPage: null },
      },
      { page: 2 },
      identity,
    ).items,
  ).toHaveLength(2);
  expect(() =>
    verifiedHistoryPage(
      initial,
      {
        items: [row('two')],
        meta: { total: 2, hasMore: false, nextPage: null },
      },
      { page: 3 },
      identity,
    ),
  ).toThrow();
});
