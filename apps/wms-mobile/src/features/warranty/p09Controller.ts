import { toAppError, type AppError } from '../../errors/AppError';
import {
  p09Ensure,
  p09SameReviewedVersion,
  type P09Service,
  type P09Command,
  type P09Receipt,
  type P09Case,
  type P09Page,
  type P09Paging,
} from '../../services/wms/p09Warranty';
import {
  p09RecoveryJournal,
  type P09RecoveryJournal,
} from './p09RecoveryJournal';

export interface P09CommandState {
  phase:
    | 'idle'
    | 'sending'
    | 'unknown'
    | 'failed'
    | 'saved-unloaded'
    | 'succeeded';
  command?: P09Command;
  receipt?: P09Receipt;
  detail?: P09Case;
  error?: AppError;
}
/** Form/detail remain in RAM. The optional journal retains only GET recovery
 * identity, never the PII form or credentials, and never permits writer replay.
 */
export function createP09CommandOwner(
  service: P09Service,
  journal?: P09RecoveryJournal,
) {
  let state: P09CommandState = { phase: 'idle' },
    busy = false;
  const listeners = new Set<() => void>();
  let persistenceError: AppError | undefined;
  try {
    const saved = journal?.load();
    if (saved)
      state = {
        phase: 'unknown',
        command: service.restoreForReconcile(saved.command),
      };
  } catch (cause) {
    persistenceError = toAppError(cause);
    state = { phase: 'unknown', error: persistenceError };
  }
  const notify = () => listeners.forEach(f => f());
  const matches = () =>
    !state.command ||
    service.contextKey() === JSON.stringify(state.command.scope);
  const change = (next: P09CommandState) => {
    try {
      if (next.command) journal?.write(next.command, next.phase, next.receipt);
      else journal?.clear();
    } catch (cause) {
      persistenceError = toAppError(cause);
      state = {
        ...(next.command ? next : state),
        phase: 'unknown',
        error: persistenceError,
      };
      notify();
      throw cause;
    }
    state = next;
    notify();
  };
  async function hydrate() {
    const c = state.command!,
      receipt = state.receipt!;
    try {
      const detail = await service.detail(receipt.warranty_case_id!);
      if (!matches()) return;
      if (c.body.status === 'RETURNED') {
        p09Ensure(
          detail.status === 'RETURNED' &&
            detail.version === receipt.version &&
            detail.handover?.handover_checked === true &&
            detail.handover.handover_date === c.body.handover_date &&
            (detail.handover.receiver_masked ||
              detail.handover.receiver === c.body.receiver) &&
            (detail.handover.note_redacted ||
              detail.handover.note === c.body.note),
          'P09_HANDOVER_READBACK_INVALID',
        );
      }
      change({ ...state, phase: 'succeeded', detail, error: undefined });
    } catch (cause) {
      if (!matches()) return;
      change({ ...state, phase: 'saved-unloaded', error: toAppError(cause) });
    }
    // Captured command remains the authority, even if the detail advanced.
    p09Ensure(c === state.command, 'P09_COMMAND_CHANGED');
  }
  async function accept(receipt: P09Receipt) {
    if (!matches()) return;
    change({
      ...state,
      receipt,
      error: undefined,
      phase:
        receipt.state === 'SUCCEEDED'
          ? 'saved-unloaded'
          : receipt.state === 'FAILED'
          ? 'failed'
          : 'unknown',
    });
    if (receipt.state === 'SUCCEEDED') await hydrate();
  }
  return {
    snapshot: () =>
      matches() ? state : ({ phase: 'unknown' } as P09CommandState),
    subscribe(f: () => void) {
      listeners.add(f);
      return () => {
        listeners.delete(f);
      };
    },
    get busy() {
      return busy;
    },
    newOperation() {
      p09Ensure(
        matches() && state.phase === 'succeeded' && !busy,
        'P09_RECONCILE_REQUIRED',
        'blocked_by_gate',
      );
      change({ phase: 'idle' });
    },
    async confirm(prepare: () => P09Command) {
      if (busy) return; // synchronous latch, acquired before prepare/first await
      p09Ensure(matches(), 'P09_OLD_SESSION_REQUEST', 'blocked_by_gate');
      p09Ensure(
        state.phase === 'idle' ||
          state.phase === 'succeeded' ||
          (state.phase === 'failed' &&
            state.receipt?.may_create_new_request === true),
        'P09_RECONCILE_REQUIRED',
        'blocked_by_gate',
      );
      busy = true;
      try {
        p09Ensure(
          !persistenceError,
          'P09_RECOVERY_UNREADABLE',
          'blocked_by_gate',
        );
        const command = prepare();
        if (
          state.phase === 'failed' &&
          state.receipt?.error_code === 'STALE_VERSION'
        )
          p09Ensure(
            !p09SameReviewedVersion(command, state.command),
            'P09_REVIEW_NEW_VERSION',
            'blocked_by_gate',
          );
        if (
          state.phase === 'failed' &&
          state.receipt?.error_code === 'ACTIVE_WARRANTY_EXISTS'
        )
          p09Ensure(
            command.body.item_id !== state.command?.body.item_id,
            'ACTIVE_WARRANTY_EXISTS',
            'blocked_by_gate',
          );
        change({ phase: 'sending', command });
        try {
          await accept(await service.send(command));
        } catch (cause) {
          if (matches())
            change({ ...state, phase: 'unknown', error: toAppError(cause) });
        }
      } finally {
        busy = false;
        notify();
      }
    },
    async reconcile() {
      if (busy || !matches() || state.phase !== 'unknown' || !state.command)
        return;
      busy = true;
      notify();
      try {
        await accept(await service.reconcile(state.command));
      } catch (cause) {
        if (matches()) change({ ...state, error: toAppError(cause) });
      } finally {
        busy = false;
        notify();
      }
    },
    async retryDetail() {
      if (busy || !matches() || state.phase !== 'saved-unloaded') return;
      busy = true;
      notify();
      try {
        await hydrate();
      } finally {
        busy = false;
        notify();
      }
    },
  };
}
const journals = new WeakMap<
  P09Service,
  Map<string, ReturnType<typeof createP09CommandOwner>>
>();
export function p09CommandOwner(service: P09Service) {
  let entries = journals.get(service);
  if (!entries) {
    entries = new Map();
    journals.set(service, entries);
  }
  const context = service.contextKey();
  let ownerScope:
    | { actorId: string; authSessionId: string; warehouseId: string }
    | undefined;
  if (context) {
    try {
      const parsed = JSON.parse(context) as Record<string, unknown>;
      if (
        parsed &&
        typeof parsed.actorId === 'string' &&
        typeof parsed.authSessionId === 'string' &&
        typeof parsed.warehouseId === 'string'
      )
        ownerScope = {
          actorId: parsed.actorId,
          authSessionId: parsed.authSessionId,
          warehouseId: parsed.warehouseId,
        };
    } catch {
      // A malformed/non-owner context may still render read-only states. It
      // must never crash the list or allocate a durable writer journal.
      ownerScope = undefined;
    }
  }
  // Permission changes may hide an old command, but must never allocate an
  // idle writer for the same account/family/warehouse while it is unresolved.
  const key = ownerScope
    ? JSON.stringify([
        ownerScope.actorId,
        ownerScope.authSessionId,
        ownerScope.warehouseId,
      ])
    : '';
  let owner = entries.get(key);
  if (!owner) {
    owner = createP09CommandOwner(
      service,
      key ? p09RecoveryJournal(service) : undefined,
    );
    entries.set(key, owner);
  }
  return owner;
}

export interface P09PageState<T> {
  items: readonly T[];
  meta?: P09Page<T>['meta'];
  loading: boolean;
  error?: AppError;
  scroll: number;
  key: string;
}
/** One instance per resource/filter scope. A failed next page retains old rows. */
export function createP09Pager<T>(
  load: (page: P09Paging) => Promise<P09Page<T>>,
  id: (row: T) => string,
  contextKey: () => string,
) {
  let state: P09PageState<T> = {
      items: [],
      loading: false,
      scroll: 0,
      key: '',
    },
    epoch = 0;
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach(f => f());
  async function request(next = false) {
    const key = contextKey();
    if (!key) {
      epoch++;
      state = { items: [], loading: false, scroll: 0, key };
      emit();
      return;
    }
    if (state.key !== key) {
      epoch++;
      state = { items: [], loading: false, scroll: 0, key };
    }
    if (state.loading || (next && !state.meta?.hasMore)) return;
    const token = ++epoch;
    const paging: P09Paging = next
      ? state.meta?.pagination === 'KEYSET'
        ? { cursor: state.meta.nextCursor! }
        : { page: state.meta!.nextPage! }
      : {};
    state = { ...state, loading: true, error: undefined };
    emit();
    try {
      const r = await load(paging);
      if (token !== epoch || contextKey() !== key) return;
      const rows = next ? [...state.items, ...r.items] : r.items;
      state = {
        ...state,
        items: [...new Map(rows.map(row => [id(row), row])).values()],
        meta: r.meta,
      };
    } catch (cause) {
      if (token !== epoch || contextKey() !== key) return;
      state = { ...state, error: toAppError(cause) };
    } finally {
      if (token === epoch && contextKey() === key) {
        state = { ...state, loading: false };
        emit();
      }
    }
  }
  return {
    snapshot: () => state,
    subscribe(f: () => void) {
      listeners.add(f);
      return () => {
        listeners.delete(f);
      };
    },
    load: request,
    reset() {
      epoch++;
      state = { items: [], loading: false, scroll: 0, key: contextKey() };
      emit();
    },
    scroll(y: number) {
      state = { ...state, scroll: Math.max(0, y) };
    },
  };
}
