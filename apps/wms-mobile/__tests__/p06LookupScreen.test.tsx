import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { Image, Text } from 'react-native';
import { AppProviders } from '../src/app/App';
import { P06LookupScreen } from '../src/features/lookup/P06LookupScreen';
import {
  p06ScopeKey,
  createP06CatalogService,
  type P06CatalogService,
} from '../src/services/wms/p06Catalog';
import { clearSession, setSession } from '../src/auth/session';
import {
  createMemoryBackend,
  createStorage,
  setAppStorageForTesting,
} from '../src/storage/storage';
import {
  mockId,
  p06MockHarness,
  p06MockSession,
} from '../src/web/p06ReviewFixtures';
import { resetHardwareBackForTest } from '../src/app/useHardwareBack';
import { P06Pair, p06MasterFields } from '../src/features/lookup/P06Presentation';
import type { ReadClient } from '../src/services/wms/readOnlyClient';
import type { RequestOptions } from '../src/api/client';
let tree: Renderer.ReactTestRenderer | undefined;
const text = () => JSON.stringify(tree?.toJSON());
async function mount(
  panel: 1 | 2 | 3 | 4,
  service?: P06CatalogService,
  callbacks: { onScan?: () => void; onConfirmSession?: () => void } = {},
) {
  await act(async () => {
    tree = Renderer.create(
      <AppProviders>
        <P06LookupScreen
          service={service}
          {...callbacks}
          initialViewState={{
            scopeKey: p06ScopeKey(p06MockSession),
            query: '',
            mode: 'keyword',
            category: 'PRODUCT',
            status: 'ACTIVE',
            panel,
            identity:
              panel === 1 ? undefined : { type: 'SKU', id: mockId(100) },
            source: 'ALL',
            scroll: { 1: 0, 2: 0, 3: 0, 4: 0 },
          }}
        />
      </AppProviders>,
    );
    await Promise.resolve();
    await new Promise<void>(resolve => setTimeout(() => resolve(), 0));
  });
}
beforeEach(() => {
  setAppStorageForTesting(createStorage(createMemoryBackend()));
  setSession(p06MockSession);
});
afterEach(async () => {
  await act(() => tree?.unmount());
  tree = undefined;
  resetHardwareBackForTest();
});
describe('P06 native UI — mock render, not live Android acceptance', () => {
  it('S02 displays current owner category and brand without a visual fixture or extra master lookup', async () => {
    const h = p06MockHarness();
    const client: ReadClient = {
      async get<T>(path: string, options?: Omit<RequestOptions, 'path' | 'method'>) {
        const response = await h.client.get<unknown>(path, options);
        if (path === '/api/v1/mini-app/catalog/skus/' + mockId(100)) {
          const body = response.data as { data: { card: Record<string, unknown> } };
          Object.assign(body.data.card, {
            category_name: 'Máy khoan & vặn vít',
            brand_name: 'DongCheng',
            description: null,
          });
        }
        return response as { status: number; data: T };
      },
    };
    await mount(2, createP06CatalogService(client, h.readSession, () => true));
    const pair = (label: string) => tree!.root.findAllByType(P06Pair).find(row => row.props.label === label)!;
    expect(pair('Nhóm sản phẩm').props.value).toBe('Máy khoan & vặn vít');
    expect(pair('Thương hiệu').props.value).toBe('DongCheng');
    expect(pair('Mô tả').props.value).toBeNull();
    expect(h.calls.every(call => call.path.startsWith('/api/v1/mini-app/catalog/'))).toBe(true);
  });
  it('an explicit missing owner label never falls back to a visual name or the SKU code', async () => {
    const h = p06MockHarness();
    const context = (await h.service.context()).data;
    const card = (await h.service.detail(context, { type: 'SKU', id: mockId(100) })).data.card;
    const fields = p06MasterFields({ ...card, category_name: null, brand_name: null, description: null }, {
      kind: 'LOCAL_LOCKED_VISUAL_ONLY',
      cards: { [card.sku_id]: { code: 'DEMO_CODE', group: 'DEMO_GROUP', brand: 'DEMO_BRAND', description: 'DEMO_DESCRIPTION' } },
    });
    expect(fields).toEqual({ group: null, brand: null, description: null });
  });
  it.each(['warehouse-required', 'warehouse-inactive'] as const)(
    '%s disables scan and returns confirmation to session owner',
    async scenario => {
      const h = p06MockHarness(scenario),
        onScan = jest.fn(),
        onConfirmSession = jest.fn();
      await mount(1, h.service, { onScan, onConfirmSession });
      const buttons = tree!.root.findAll(
        p =>
          p.props.accessibilityLabel === 'Quét mã tra cứu' &&
          p.props.accessibilityRole === 'button',
      );
      expect(buttons.some(p => p.props.accessibilityState?.disabled)).toBe(
        true,
      );
      await act(() =>
        buttons
          .find(p => typeof p.props.onPress === 'function')
          ?.props.onPress(),
      );
      expect(onScan).not.toHaveBeenCalled();
      expect(text()).not.toContain('XP-420B');
      expect(h.calls).toHaveLength(1);
      const owner = tree!.root.findAll(
        p =>
          p.props.label === 'Về xác nhận phiên' &&
          typeof p.props.onPress === 'function',
      )[0];
      await act(() => owner.props.onPress());
      expect(onConfirmSession).toHaveBeenCalledTimes(1);
    },
  );
  it('limited ITEM/stock rights keep scan disabled despite a successful SKU list', async () => {
    await mount(1, p06MockHarness('limited-rights').service, {
      onScan: jest.fn(),
    });
    expect(text()).toContain('XP-420B');
    const scan = tree!.root.findAll(
      p =>
        p.props.accessibilityLabel === 'Quét mã tra cứu' &&
        p.props.accessibilityRole === 'button',
    );
    expect(scan.some(p => p.props.accessibilityState?.disabled)).toBe(true);
    expect(text()).not.toContain('Còn hàng');
  });
  it('unaccepted read adapter displays pending; no catalogue rows/scan activation', async () => {
    const h = p06MockHarness();
    await mount(
      1,
      createP06CatalogService(h.client, h.readSession, () => false),
    );
    expect(text()).toContain('Tra cứu đang chờ kiểm thử và triển khai');
    expect(text()).not.toContain('XP-420B');
    const scan = tree!.root.findAll(
      p =>
        p.props.accessibilityLabel === 'Quét mã tra cứu' &&
        p.props.accessibilityRole === 'button',
    );
    expect(scan.some(p => p.props.accessibilityState?.disabled === true)).toBe(
      true,
    );
  });
  it('S01 shows server count23 with only20 loaded and no invented serial or image', async () => {
    await mount(1, p06MockHarness().service);
    expect(text()).toContain('23');
    expect(text()).not.toContain('Danh sách theo SKU');
    expect(text()).not.toContain('SKU phù hợp');
    expect(text()).not.toContain('HN12345');
    expect(tree!.root.findAllByType(Image)).toHaveLength(0);
  });
  it('S02 disables print/warranty even when permission=true and keeps missing fields', async () => {
    await mount(2, p06MockHarness().service);
    const actions = tree!.root
      .findAll(
        p =>
          p.props.accessibilityRole === 'button' &&
          p.props.accessibilityState?.disabled === true,
      )
      .filter(p =>
        p.findAllByType(Text).some(t => t.props.children === 'In tem'),
      );
    expect(actions.length).toBeGreaterThan(0);
    const missing = tree!.root
      .findAllByType(P06Pair)
      .filter(p =>
        ['Nhóm sản phẩm', 'Thương hiệu', 'Mô tả'].includes(p.props.label),
      );
    expect(missing).toHaveLength(3);
    expect(missing.every(p => p.props.value == null)).toBe(true);
    expect(text()).not.toContain('Xprinter');
    expect(tree!.root.findAllByType(Image)).toHaveLength(0);
  });
  it('S03 mismatch clearly unconfirmed; no made-up shelves', async () => {
    await mount(3, p06MockHarness('mismatch').service);
    expect(text()).toContain('Tồn chưa được xác nhận');
    expect(text()).toContain('Chưa có dữ liệu tồn theo ô/kệ/khay');
    expect(text()).not.toContain('A-01-03');
  });
  it('S04 shows only the source filter and warranty qty not applicable', async () => {
    await mount(4, p06MockHarness().service);
    expect(text()).not.toContain('Khoảng ngày: chưa hỗ trợ');
    expect(text()).toContain('Không áp dụng');
    expect(text()).toContain('-2,5');
  });
  it('logout removes detail/stock from rendered UI immediately', async () => {
    await mount(2, p06MockHarness().service);
    expect(text()).toContain('XP-420B');
    await act(() => clearSession());
    expect(text()).not.toContain('XP-420B');
    expect(text()).toContain('Cần xác nhận lại phiên đăng nhập');
  });
});
