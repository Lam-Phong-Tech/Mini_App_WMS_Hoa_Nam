import { type P12Service } from './service';
import {STOCK_WAITING_WEB_FILTER} from '../../../ui/stockWorkflowLabels';
import { mixedQuery, compareMixed, type MixedPage } from './mixed';
import { isDocumentTimestampMetadata } from '../../../services/wms/documentTimestamps';
import {
  requireValue,
  stockHistory,
  type Source,
  type Document,
  type Page,
  type Raw,
  type Scan,
  type File,
  type Query,
  type Paging,
} from './contract';
export type Tab = 'info' | 'products' | 'files' | 'events';
export interface Filters {
  source: Source | 'all';
  q: string;
  status: string;
  sort: 'asc' | 'desc';
  from: string;
  to: string;
}
export interface Slot<T> {
  status: 'pending' | 'loading' | 'ready' | 'error';
  data?: T;
  error?: string;
  code?: string;
}
export interface State {
  requiresScopeRevalidation?: boolean;
  cursorRecoveryCode?: string;
  homeEntryKey?: string;
  stockQueue?: 'inbound' | 'outbound';
  createDraft?: {
    supplierId: string | null;
    supplierName: string;
    note: string;
    docDate?: string;
  };
  scope: string;
  panel: 1 | 2 | 3 | 4;
  filters: Filters;
  pendingQuery?: string;
  list: Slot<Page<Document>>;
  groups: Record<Source, Slot<Page<Document>>>;
  groupFilters: Record<Source, Filters>;
  expandedGroup?: Source;
  detail: Slot<Document>;
  detailTarget?: { type: Source; id: string };
  scans: Slot<Page<Scan>>;
  files: Slot<Page<File>>;
  events: Slot<Page<Raw>>;
  tab: Tab;
  query: string;
  scanStatus: 'ACTIVE' | 'REMOVED' | 'ALL';
  scroll: Record<string, number>;
}
export const initialFilters = (): Filters => ({
  source: 'all',
  q: '',
  status: 'all',
  sort: 'desc',
  from: '',
  to: '',
});
export const documentSources: Source[] = ['inbound', 'outbound', 'warranty'];
const emptyGroups = (): State['groups'] => ({
  inbound: { status: 'pending' },
  outbound: { status: 'pending' },
  warranty: { status: 'pending' },
});
const initialGroupFilters = (): State['groupFilters'] => ({
  inbound: { ...initialFilters(), source: 'inbound' },
  outbound: { ...initialFilters(), source: 'outbound' },
  warranty: { ...initialFilters(), source: 'warranty' },
});

const sourceText = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : null;

/**
 * Warranty detail already carries the persisted product identity. P12 must
 * render that owner detail directly; it must not call scan-entries (which is
 * intentionally not mapped for warranty) or enrich from the current catalog.
 */
export function warrantyProductPage(document: Document): Page<Scan> | null {
  const source = document.source ?? {};
  const itemId = sourceText(source.item_id);
  const skuId = sourceText(source.product_id ?? source.sku_id);
  const skuCode = sourceText(source.sku_code);
  const skuName = sourceText(source.sku_name);
  const serial = sourceText(source.serial_number ?? source.item_code);
  const temporaryCode = sourceText(source.temporary_item_code);
  const identity = itemId ?? skuId ?? serial ?? temporaryCode;
  if (!identity) return null;

  const row: Scan = {
    id: itemId ?? `${document.id}:warranty-product-source`,
    document_id: document.id,
    quantity: null,
    unit: sourceText(source.unit),
    sku_id: skuId,
    sku_code: skuCode,
    sku_name: skuName,
    raw_code: sourceText(source.physical_code ?? source.item_code ?? temporaryCode),
    serial_number: serial,
    candidate_serial_number: null,
  };
  const now = {
    entry_count: 1,
    sku_count: skuId ? 1 : 0,
    item_count: itemId ? 1 : 0,
    resolved_serial_count: serial ? 1 : 0,
    quantity_total: null,
    quantity_by_unit: [
      {
        unit: row.unit,
        quantity: null,
        known_quantity: null,
        entry_count: 1,
        missing_quantity_count: 1,
      },
    ],
    quantity_complete: null,
    unit_complete: null,
    missing_quantity_count: 1,
    unknown_unit_entry_count: row.unit ? 0 : 1,
    mixed_units: false,
    coverage: 'CURRENT_QUERY' as const,
  };
  return {
    items: [row],
    paging: {
      total: 1,
      page: 1,
      perPage: 20,
      lastPage: 1,
      hasMore: false,
      nextPage: null,
      nextCursor: null,
      mode: 'OFFSET',
      snapshotConsistent: false,
    },
    meta: {
      kind: 'LOCAL_OWNER_DETAIL_PRESENTATION_NOT_BACKEND_CONTRACT',
      source: 'PERSISTED_WARRANTY_CASE_DETAIL',
      identification_status: sourceText(source.identification_status),
    },
    summary: now,
    refreshRequired: false,
  };
}
type ReadName =
  | 'list'
  | 'detail'
  | 'scans'
  | 'files'
  | 'events'
  | `group:${Source}`;
export function listQuery(f: Filters, queue?: 'inbound' | 'outbound'): Query {
  if (f.source === 'all')
    return mixedQuery({
      source: 'ALL',
      q: f.q,
      status: f.status === 'all' ? 'ALL' : f.status,
      sort: f.sort === 'asc' ? 'created_at_asc' : 'created_at_desc',
      per_page: 20,
      ...(f.from ? { date_from: f.from } : {}),
      ...(f.to ? { date_to: f.to } : {}),
    });
  if (f.source === 'warranty') {
    requireValue(
      !f.from && !f.to,
      'P23_DATE_MAPPING_PENDING',
      'Bộ lọc ngày bảo hành chưa được nối theo mapping riêng.',
    );
    return {
      ...(f.q ? { search: f.q } : {}),
      sort: f.sort === 'asc' ? 'created_at_asc' : 'created_at_desc',
      ...(f.status === 'all' ? {} : { status: f.status }),
      page: 1,
      per_page: 20,
    };
  }
  const waiting=f.status===STOCK_WAITING_WEB_FILTER||queue===f.source;
  return {
    keyword: f.q,
    sort_order: f.sort,
    timezone: 'Asia/Ho_Chi_Minh',
    ...(waiting?(f.source==='inbound'?{status:'WAITING_APPROVAL'}:{ready_for_issue:true}):f.status === 'all' ? {} : { status: f.status }),
    ...(f.from ? { date_from: f.from } : {}),
    ...(f.to ? { date_to: f.to } : {}),
    page: 1,
    per_page: 20,
  };
}
export function hasNextPage(p?: Paging) {
  if (!p) return false;
  return typeof p.hasMore === 'boolean'
    ? p.hasMore
    : typeof p.page === 'number' &&
        typeof p.lastPage === 'number' &&
        p.page < p.lastPage;
}
function nextQuery(q: Query, p?: Paging): Query | null {
  if (!p || !hasNextPage(p)) return null;
  if (p.mode === 'KEYSET') {
    requireValue(p.nextCursor, 'P12_INVALID_NEXT_PAGE');
    const rest = { ...q };
    delete rest.page;
    return { ...rest, cursor: p.nextCursor };
  }
  requireValue(typeof p.page === 'number', 'P12_INVALID_NEXT_PAGE');
  const page = p.nextPage ?? p.page + 1;
  requireValue(page === p.page + 1, 'P12_INVALID_NEXT_PAGE');
  return { ...q, page };
}
export function createP12Controller(api: P12Service, retained?: State) {
  let state: State =
    retained && retained.scope === api.scopeKey()
      ? {
          ...retained,
          groups: retained.groups ?? emptyGroups(),
          groupFilters: retained.groupFilters ?? initialGroupFilters(),
        }
      : {
          scope: api.scopeKey(),
          panel: 1,
          filters: initialFilters(),
          list: { status: 'pending' },
          groups: emptyGroups(),
          groupFilters: initialGroupFilters(),
          detail: { status: 'pending' },
          scans: { status: 'pending' },
          files: { status: 'pending' },
          events: { status: 'pending' },
          tab: 'info',
          query: '',
          scanStatus: 'ACTIVE',
          scroll: {},
        };
  // A retained cursor/DTO from the old timestamp convention must be reread.
  // Keep filters and scroll, but never display that cached shifted timestamp.
  if (
    state.list.data &&
    (!isDocumentTimestampMetadata(state.list.data.meta) ||
      (state.filters.source === 'all' &&
        (state.list.data as MixedPage).mixed?.cursorVersion !== 3))
  )
    state = {
      ...state,
      list: { status: 'pending' },
      cursorRecoveryCode: undefined,
    };
  if (state.detail.data && !isDocumentTimestampMetadata(state.detail.data.meta))
    state = {
      ...state,
      detailTarget: { type: state.detail.data.type, id: state.detail.data.id },
      detail: { status: 'pending' },
      scans: { status: 'pending' },
      files: { status: 'pending' },
      events: { status: 'pending' },
    };
  // An uncommitted visible query must not survive a controller remount as data
  // for the older committed filter.
  if (
    retained &&
    state.pendingQuery !== undefined &&
    state.pendingQuery !== state.filters.q
  )
    state = { ...state, list: { status: 'pending' } };
  let disposed = false;
  const listeners = new Set<() => void>(),
    requests = new Map<ReadName, AbortController>();
  const slot = (name: ReadName): Slot<unknown> =>
    name.startsWith('group:')
      ? state.groups[name.slice(6) as Source]
      : state[name as Exclude<ReadName, `group:${Source}`>];
  const putSlot = (name: ReadName, value: Slot<unknown>) => {
    state = name.startsWith('group:')
      ? { ...state, groups: { ...state.groups, [name.slice(6)]: value } }
      : { ...state, [name]: value };
  };
  const emit = () => {
    for (const fn of listeners) fn();
  };
  const cancel = () => {
    for (const [name, c] of requests) {
      c.abort();
      const current = slot(name);
      if (current.status === 'loading')
        putSlot(name, {
          status: current.data ? 'ready' : 'pending',
          data: current.data,
        });
    }
    requests.clear();
  };
  function scope() {
    const next = api.scopeKey();
    if (next !== state.scope) {
      cancel();
      state = {
        scope: next,
        panel: 1,
        filters: initialFilters(),
        list: { status: 'pending' },
        groups: emptyGroups(),
        groupFilters: initialGroupFilters(),
        detail: { status: 'pending' },
        scans: { status: 'pending' },
        files: { status: 'pending' },
        events: { status: 'pending' },
        tab: 'info',
        query: '',
        scanStatus: 'ACTIVE',
        scroll: {},
      };
      emit();
    }
    return next;
  }
  async function read<T>(
    name: ReadName,
    reader: (signal: AbortSignal) => Promise<T>,
    append = false,
    expected?: Query,
  ) {
    if (requests.has(name)) return false;
    const owner = scope(),
      controller = new AbortController();
    requests.get(name)?.abort();
    requests.set(name, controller);
    const previous = slot(name).data as T | undefined;
    putSlot(name, { status: 'loading', data: previous });
    emit();
    try {
      // Context/permission failures require fresh auth-owner evidence before
      // any retry. Applies to children too, without emptying an authorized
      // parent merely because its attachment/scan endpoint denied the read.
      if (
        state.requiresScopeRevalidation ||
        (name === 'list' &&
          state.cursorRecoveryCode === 'DOCUMENTS_CURSOR_CONTEXT_CHANGED')
      ) {
        const revalidatingScope = scope();
        requireValue(
          await api.revalidateScope(controller.signal),
          'P12_CONTEXT_REVALIDATE_REQUIRED',
        );
        requireValue(
          !disposed &&
            !controller.signal.aborted &&
            requests.get(name) === controller &&
            revalidatingScope === scope() &&
            owner === state.scope,
          'P12_STALE_SCOPE',
        );
        state = { ...state, requiresScopeRevalidation: false };
      }
      const data = await reader(controller.signal);
      if (
        disposed ||
        controller.signal.aborted ||
        requests.get(name) !== controller ||
        owner !== scope()
      )
        return false;
      if (name === 'list' && !append) {
        const page = data as unknown as Page<Raw>;
        if (typeof page.paging.total === 'number')
          requireValue(
            page.items.length <= page.paging.total &&
              (page.paging.total === 0 || page.items.length > 0),
            'P12_LIST_COUNT_MISMATCH',
            'Số dòng trang đầu chưa khớp tổng nguồn.',
          );
      }
      if (append && previous) {
        const a = previous as unknown as Page<Raw>,
          b = data as unknown as Page<Raw>;
        requireValue(
          a.paging.total === b.paging.total &&
            a.paging.perPage === b.paging.perPage &&
            a.paging.mode === b.paging.mode &&
            (expected?.cursor
              ? b.paging.nextCursor !== expected.cursor
              : b.paging.page === expected?.page),
          'P12_PAGING_CHANGED_RELOAD',
          'Nguồn hoặc phân trang đã thay đổi. Đọc lại từ trang đầu.',
        );
        if (name === 'list' && state.filters.source === 'all') {
          const before = previous as unknown as MixedPage,
            after = data as unknown as MixedPage;
          requireValue(
            before.mixed?.upperBound === after.mixed?.upperBound &&
              before.mixed?.expiresAt === after.mixed?.expiresAt &&
              before.mixed?.cursorVersion === after.mixed?.cursorVersion &&
              (before.meta.timestamps as Raw)?.legacy_naive_timezone ===
                (after.meta.timestamps as Raw)?.legacy_naive_timezone,
            'P12_PAGING_CHANGED_RELOAD',
            'Danh sách đã thay đổi. Đọc lại từ trang đầu.',
          );
          requireValue(
            after.items.length === 0 ||
              compareMixed(
                before.items[before.items.length - 1],
                after.items[0],
                String(expected?.sort),
              ) < 0,
            'P12_PAGING_CHANGED_RELOAD',
            'Lượt tải tiếp theo bị lặp hoặc sai thứ tự. Đọc lại từ trang đầu.',
          );
        }
        if (
          name === 'scans' &&
          JSON.stringify(a.summary) !== JSON.stringify(b.summary)
        ) {
          putSlot(name, {
            status: 'error',
            code: 'SUMMARY_CHANGED_RELOAD',
            error: 'Nguồn đã thay đổi. Đọc lại từ trang đầu.',
          });
          emit();
          return false;
        }
        const id = (r: Raw) =>
          name === 'list' && state.filters.source === 'all'
            ? String(r.rowKey ?? (r.source as Raw)?.row_key)
            : String(
                r.id ?? r.event_id ?? r.attachment_id ?? r.warranty_case_id,
              );
        const map = new Map(a.items.map(r => [id(r), r]));
        for (const r of b.items) map.set(id(r), r);
        requireValue(
          map.size > a.items.length || !hasNextPage(b.paging),
          'P12_PAGING_CHANGED_RELOAD',
          'Trang tiếp theo bị lặp. Đọc lại từ trang đầu.',
        );
        requireValue(
          hasNextPage(b.paging) || map.size === b.paging.total,
          'P12_PAGING_CHANGED_RELOAD',
          'Số bản ghi đã đọc chưa khớp tổng nguồn. Đọc lại từ trang đầu.',
        );
        b.items = [...map.values()];
      }
      putSlot(name, { status: 'ready', data });
      if (name === 'list') state = { ...state, cursorRecoveryCode: undefined };
      emit();
      return true;
    } catch (error) {
      if (
        disposed ||
        controller.signal.aborted ||
        owner !== scope() ||
        requests.get(name) !== controller
      )
        return false;
      const e = error as {
        message?: string;
        code?: string;
        status?: number;
        kind?: string;
      };
      const invalidResponse =
        e.kind === 'parse' ||
        /INVALID|MISMATCH|CONTRACT|SCOPE|COUNT/.test(e.code ?? '');
      if (e.code === 'P12_CONTEXT_REVALIDATE_CHANGED') {
        // The service can observe fresh rights before its caller replaces the
        // cached context. Hide protected DTOs and cancel all older callbacks;
        // preserve filters, canonical target and scroll for the owner retry.
        const target =
          state.detailTarget ??
          (state.detail.data
            ? { type: state.detail.data.type, id: state.detail.data.id }
            : undefined);
        cancel();
        state = {
          ...state,
          list: { status: 'pending' },
          groups: emptyGroups(),
          detailTarget: target,
          detail: { status: 'pending' },
          scans: { status: 'pending' },
          files: { status: 'pending' },
          events: { status: 'pending' },
          requiresScopeRevalidation: true,
        };
      } else if (
        e.status === 401 ||
        e.status === 403 ||
        e.code === 'READ_FORBIDDEN' ||
        e.code === 'DOCUMENTS_CURSOR_CONTEXT_CHANGED'
      ) {
        state = { ...state, requiresScopeRevalidation: true };
      }
      if (
        name === 'list' &&
        state.filters.source === 'all' &&
        [
          'DOCUMENTS_CURSOR_INVALID',
          'DOCUMENTS_CURSOR_CONTEXT_CHANGED',
          'DOCUMENTS_CURSOR_EXPIRED',
        ].includes(e.code ?? '')
      )
        state = { ...state, cursorRecoveryCode: e.code };
      const invalidScan =
        name === 'scans' &&
        [
          'SCAN_CONTRACT_MISMATCH',
          'SCAN_PARENT_MISMATCH',
          'INVALID_SCAN_SUMMARY',
          'INVALID_RESPONSE',
          'DUPLICATE_PAGE_ID',
          'PRIVATE_CACHE_REQUIRED',
          'INVALID_JSON_CONTENT_TYPE',
        ].includes(e.code ?? '');
      putSlot(name, {
        status: 'error',
        data:
          !!previous &&
          !invalidResponse &&
          !state.requiresScopeRevalidation &&
          e.status !== 401 &&
          e.status !== 403 &&
          e.status !== 404 &&
          !invalidScan &&
          e.code !== 'READ_FORBIDDEN' &&
          ![
            'DOCUMENTS_CURSOR_INVALID',
            'DOCUMENTS_CURSOR_CONTEXT_CHANGED',
            'DOCUMENTS_CURSOR_EXPIRED',
          ].includes(e.code ?? '') &&
          !e.code?.startsWith('MIXED_') &&
          !e.code?.startsWith('DOCUMENT_TIMESTAMP_') &&
          e.code !== 'P12_PAGING_CHANGED_RELOAD'
            ? previous
            : undefined,
        error: e.message ?? 'Chưa đọc được dữ liệu.',
        code: e.code,
      });
      emit();
      return false;
    } finally {
      if (requests.get(name) === controller) requests.delete(name);
    }
  }
  const query = () => listQuery(state.filters, state.stockQueue);
  const list = async (append = false) => {
    scope();
    if (
      state.pendingQuery !== undefined &&
      state.pendingQuery !== state.filters.q
    )
      return false;
    const source = state.filters.source;
    let q: Query;
    try {
      q = query();
      if (append) {
        const next = nextQuery(q, state.list.data?.paging);
        if (!next) return false;
        q = next;
      }
    } catch (error) {
      state = {
        ...state,
        list: { status: 'error', error: (error as Error).message },
      };
      emit();
      return false;
    }
    return read(
      'list',
      async signal => {
        if (source === 'all') {
          return api.mixed(q, signal);
        }
        const page = await api.list(source, q, signal);
        return {
          ...page,
          items: page.items.map(r => api.normalize(source, r)),
        };
      },
      append,
      q,
    );
  };
  async function child(tab: Tab, append = false) {
    const d = state.detail.data;
    if (!d || state.detail.status !== 'ready') return false;
    if (tab === 'products') {
      if (d.type === 'warranty') {
        const page = warrantyProductPage(d);
        if (page) {
          return read('scans', async () => page, append);
        }
        state = {
          ...state,
          scans: {
            status: 'error',
            code: 'P09_PRODUCT_SOURCE_NOT_RECORDED',
            error: 'Nguồn sản phẩm bảo hành chưa được chốt.',
          },
        };
        emit();
        return false;
      }
      const q = append
        ? nextQuery(
            { status: state.scanStatus, per_page: 20 },
            state.scans.data?.paging,
          )
        : { status: state.scanStatus, page: 1, per_page: 20 };
      if (!q) return false;
      return read(
        'scans',
        signal => api.scans(d.type, d.id, q, signal),
        append,
        q,
      );
    }
    if (tab === 'files') {
      const q = append
        ? nextQuery({ per_page: 20 }, state.files.data?.paging)
        : { per_page: 20, page: 1 };
      if (!q) return false;
      return read(
        'files',
        async signal =>
          (await api.files(d.type, d.id, q, signal)) as Page<File>,
        append,
        q,
      );
    }
    if (tab === 'events') {
      if (d.type !== 'warranty')
        return read('events', async () => ({
          items: stockHistory(d).items,
          meta: {},
          paging: {
            total: stockHistory(d).items.length,
            page: 1,
            perPage: 20,
            snapshotConsistent: false,
          },
        }));
      const q = append
        ? nextQuery(
            { sort: 'event_at_asc', per_page: 20 },
            state.events.data?.paging,
          )
        : { sort: 'event_at_asc', per_page: 20, page: 1 };
      if (!q) return false;
      return read('events', signal => api.events(d.id, q, signal), append, q);
    }
    return true;
  }
  return {
    snapshot: () => {
      scope();
      return state;
    },
    subscribe: (fn: () => void) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    load: list,
    stockQueue(source: 'inbound' | 'outbound', homeEntryKey?: string) {
      cancel();
      state = {
        ...state,
        panel: 1,
        stockQueue: source,
        homeEntryKey,
        filters: { ...initialFilters(), source },
        list: { status: 'pending' },
        scroll: { ...state.scroll, list: 0 },
      };
      emit();
      return list();
    },
    more: () => list(true),
    resumeList: () =>
      state.list.status === 'pending' ? list() : Promise.resolve(true),
    filters(f: Filters, homeEntryKey?: string) {
      cancel();
      const groupFilters = { ...state.groupFilters },
        groups = { ...state.groups };
      if (f.source === 'all')
        for (const source of documentSources) {
          if (
            groupFilters[source].q !== f.q ||
            groupFilters[source].sort !== f.sort
          ) {
            groupFilters[source] = {
              ...groupFilters[source],
              q: f.q,
              sort: f.sort,
            };
            groups[source] = { status: 'pending' };
          }
        }
      state = {
        ...state,
        filters: { ...f },
        pendingQuery: undefined,
        homeEntryKey: homeEntryKey ?? state.homeEntryKey,
        stockQueue: undefined,
        groups,
        groupFilters,
        list: { status: 'pending' },
        scroll: { ...state.scroll, list: 0 },
      };
      emit();
      return list();
    },
    previewQuery(value: string) {
      requests.get('list')?.abort();
      requests.delete('list');
      state = {
        ...state,
        pendingQuery: value,
        // The visible query no longer describes the loaded rows. Hide them
        // immediately and invalidate their callbacks; debounce will dispatch
        // only the visible query if the caller/source is still current.
        list: { status: 'pending' },
      };
      emit();
    },
    async open(type: Source, id: string, initialTab: Tab = 'info') {
      cancel();
      state = {
        ...state,
        panel: 2,
        tab: initialTab,
        query: '',
        scanStatus: 'ACTIVE',
        detailTarget: { type, id },
        scans: { status: 'pending' },
        files: { status: 'pending' },
        events: { status: 'pending' },
      };
      emit();
      const ok = await read('detail', signal => api.detail(type, id, signal));
      if (
        ok &&
        state.detailTarget?.type === type &&
        state.detailTarget.id === id &&
        state.tab === initialTab &&
        initialTab !== 'info'
      )
        await child(initialTab);
      return ok;
    },
    async tab(tab: Tab) {
      state = { ...state, tab, panel: tab === 'products' ? 3 : 2 };
      emit();
      const childSlot =
        tab === 'products'
          ? 'scans'
          : tab === 'files'
          ? 'files'
          : tab === 'events'
          ? 'events'
          : null;
      if (childSlot && state[childSlot].status === 'pending') await child(tab);
    },
    retry: async () =>
      state.panel === 1
        ? list()
        : (state.tab === 'info' || state.detail.status !== 'ready') &&
          (state.detailTarget || state.detail.data)
        ? (async () => {
            const ok = await read('detail', signal =>
              api.detail(
                state.detailTarget?.type ?? state.detail.data!.type,
                state.detailTarget?.id ?? state.detail.data!.id,
                signal,
              ),
            );
            if (ok && state.tab !== 'info') await child(state.tab);
            return ok;
          })()
        : child(state.tab),
    refreshDetail: (type: Source, id: string) =>
      read('detail', signal => api.detail(type, id, signal)),
    child,
    moreChild: () => child(state.tab, true),
    scanFilter(status: State['scanStatus']) {
      state = {
        ...state,
        scanStatus: status,
        query: '',
        scans: { status: 'pending' },
        scroll: {
          ...state.scroll,
          ...(state.detail.data
            ? { [state.detail.data.id + ':products']: 0 }
            : {}),
        },
      };
      emit();
      return child('products');
    },
    search(value: string) {
      state = { ...state, query: value };
      emit();
    },
    scroll(key: string, y: number) {
      state = { ...state, scroll: { ...state.scroll, [key]: y } };
    },
    draft(value: State['createDraft']) {
      state = { ...state, createDraft: value };
    },
    create() {
      cancel();
      state = { ...state, panel: 4 };
      emit();
    },
    back() {
      cancel();
      if (state.panel === 1) return false;
      state = { ...state, panel: 1, tab: 'info' };
      emit();
      return true;
    },
    invalidate: scope,
    hide() {
      cancel();
      for (const name of [
        'list',
        'detail',
        'scans',
        'files',
        'events',
      ] as const)
        if (state[name].status === 'loading')
          state = { ...state, [name]: { status: 'pending' } };
      emit();
    },
    dispose() {
      cancel();
      disposed = true;
      listeners.clear();
    },
  };
}
export type P12Controller = ReturnType<typeof createP12Controller>;
