import { AppError, toAppError } from '../../errors/AppError';
import { p08Dedup, p08Identity } from '../../services/wms/p08History';
import type {
  P08Batch,
  P08Detail,
  P08Event,
  P08Filters,
  P08HistoryService,
  P08Meta,
  P08PageMeta,
  P08Summary,
} from '../../services/wms/p08Types';

export type P08Panel = 'S01' | 'S02' | 'S03' | 'S04';
export interface P08View {
  panel: P08Panel;
  filters: P08Filters;
  recordId?: string;
  activityId?: string;
  batchId?: string;
  rows: P08Event[];
  detail?: P08Detail;
  batch?: P08Batch;
  summary?: P08Summary;
  meta?: P08Meta | P08PageMeta;
  loading: boolean;
  error?: AppError;
  scrollY: number;
}
export interface P08State {
  scope: string;
  current: P08View;
  stack: P08View[];
}
const blank = (
  panel: P08Panel = 'S01',
  filters: P08Filters = { date_mode: 'ALL', source: 'ALL', business: 'ALL' },
): P08View => ({ panel, filters, rows: [], loading: false, scrollY: 0 });
export function createP08Controller(
  api: P08HistoryService,
  restored?: P08State,
) {
  const scope = api.scopeKey();
  let state: P08State =
    restored?.scope === scope && scope
      ? { ...restored, current: { ...restored.current, loading: false } }
      : { scope, current: blank(), stack: [] };
  let generation = 0,
    abort: AbortController | undefined,
    disposed = false;
  const listeners = new Set<() => void>();
  const publish = () => {
    for (const l of listeners) l();
  };
  function cancel() {
    generation++;
    abort?.abort();
    abort = undefined;
  }
  function invalidate() {
    cancel();
    state = { scope: api.scopeKey(), current: blank(), stack: [] };
    publish();
  }
  function refreshScope() {
    if (state.scope !== api.scopeKey()) invalidate();
  }
  function update(current: P08View) {
    state = { ...state, current };
    publish();
  }
  async function load(append = false) {
    if (disposed) return;
    refreshScope();
    const old = state.current,
      meta = old.meta as P08PageMeta | undefined;
    if (old.loading || (append && (!meta?.hasMore || !meta.nextCursor))) return;
    cancel();
    const version = generation,
      captured = state.scope;
    abort = new AbortController();
    const signal = abort.signal;
    const paging = {
      limit: meta && append ? meta.limit : 20,
      ...(append ? { cursor: meta!.nextCursor! } : {}),
    };
    update({ ...old, loading: true, error: undefined });
    try {
      const result =
        old.panel === 'S01'
          ? await api.records(old.filters, paging, signal)
          : old.panel === 'S02'
          ? await api.detail(old.recordId!, old.activityId, paging, signal)
          : old.panel === 'S03'
          ? await api.session(old.batchId!, paging, signal)
          : await api.summary(old.filters, signal);
      if (disposed || version !== generation || captured !== api.scopeKey()) {
        if (!disposed && captured !== api.scopeKey()) invalidate();
        return;
      }
      const next: P08View = {
        ...old,
        meta: result.meta,
        loading: false,
        error: undefined,
      };
      if (old.panel === 'S01')
        next.rows = p08Dedup([
          ...(append ? old.rows : []),
          ...(result.data as P08Event[]),
        ]);
      if (old.panel === 'S02') {
        const d = result.data as P08Detail;
        next.detail = {
          ...d,
          events: p08Dedup([
            ...(append ? old.detail?.events || [] : []),
            ...d.events,
          ]),
        };
      }
      if (old.panel === 'S03') {
        const d = result.data as P08Batch;
        next.batch = {
          ...d,
          events: p08Dedup([
            ...(append ? old.batch?.events || [] : []),
            ...d.events,
          ]),
        };
      }
      if (old.panel === 'S04') next.summary = result.data as P08Summary;
      update(next);
    } catch (cause) {
      if (disposed || version !== generation) return;
      if (captured !== api.scopeKey()) {
        invalidate();
        return;
      }
      const error = toAppError(cause);
      if (
        error.kind === 'auth' ||
        [401, 403, 409].includes(error.status || 0) ||
        error.code === 'HISTORY_CURSOR_SCOPE_MISMATCH'
      ) {
        // Access/scope changed: neither current nor Back may reveal a protected cache.
        state = {
          scope: api.scopeKey(),
          stack: [],
          current: {
            ...blank(old.panel, old.filters),
            recordId: old.recordId,
            activityId: old.activityId,
            batchId: old.batchId,
            error,
          },
        };
        publish();
      } else update({ ...old, loading: false, error });
    }
  }
  function enter(next: P08View) {
    refreshScope();
    cancel();
    state = {
      ...state,
      stack: [...state.stack, { ...state.current, loading: false }],
      current: next,
    };
    publish();
    load();
  }
  return {
    snapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    load,
    refreshScope,
    invalidate,
    scroll(y: number) {
      state = {
        ...state,
        current: { ...state.current, scrollY: Math.max(0, y) },
      };
    },
    filters(filters: P08Filters) {
      refreshScope();
      cancel();
      update(blank(state.current.panel === 'S04' ? 'S04' : 'S01', filters));
      load();
    },
    detail(event: P08Event) {
      enter({
        ...blank('S02', state.current.filters),
        recordId: event.recordId,
        activityId: event.activityId,
      });
    },
    /** Canonical parent ID with the P08 documented namespace; no guessed event. */
    record(
      recordId: string,
      filters: P08Filters = { date_mode: 'ALL', source: 'ALL' },
    ) {
      p08Identity(recordId);
      refreshScope();
      cancel();
      state = {
        ...state,
        stack: [],
        current: { ...blank('S02', filters), recordId },
      };
      publish();
      load();
    },
    session() {
      const record = state.current.detail?.recordId;
      if (!record || p08Identity(record).source !== 'SCAN') return;
      enter({ ...blank('S03'), batchId: p08Identity(record).uuid });
    },
    summary() {
      enter(blank('S04', state.current.filters));
    },
    /** A caller-owned summary entry must not invent an unvisited list in Back. */
    summaryRoot(filters?: P08Filters) {
      refreshScope();
      cancel();
      state = {
        ...state,
        stack: [],
        current: blank('S04', filters ?? state.current.filters),
      };
      publish();
      load();
    },
    drilldown(business: P08Filters['business']) {
      enter(blank('S01', { ...state.current.filters, business }));
    },
    back() {
      refreshScope();
      if (!state.stack.length) return false;
      cancel();
      const stack = [...state.stack],
        current = stack.pop()!;
      state = { ...state, stack, current: { ...current, loading: false } };
      publish();
      return true;
    },
    dispose() {
      disposed = true;
      cancel();
      listeners.clear();
    },
  };
}
export type P08Controller = ReturnType<typeof createP08Controller>;
