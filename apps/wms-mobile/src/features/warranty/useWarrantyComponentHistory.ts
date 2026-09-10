/** Danh sách chứng từ linh kiện đã xuất, đọc lại mỗi khi mở hồ sơ bảo hành. */

import { useCallback, useEffect, useState } from 'react';
import { messageForUser, toAppError } from '../../errors/AppError';
import {
  fetchPostedWarrantyComponentHistory,
  type WarrantyComponentHistoryDocument,
} from '../../services/wms/warrantyComponentRead';

export interface WarrantyComponentHistoryState {
  readonly documents: readonly WarrantyComponentHistoryDocument[];
  readonly loading: boolean;
  readonly error?: string;
  readonly refresh: () => void;
}

export interface UseWarrantyComponentHistoryDeps {
  readonly load?: typeof fetchPostedWarrantyComponentHistory;
}

export function useWarrantyComponentHistory(
  warrantyCaseId: string,
  deps: UseWarrantyComponentHistoryDeps = {},
): WarrantyComponentHistoryState {
  const load = deps.load ?? fetchPostedWarrantyComponentHistory;
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<
    Omit<WarrantyComponentHistoryState, 'refresh'>
  >({
    documents: [],
    loading: true,
  });

  useEffect(() => {
    let active = true;
    setState(current => ({ ...current, loading: true, error: undefined }));
    load(warrantyCaseId)
      .then(documents => {
        if (active) setState({ documents, loading: false });
      })
      .catch(cause => {
        if (active) {
          setState({
            documents: [],
            loading: false,
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

  const refresh = useCallback(() => setRevision(value => value + 1), []);
  return { ...state, refresh };
}
