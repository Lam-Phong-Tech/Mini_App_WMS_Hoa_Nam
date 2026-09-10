import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import {
  useWarrantyComponentHistory,
  type WarrantyComponentHistoryState,
} from '../src/features/warranty/useWarrantyComponentHistory';
import type {
  WarrantyComponentHistoryDocument,
  WarrantyComponentHistoryPage,
} from '../src/services/wms/warrantyComponentRead';
import type { ReadOptions } from '../src/services/wms/readOnlyClient';

interface Deferred<T> {
  readonly promise: Promise<T>;
  resolve(value: T): void;
  reject(reason: unknown): void;
}

function deferred<T>(): Deferred<T> {
  let resolvePromise: (value: T) => void = () => undefined;
  let rejectPromise: (reason: unknown) => void = () => undefined;
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return { promise, resolve: resolvePromise, reject: rejectPromise };
}

function page(
  id: string,
  currentPage: number,
  hasMore: boolean,
): WarrantyComponentHistoryPage {
  const document: WarrantyComponentHistoryDocument = { id, lines: [] };
  return { documents: [document], page: currentPage, hasMore };
}

function renderHistoryHook(
  warrantyCaseId: string,
  load: (caseId: string, options?: ReadOptions) => Promise<WarrantyComponentHistoryPage>,
) {
  const captured: { current?: WarrantyComponentHistoryState } = {};
  function Probe({ caseId }: { caseId: string }): null {
    captured.current = useWarrantyComponentHistory(caseId, {
      load,
    });
    return null;
  }
  let tree: ReactTestRenderer.ReactTestRenderer | undefined;
  ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(<Probe caseId={warrantyCaseId} />);
  });
  return {
    get: () => captured.current as WarrantyComponentHistoryState,
    rerender: (caseId: string) => {
      ReactTestRenderer.act(() => {
        tree?.update(<Probe caseId={caseId} />);
      });
    },
    unmount: () => {
      ReactTestRenderer.act(() => tree?.unmount());
    },
  };
}

describe('phân trang lịch sử linh kiện bảo hành', () => {
  it('bỏ response Tải thêm thuộc hồ sơ cũ sau khi đổi hồ sơ', async () => {
    const firstA = deferred<WarrantyComponentHistoryPage>();
    const moreA = deferred<WarrantyComponentHistoryPage>();
    const firstB = deferred<WarrantyComponentHistoryPage>();
    const load = jest.fn((caseId: string, options?: ReadOptions) => {
      if (caseId === 'case-a' && options?.query?.page === 1) return firstA.promise;
      if (caseId === 'case-a' && options?.query?.page === 2) return moreA.promise;
      if (caseId === 'case-b' && options?.query?.page === 1) return firstB.promise;
      throw new Error('Không có request dự kiến');
    });
    const hook = renderHistoryHook('case-a', load);

    await ReactTestRenderer.act(async () => {
      firstA.resolve(page('a-1', 1, true));
      await firstA.promise;
    });
    ReactTestRenderer.act(() => hook.get().loadMore());
    hook.rerender('case-b');

    await ReactTestRenderer.act(async () => {
      moreA.resolve(page('a-2-stale', 2, false));
      firstB.resolve(page('b-1', 1, false));
      await Promise.all([moreA.promise, firstB.promise]);
    });

    expect(hook.get().documents).toEqual([{ id: 'b-1', lines: [] }]);
    expect(hook.get().loadingMore).toBe(false);
    hook.unmount();
  });

  it('bỏ response Tải thêm cũ ngay sau khi Refresh', async () => {
    const first = deferred<WarrantyComponentHistoryPage>();
    const more = deferred<WarrantyComponentHistoryPage>();
    const refreshed = deferred<WarrantyComponentHistoryPage>();
    let firstRequestCount = 0;
    const load = jest.fn((_caseId: string, options?: ReadOptions) => {
      if (options?.query?.page === 2) return more.promise;
      firstRequestCount += 1;
      return firstRequestCount === 1 ? first.promise : refreshed.promise;
    });
    const hook = renderHistoryHook('case-a', load);

    await ReactTestRenderer.act(async () => {
      first.resolve(page('a-1', 1, true));
      await first.promise;
    });
    ReactTestRenderer.act(() => hook.get().loadMore());
    ReactTestRenderer.act(() => hook.get().refresh());

    await ReactTestRenderer.act(async () => {
      more.resolve(page('a-2-stale', 2, false));
      refreshed.resolve(page('a-refresh', 1, false));
      await Promise.all([more.promise, refreshed.promise]);
    });

    expect(hook.get().documents).toEqual([{ id: 'a-refresh', lines: [] }]);
    expect(hook.get().loadingMore).toBe(false);
    hook.unmount();
  });
});
