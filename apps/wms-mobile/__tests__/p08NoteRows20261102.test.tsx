import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { P08HistoryScreen } from '../src/features/history/P08HistoryScreen';
import { HistoryFilterBar } from '../src/features/history/HistoryFilterBar';
import { P08FilterDialog } from '../src/features/history/P08FilterDialog';
import { ThemeProvider } from '../src/theme/ThemeProvider';
import { FilterChipRow } from '../src/ui/FilterChipRow';
import { Input } from '../src/ui/Input';
import { Button } from '../src/ui/Button';
import { Page } from '../src/ui/Page';
import { P08ControlIcon } from '../src/features/history/P08Presentation';
import { context, harness, id } from './fixtures/p08Mock';

let tree: renderer.ReactTestRenderer;
const json = () => JSON.stringify(tree.toJSON());
const tabs = () =>
  tree.root
    .findAllByType(FilterChipRow)
    .find(node => node.props.chips[0].key === 'ALL')!;
const press = async (label: string) =>
  act(async () => {
    const target =
      tree.root
        .findAllByType(Button)
        .find(node => node.props.label === label) ??
      tree.root.findAll(
        node =>
          node.props.accessibilityLabel === label &&
          typeof node.props.onPress === 'function',
      )[0];
    expect(target).toBeDefined();
    target.props.onPress();
  });
async function mount(
  h = harness(),
  extra: Partial<React.ComponentProps<typeof P08HistoryScreen>> = {},
) {
  await act(async () => {
    tree = renderer.create(
      <ThemeProvider>
        <P08HistoryScreen
          context={context()}
          service={h.api}
          onBack={() => {}}
          onOpenDocument={() => {}}
          {...extra}
        />
      </ThemeProvider>,
    );
  });
  return h;
}
afterEach(async () => {
  await act(async () => tree?.unmount());
});

describe('TC_UAT_22/31 Note controls — component/mock HTTP checks only', () => {
  it('keeps plain Note tab labels, a separate server total, Back and date/status/sort controls', async () => {
    const onBack = jest.fn();
    await mount(harness(), { onBack });
    expect(tree.root.findByType(Input).props.placeholder).toBe(
      'Tìm theo mã phiếu, serial, người thao tác',
    );
    expect(tabs().props.chips.map((chip: {label:string}) => chip.label)).toEqual(['Tất cả','Nhập kho','Xuất kho','Bảo hành','NFC']);
    const bar = tree.root.findByType(HistoryFilterBar);
    expect(bar.props.total).toBe(3);
    expect(bar.props.statusLabel).toBe('Tất cả trạng thái');
    expect(typeof bar.props.onStatus).toBe('function');
    expect(typeof bar.props.onSort).toBe('function');
    expect(
      tree.root
        .findAllByType(P08ControlIcon)
        .some(node => node.props.name === 'search'),
    ).toBe(true);
    await act(async () => tree.root.findByType(Page).props.onBack());
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('selects the business on the server without fetching or decorating a tab count', async () => {
    const h = harness();
    await mount(h, {
      initialFilters: {
        date_mode: 'RANGE',
        from: '2026-10-01',
        to: '2026-10-10',
        source: 'DOCUMENT',
        keyword: 'PN',
        status: 'POSTED',
      },
    });
    await act(async () => tabs().props.onSelect('OUTBOUND'));
    expect(tabs().props.chips.map((chip:{label:string})=>chip.label)).toEqual(['Tất cả','Nhập kho','Xuất kho']);
    expect(h.calls.filter(call => call.path.includes('/summary?'))).toHaveLength(0);
    const records = new URL(
      h.calls.filter(call => call.path.includes('/records?')).at(-1)!.path,
      'https://test.invalid',
    ).searchParams;
    expect(records.get('business')).toBe('OUTBOUND');
    expect(records.get('source')).toBe('DOCUMENT');
    expect(records.get('keyword')).toBe('PN');
    expect(records.get('status')).toBe('POSTED');
    expect(records.get('from')).toBe('2026-10-01');
    expect(records.get('to')).toBe('2026-10-10');
    expect(json()).toContain('3 kết quả');
  });

  it('opens the date and status sections independently, preserving the committed query until Apply', async () => {
    const h = await mount();
    const before = h.calls.length;
    await act(async () =>
      tree.root.findByType(HistoryFilterBar).props.onStatus(),
    );
    expect(tree.root.findByType(P08FilterDialog).props.section).toBe('status');
    await press('Hủy');
    await act(async () =>
      tree.root.findByType(HistoryFilterBar).props.onDates(),
    );
    expect(tree.root.findByType(P08FilterDialog).props.section).toBe('dates');
    await press('Hủy');
    expect(h.calls).toHaveLength(before);
  });

  it('sort affordance describes the supported server order without reordering one page or issuing a new query', async () => {
    const h = await mount();
    const before = h.calls.length;
    await act(async () =>
      tree.root.findByType(HistoryFilterBar).props.onSort(),
    );
    expect(json()).toContain('Sắp xếp lịch sử');
    expect(json()).toContain('Mới nhất trước');
    await press('Xong');
    expect(h.calls).toHaveLength(before);
  });

  it('list uses the actual business label and compact minutes; detail retains the action and exact timestamp', async () => {
    await mount();
    expect(json()).not.toContain('Hoạt động khác');
    expect(json()).toContain('10/10/2026 08:00');
    expect(json()).not.toContain('10/10/2026 08:00:00');
    await press('Xem chi tiết');
    expect(json()).toContain('10/10/2026 08:00:00');
  });
  it('uses the confirmed warehouse caption and retains the exact parent route without treating a shortened UUID as a document number', async () => {
    const h = harness();
    const c = context();
    const open=jest.fn();
    c.user = { ...c.user!, available_warehouses: c.user!.available_warehouses!.map(warehouse => ({ ...warehouse, name: 'Kho xác nhận' })) };
    h.setContext(c);
    await mount(h, { context: c,onOpenDocument:open });
    expect(json()).toContain('Kho xác nhận');
    expect(json()).not.toContain('Chứng từ · 10000000');
    await press('Xem chi tiết');
    await press('Xem chứng từ');
    expect(open).toHaveBeenCalledWith('inbound',id(9));
    const copy=tree.root.findAll(n=>n.props.accessibilityLabel==='Sao chép mã chứng từ')[0];
    expect(copy.props.disabled).toBe(true);
  });

  it('drops unavailable facet counts instead of replacing them with the filtered total or loaded page', async () => {
    const h = harness();
    await mount(h, {
      initialFilters: { date_mode: 'ALL', business: 'INBOUND' },
      service: {
        ...h.api,
        summary: async () => {
          throw new Error('facet unavailable');
        },
      },
    });
    expect(tabs().props.chips[0].label).toBe('Tất cả');
    expect(json()).toContain('3 kết quả');
    expect(json()).not.toContain('Không tải được lịch sử');
  });

  it('keeps the tab label plain when switching back to All without requesting a facet', async () => {
    const h = harness();
    await mount(h, {
      initialFilters: { date_mode: 'ALL', business: 'INBOUND' },
    });
    expect(tabs().props.chips[0].label).toBe('Tất cả');
    await act(async () => tabs().props.onSelect('ALL'));
    expect(tabs().props.chips[0].label).toBe('Tất cả');
    expect(h.calls.filter(call=>call.path.includes('/summary?'))).toHaveLength(0);
  });
  it('keeps plain tabs across an auth-session scope change without fetching an All facet', async () => {
    const h = harness();
    await mount(h, { initialFilters: { date_mode: 'ALL', business: 'INBOUND' } });
    const next = context();
    next.session = { ...next.session!, authSessionId: id(77) };
    next.user = { ...next.user!, auth_session_id: id(77) };
    h.setContext(next);
    await act(async () => tree.update(<ThemeProvider><P08HistoryScreen context={next}
      service={h.api} onBack={() => {}} onOpenDocument={() => {}} /></ThemeProvider>));
    expect(tabs().props.chips[0].label).toBe('Tất cả');
    expect(h.calls.filter(call=>call.path.includes('/summary?'))).toHaveLength(0);
  });
});
