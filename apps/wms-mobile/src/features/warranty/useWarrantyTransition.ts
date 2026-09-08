/**
 * Chuyển trạng thái một hồ sơ bảo hành.
 *
 * 🔓 `GATE_WMS §2i` — **I** được duyệt ngày 2026-09-06.
 *
 * ## Đọc lại hồ sơ trước mỗi lần chuyển
 *
 * Cùng lý do với Post Issue hàng loạt: `version` trong danh sách là ảnh chụp
 * lúc tải. Với hồ sơ bảo hành, cái bị ghi đè không phải tồn kho mà là **Kết quả
 * kiểm tra** của kỹ thuật viên khác — thứ không dựng lại được từ đâu.
 *
 * Một request đọc thêm rẻ hơn nhiều so với việc đó.
 *
 * ## Khoá idempotency
 *
 * Suy từ **mã hồ sơ + trạng thái đích**, không phải mã hồ sơ đơn thuần: một hồ
 * sơ đi qua nhiều bước, mỗi bước là một thao tác riêng. Dùng chung một khoá cho
 * cả vòng đời thì bước thứ hai sẽ bị máy chủ coi là gửi trùng của bước đầu và
 * lặng lẽ không xảy ra.
 */

import { useCallback, useState } from 'react';
import { toAppError, type AppError } from '../../errors/AppError';
import { updateWarrantyStatus } from '../../services/wms/warrantyWrite';
import { fetchWarrantyCase } from '../../services/wms/queries';
import type { WarrantyCase } from '../../services/wms/types';

export const TRANSITION_KEY_PREFIX = 'wmshn-wstatus-';

/**
 * Khoá của **một bước** chuyển trạng thái.
 *
 * Ổn định qua mọi lần bấm lại cùng một bước, khác nhau giữa các bước.
 */
export function transitionIdempotencyKey(
  caseId: string,
  targetStatus: string,
): string {
  return (
    TRANSITION_KEY_PREFIX + caseId + '-' + targetStatus.toUpperCase()
  ).slice(0, 100);
}

export interface TransitionState {
  readonly running?: string;
  readonly error?: AppError;
  readonly updated?: WarrantyCase;
}

export interface UseWarrantyTransitionDeps {
  readonly update?: typeof updateWarrantyStatus;
  readonly fetchCase?: typeof fetchWarrantyCase;
  readonly onDone?: (warrantyCase: WarrantyCase) => void;
}

export function useWarrantyTransition(
  caseId: string,
  deps: UseWarrantyTransitionDeps = {},
) {
  const submit = deps.update ?? updateWarrantyStatus;
  const readCase = deps.fetchCase ?? fetchWarrantyCase;
  const [state, setState] = useState<TransitionState>({});

  const run = useCallback(
    async (status: string, note: string, confirmedDefect?: string) => {
      // Chống bấm hai lần: bước thứ hai không tạo bản ghi trùng nhờ
      // `Idempotency-Key`, nhưng vẫn là một request thừa và một lần chờ.
      if (state.running !== undefined) {
        return;
      }
      setState({ running: status });
      try {
        // Đọc lại để có `version` mới nhất — xem chú thích đầu tệp.
        const fresh = await readCase(caseId);
        const updated = await submit(
          {
            caseId,
            status,
            version: fresh.version ?? '',
            note,
            confirmedDefect,
          },
          transitionIdempotencyKey(caseId, status),
        );
        setState({ updated });
        deps.onDone?.(updated);
      } catch (cause) {
        setState({ error: toAppError(cause) });
      }
    },
    [caseId, deps, readCase, state.running, submit],
  );

  const dismissError = useCallback(() => {
    setState(current => ({ ...current, error: undefined }));
  }, []);

  return { ...state, run, dismissError };
}
