import { AppError } from '../../errors/AppError';

interface PageMeta {
  total: number | null;
  availableTotal?: number | null;
  hasMore: boolean;
  nextCursor?: string | null;
  nextPage?: number | null;
}
export interface HistoryWindow<T> {
  items: readonly T[];
  meta: PageMeta;
  cursors?: readonly string[];
  requestKey?: string;
  pageIds?: readonly string[];
}

/** Join only consecutive reads of the same caller/scope/filter binding. */
export function verifiedHistoryPage<T>(
  previous: HistoryWindow<T> | undefined,
  next: HistoryWindow<T>,
  request: { page?: number; cursor?: string },
  identity: (item: T) => string,
): HistoryWindow<T> {
  const fail = () => {
    throw new AppError({
      kind: 'parse',
      code: 'HISTORY_PAGE_CHANGED_RESTART',
      message:
        'Nguồn lịch sử hoặc cursor đã thay đổi. Đọc lại từ trang đầu, giữ bộ lọc.',
    });
  };
  const append = !!request.cursor || (request.page ?? 1) > 1;
  const requestKey = JSON.stringify(request);
  const pageIds = next.items.map(identity);
  if (append && previous?.requestKey === requestKey) {
    const prior = new Map(previous.items.map(item => [identity(item), item]));
    if (
      ['total', 'availableTotal', 'hasMore', 'nextCursor', 'nextPage'].some(
        field =>
          previous.meta[field as keyof PageMeta] !==
          next.meta[field as keyof PageMeta],
      ) ||
      JSON.stringify(previous.pageIds) !== JSON.stringify(pageIds) ||
      next.items.some(
        item =>
          JSON.stringify(prior.get(identity(item))) !== JSON.stringify(item),
      )
    )
      fail();
    return previous;
  }
  const cursors = append ? [...(previous?.cursors ?? [])] : [];
  if (request.cursor) {
    if (cursors.includes(request.cursor)) fail();
    cursors.push(request.cursor);
  }
  if (append && !previous) fail();
  if (
    next.meta.hasMore &&
    (!next.items.length ||
      (next.meta.nextCursor
        ? cursors.includes(next.meta.nextCursor)
        : !(Number(next.meta.nextPage) > (request.page ?? 1))))
  )
    fail();
  if (
    append &&
    previous &&
    (previous.meta.total !== next.meta.total ||
      previous.meta.availableTotal !== next.meta.availableTotal ||
      (request.cursor
        ? previous.meta.nextCursor !== request.cursor
        : previous.meta.nextPage !== request.page))
  )
    fail();
  const rows = new Map<string, T>();
  for (const item of [
    ...(append ? previous?.items ?? [] : []),
    ...next.items,
  ]) {
    const id = identity(item);
    if (
      !id ||
      (rows.has(id) && JSON.stringify(rows.get(id)) !== JSON.stringify(item))
    )
      fail();
    rows.set(id, item);
  }
  const items = [...rows.values()];
  if (
    typeof next.meta.total === 'number' &&
    (items.length > next.meta.total || (next.meta.total > 0 && !items.length))
  )
    fail();
  return { items, meta: next.meta, cursors, requestKey, pageIds };
}
