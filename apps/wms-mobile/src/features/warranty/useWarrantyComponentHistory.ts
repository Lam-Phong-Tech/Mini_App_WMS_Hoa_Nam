/** Danh sách phiếu linh kiện đã Post, phân trang theo từng hồ sơ bảo hành. */

import { useCallback, useEffect, useRef, useState } from 'react';
import { messageForUser, toAppError } from '../../errors/AppError';
import {
  fetchPostedWarrantyComponentHistoryPage,
  type WarrantyComponentHistoryDocument,
} from '../../services/wms/warrantyComponentRead';

export interface WarrantyComponentHistoryState {
  readonly documents: readonly WarrantyComponentHistoryDocument[];
  readonly loading: boolean;
  readonly loadingMore: boolean;
  readonly hasMore: boolean;
  readonly error?: string;
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
  });
  const pageRef = useRef(1);
  const loadingMoreRef = useRef(false);
  const requestGenerationRef = useRef(0);
  const latestCaseRef = useRef(warrantyCaseId);
  const latestLoadRef = useRef(load);

  // Đổi hồ sơ hoặc hàm loader là một thế hệ dữ liệu mới. Làm điều này trong
  // render để response cũ không kịp nối dữ liệu vào một khung hình mới trước
  // khi effect của case mới được chạy.
  if (latestCaseRef.current !== warrantyCaseId || latestLoadRef.current !== load) {
    latestCaseRef.current = warrantyCaseId;
    latestLoadRef.current = load;
    requestGenerationRef.current += 1;
  }

  useEffect(() => {
    let active = true;
    const generation = requestGenerationRef.current + 1;
    requestGenerationRef.current = generation;
    pageRef.current = 1;
    loadingMoreRef.current = false;
    setState({ documents: [], loading: true, loadingMore: false, hasMore: false });
    load(warrantyCaseId, { query: { page: 1 } })
      .then(page => {
        if (active && requestGenerationRef.current === generation) {
          pageRef.current = page.page;
          setState({
            documents: dedupe(page.documents),
            loading: false,
            loadingMore: false,
            hasMore: page.hasMore,
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
            error:
              'Không tải được danh sách linh kiện đã xuất: ' +
              messageForUser(toAppError(cause)),
          });
        }
      });
    return () => {
      active = false;
    };
  }, [load, revision, warrantyCaseId]);

  const refresh = useCallback(() => {
    // Vô hiệu response cũ ngay lúc người dùng bấm, không chờ effect chạy.
    requestGenerationRef.current += 1;
    setRevision(value => value + 1);
  }, []);
  const loadMore = useCallback(() => {
    if (loadingMoreRef.current || state.loading || !state.hasMore) return;
    const generation = requestGenerationRef.current;
    loadingMoreRef.current = true;
    setState(current => ({ ...current, loadingMore: true, error: undefined }));
    const nextPage = pageRef.current + 1;
    load(warrantyCaseId, { query: { page: nextPage } })
      .then(page => {
        if (requestGenerationRef.current !== generation) return;
        pageRef.current = page.page;
        setState(current => ({
          documents: dedupe([...current.documents, ...page.documents]),
          loading: false,
          loadingMore: false,
          hasMore: page.hasMore,
        }));
      })
      .catch(cause => {
        if (requestGenerationRef.current !== generation) return;
        setState(current => ({
          ...current,
          loadingMore: false,
          error: 'Không tải thêm được lịch sử linh kiện: ' + messageForUser(toAppError(cause)),
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
