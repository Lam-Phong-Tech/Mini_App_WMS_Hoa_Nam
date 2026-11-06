import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { AppState } from 'react-native';
import { getSession, subscribeSession } from '../../auth/session';
import { toAppError, type AppError } from '../../errors/AppError';
import type { BeReleasedReads } from '../../services/wms/beReleasedReads';

/** Scope-bound single flight; background/unmount and late replies cannot republish private data. */
export function useBeRead<T>(
  service: Pick<BeReleasedReads, 'scopeKey'>,
  initial: (signal: AbortSignal) => Promise<T>,
) {
  useSyncExternalStore(subscribeSession, getSession);
  let scope: string;
  try {
    scope = service.scopeKey();
  } catch {
    scope = 'UNAVAILABLE';
  }
  const [state, setState] = useState<{
    scope: string;
    data?: T;
    error?: AppError;
    busy: boolean;
  }>({ scope, busy: false });
  const latest = useRef(initial),
    ticket = useRef(0),
    active = useRef(true),
    latch = useRef(false),
    controller = useRef<AbortController | undefined>(undefined),
    scopeRef = useRef(scope);
  latest.current = initial;
  scopeRef.current = scope;
  const cancel = useCallback(() => {
    ticket.current++;
    controller.current?.abort();
    latch.current = false;
  }, []);
  const run = useCallback(async (work: (signal: AbortSignal) => Promise<T>) => {
    if (latch.current || !active.current) return;
    latch.current = true;
    const id = ++ticket.current,
      owner = scopeRef.current,
      abort = new AbortController();
    controller.current = abort;
    setState(s => ({ ...s, scope: owner, busy: true, error: undefined }));
    try {
      const data = await work(abort.signal);
      if (
        active.current &&
        id === ticket.current &&
        owner === scopeRef.current &&
        !abort.signal.aborted
      )
        setState({ scope: owner, data, busy: false });
    } catch (cause) {
      if (
        active.current &&
        id === ticket.current &&
        owner === scopeRef.current &&
        !abort.signal.aborted
      )
        setState({ scope: owner, error: toAppError(cause), busy: false });
    } finally {
      if (id === ticket.current) latch.current = false;
    }
  }, []);
  useEffect(() => {
    active.current = true;
    cancel();
    setState({ scope, busy: false });
    void run(signal => latest.current(signal));
    const subscription = AppState.addEventListener('change', next => {
      active.current = next === 'active';
      cancel();
      setState({ scope: scopeRef.current, busy: false });
      if (active.current) void run(signal => latest.current(signal));
    });
    return () => {
      active.current = false;
      cancel();
      subscription.remove();
    };
  }, [scope, run, cancel]);
  return {
    ...state,
    data: state.scope === scope ? state.data : undefined,
    error: state.scope === scope ? state.error : undefined,
    run,
    cancel,
    scope,
  };
}
