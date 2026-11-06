import { useEffect, useMemo, useState } from 'react';
import type { P08HistoryService } from '../../services/wms/p08Types';
import type { P08View } from './p08HistoryController';

/** All is a server scope total, never the visible page or selected business total.
 * A business-filtered list needs the existing summary reader for its All facet.
 * Both reads are scoped independently; no cross-request snapshot is claimed.
 */
export function useP08TabTotal(
  api: P08HistoryService,
  scope: string,
  view?: P08View,
) {
  const filters = view?.filters;
  const all = !filters?.business || filters.business === 'ALL';
  const query = useMemo(
    () => (filters ? { ...filters, business: 'ALL' as const } : undefined),
    [filters],
  );
  const ready =
    view?.panel === 'S01' && !!view.meta && !view.loading && !view.error;
  const requestKey =
    ready && !all
      ? JSON.stringify([scope, query, view?.meta?.asOf])
      : undefined;
  const [read, setRead] = useState<{ key: string; total: number }>();
  useEffect(() => {
    if (!requestKey || !query || !scope || scope !== api.scopeKey()) return;
    const abort = new AbortController();
    let active = true;
    (async () => {
      try {
        const result = await api.summary(query, abort.signal);
        if (active && !abort.signal.aborted && scope === api.scopeKey())
          setRead({ key: requestKey, total: result.data.availableTotal });
      } catch {
        // Main read owns error/admission UI. An unavailable facet is omitted.
      }
    })();
    return () => {
      active = false;
      abort.abort();
    };
  }, [api, scope, requestKey, query]);
  if (!ready) return undefined;
  return all
    ? view?.meta?.total
    : read && read.key === requestKey
    ? read.total
    : undefined;
}
