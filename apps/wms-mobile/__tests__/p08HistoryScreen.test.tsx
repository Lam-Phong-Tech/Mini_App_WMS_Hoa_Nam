import React from 'react';
import { StyleSheet,View } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import { P08HistoryScreen } from '../src/features/history/P08HistoryScreen';
import { ThemeProvider } from '../src/theme/ThemeProvider';
import { Button } from '../src/ui/Button';
import { FilterChipRow } from '../src/ui/FilterChipRow';
import { Text } from '../src/ui/Text';
import { context, harness, event } from './fixtures/p08Mock';
import { id } from './fixtures/p08Mock';
import type {
  P08State,
  P08Panel,
} from '../src/features/history/p08HistoryController';
const noop = () => {};
let tree: ReturnType<typeof renderer.create>;
const text = () => JSON.stringify(tree.toJSON());
async function press(label: string) {
  await act(async () => {
    const target =
      tree.root.findAllByType(Button).find(b => b.props.label === label) ??
      tree.root.findAll(
        b =>
          b.props.accessibilityLabel === label &&
          typeof b.props.onPress === 'function',
      )[0];
    target!.props.onPress();
  });
}
afterEach(async () => {
  if (tree) await act(async () => tree.unmount());
});
describe('P08 native component with mock HTTP only', () => {
  it('direct summary returns to its caller, while drilldown returns to that summary without a synthetic list', async () => {
    const h = harness(),
      onBack = jest.fn();
    await act(async () => {
      tree = renderer.create(
        <ThemeProvider>
          <P08HistoryScreen
            context={context()}
            service={h.api}
            initialMode="summary"
            onBack={onBack}
            onOpenDocument={noop}
          />
        </ThemeProvider>,
      );
    });
    expect(text()).toContain('Tổng quan hoạt động');
    expect(
      h.calls.every(
        call =>
          !new URL(call.path, 'https://test.invalid').pathname.endsWith(
            '/records',
          ),
      ),
    ).toBe(true);
    await press('Xem Nhập kho');
    expect(text()).toContain('kết quả');
    await act(async () =>
      tree.root.findByType(require('../src/ui/Page').Page).props.onBack(),
    );
    expect(onBack).not.toHaveBeenCalled();
    expect(text()).toContain('Tổng quan hoạt động');
    await act(async () =>
      tree.root.findByType(require('../src/ui/Page').Page).props.onBack(),
    );
    expect(onBack).toHaveBeenCalledTimes(1);
  });
  it('date shortcuts/Reset edit draft only; Cancel keeps committed ALL filters', async () => {
    const h = harness();
    await act(async () => {
      tree = renderer.create(
        <ThemeProvider>
          <P08HistoryScreen
            context={context()}
            service={h.api}
            onBack={noop}
            onOpenDocument={noop}
          />
        </ThemeProvider>,
      );
    });
    const before = h.calls.length;
    await press('Bộ lọc ngày và trạng thái');
    await press('7 ngày');
    await press('Đặt lại');
    expect(h.calls.length).toBe(before);
    await press('Hủy');
    expect(h.calls.length).toBe(before);
    await press('Bộ lọc ngày và trạng thái');
    await press('30 ngày');
    await press('Áp dụng');
    expect(h.calls.length).toBe(before + 1);
    expect(h.calls.at(-1)?.path).toContain('date_mode=RANGE');
    expect(h.calls.at(-1)?.path).not.toContain('timezone=');
  });
  it('DOCUMENT partial rights do not turn a forbidden outbound group into a zero count', async () => {
    const h = harness(),
      c = context();
    c.user = {
      ...c.user,
      permissions: c.user!.permissions!.filter(p => p !== 'outbound.view'),
    };
    h.setContext(c);
    await act(async () => {
      tree = renderer.create(
        <ThemeProvider>
          <P08HistoryScreen
            context={c}
            service={h.api}
            initialMode="summary"
            onBack={noop}
            onOpenDocument={noop}
          />
        </ThemeProvider>,
      );
    });
    const groupText = tree.root
      .findAllByType(Text)
      .map(n => React.Children.toArray(n.props.children).join(''));
    expect(groupText).toContain('Không có quyền');
    expect(
      tree.root.findAll(
        node =>
          node.props.accessibilityLabel === 'Xem Xuất kho' &&
          typeof node.props.onPress === 'function',
      )[0].props.disabled,
    ).toBe(true);
  });
  it('S03 renders batch-wide counters and nullable quantity, never page length or inferred author/time', async () => {
    const h = harness((b, u) => {
      if (u.pathname.endsWith('/records')) b.data = [event(10, 'SCAN', 9)];
    });
    await act(async () => {
      tree = renderer.create(
        <ThemeProvider>
          <P08HistoryScreen
            context={context()}
            service={h.api}
            onBack={noop}
            onOpenDocument={noop}
          />
        </ThemeProvider>,
      );
    });
    await press('Xem chi tiết');
    await press('Xem phiên quét');
    expect(text()).toContain('Phiên quét · 10000000');
    expect(text()).not.toContain('SCAN · 10000000');
    expect(text()).not.toContain(id(9));
    expect(text()).toContain('Trạng thái khác');
    expect(text()).toContain('3');
    expect(text()).toContain('Số lượng: —');
    expect(text()).toContain('Người quét / bắt đầu / kết thúc / chứng từ: —');
  });
  it.each(['S01', 'S02', 'S03', 'S04'] as P08Panel[])(
    '%s loading and read failure do not render fake empty data',
    async panel => {
      const h = harness();
      let release: (() => void) | undefined;
      const failed = {
        ...h.api,
        records: jest.fn(
          () =>
            new Promise<never>((_r, reject) => {
              release = () => reject(new Error('mock unavailable'));
            }),
        ),
        detail: jest.fn(
          () =>
            new Promise<never>((_r, reject) => {
              release = () => reject(new Error('mock unavailable'));
            }),
        ),
        session: jest.fn(
          () =>
            new Promise<never>((_r, reject) => {
              release = () => reject(new Error('mock unavailable'));
            }),
        ),
        summary: jest.fn(
          () =>
            new Promise<never>((_r, reject) => {
              release = () => reject(new Error('mock unavailable'));
            }),
        ),
      };
      const retainedState: { current: P08State | undefined } = {
        current: {
          scope: h.api.scopeKey(),
          stack: [],
          current: {
            panel,
            rows: [],
            filters: { date_mode: 'ALL' },
            recordId: 'SCAN:' + id(9),
            batchId: id(9),
            loading: false,
            scrollY: 0,
          },
        },
      };
      await act(async () => {
        tree = renderer.create(
          <ThemeProvider>
            <P08HistoryScreen
              context={context()}
              service={failed}
              retainedState={retainedState}
              onBack={noop}
              onOpenDocument={noop}
            />
          </ThemeProvider>,
        );
      });
      expect(text()).toContain('Đang đọc lịch sử');
      expect(text()).not.toContain('Nguồn đã đọc không có hoạt động');
      await act(async () => release?.());
      expect(text()).toContain('Không tải được lịch sử');
      expect(text()).not.toContain('Nguồn đã đọc không có hoạt động');
      expect(text()).not.toContain('Đang tải');
    },
  );
  it('runtime without valid context fails closed; no old document snapshot or demo metrics', async () => {
    await act(async () => {
      tree = renderer.create(
        <ThemeProvider>
          <P08HistoryScreen
            context={{ session: undefined, user: undefined }}
            onBack={noop}
            onOpenDocument={noop}
          />
        </ThemeProvider>,
      );
    });
    expect(text()).toContain('Không tải được lịch sử');
    expect(text()).not.toContain('LS-0001');
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
  it('list/detail/timeline/summary all use server totals, unknown fields and Back restores', async () => {
    const h = harness();
    await act(async () => {
      tree = renderer.create(
        <ThemeProvider>
          <P08HistoryScreen
            context={context()}
            service={h.api}
            onBack={noop}
            onOpenDocument={noop}
          />
        </ThemeProvider>,
      );
    });
    expect(text()).toContain('3 kết quả');
    await press('Xem chi tiết');
    const actorRow=tree.root.findAllByType(View).find(n=>StyleSheet.flatten(n.props.style)?.minHeight===42&&n.findAllByType(Text).some(t=>t.props.children==='Người thao tác'))!;
    expect(actorRow).toBeDefined();
    expect(actorRow.findAllByType(Text).map(n=>n.props.children)).toContain('—');
    await act(async () => {
      tree.root
        .findAllByType(FilterChipRow)
        .find(x => x.props.chips[0].key === 'info')!
        .props.onSelect('timeline');
    });
    expect(text()).toContain('mock hoạt động');
    // Page Back is delegated to the controller and restores the list, not a fake first item.
    await act(async () => {
      tree.root.findByType(require('../src/ui/Page').Page).props.onBack();
    });
    expect(text()).toContain('3 kết quả');
    await act(async () => tree.unmount());
    await act(async () => {
      tree = renderer.create(
        <ThemeProvider>
          <P08HistoryScreen
            context={context()}
            service={h.api}
            initialMode="summary"
            onBack={noop}
            onOpenDocument={noop}
          />
        </ThemeProvider>,
      );
    });
    expect(text()).toContain('Phần khả dụng: ');
    expect(text()).toContain('3');
  });
  it('partial summary never substitutes availableTotal for null grandTotal; forbidden source not displayed as0', async () => {
    const h = harness((b, u) => {
      if (u.pathname.endsWith('/summary')) {
        b.data.grandTotal = null;
        b.data.coverage = 'PARTIAL';
        b.meta.sources.SCAN.status = 'PARTIAL';
        b.meta.sources.NFC.status = 'FORBIDDEN';
      }
    });
    await act(async () => {
      tree = renderer.create(
        <ThemeProvider>
          <P08HistoryScreen
            context={context()}
            service={h.api}
            initialMode="summary"
            onBack={noop}
            onOpenDocument={noop}
          />
        </ThemeProvider>,
      );
    });
    expect(text()).toContain('Dữ liệu chưa đầy đủ');
    expect(text()).toContain('Khả dụng');
    expect(text()).toContain('Không có quyền');
    expect(text()).not.toContain('Tổng cộng');
  });
  it('uses the approved compact controls and quiet P08 card boundary per panel', async () => {
    const h = harness();
    await act(async () => {
      tree = renderer.create(
        <ThemeProvider>
          <P08HistoryScreen
            context={context()}
            service={h.api}
            onBack={noop}
            onOpenDocument={noop}
          />
        </ThemeProvider>,
      );
    });
    const listChips = tree.root
      .findAllByType(FilterChipRow)
      .find(row => row.props.chips[0].key === 'ALL');
    expect(
      listChips?.props.chips.map((chip: { key: string }) => chip.key),
    ).toEqual(['ALL', 'INBOUND', 'OUTBOUND', 'WARRANTY', 'NFC']);
    expect(text()).not.toContain('Tổng quan theo ngày');
    for (const box of tree.root.findAllByType(require('../src/ui/Box').Box)) {
      if (box.props.card)
        expect(StyleSheet.flatten(box.props.style)?.elevation).toBe(0);
    }

    await act(async () => tree.unmount());
    await act(async () => {
      tree = renderer.create(
        <ThemeProvider>
          <P08HistoryScreen
            context={context()}
            service={h.api}
            initialMode="summary"
            onBack={noop}
            onOpenDocument={noop}
          />
        </ThemeProvider>,
      );
    });
    expect(
      tree.root
        .findAllByType(FilterChipRow)
        .some(row => row.props.chips[0].key === 'ALL'),
    ).toBe(false);
    expect(text()).not.toContain('Mới nhất trước');
  });
  it('keeps a long history identifier readable on two lines', async () => {
    const longLabel = 'PN-20261102090731-TEST-UI-LONG-IDENTIFIER';
    const h = harness((body, url) => {
      if (url.pathname.endsWith('/records')) body.data[1].label = longLabel;
    });
    await act(async () => {
      tree = renderer.create(
        <ThemeProvider>
          <P08HistoryScreen
            context={context()}
            service={h.api}
            onBack={noop}
            onOpenDocument={noop}
          />
        </ThemeProvider>,
      );
    });
    const title = tree.root
      .findAllByType(Text)
      .find(node => node.props.children === longLabel)!;
    expect(title).toBeDefined();
    expect(title.props.numberOfLines).toBe(2);
  });
  it('document history offers only document business filters and retains the DOCUMENT source', async () => {
    const h = harness();
    await act(async () => {
      tree = renderer.create(
        <ThemeProvider>
          <P08HistoryScreen
            context={context()}
            service={h.api}
            initialFilters={{ date_mode: 'ALL', source: 'DOCUMENT' }}
            onBack={noop}
            onOpenDocument={noop}
          />
        </ThemeProvider>,
      );
    });
    const types = tree.root
      .findAllByType(FilterChipRow)
      .find(row => row.props.chips[0].key === 'ALL')!;
    expect(types.props.chips.map((chip: { key: string }) => chip.key)).toEqual([
      'ALL',
      'INBOUND',
      'OUTBOUND',
    ]);
    await act(async () => types.props.onSelect('OUTBOUND'));
    const query = new URL(
      h.calls.filter(call => call.path.includes('/records?')).at(-1)!.path,
      'https://test.invalid',
    ).searchParams;
    expect(query.get('source')).toBe('DOCUMENT');
    expect(query.get('business')).toBe('OUTBOUND');
  });
  it('owner document callback uses exact parent; canOpen does not fabricate attachment list', async () => {
    const h = harness(),
      open = jest.fn();
    await act(async () => {
      tree = renderer.create(
        <ThemeProvider>
          <P08HistoryScreen
            context={context()}
            service={h.api}
            onBack={noop}
            onOpenDocument={open}
          />
        </ThemeProvider>,
      );
    });
    await press('Xem chi tiết');
    await press('Xem chứng từ');
    expect(open).toHaveBeenCalledWith(
      'inbound',
      event().recordId.split(':')[1],
    );
    await act(async () => {
      tree.root
        .findAllByType(FilterChipRow)
        .find(x => x.props.chips[0].key === 'info')!
        .props.onSelect('attachments');
    });
    expect(text()).toContain('Tệp đính kèm');
    await press('Mở tệp tại chứng từ');
    expect(open).toHaveBeenLastCalledWith(
      'inbound',
      event().recordId.split(':')[1],
      'files',
    );
  });
});
