import type { Session } from '../../auth/session';
import { AppError, toAppError } from '../../errors/AppError';
import { parseScanPayload } from '../../scanner/scanPayload';
import {
  p06Identity,
  p06ContextReadError,
  p06IdentityKey,
  p06ScopeKey,
  p06Unique,
  type P06Card,
  type P06CatalogService,
  type P06Category,
  type P06Context,
  type P06Detail,
  type P06Event,
  type P06GalleryImage,
  type P06Identity,
  type P06ListResponse,
  type P06Response,
  type P06Source,
  type P06Stock,
  type P06TimelineResponse,
} from '../../services/wms/p06Catalog';

export type P06Panel = 1 | 2 | 3 | 4;
export type P06SearchMode = 'keyword' | 'item_code' | 'serial';
export interface P06ViewState {
  scopeKey: string;
  query: string;
  mode: P06SearchMode;
  category: P06Category;
  status: 'ACTIVE' | 'INACTIVE' | 'ALL';
  panel: P06Panel;
  identity?: P06Identity;
  scroll: Record<P06Panel, number>;
  source: P06Source;
  scanReturnCategory?: P06Category;
  initialScan?: string;
  /** Navigation only. Projections must be read again after remount. */
  listPages?: number;
  timelinePages?: number;
}
export interface P06Load<T> {
  loading: boolean;
  data?: T;
  error?: AppError;
}
export interface P06Recent {
  identity: P06Identity;
  name: string;
  code: string;
}
export interface P06State {
  view: P06ViewState;
  context: P06Load<P06Response<P06Context>>;
  list: P06Load<P06ListResponse>;
  detail: P06Load<P06Response<P06Detail>>;
  stock: P06Load<P06Response<P06Stock>>;
  timeline: P06Load<P06TimelineResponse>;
  gallery: P06Load<P06Response<P06GalleryImage[]>>;
  recent: P06Recent[];
}
type Lane = 'context' | 'list' | 'detail' | 'stock' | 'timeline' | 'gallery';
function empty(scopeKey = ''): P06State {
  return {
    view: {
      scopeKey,
      query: '',
      mode: 'keyword',
      category: 'PRODUCT',
      status: 'ACTIVE',
      panel: 1,
      scroll: { 1: 0, 2: 0, 3: 0, 4: 0 },
      source: 'ALL',
    },
    context: { loading: false },
    list: { loading: false },
    detail: { loading: false },
    stock: { loading: false },
    timeline: { loading: false },
    gallery: { loading: false },
    recent: [],
  };
}
/** Per-mount read model. No tokens, live cache, or recent data persisted to storage. */
export class P06LookupFlow {
  private state = empty();
  private listeners = new Set<() => void>();
  private tasks: Partial<Record<Lane, AbortController>> = {};
  private generation: Record<Lane, number> = {
    context: 0,
    list: 0,
    detail: 0,
    stock: 0,
    timeline: 0,
    gallery: 0,
  };
  constructor(private service: P06CatalogService) {}
  snapshot = (): P06State => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private update(patch: Partial<P06State>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach(f => f());
  }
  private view(patch: Partial<P06ViewState>) {
    this.update({ view: { ...this.state.view, ...patch } });
  }
  private cancel(lane: Lane) {
    this.generation[lane] += 1;
    this.tasks[lane]?.abort();
    delete this.tasks[lane];
  }
  stop = () => {
    (Object.keys(this.generation) as Lane[]).forEach(lane => this.cancel(lane));
  };
  private begin(lane: Lane) {
    this.cancel(lane);
    const controller = new AbortController();
    this.tasks[lane] = controller;
    const sequence = this.generation[lane];
    return {
      signal: controller.signal,
      current: () =>
        !controller.signal.aborted && sequence === this.generation[lane],
    };
  }
  private context(): P06Context {
    const c = this.state.context.data?.data;
    if (!c)
      throw new AppError({
        kind: 'config',
        message: 'Chưa xác nhận nguồn dữ liệu tra cứu.',
      });
    return c;
  }
  private acceptContext(data: P06Response<P06Context>): boolean {
    const error = p06ContextReadError(data.data),
      rights = data.data.permissions;
    this.update({
      context: { loading: false, data, error },
      recent: this.state.recent.filter(r =>
        r.identity.type === 'SKU' ? rights.skus : rights.items,
      ),
    });
    return error === undefined;
  }
  async start(
    session: Session | undefined,
    restored?: P06ViewState,
    scan?: string,
  ) {
    this.stop();
    const key = p06ScopeKey(session),
      next = empty(key);
    if (restored?.scopeKey === key)
      next.view = { ...restored, scroll: { ...restored.scroll } };
    if (
      scan &&
      !(
        restored?.scopeKey === key &&
        (restored.query === scan || restored.initialScan === scan)
      )
    ) {
      const parsed = parseScanPayload(scan);
      const query = parsed.item ?? parsed.sku ?? scan;
      next.view = {
        ...next.view,
        query,
        initialScan: scan,
        // Composite labels have an authoritative ITEM field. A plain scanner
        // string is not assumed to be serial or item code; keyword covers SKU
        // and lets the operator choose an explicit exact filter if needed.
        mode: parsed.item ? 'item_code' : 'keyword',
        panel: 1,
        identity: undefined,
        scanReturnCategory: next.view.category,
        category: 'ALL',
        listPages: 1,
      };
    }
    this.state = next;
    this.update({});
    if (!session) {
      this.update({
        context: {
          loading: false,
          error: new AppError({
            kind: 'auth',
            message: 'Cần đăng nhập để tra cứu.',
          }),
        },
      });
      return;
    }
    const task = this.begin('context');
    this.update({ context: { loading: true } });
    try {
      const data = await this.service.context({ signal: task.signal });
      if (!task.current()) return;
      if (!this.acceptContext(data)) return;
      if (this.state.view.panel !== 1 && this.state.view.identity)
        await this.open(this.state.view.identity, this.state.view.panel, true);
      else
        await this.search(scan !== undefined, this.state.view.listPages ?? 1);
    } catch (error) {
      if (task.current())
        this.update({ context: { loading: false, error: toAppError(error) } });
    }
  }
  async refresh() {
    this.stop();
    const task = this.begin('context');
    this.update({
      context: { loading: true },
      list: { loading: false },
      detail: { loading: false },
      stock: { loading: false },
      timeline: { loading: false },
      gallery: { loading: false },
    });
    try {
      const data = await this.service.context({ signal: task.signal });
      if (!task.current()) return;
      if (!this.acceptContext(data)) return;
      if (this.state.view.panel === 1)
        await this.search(false, this.state.view.listPages ?? 1);
      else if (this.state.view.identity)
        await this.open(this.state.view.identity, this.state.view.panel, true);
    } catch (e) {
      if (task.current())
        this.update({ context: { loading: false, error: toAppError(e) } });
    }
  }
  setQuery(query: string) {
    this.cancel('list');
    this.view({
      query,
      listPages: 1,
      scroll: { ...this.state.view.scroll, 1: 0 },
    });
    // A previous result must not be labelled as matching new input during debounce.
    this.update({ list: { loading: false } });
  }
  setFilters(mode: P06SearchMode, status: P06ViewState['status']) {
    this.view({
      mode,
      status,
      panel: 1,
      identity: undefined,
      listPages: 1,
      scroll: { ...this.state.view.scroll, 1: 0 },
    });
    return this.search();
  }
  setCategory(category: P06Category) {
    this.view({
      category,
      panel: 1,
      identity: undefined,
      listPages: 1,
      scroll: { ...this.state.view.scroll, 1: 0 },
    });
    return this.search();
  }
  clear() {
    this.setQuery('');
    this.view({
      mode: 'keyword',
      category: this.state.view.scanReturnCategory ?? this.state.view.category,
      scanReturnCategory: undefined,
    });
    return this.search();
  }
  async search(resolveSingle = false, restorePages = 1) {
    const task = this.begin('list'),
      v = this.state.view;
    this.update({ list: { loading: true } });
    // User decision 09/10/2026: S01 cards and totals always represent SKU.
    // Serial/item_code are server-side identity filters, not an ITEM list mode.
    const type = 'SKU';
    if (v.mode !== 'keyword' && !v.query.trim()) {
      this.update({
        list: {
          loading: false,
          error: new AppError({
            kind: 'config',
            code: 'P06_EMPTY_EXACT',
            message: 'Nhập mã hiện vật hoặc serial cần tìm.',
          }),
        },
      });
      return;
    }
    try {
      let data = await this.service.list(
        this.context(),
        type,
        {
          [v.mode]: v.query,
          status: v.status,
          sku_type: v.category,
          page: 1,
          per_page: 20,
        },
        { signal: task.signal },
      );
      if (!task.current()) return;
      while (
        Number.isSafeInteger(restorePages) &&
        data.meta.page < restorePages &&
        data.meta.page < data.meta.last_page
      ) {
        const next = await this.service.list(
          this.context(),
          type,
          {
            [v.mode]: v.query,
            status: v.status,
            sku_type: v.category,
            page: data.meta.page + 1,
            per_page: data.meta.per_page,
          },
          { signal: task.signal },
        );
        if (!task.current()) return;
        data = {
          data: p06Unique([...data.data, ...next.data], card =>
            p06IdentityKey(p06Identity(card)),
          ),
          meta: next.meta,
        };
      }
      this.view({ listPages: data.meta.page });
      this.update({ list: { loading: false, data } });
      if (resolveSingle && data.meta.total === 1 && data.data.length === 1)
        await this.open(p06Identity(data.data[0]));
    } catch (e) {
      if (task.current())
        this.update({ list: { loading: false, error: toAppError(e) } });
    }
  }
  async moreList() {
    const old = this.state.list.data,
      v = this.state.view;
    if (!old || this.state.list.loading || old.meta.page >= old.meta.last_page)
      return;
    const task = this.begin('list');
    this.update({ list: { data: old, loading: true } });
    try {
      const next = await this.service.list(
        this.context(),
        'SKU',
        {
          [v.mode]: v.query,
          status: v.status,
          sku_type: v.category,
          page: old.meta.page + 1,
          per_page: old.meta.per_page,
        },
        { signal: task.signal },
      );
      if (task.current()) {
        this.view({ listPages: next.meta.page });
        this.update({
          list: {
            loading: false,
            data: {
              data: p06Unique([...old.data, ...next.data], card =>
                p06IdentityKey(p06Identity(card)),
              ),
              meta: next.meta,
            },
          },
        });
      }
    } catch (e) {
      if (task.current())
        this.update({
          list: { loading: false, error: toAppError(e) },
        });
    }
  }
  async open(
    identity: P06Identity,
    panel: P06Panel = 2,
    preserveScroll = false,
  ) {
    this.cancel('list');
    this.update({ list: { ...this.state.list, loading: false } });
    for (const lane of ['detail', 'stock', 'timeline', 'gallery'] as const)
      this.cancel(lane);
    const task = this.begin('detail');
    this.view({
      identity,
      panel,
      scroll: preserveScroll
        ? this.state.view.scroll
        : { ...this.state.view.scroll, 2: 0, 3: 0, 4: 0 },
      timelinePages: preserveScroll ? this.state.view.timelinePages : 1,
    });
    this.update({
      detail: { loading: true },
      stock: { loading: false },
      timeline: { loading: false },
      gallery: { loading: false },
    });
    try {
      const data = await this.service.detail(this.context(), identity, {
        signal: task.signal,
      });
      if (!task.current()) return;
      const card = data.data.card,
        recent = [
          {
            identity,
            name: card.sku_name,
            code: card.item_code || card.sku_code,
          },
          ...this.state.recent.filter(
            r => p06IdentityKey(r.identity) !== p06IdentityKey(identity),
          ),
        ].slice(0, 5);
      this.update({ detail: { loading: false, data }, recent });
      if (panel === 3) await this.loadStock();
      if (panel === 4)
        await this.loadTimeline(false, this.state.view.timelinePages ?? 1);
    } catch (e) {
      if (task.current())
        this.update({ detail: { loading: false, error: toAppError(e) } });
    }
  }
  async toPanel(panel: 3 | 4) {
    if (!this.state.detail.data) return;
    this.view({ panel });
    if (panel === 3) await this.loadStock();
    else await this.loadTimeline(false, this.state.view.timelinePages ?? 1);
  }
  back(): boolean {
    const panel = this.state.view.panel;
    if (panel === 1) return false;
    for (const lane of ['detail', 'stock', 'timeline', 'gallery'] as const)
      this.cancel(lane);
    this.view({ panel: panel === 2 ? 1 : 2 });
    this.update({
      detail: { ...this.state.detail, loading: false },
      stock: { ...this.state.stock, loading: false },
      timeline: { ...this.state.timeline, loading: false },
      gallery: { ...this.state.gallery, loading: false },
    });
    if (panel !== 2 && !this.state.detail.data && this.state.view.identity) {
      void this.open(this.state.view.identity, 2, true);
    }
    // Remount/resume may have opened detail before loading the list.
    if (panel === 2 && !this.state.list.data)
      void this.search(false, this.state.view.listPages ?? 1);
    return true;
  }
  setScroll(panel: P06Panel, y: number) {
    this.view({
      scroll: { ...this.state.view.scroll, [panel]: Math.max(0, y) },
    });
  }
  async loadStock() {
    const card = this.state.detail.data?.data.card;
    if (!card) return;
    const task = this.begin('stock');
    this.update({ stock: { loading: true } });
    try {
      const data = await this.service.stock(this.context(), card.sku_id, {
        signal: task.signal,
      });
      if (task.current()) this.update({ stock: { loading: false, data } });
    } catch (e) {
      if (task.current())
        this.update({ stock: { loading: false, error: toAppError(e) } });
    }
  }
  async loadGallery() {
    const card = this.state.detail.data?.data.card;
    if (!card) return;
    const task = this.begin('gallery');
    this.update({ gallery: { loading: true } });
    try {
      const data = await this.service.gallery(this.context(), card.sku_id, {
        signal: task.signal,
      });
      if (task.current()) this.update({ gallery: { loading: false, data } });
    } catch (e) {
      if (task.current())
        this.update({ gallery: { loading: false, error: toAppError(e) } });
    }
  }
  async setSource(source: P06Source) {
    this.view({
      source,
      timelinePages: 1,
      scroll: { ...this.state.view.scroll, 4: 0 },
    });
    return this.loadTimeline();
  }
  async loadTimeline(more = false, restorePages = 1) {
    const i = this.state.view.identity,
      old = this.state.timeline.data;
    if (!i) return;
    if (
      more &&
      (!old ||
        this.state.timeline.loading ||
        old.meta.page >= old.meta.last_page)
    )
      return;
    const task = this.begin('timeline');
    this.update({ timeline: { loading: true, data: more ? old : undefined } });
    try {
      let data = await this.service.timeline(
        this.context(),
        i,
        {
          source: this.state.view.source,
          page: more ? old!.meta.page + 1 : 1,
          per_page: 20,
        },
        { signal: task.signal },
      );
      if (!task.current()) return;
      while (
        !more &&
        Number.isSafeInteger(restorePages) &&
        data.meta.page < restorePages &&
        data.meta.page < data.meta.last_page
      ) {
        const next = await this.service.timeline(
          this.context(),
          i,
          {
            source: this.state.view.source,
            page: data.meta.page + 1,
            per_page: data.meta.per_page,
          },
          { signal: task.signal },
        );
        if (!task.current()) return;
        data = {
          ...next,
          data: p06Unique(
            [...data.data, ...next.data],
            event => event.event_id,
          ),
        };
      }
      this.view({ timelinePages: data.meta.page });
      this.update({
        timeline: {
          loading: false,
          data: more
            ? {
                ...data,
                data: p06Unique(
                  [...old!.data, ...data.data],
                  event => event.event_id,
                ),
              }
            : data,
        },
      });
    } catch (e) {
      if (task.current())
        this.update({
          timeline: {
            loading: false,
            error: toAppError(e),
          },
        });
    }
  }
}
export function p06StockText(value: number | null | undefined) {
  return value == null
    ? '—'
    : new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 3 }).format(
        value,
      );
}
export function p06EventQuantity(event: P06Event) {
  return event.source === 'WARRANTY'
    ? 'Không áp dụng'
    : event.signed_quantity == null
    ? '—'
    : `${event.signed_quantity > 0 ? '+' : ''}${p06StockText(
        event.signed_quantity,
      )}`;
}
export function p06DocumentTarget(
  event: P06Event,
): { owner: 'P12' | 'P09'; id: string; type: string } | undefined {
  const d = event.document;
  if (!d?.can_open) return undefined;
  if (d.type === 'receipt' || d.type === 'issue')
    return { owner: 'P12', id: d.id, type: d.type };
  if (d.type === 'WARRANTY_CASE')
    return { owner: 'P09', id: d.id, type: d.type };
  return undefined;
}
export function p06StockChip(stock: P06Stock | null | undefined) {
  if (!stock || stock.status === 'INCOMPLETE' || stock.status === 'MISMATCH')
    return 'Chưa xác nhận';
  return stock.total_qty === 0 ? 'Hết hàng' : 'Còn hàng';
}
export function p06CardLabel(card: P06Card) {
  return card.card_type === 'ITEM'
    ? card.item_code || 'Hiện vật chưa có mã'
    : card.sku_code;
}
