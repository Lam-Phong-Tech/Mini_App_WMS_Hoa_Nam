/**
 * Tỉnh/Phường cho form phiếu xuất, ở tầng React.
 *
 * Phường **chỉ tải sau khi đã chọn tỉnh** — mô tả luồng xuất 2026-09-06. Tải
 * sẵn tất cả phường của 34 tỉnh là hàng chục nghìn bản ghi cho một ô chọn.
 */

import { useCallback, useEffect, useState } from 'react';
import { toAppError, type AppError } from '../../errors/AppError';
import { fetchProvinces, fetchWards, type GeoUnit } from './provinces';

export type GeoPhase = 'idle' | 'loading' | 'ready' | 'error';

export interface GeoState {
  readonly phase: GeoPhase;
  readonly items: readonly GeoUnit[];
  /** Dữ liệu từ cache quá hạn vì gọi mạng hỏng — nên nói cho người dùng biết. */
  readonly stale: boolean;
  readonly error?: AppError;
  readonly reload: () => void;
}

const EMPTY: readonly GeoUnit[] = [];

export interface UseGeoDeps {
  readonly loadProvinces?: typeof fetchProvinces;
  readonly loadWards?: typeof fetchWards;
}

export function useProvinces(deps: UseGeoDeps = {}): GeoState {
  const load = deps.loadProvinces ?? fetchProvinces;
  const [state, setState] = useState<Omit<GeoState, 'reload'>>({
    phase: 'loading',
    items: EMPTY,
    stale: false,
  });

  const run = useCallback(() => {
    setState({ phase: 'loading', items: EMPTY, stale: false });
    load()
      .then(result =>
        setState({
          phase: 'ready',
          items: result.items,
          stale: result.stale,
        }),
      )
      .catch(cause =>
        setState({
          phase: 'error',
          items: EMPTY,
          stale: false,
          error: toAppError(cause),
        }),
      );
  }, [load]);

  useEffect(run, [run]);

  return { ...state, reload: run };
}

export function useWards(
  provinceCode: string,
  deps: UseGeoDeps = {},
): GeoState {
  const load = deps.loadWards ?? fetchWards;
  const [state, setState] = useState<Omit<GeoState, 'reload'>>({
    phase: 'idle',
    items: EMPTY,
    stale: false,
  });

  const run = useCallback(() => {
    // Chưa chọn tỉnh ⇒ `idle`, KHÔNG phải `loading`. Ô phường lúc này bị khoá
    // và phải nói lý do là "chọn tỉnh trước", không phải "đang tải".
    if (provinceCode.trim() === '') {
      setState({ phase: 'idle', items: EMPTY, stale: false });
      return;
    }
    setState({ phase: 'loading', items: EMPTY, stale: false });
    load(provinceCode)
      .then(result =>
        setState({
          phase: 'ready',
          items: result.items,
          stale: result.stale,
        }),
      )
      .catch(cause =>
        setState({
          phase: 'error',
          items: EMPTY,
          stale: false,
          error: toAppError(cause),
        }),
      );
  }, [load, provinceCode]);

  useEffect(run, [run]);

  return { ...state, reload: run };
}
