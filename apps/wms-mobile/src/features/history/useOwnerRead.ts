import { useEffect, useRef, useState } from 'react';
import {
  captureSessionScope,
  isSessionScopeCurrent,
  subscribeSession,
} from '../../auth/session';
import { toAppError, type AppError } from '../../errors/AppError';

/** No previous caller/scope data is rendered while a new owner read is pending. */
export function useOwnerRead<T>(
  key: string,
  load: (signal: AbortSignal) => Promise<T>,
) {
  const loader = useRef(load);
  loader.current = load;
  const [revision, setRevision] = useState(0),
    [state, setState] = useState<{
      key: string;
      loading: boolean;
      data?: T;
      error?: AppError;
    }>({ key: '', loading: true });
  useEffect(() => {
    let captured = captureSessionScope();
    return subscribeSession(() => {
      if (!isSessionScopeCurrent(captured)) {
        captured = captureSessionScope();
        setRevision(n => n + 1);
      }
    });
  }, []);
  useEffect(() => {
    const c = new AbortController(),
      scope = captureSessionScope();
    let live = true;
    setState({ key, loading: true });
    loader
      .current(c.signal)
      .then(data => {
        if (live && isSessionScopeCurrent(scope))
          setState({ key, loading: false, data });
      })
      .catch(error => {
        if (live && isSessionScopeCurrent(scope))
          setState({ key, loading: false, error: toAppError(error) });
      });
    return () => {
      live = false;
      c.abort();
    };
  }, [key, revision]);
  return {
    ...(state.key === key ? state : { key, loading: true }),
    retry: () => setRevision(n => n + 1),
  };
}
