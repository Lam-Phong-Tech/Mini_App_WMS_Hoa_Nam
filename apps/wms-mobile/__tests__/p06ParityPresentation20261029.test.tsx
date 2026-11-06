/** P06 parity regression: presentation changes must preserve owner data and gates. */
import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { Image, Platform, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '../src/theme/ThemeProvider';
import { P06LookupScreen } from '../src/features/lookup/P06LookupScreen';
import { P06DesignProvider, p06Design, P06SurfaceGradient } from '../src/features/lookup/P06Design';
import {HN_UI} from '../src/theme/uiKitV3';
import {
  P06EventRow,
  P06Hero,
  P06Photo,
  P06Pair,
} from '../src/features/lookup/P06Presentation';
import { BottomNav } from '../src/ui/BottomNav';
import { setSession } from '../src/auth/session';
import {
  createMemoryBackend,
  createStorage,
  setAppStorageForTesting,
} from '../src/storage/storage';
import { p06ScopeKey, type P06Event } from '../src/services/wms/p06Catalog';
import {
  mockId,
  p06MockCard,
  p06MockHarness,
  p06MockSession,
  p06MockStock,
} from '../src/web/p06ReviewFixtures';
import { resetHardwareBackForTest } from '../src/app/useHardwareBack';

// Leave time for the first RN mount while the parent verifies other boards.
jest.setTimeout(30000);

let tree: Renderer.ReactTestRenderer | undefined;
function text(value: any): string {
  if (typeof value === 'string' || typeof value === 'number')
    return String(value);
  if (Array.isArray(value)) return value.map(text).join('');
  return value?.children ? text(value.children) : '';
}
const output = () => text(tree!.toJSON());
function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SafeAreaProvider>
      <ThemeProvider>{children}</ThemeProvider>
    </SafeAreaProvider>
  );
}
async function mount(
  panel: 1 | 2 | 3 | 4,
  scenario: Parameters<typeof p06MockHarness>[0] = 'ready',
) {
  const h = p06MockHarness(scenario);
  await act(async () => {
    tree = Renderer.create(
      <Providers>
        <P06LookupScreen
          service={h.service}
          onScan={jest.fn()}
          initialViewState={{
            scopeKey: p06ScopeKey(p06MockSession),
            query: '',
            mode: 'keyword',
            category: 'PRODUCT',
            status: 'ACTIVE',
            panel,
            identity: panel > 1 ? { type: 'SKU', id: mockId(100) } : undefined,
            source: 'ALL',
            scroll: { 1: 0, 2: 0, 3: 0, 4: 0 },
          }}
        />
      </Providers>,
    );
    await Promise.resolve();
    await new Promise<void>(resolve => setTimeout(resolve, 0));
  });
  return h;
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

describe('P06 parity29/10 — no live or visual acceptance claim', () => {
  it('warehouse-only S03 does not promise bin-level allocation and preserves the four source quantities', async () => {
    const h = await mount(3);
    expect(output()).toContain('Tồn tại Kho Hoa Nam (mock)');
    expect(output()).toContain('Phạm vi tồn kho');
    expect(output()).not.toContain('Tồn kho theo vị trí');
    expect(output()).toContain('Chưa có dữ liệu tồn theo ô/kệ/khay.');
    expect(output()).not.toContain('A-01-03');
    const strip = tree!.root
      .findAllByType(View)
      .find(n => n.props.testID === 'p06-stock-strip')!;
    const values = strip.findAllByType(Text).map(n => text(n.props));
    expect(values).toEqual([
      'Tổng tồn',
      '12',
      'Khả dụng',
      '10',
      'Đang giữ',
      '1',
      'Không khả dụng',
      '1',
    ]);
    expect(h.calls.some(c => c.path.endsWith('/stock'))).toBe(true);
    const slots = strip
      .findAllByType(View)
      .filter(
        n => StyleSheet.flatten(n.props.style)?.justifyContent === 'center',
      );
    expect(slots).toHaveLength(4);
  });
  it('INCOMPLETE retains its warning and nullable quantities are not repaired to fit the reference', async () => {
    await mount(3, 'incomplete');
    expect(output()).toContain('Tồn chưa được xác nhận');
    const strip = tree!.root
      .findAllByType(View)
      .find(n => n.props.testID === 'p06-stock-strip')!;
    expect(strip.findAllByType(Text).map(n => text(n.props))).toEqual([
      'Tổng tồn',
      '—',
      'Khả dụng',
      '—',
      'Đang giữ',
      '—',
      'Không khả dụng',
      '—',
    ]);
  });
  it('compact S01 metadata preserves exact SKU/null serial/server totals without wide-space forced wrapping', async () => {
    const h = await mount(1);
    expect(output()).toContain('SKU: XP-420B  |  SN: —');
    expect(output()).toContain('Kho Hoa Nam (mock)  |  Vị trí: Chưa xác nhận');
    expect(output()).not.toContain('\u3000');
    expect(output()).toContain('Sản phẩm (23)');
    expect(output()).not.toContain('23 SKU phù hợp');
    expect(tree!.root.findAllByType(Image)).toHaveLength(0);
    expect(h.cards[0].item_id).toBeNull();
  });
  it('S02 still reads source master/null fields and keeps print/warranty action gates', async () => {
    await mount(2);
    for (const label of ['Nhóm sản phẩm', 'Thương hiệu', 'Mô tả'])
      expect(
        tree!.root.findAllByType(P06Pair).find(n => n.props.label === label)
          ?.props.value == null,
      ).toBe(true);
    for (const label of ['In tem', 'Bảo hành']) {
      const actions = tree!.root.findAll(
        n =>
          n.props.accessibilityRole === 'button' &&
          n.props.accessibilityState?.disabled === true &&
          n.findAllByType(Text).some(t => t.props.children === label),
      );
      expect(actions.length).toBeGreaterThan(0);
    }
    const footer = tree!.root.findByType(BottomNav);
    expect(footer.props.highlightScan).toBe(true);
    expect(footer.props.activeKey).toBe('scan');
  });
  it('REVERSAL gets a display label without changing signed quantity, date, source or document identity', async () => {
    const h = p06MockHarness();
    const event: P06Event = {
      ...h.events[0],
      event_type: 'REVERSAL',
      signed_quantity: -20,
    };
    const original = JSON.stringify(event),
      onPress = jest.fn();
    await act(() => {
      tree = Renderer.create(
        <P06DesignProvider width={494}>
          <P06EventRow event={event} onPress={onPress} />
        </P06DesignProvider>,
      );
    });
    expect(output()).toContain('Đảo bút toán');
    expect(output()).toContain('Đã ghi nhận');
    expect(output()).not.toContain('Thành công');
    expect(output()).toContain('-20');
    expect(output()).toContain(event.document!.number);
    await act(() =>
      tree!.root
        .findAll(
          n =>
            n.props.testID === 'p06-event' &&
            typeof n.props.onPress === 'function',
        )[0]
        .props.onPress(),
    );
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(event)).toBe(original);
  });
  it('positive WARRANTY remains quantity-not-applicable rather than the fixture movement -1', async () => {
    const event = p06MockHarness().events.find(e => e.source === 'WARRANTY')!;
    await act(() => {
      tree = Renderer.create(
        <P06DesignProvider width={494}>
          <P06EventRow event={event} />
        </P06DesignProvider>,
      );
    });
    expect(output()).toContain('Không áp dụng');
    expect(event.signed_quantity).toBeNull();
  });
  it.each([
    ['RECEIPT',20,'Thành công','+20'],
    ['ISSUE',-2.5,'Thành công','-2,5'],
    ['RECEIPT',null,'Đã ghi nhận','—'],
    ['ISSUE',0,'Đã ghi nhận','0'],
    ['OPENING',1,'Đã ghi nhận','+1'],
    ['ADJUSTMENT',-1,'Đã ghi nhận','-1'],
  ] as const)('labels ledger %s with quantity %s without changing the persisted event',async(event_type,signed_quantity,label,quantityText)=>{
    const base=p06MockHarness().events.find(e=>e.source==='LEDGER')!;
    const event:P06Event={...base,event_type,signed_quantity,to_status:null};
    const original=JSON.stringify(event),read=jest.fn();
    await act(()=>{tree=Renderer.create(<P06DesignProvider width={494}><P06EventRow event={event} onRead={read}/></P06DesignProvider>);});
    expect(output()).toContain(label);
    expect(output()).not.toContain(label==='Thành công'?'Đã ghi nhận':'Thành công');
    expect(output()).toContain(quantityText);
    const reader=tree!.root.findAll(n=>n.props.testID==='p06-event-read'&&typeof n.props.onPress==='function')[0];
    await act(()=>reader.props.onPress({stopPropagation:jest.fn()}));
    expect(read.mock.calls[0][0]).toContain(`Ghi nhận: ${label}`);
    expect(JSON.stringify(event)).toBe(original);
  });
  it.each([['CHECKING','Đã ghi nhận'],['COMPLETED','Thành công']] as const)('uses this event to_status=%s rather than the current document status',async(to_status,label)=>{
    const base=p06MockHarness().events.find(e=>e.source==='WARRANTY')!;
    const event:P06Event={...base,to_status,document:base.document?{...base.document,current_status:'COMPLETED'}:null};
    const original=JSON.stringify(event);
    await act(()=>{tree=Renderer.create(<P06DesignProvider width={494}><P06EventRow event={event}/></P06DesignProvider>);});
    expect(output()).toContain(label);
    if(to_status!=='COMPLETED')expect(output()).not.toContain('Thành công');
    expect(JSON.stringify(event)).toBe(original);
  });
  it('compact description retains full historical/current values in a reader without navigating',async()=>{
    const base=p06MockHarness().events.find(e=>e.source==='WARRANTY')!;
    const event:P06Event={...base,from_status:'CHECKING',to_status:'COMPLETED',document:base.document?{...base.document,current_status:'RETURNED'}:null};
    const open=jest.fn(),read=jest.fn(),stopPropagation=jest.fn();
    await act(()=>{tree=Renderer.create(<P06DesignProvider width={494}><P06EventRow event={event} onPress={open} onRead={read}/></P06DesignProvider>);});
    const reader=tree!.root.findAll(n=>n.props.testID==='p06-event-read'&&typeof n.props.onPress==='function')[0];
    expect(reader).toBeDefined();
    await act(()=>reader.props.onPress({stopPropagation}));
    expect(read).toHaveBeenCalledTimes(1);
    expect(read.mock.calls[0][0]).toContain('CHECKING → COMPLETED');
    expect(read.mock.calls[0][0]).toContain('RETURNED');
    if(event.document)expect(read.mock.calls[0][0]).toContain(event.document.number);
    expect(stopPropagation).toHaveBeenCalled();expect(open).not.toHaveBeenCalled();
  });
  it('hero and list use the same source image without substituting an asset to match the board', async () => {
    const source = { uri: 'data:image/png;base64,UI_ONLY_TEST' };
    await act(() => {
      tree = Renderer.create(
        <P06DesignProvider width={494}>
          <P06Photo source={source} />
          <P06Hero card={p06MockCard()} stock={p06MockStock()} panel={2} />
        </P06DesignProvider>,
      );
    });
    expect(tree!.root.findAllByType(Image).map(n => n.props.source)).toEqual([
      source,
    ]);
    expect(tree!.root.findByType(P06Hero).findAllByType(P06SurfaceGradient)[0].props.to).toBe(HN_UI.selected);
    expect(tree!.root.findAllByType(P06Photo)[0].findByType(P06SurfaceGradient).props.to).toBe(HN_UI.canvas);
    expect(output()).toContain('Chưa có ảnh');
    expect(output()).toContain('SKU: XP-420B  |  SN: —');
  });
  it.each([494, 360])(
    'source typography/stock geometry scales at %ipx without shrinking the shared footer',
    width => {
      const s = p06Design(width).s,
        factor = width / 494;
      expect(s.eventTop.flexWrap).toBe('nowrap');
      expect(s.eventResult.width).toBeCloseTo(112*factor);
      expect(s.header.height).toBeCloseTo(92 * factor);
      expect(s.stockLabelSlot.minHeight).toBeCloseTo(36 * factor);
      expect(s.card.minHeight).toBeCloseTo(118 * factor);
      expect(s.cardChip.paddingVertical).toBeCloseTo(3 * factor);
      expect(s.title.fontWeight).toBe(
        Platform.OS === 'android' ? '700' : '600',
      );
    },
  );
});
