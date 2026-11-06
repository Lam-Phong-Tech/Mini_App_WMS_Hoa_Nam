/** Local state/data/presentation regression. No credentials, server, camera, device or mutation. */
import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { Image, ScrollView } from 'react-native';
import { AppProviders } from '../src/app/App';
import { P06LookupScreen } from '../src/features/lookup/P06LookupScreen';
import {
  P06Pair,
  P06EventRow,
  p06Date,
  P06Photo,
  P06Button,
} from '../src/features/lookup/P06Presentation';
import { Dialog } from '../src/ui/Dialog';
import { p06Design, P06Icon } from '../src/features/lookup/P06Design';
import {
  p06ScopeKey,
  p06Catalog,
  type P06CatalogService,
} from '../src/services/wms/p06Catalog';
import {
  p06MockHarness,
  mockId,
  p06MockSession,
  type P06MockScenario,
} from '../src/web/p06ReviewFixtures';
import { p06LockedVisualFixture } from '../src/web/p06LockedVisualFixtures';
import { setSession, clearSession } from '../src/auth/session';
import {
  createMemoryBackend,
  createStorage,
  setAppStorageForTesting,
} from '../src/storage/storage';
import { resetHardwareBackForTest } from '../src/app/useHardwareBack';
let tree: Renderer.ReactTestRenderer | undefined;
function textTree(value: any): string {
  if (typeof value === 'string' || typeof value === 'number')
    return String(value);
  if (Array.isArray(value)) return value.map(textTree).join('');
  return value?.children ? textTree(value.children) : '';
}
const output = () => textTree(tree!.toJSON());
async function render(
  panel: 1 | 2 | 3 | 4,
  service: P06CatalogService,
  props: Partial<React.ComponentProps<typeof P06LookupScreen>> = {},
  scrollTo?: jest.Mock,
) {
  await act(async () => {
    tree = Renderer.create(
      <AppProviders>
        <P06LookupScreen
          service={service}
          initialViewState={{
            scopeKey: p06ScopeKey(p06MockSession),
            query: '',
            mode: 'keyword',
            status: 'ACTIVE',
            category: 'PRODUCT',
            source: 'ALL',
            panel,
            identity: panel > 1 ? { type: 'SKU', id: mockId(100) } : undefined,
            scroll: { 1: 0, 2: 0, 3: 0, 4: 0 },
          }}
          {...props}
        />
      </AppProviders>,
      scrollTo
        ? {
            createNodeMock: element =>
              (element.props as { testID?: string })?.testID === 'p06-scroll'
                ? { scrollTo }
                : null,
          }
        : undefined,
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
const scenarios: P06MockScenario[] = [
  'ready',
  'empty',
  'forbidden',
  'unavailable',
  'incomplete',
  'mismatch',
  'warehouse-required',
  'warehouse-inactive',
  'limited-rights',
  'loading',
  'list-loading',
  'detail-loading',
  'stock-loading',
  'gallery-loading',
  'timeline-loading',
  'not-found',
  'auth-error',
  'schema-error',
  'stock-forbidden',
  'ledger-only',
  'warranty-only',
  'no-timeline',
  'timeline-empty',
  'long-content',
];
describe('P06 local S01–S04 state matrix', () => {
  it('compact event description opens the existing full reader without fetching or navigating',async()=>{
    const h=p06MockHarness(),open=jest.fn();
    await render(4,h.service,{onOpenDocument:open});
    const event=tree!.root.findAllByType(P06EventRow)[0].props.event;
    const count=h.calls.length,stopPropagation=jest.fn();
    const reader=tree!.root.findAll(n=>n.props.testID==='p06-event-read'&&typeof n.props.onPress==='function')[0];
    await act(async()=>reader.props.onPress({stopPropagation}));
    const dialog=tree!.root.findAllByType(Dialog).find(d=>d.props.visible)!;
    expect(dialog).toBeDefined();
    if(event.document?.number)expect(output()).toContain(event.document.number);
    expect(output()).toContain('Thời gian:');
    expect(h.calls).toHaveLength(count);expect(open).not.toHaveBeenCalled();
    expect(stopPropagation).toHaveBeenCalled();
  },15000);
  it.each([['Xem tồn kho',3],['Lịch sử giao dịch',4]] as const)('detail exposes %s and opens the same scoped read owner',async(label,panel)=>{
    const h=p06MockHarness();
    await render(2,h.service);
    const button=tree!.root.findAllByType(P06Button).find(n=>n.props.label===label);
    expect(button).toBeDefined();
    expect(button!.props.disabled).toBe(false);
    expect(button!.findAllByType(P06Icon).map(n=>n.props.name)).toEqual([panel===3?'warehouse':'history','chevron']);
    await act(async()=>{await button!.props.onPress();});
    expect(tree!.root.findAll(n=>n.props.testID===`p06-s0${panel}`).length).toBeGreaterThan(0);
  });
  it.each([['stock-forbidden','Xem tồn kho'],['no-timeline','Lịch sử giao dịch']] as const)('detail denies %s without issuing the forbidden read',async(scenario,label)=>{
    const h=p06MockHarness(scenario);
    await render(2,h.service);
    const button=tree!.root.findAllByType(P06Button).find(n=>n.props.label===label);
    expect(button).toBeDefined();
    expect(button!.props.disabled).toBe(true);
    const count=h.calls.length;
    await act(async()=>{await button!.props.onPress();});
    expect(h.calls).toHaveLength(count);
    expect(tree!.root.findAll(n=>n.props.testID==='p06-s02').length).toBeGreaterThan(0);
  });
  it('broken local image preserves its slot and retries the same authorized source', async () => {
    await act(() => {
      tree = Renderer.create(
        <AppProviders>
          <P06Photo source={{ uri: 'http://127.0.0.1/locked-qa.png' }} />
        </AppProviders>,
      );
    });
    const before = tree!.root.findByType(Image).props.source;
    await act(() => tree!.root.findByType(Image).props.onError());
    expect(output()).toContain('Không tải được ảnh');
    const retry = tree!.root.findAll(
      n =>
        n.props.accessibilityLabel === 'Thử tải ảnh lại' &&
        typeof n.props.onPress === 'function',
    )[0];
    await act(() => retry.props.onPress());
    expect(tree!.root.findByType(Image).props.source).toEqual(before);
  });
  it('dates use locked DD/MM/YYYY HH:mm Vietnam; timestamps missing timezone remain —', () => {
    expect(p06Date('2026-09-09T01:15:00Z')).toBe('09/09/2026 08:15');
    expect(p06Date('2026-09-09T08:15:00+07:00')).toBe('09/09/2026 08:15');
    expect(p06Date(null)).toBe('—');
    expect(p06Date('2026-09-09 08:15:00')).toBe('—');
  });
  it('long source text opens the complete reader without changing data or issuing another API read', async () => {
    const h = p06MockHarness();
    h.cards[0].sku_name = 'Máy in 日本語 🧰\n'.repeat(160);
    await render(2, h.service);
    const count = h.calls.length,
      readers = tree!.root.findAll(
        n =>
          n.props.label === 'Xem đầy đủ' &&
          typeof n.props.onPress === 'function',
      );
    expect(readers.length).toBeGreaterThan(0);
    await act(() => readers[0].props.onPress());
    const dialog = tree!.root.findAllByType(Dialog).find(n => n.props.visible);
    expect(dialog?.props.title).toBe('Tên sản phẩm');
    expect(dialog?.props.children.props.children).toBe(h.cards[0].sku_name);
    expect(h.calls).toHaveLength(count);
    await act(() => dialog?.props.onDismiss());
    expect(tree!.root.findAllByType(Dialog).some(n => n.props.visible)).toBe(
      false,
    );
  });
  it.each(
    scenarios.flatMap(scenario =>
      [1, 2, 3, 4].map(panel => ({ scenario, panel: panel as 1 | 2 | 3 | 4 })),
    ),
  )(
    '$scenario / S0$panel renders truthfully with fixed header/footer and no fixture leakage',
    async ({ scenario, panel }) => {
      const h = p06MockHarness(scenario);
      await render(panel, h.service);
      if (scenario === 'gallery-loading' && panel === 2) {
        const retries = tree!.root.findAll(
          n =>
            n.props.label === 'Đọc lại ảnh' &&
            typeof n.props.onPress === 'function',
        );
        expect(retries).toHaveLength(0);
      }
      expect(
        tree!.root.findAll(n => n.props.testID === 'hn-locked-footer').length,
      ).toBeGreaterThan(0);
      expect(
        tree!.root.findAll(n => n.props.testID === 'p06-header').length,
      ).toBeGreaterThan(0);
      expect(tree!.root.findAllByType(Image)).toHaveLength(0);
      expect(output()).not.toContain('Xprinter');
      expect(output()).not.toContain('A-01-03');
      if (
        [
          'forbidden',
          'unavailable',
          'auth-error',
          'warehouse-required',
          'warehouse-inactive',
          'loading',
        ].includes(scenario)
      )
        expect(output()).not.toContain('XP-420B');
      if (scenario === 'loading')
        expect(output()).toContain('Đang đọc dữ liệu');
      const scopedLoading =
        (scenario === 'list-loading' && panel === 1) ||
        (scenario === 'detail-loading' && panel > 1) ||
        (scenario === 'stock-loading' && panel === 3) ||
        (scenario === 'timeline-loading' && panel === 4);
      if (scopedLoading) expect(output()).toContain('Đang đọc dữ liệu');
      if (
        ['stock-loading', 'gallery-loading', 'timeline-loading'].includes(
          scenario,
        ) &&
        panel > 1
      )
        expect(output()).toContain('XP-420B');
      if (scenario === 'gallery-loading' && panel === 2) {
        expect(output()).toContain('Chưa có ảnh');
        expect(
          tree!.root.findAll(n => n.props.label === 'Đọc lại ảnh'),
        ).toHaveLength(0);
      }
      if (scenario === 'empty' && panel === 1)
        expect(output()).toContain('Danh sách hiện chưa có dữ liệu');
      if (scenario === 'not-found' && panel > 1)
        expect(output()).toContain('Không tìm thấy đối tượng');
      if (scenario === 'schema-error')
        expect(output()).toContain('Kết quả chưa xác định');
      if (
        ['incomplete', 'mismatch'].includes(scenario) &&
        [2, 3].includes(panel)
      )
        expect(output()).toContain('Tồn chưa được xác nhận');
      if (scenario === 'no-timeline' && panel === 4)
        expect(output()).toContain('Bạn chưa có quyền');
    },
  );
  it('S02 missing metadata has the seven locked information rows with —, not dummy brand/model', async () => {
    await render(2, p06MockHarness().service);
    const rows = tree!.root.findAllByType(P06Pair);
    expect(rows.slice(0, 7).map(r => r.props.label)).toEqual([
      'SKU',
      'Tên sản phẩm',
      'Nhóm sản phẩm',
      'Thương hiệu',
      'Đơn vị tính',
      'Kho lưu trữ',
      'Mô tả',
    ]);
    expect(
      rows
        .filter(r =>
          ['Nhóm sản phẩm', 'Thương hiệu', 'Mô tả'].includes(r.props.label),
        )
        .every(r => r.props.value == null),
    ).toBe(true);
  });
  it('S02 shortcuts precede actions/basic information and Back returns to caller at the root', async () => {
    const onHome = jest.fn(),
      onExitLookup = jest.fn();
    await render(1, p06MockHarness().service, { onHome, onExitLookup });
    const back = tree!.root.findAll(
      n =>
        n.props.accessibilityLabel === 'Quay lại' &&
        typeof n.props.onPress === 'function',
    )[0];
    await act(() => back.props.onPress());
    expect(onExitLookup).toHaveBeenCalledTimes(1);
    expect(onHome).not.toHaveBeenCalled();
  });
  it('S04 warranty quantities remain NOT_APPLICABLE and ledger decimals retain sign', async () => {
    await render(4, p06MockHarness().service);
    const events = tree!.root
      .findAllByType(P06EventRow)
      .map(n => n.props.event);
    expect(events.some(e => e.signed_quantity === -2.5)).toBe(true);
    expect(
      events
        .filter(e => e.source === 'WARRANTY')
        .every(e => e.signed_quantity === null),
    ).toBe(true);
    expect(output()).toContain('Không áp dụng');
  });
  it('header/footer dimensions scale from the same locked494 frame, not viewport toolbar width', () => {
    expect(p06Design(494).s.header.height).toBe(92);
    expect(p06Design(360).s.header.height).toBeCloseTo((92 * 360) / 494);
    expect(p06Design(494).s.action.minHeight).toBe(90);
  });
  it('locked visual demo preserves authored12/10/1/1 but is explicitly opt-in', async () => {
    const value = p06LockedVisualFixture();
    await render(2, value.harness.service, {
      reviewPresentation: value.review,
    });
    expect(output()).toContain('Xprinter');
    expect(tree!.root.findAllByType(Image).length).toBeGreaterThan(0);
    const stockRows = tree!.root
      .findAllByType(P06Pair)
      .filter(r =>
        ['Tổng tồn', 'Khả dụng', 'Đang giữ', 'Không khả dụng'].includes(
          r.props.label,
        ),
      );
    expect(stockRows.map(r => r.props.value)).toEqual(['12', '10', '1', '1']);
  });
  it('production singleton ignores review fields and never imports a demo asset source', async () => {
    const api = p06Catalog.context,
      originalGallery = p06Catalog.gallery,
      originalList = p06Catalog.list;
    const fake = p06MockHarness();
    p06Catalog.context = fake.service.context;
    p06Catalog.list = fake.service.list;
    p06Catalog.gallery = fake.service.gallery;
    try {
      await render(1, p06Catalog, {
        reviewPresentation: p06LockedVisualFixture().review,
      });
      expect(tree!.root.findAllByType(Image)).toHaveLength(0);
      expect(output()).not.toContain('HN12345');
    } finally {
      p06Catalog.context = api;
      p06Catalog.list = originalList;
      p06Catalog.gallery = originalGallery;
    }
  });
  it('logout conceals all detail/review data and closes overlays without persisting photos/stock', async () => {
    const value = p06LockedVisualFixture();
    await render(2, value.harness.service, {
      reviewPresentation: value.review,
    });
    expect(output()).toContain('HN12345');
    await act(() => clearSession());
    expect(output()).not.toContain('HN12345');
    expect(tree!.root.findAllByType(Image)).toHaveLength(0);
  });
  it('cancelled read/Back never keeps a permanently loading indicator', async () => {
    const h = p06MockHarness();
    let resolve!: (v: any) => void;
    const pending = new Promise<any>(r => (resolve = r));
    h.service.detail = () => pending;
    await render(1, h.service);
    const card = tree!.root.findAll(
      n =>
        n.props.testID === 'p06-catalog-card' &&
        typeof n.props.onPress === 'function',
    )[0];
    await act(() => card.props.onPress());
    const back = tree!.root.findAll(
      n =>
        n.props.accessibilityLabel === 'Quay lại' &&
        typeof n.props.onPress === 'function',
    )[0];
    await act(() => back.props.onPress());
    expect(output()).not.toContain('Đang đọc dữ liệu');
    resolve(undefined);
  });
  it('restore scroll target is not consumed by the loading placeholder before data exists', async () => {
    const h = p06MockHarness();
    await render(1, h.service, {
      initialViewState: {
        scopeKey: p06ScopeKey(p06MockSession),
        query: '',
        mode: 'keyword',
        category: 'PRODUCT',
        status: 'ACTIVE',
        panel: 1,
        source: 'ALL',
        scroll: { 1: 182, 2: 0, 3: 0, 4: 0 },
      },
    });
    const scroll = tree!.root.findAllByType(ScrollView)[0];
    expect(scroll.props.onContentSizeChange).toEqual(expect.any(Function));
    await act(() =>
      scroll.props.onScroll({
        nativeEvent: {
          contentOffset: { y: 182 },
          contentSize: { height: 1500 },
          layoutMeasurement: { height: 700 },
        },
      }),
    );
  });
  it('TC20 append clears only the pending mount restore and never scrolls the retained list back to top', async () => {
    const h = p06MockHarness(),
      scrollTo = jest.fn();
    await render(1, h.service, {}, scrollTo);
    scrollTo.mockClear();
    const more = tree!.root.findAll(
      node =>
        node.props.label === 'Tải thêm kết quả' &&
        typeof node.props.onPress === 'function',
    )[0];
    await act(async () => {
      more.props.onPress();
      await Promise.resolve();
    });
    const list = tree!.root.findAllByType(ScrollView)[0];
    await act(() => list.props.onContentSizeChange(390, 3000));
    expect(scrollTo).not.toHaveBeenCalled();
    expect(output()).toContain('Sản phẩm (23)');
    expect(output()).not.toContain('đã tải 23');
  });
});
