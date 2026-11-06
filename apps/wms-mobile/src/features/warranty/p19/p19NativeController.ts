import { createP03RequestId } from '../../../services/wms/p03Drafts';
import { createP19LinkedAdapter } from './core/linked-adapter';
import { createLinkedIssueOwner } from './core/linked-owner';
import { createLinkedViewBridge } from './core/linked-view-bridge';
import type {
  P19OfflineRequest,
  P19LiveRequest,
  P19Owner,
  P19Scope,
} from './p19Types';
import { p19DevEnabled } from '../../../config/p19Release';

export const P19_NATIVE_RELEASE = Object.freeze({
  mode: 'P03_LINKED_LOCAL_BATCH_ATOMIC_POST',
  status: 'DEV_CONNECTED_PENDING_NATIVE_LIVE_ACCEPTANCE',
  activation: p19DevEnabled(),
  liveWrites: p19DevEnabled(),
  production: false,
  maxSaveRows: 1000,
  maxRecordRows: 500,
});
export function createP19NativeController(options: {
  getScope(): P19Scope;
  caseId: string;
  presentation: {
    caseLabel: string;
    productName?: string | null;
    warehouseName?: string | null;
    status: string;
  };
  /** Test seam only. Default has no HTTP/auth/live transport. */
  offlineRequest?: P19OfflineRequest;
  liveRequest?: P19LiveRequest;
  uuid?: () => string;
  checkpoint?: unknown;
  journal?: { write(value: unknown): void };
}) {
  const listeners = new Set<() => void>();
  let owner: P19Owner;
  let ready: Promise<boolean> | undefined;
  let scopeAtStart: string | undefined;
  let persistenceError: string | undefined;
  const getScope = () => options.getScope();
  const persist = () => {
    const checkpoint = owner?.checkpoint();
    try {
      if (checkpoint) options.journal?.write(checkpoint);
    } catch {
      persistenceError = 'Không lưu được dữ liệu phiếu đang làm trên thiết bị.';
    }
  };
  const emit = () => {
    persist();
    for (const listener of listeners) listener();
  };
  owner = createLinkedIssueOwner({
    adapter: createP19LinkedAdapter({
      liveRequest: options.liveRequest
        ? async descriptor => {
            if (
              persistenceError &&
              (descriptor.method === 'PUT' ||
                descriptor.path.endsWith('/record'))
            )
              throw Error('P19_JOURNAL_FAILED');
            return options.liveRequest!(descriptor);
          }
        : null,
      offlineRequest: options.offlineRequest
        ? async descriptor => {
            if (
              persistenceError &&
              (descriptor.method === 'PUT' ||
                descriptor.path.endsWith('/record'))
            )
              throw Error('P19_JOURNAL_FAILED');
            return options.offlineRequest!(descriptor);
          }
        : null,
    }),
    getScope,
    uuid: options.uuid ?? createP03RequestId,
    checkpoint: options.checkpoint ?? null,
    onChange: emit,
  });
  const bridge = createLinkedViewBridge({
    owner,
    getCasePresentation: () => ({
      ...options.presentation,
      status: String(
        (owner.snapshot().caseRow as { status?: string } | undefined)?.status ??
          options.presentation.status,
      ),
    }),
  });
  return {
    owner,
    flow: bridge.flow,
    get presentation() {
      return {
        ...options.presentation,
        status: String(
          (owner.snapshot().caseRow as { status?: string } | undefined)
            ?.status ?? options.presentation.status,
        ),
      };
    },
    offline: !!options.offlineRequest,
    connected: !!options.offlineRequest || !!options.liveRequest,
    snapshot: () =>
      persistenceError
        ? {
            ...bridge.snapshot(),
            canPost: false,
            error: { code: 'P19_JOURNAL_FAILED', message: persistenceError },
          }
        : bridge.snapshot(),
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    currentScope() {
      try {
        return !scopeAtStart || JSON.stringify(getScope()) === scopeAtStart;
      } catch {
        return false;
      }
    },
    initialize() {
      if (ready) return ready.then(ok => (ok ? owner.revalidate() : false));
      if (!ready) {
        try {
          scopeAtStart = JSON.stringify(getScope());
        } catch {
          scopeAtStart = 'INVALID';
        }
        ready = owner.initialize(options.caseId).then(ok => {
          persist();
          emit();
          return ok;
        });
      }
      return ready;
    },
    leave() {
      owner.leave();
      persist();
      emit();
    },
    checkpoint: () => owner.checkpoint(),
    logout() {
      const evidence = owner.logoutEvidence();
      if (evidence) options.journal?.write(evidence);
      return evidence;
    },
    dispose() {
      persist();
      owner.dispose();
      listeners.clear();
    },
  };
}
export type P19NativeController = ReturnType<typeof createP19NativeController>;
