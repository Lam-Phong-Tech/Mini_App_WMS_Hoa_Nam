/** Danh sách phiếu linh kiện đã Post, phân trang theo từng hồ sơ bảo hành. */

import { useCallback, useEffect, useRef, useState } from 'react';
import { messageForUser, toAppError } from '../../errors/AppError';
import {
  captureSessionScope,
  isSessionScopeCurrent,
  subscribeSession,
} from '../../auth/session';
import {
  fetchPostedWarrantyComponentHistoryPage,
  type WarrantyComponentHistoryDocument,
} from '../../services/wms/warrantyComponentRead';

export interface WarrantyComponentHistoryState {
  readonly documents: readonly WarrantyComponentHistoryDocument[];
  readonly loading: boolean;
  readonly loadingMore: boolean;
  readonly hasMore: boolean;
  readonly total: number | null;
  readonly error?: string;
  readonly accessDenied?: boolean;
  readonly refresh: () => void;
  readonly loadMore: () => void;
}

export interface UseWarrantyComponentHistoryDeps {
  readonly load?: typeof fetchPostedWarrantyComponentHistoryPage;
}

function dedupe(
  documents: readonly WarrantyComponentHistoryDocument[],
): readonly WarrantyComponentHistoryDocument[] {
  const ids = new Set<string>();
  return documents.filter(document => {
    if (ids.has(document.id)) return false;
    ids.add(document.id);
    return true;
  });
}

export function useWarrantyComponentHistory(
  warrantyCaseId: string,
  deps: UseWarrantyComponentHistoryDeps = {},
): WarrantyComponentHistoryState {
  const load = deps.load ?? fetchPostedWarrantyComponentHistoryPage;
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<
    Omit<WarrantyComponentHistoryState, 'refresh' | 'loadMore'>
  >({
    documents: [],
    loading: true,
    loadingMore: false,
    hasMore: false,
    total: null,
  });
  const nextRef = useRef<{ page: number } | { cursor: string } | null>(null);
  const [scopeRevision, setScopeRevision] = useState(0);
  const scopeRef = useRef(captureSessionScope());
  const loadingMoreRef = useRef(false);
  const requestGenerationRef = useRef(0);
  const abortRef = useRef<AbortController | undefined>(undefined);
  const latestCaseRef = useRef(warrantyCaseId);
  const latestLoadRef = useRef(load);

  // Đổi hồ sơ hoặc hàm loader là một thế hệ dữ liệu mới. Làm điều này trong
  // render để response cũ không kịp nối dữ liệu vào một khung hình mới trước
  // khi effect của case mới được chạy.
  if (
    latestCaseRef.current !== warrantyCaseId ||
    latestLoadRef.current !== load
  ) {
    latestCaseRef.current = warrantyCaseId;
    latestLoadRef.current = load;
    requestGenerationRef.current += 1;
  }
  useEffect(
    () =>
      subscribeSession(() => {
        if (isSessionScopeCurrent(scopeRef.current)) return;
        scopeRef.current = captureSessionScope();
        requestGenerationRef.current += 1;
        nextRef.current = null;
        setState({
          documents: [],
          loading: true,
          loadingMore: false,
          hasMore: false,
          total: null,
        });
        setScopeRevision(v => v + 1);
      }),
    [],
  );

  useEffect(() => {
    let active = true;
    const abort = new AbortController();
    abortRef.current = abort;
    const generation = requestGenerationRef.current + 1;
    requestGenerationRef.current = generation;
    nextRef.current = null;
    loadingMoreRef.current = false;
    setState({
      documents: [],
      loading: true,
      loadingMore: false,
      hasMore: false,
      total: null,
    });
    load(warrantyCaseId, { query: { page: 1 }, signal: abort.signal })
      .then(page => {
        if (active && requestGenerationRef.current === generation) {
          nextRef.current =
            page.nextCursor !== null
              ? { cursor: page.nextCursor }
              : page.nextPage !== null
              ? { page: page.nextPage }
              : null;
          setState({
            documents: dedupe(page.documents),
            loading: false,
            loadingMore: false,
            hasMore: page.hasMore,
            total: page.total,
          });
        }
      })
      .catch(cause => {
        if (active && requestGenerationRef.current === generation) {
          setState({
            documents: [],
            loading: false,
            loadingMore: false,
            hasMore: false,
            total: null,
            accessDenied:
              ['http', 'auth'].includes(toAppError(cause).kind) &&
              [401, 403].includes(toAppError(cause).status ?? 0),
            error:
              'Không tải được danh sách linh kiện đã xuất: ' +
              messageForUser(toAppError(cause)),
          });
        }
      });
    return () => {
      active = false;
      abort.abort();
      requestGenerationRef.current++;
    };
  }, [load, revision, warrantyCaseId, scopeRevision]);

  const refresh = useCallback(() => {
    if (latestCaseRef.current !== warrantyCaseId) return;
    // Vô hiệu response cũ ngay lúc người dùng bấm, không chờ effect chạy.
    requestGenerationRef.current += 1;
    setRevision(value => value + 1);
  }, [warrantyCaseId]);
  const loadMore = useCallback(() => {
    if (
      loadingMoreRef.current ||
      latestCaseRef.current !== warrantyCaseId ||
      latestLoadRef.current !== load ||
      state.loading ||
      !state.hasMore ||
      nextRef.current === null
    )
      return;
    const generation = requestGenerationRef.current;
    loadingMoreRef.current = true;
    setState(current => ({ ...current, loadingMore: true, error: undefined }));
    const query = { ...nextRef.current };
    load(warrantyCaseId, { query, signal: abortRef.current?.signal })
      .then(page => {
        if (requestGenerationRef.current !== generation) return;
        nextRef.current =
          page.nextCursor !== null
            ? { cursor: page.nextCursor }
            : page.nextPage !== null
            ? { page: page.nextPage }
            : null;
        setState(current => ({
          documents: dedupe([...current.documents, ...page.documents]),
          loading: false,
          loadingMore: false,
          hasMore: page.hasMore,
          total: page.total,
        }));
      })
      .catch(cause => {
        if (requestGenerationRef.current !== generation) return;
        const denied =
          ['http', 'auth'].includes(toAppError(cause).kind) &&
          [401, 403].includes(toAppError(cause).status ?? 0);
        setState(current => ({
          ...current,
          ...(denied
            ? { documents: [], total: null, hasMore: false, accessDenied: true }
            : {}),
          loadingMore: false,
          error:
            'Không tải thêm được lịch sử linh kiện: ' +
            messageForUser(toAppError(cause)),
        }));
      })
      .finally(() => {
        if (requestGenerationRef.current === generation) {
          loadingMoreRef.current = false;
        }
      });
  }, [load, state.hasMore, state.loading, warrantyCaseId]);
  return { ...state, refresh, loadMore };
}
