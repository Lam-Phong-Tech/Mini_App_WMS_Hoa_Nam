import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { AppError } from '../src/errors/AppError';
import {
  LookupScreen,
  MESSAGE_LOOKUP_CODE_REQUIRED,
  type LookupResult,
} from '../src/features/lookup/LookupScreen';
import { AppProviders } from '../src/app/App';
import { Button } from '../src/ui/Button';
import { CodeInput } from '../src/ui/CodeInput';
import {
  createMemoryBackend,
  createStorage,
  setAppStorageForTesting,
} from '../src/storage/storage';

interface Deferred<T> {
  readonly promise: Promise<T>;
  resolve(value: T): void;
}

function deferred<T>(): Deferred<T> {
  let resolvePromise: (value: T) => void = () => undefined;
  const promise = new Promise<T>(resolve => { resolvePromise = resolve; });
  return { promise, resolve: resolvePromise };
}

function textOf(tree: ReactTestRenderer.ReactTestRenderer | undefined): string {
  return JSON.stringify(tree?.toJSON());
}

function button(tree: ReactTestRenderer.ReactTestRenderer | undefined, label: string) {
  return tree?.root.findAllByType(Button).find(candidate => candidate.props.label === label);
}

beforeEach(() => {
  setAppStorageForTesting(createStorage(createMemoryBackend()));
});

describe('Tra cứu — chỉ kết quả mới nhất được phép lên màn hình', () => {
  it('mã trống báo lỗi input, không gọi WMS', async () => {
    const lookup = jest.fn();
    let tree: ReactTestRenderer.ReactTestRenderer | undefined;
    await ReactTestRenderer.act(() => {
      tree = ReactTestRenderer.create(
        <AppProviders><LookupScreen lookup={lookup} /></AppProviders>,
      );
    });

    const code = tree?.root.findByType(CodeInput);
    await ReactTestRenderer.act(() => {
      code?.props.onSubmitEditing?.();
    });

    expect(textOf(tree)).toContain(MESSAGE_LOOKUP_CODE_REQUIRED);
    expect(lookup).not.toHaveBeenCalled();
    await ReactTestRenderer.act(() => tree?.unmount());
  });

  it('response mã cũ trả sau không được ghi đè mã mới', async () => {
    const first = deferred<LookupResult | undefined>();
    const second = deferred<LookupResult | undefined>();
    const lookup = jest.fn((code: string) => code === 'HN-OLD' ? first.promise : second.promise);
    let tree: ReactTestRenderer.ReactTestRenderer | undefined;

    await ReactTestRenderer.act(async () => {
      tree = ReactTestRenderer.create(
        <AppProviders><LookupScreen initialCode="HN-OLD" lookup={lookup} /></AppProviders>,
      );
      await Promise.resolve();
    });
    await ReactTestRenderer.act(async () => {
      tree?.update(
        <AppProviders><LookupScreen initialCode="HN-NEW" lookup={lookup} /></AppProviders>,
      );
      await Promise.resolve();
    });

    expect(lookup).toHaveBeenCalledWith('HN-OLD', expect.any(AbortSignal));
    expect(lookup).toHaveBeenCalledWith('HN-NEW', expect.any(AbortSignal));

    await ReactTestRenderer.act(async () => {
      second.resolve({ product_name: 'Sản phẩm mới', sku_code: 'SKU-NEW' });
      await second.promise;
    });
    expect(textOf(tree)).toContain('Sản phẩm mới');

    await ReactTestRenderer.act(async () => {
      first.resolve({ product_name: 'Sản phẩm cũ', sku_code: 'SKU-OLD' });
      await first.promise;
    });
    expect(textOf(tree)).toContain('Sản phẩm mới');
    expect(textOf(tree)).not.toContain('Sản phẩm cũ');
    await ReactTestRenderer.act(() => tree?.unmount());
  });

  it('hủy lookup abort request đang bay và không báo lỗi giả', async () => {
    const pending = deferred<LookupResult | undefined>();
    let seenSignal: AbortSignal | undefined;
    const lookup = jest.fn((_code: string, signal?: AbortSignal) => {
      seenSignal = signal;
      return pending.promise;
    });
    let tree: ReactTestRenderer.ReactTestRenderer | undefined;

    await ReactTestRenderer.act(async () => {
      tree = ReactTestRenderer.create(
        <AppProviders><LookupScreen initialCode="HN-CANCEL" lookup={lookup} /></AppProviders>,
      );
      await Promise.resolve();
    });
    await ReactTestRenderer.act(() => button(tree, 'Hủy tra cứu')?.props.onPress());

    expect(seenSignal?.aborted).toBe(true);
    expect(textOf(tree)).not.toContain('Đang tra cứu mã trên WMS');
    await ReactTestRenderer.act(() => tree?.unmount());
  });

  it('4xx là không tìm thấy; lỗi mạng vẫn là lỗi kết nối riêng', async () => {
    const notFound = jest.fn(async () => {
      throw new AppError({ kind: 'http', status: 404, message: 'not found' });
    });
    let tree: ReactTestRenderer.ReactTestRenderer | undefined;
    await ReactTestRenderer.act(async () => {
      tree = ReactTestRenderer.create(
        <AppProviders><LookupScreen initialCode="MISSING" lookup={notFound} /></AppProviders>,
      );
      await Promise.resolve();
    });
    expect(textOf(tree)).toContain('Không tìm thấy sản phẩm');
    expect(textOf(tree)).not.toContain('Không tra cứu được');
    await ReactTestRenderer.act(() => tree?.unmount());

    const network = jest.fn(async () => {
      throw new AppError({ kind: 'network', message: 'mất mạng' });
    });
    await ReactTestRenderer.act(async () => {
      tree = ReactTestRenderer.create(
        <AppProviders><LookupScreen initialCode="NETWORK" lookup={network} /></AppProviders>,
      );
      await Promise.resolve();
    });
    expect(textOf(tree)).toContain('Không tra cứu được');
    expect(textOf(tree)).not.toContain('Không tìm thấy sản phẩm');
    await ReactTestRenderer.act(() => tree?.unmount());
  });

  it('tìm theo tên trả danh sách SKU thật khi trace không nhận ra chuỗi', async () => {
    const lookup = jest.fn(async () => {
      throw new AppError({ kind: 'http', status: 404, message: 'not found' });
    });
    const searchCatalog = jest.fn(async () => [{
      skuCode: 'DCCS20061-2',
      skuName: 'Cưa cắt cành không dây',
      skuType: 'PRODUCT' as const,
    }]);
    let tree: ReactTestRenderer.ReactTestRenderer | undefined;
    await ReactTestRenderer.act(async () => {
      tree = ReactTestRenderer.create(
        <AppProviders>
          <LookupScreen initialCode="cưa cắt cành" lookup={lookup} searchCatalog={searchCatalog} />
        </AppProviders>,
      );
      await Promise.resolve();
    });
    expect(searchCatalog).toHaveBeenCalledWith('cưa cắt cành', expect.any(Object));
    expect(textOf(tree)).toContain('DCCS20061-2');
    expect(textOf(tree)).not.toContain('Không tìm thấy sản phẩm');
    await ReactTestRenderer.act(() => tree?.unmount());
  });
});
