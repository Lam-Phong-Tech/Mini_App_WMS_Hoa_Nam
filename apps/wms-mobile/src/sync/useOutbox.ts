/**
 * Hook đưa trạng thái hàng đợi lên UI.
 *
 * Prompt 3 §D: "Có thông báo trạng thái đồng bộ rõ ràng cho UI."
 *
 * ⚠️ Không có `useEffect` nào tự gọi đồng bộ. Đồng bộ **chỉ** chạy khi người
 * dùng gọi `sync()` — đúng quy tắc "KHÔNG tự retry" người dùng chốt 2026-09-05.
 */

import { useCallback, useState } from 'react';

import { getDataLayer } from './bootstrap';
import { useConnectivity } from '../connectivity/connectivity';
import type { OutboxSummary } from './types';
import type { SyncRunResult } from './syncEngine';

export interface OutboxView {
  readonly summary: OutboxSummary;
  /** `true` khi đang có lần đồng bộ chạy. */
  readonly isSyncing: boolean;
  /** Kết quả lần đồng bộ gần nhất, để hiển thị cho người vận hành. */
  readonly lastRun?: SyncRunResult;
  /** Đưa một mutation vào hàng đợi. */
  enqueue(kind: string, payload: unknown): void;
  /** Người dùng bấm đồng bộ. Đây là lối vào DUY NHẤT. */
  sync(): Promise<void>;
  refresh(): void;
  clear(): void;
}

export function useOutbox(): OutboxView {
  const { outbox, syncEngine } = getDataLayer();
  const connectivity = useConnectivity();
  const [summary, setSummary] = useState<OutboxSummary>(() => outbox.summary());
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastRun, setLastRun] = useState<SyncRunResult | undefined>();

  const refresh = useCallback(() => {
    setSummary(outbox.summary());
  }, [outbox]);

  const enqueue = useCallback(
    (kind: string, payload: unknown) => {
      outbox.enqueue({ kind, payload });
      refresh();
    },
    [outbox, refresh],
  );

  const sync = useCallback(async () => {
    if (isSyncing) {
      return;
    }
    setIsSyncing(true);
    try {
      const run = await syncEngine.syncAll(connectivity);
      setLastRun(run);
    } finally {
      setIsSyncing(false);
      refresh();
    }
  }, [connectivity, isSyncing, refresh, syncEngine]);

  const clear = useCallback(() => {
    outbox.clear();
    setLastRun(undefined);
    refresh();
  }, [outbox, refresh]);

  return { summary, isSyncing, lastRun, enqueue, sync, refresh, clear };
}
