import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { P08FilterDialog } from '../src/features/history/P08FilterDialog';
import { ThemeProvider } from '../src/theme/ThemeProvider';
import { Button } from '../src/ui/Button';
import { FilterChipRow } from '../src/ui/FilterChipRow';
import { Dialog } from '../src/ui/Dialog';
import { Input } from '../src/ui/Input';
import type { P08Filters } from '../src/services/wms/p08Types';
jest.mock('../src/auth/serverClock', () => ({
  serverNow: () => Date.parse('2026-10-10T05:00:00Z'),
}));
let tree: ReturnType<typeof renderer.create>;
const apply = jest.fn(),
  cancel = jest.fn();
async function mount(
  filters: P08Filters = { date_mode: 'ALL' },
  timezone: string | undefined = 'Asia/Ho_Chi_Minh',
  extra: Partial<React.ComponentProps<typeof P08FilterDialog>> = {},
) {
  await act(async () => {
    tree = renderer.create(
      <ThemeProvider>
        <P08FilterDialog
          visible
          filters={filters}
          timezone={timezone}
          onApply={apply}
          onCancel={cancel}
          {...extra}
        />
      </ThemeProvider>,
    );
  });
}
async function press(label: string) {
  await act(async () => {
    const button = tree.root
      .findAllByType(Button)
      .find(n => (n.props.accessibilityLabel || n.props.label) === label);
    if (button) button.props.onPress();
    else
      tree.root
        .findAll(
          n =>
            n.props.accessibilityLabel === label &&
            typeof n.props.onPress === 'function',
        )[0]
        .props.onPress();
  });
}
async function mode(key: string) {
  await act(async () =>
    tree.root
      .findAllByType(FilterChipRow)
      .find(
        n => n.props.chips[0].key === 'ALL' && n.props.chips[1].key === 'DATE',
      )!
      .props.onSelect(key),
  );
}
const json = () => JSON.stringify(tree.toJSON());
afterEach(async () => {
  await act(async () => tree?.unmount());
  jest.clearAllMocks();
});
describe('P08 unified native filter dialog, mock clock only', () => {
  it('uses Vietnamese source labels with unchanged exact source values', async () => {
    await mount();
    const source = tree.root.findAllByType(FilterChipRow)[0];
    expect(
      source.props.chips.find((c: { key: string }) => c.key === 'DOCUMENT')
        .label,
    ).toBe('Chứng từ');
    await act(async () => source.props.onSelect('DOCUMENT'));
    await press('Áp dụng');
    expect(apply).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'DOCUMENT', date_mode: 'ALL' }),
    );
  });
  it('initial RANGE fields show today, Reset is a button with the brand variant and edits drafts only', async () => {
    await mount();
    await mode('RANGE');
    expect(json()).toContain('Từ ngày: 10/10/2026');
    expect(json()).toContain('Đến ngày: 10/10/2026');
    await press('Đặt lại');
    expect(apply).not.toHaveBeenCalled();
    await press('Áp dụng');
    expect(apply).toHaveBeenCalledWith(
      expect.objectContaining({
        date_mode: 'RANGE',
        from: '2026-10-10',
        to: '2026-10-10',
      }),
    );
    const reset = tree.root
      .findAllByType(Button)
      .find(n => n.props.label === 'Đặt lại')!;
    expect(reset.props.variant).not.toBe('secondary');
  });
  it('calendar Today navigates only and does not change either endpoint or call Apply', async () => {
    await mount({ date_mode: 'RANGE', from: '2026-08-28', to: '2026-09-09' });
    await press('Từ ngày: 28/08/2026');
    await press('Hôm nay');
    expect(json()).toContain('Tháng ');
    expect(json()).toContain('2026');
    expect(apply).not.toHaveBeenCalled();
    await press('Quay lại');
    expect(json()).toContain('Từ ngày: 28/08/2026');
    expect(json()).toContain('Đến ngày: 09/09/2026');
    await press('Áp dụng');
    expect(apply).toHaveBeenCalledWith(
      expect.objectContaining({ from: '2026-08-28', to: '2026-09-09' }),
    );
  });
  it('uses one Modal and Back from picker returns to the same draft', async () => {
    await mount();
    await mode('RANGE');
    await press('Từ ngày: 10/10/2026');
    expect(tree.root.findAllByType(Dialog)).toHaveLength(1);
    await act(async () => tree.root.findByType(Dialog).props.onDismiss());
    expect(json()).toContain('Bộ lọc lịch sử');
    expect(cancel).not.toHaveBeenCalled();
    await act(async () => tree.root.findByType(Dialog).props.onDismiss());
    expect(cancel).toHaveBeenCalledTimes(1);
  });
  it('cannot select From later than To; calendar selection changes only From', async () => {
    await mount({ date_mode: 'RANGE', from: '2026-10-01', to: '2026-10-09' });
    await press('Từ ngày: 01/10/2026');
    const future = tree.root.findAll(
      n => n.props.accessibilityLabel === 'Chọn 10/10/2026',
    )[0];
    expect(future.props.disabled).toBe(true);
    await act(async () => future.props.onPress());
    expect(json()).toContain('Chọn ngày bắt đầu');
    await press('Chọn 08/10/2026');
    expect(json()).toContain('Từ ngày: 08/10/2026');
    expect(json()).toContain('Đến ngày: 09/10/2026');
    await press('Áp dụng');
    expect(apply).toHaveBeenCalledWith(
      expect.objectContaining({ from: '2026-10-08', to: '2026-10-09' }),
    );
  });
  it('cannot select To before From, future, or day91; day90 stays available', async () => {
    await mount({ date_mode: 'RANGE', from: '2026-07-13', to: '2026-10-10' });
    await press('Đến ngày: 10/10/2026');
    expect(
      tree.root.findAll(
        n => n.props.accessibilityLabel === 'Chọn 11/10/2026',
      )[0].props.disabled,
    ).toBe(true);
    await press('Tháng trước');
    await press('Tháng trước');
    await press('Tháng trước');
    expect(
      tree.root.findAll(
        n => n.props.accessibilityLabel === 'Chọn 12/07/2026',
      )[0].props.disabled,
    ).toBe(true);
    expect(
      tree.root.findAll(
        n => n.props.accessibilityLabel === 'Chọn 13/07/2026',
      )[0].props.disabled,
    ).toBe(false);
  });
  it('Apply rejects stale/inverted persisted dates; ALL can still view older history without date queries', async () => {
    await mount({ date_mode: 'RANGE', from: '2026-10-10', to: '2026-10-09' });
    await press('Áp dụng');
    expect(apply).not.toHaveBeenCalled();
    await mode('ALL');
    await press('Áp dụng');
    expect(apply.mock.calls[0][0]).toEqual(
      expect.objectContaining({ date_mode: 'ALL' }),
    );
    expect(apply.mock.calls[0][0]).not.toHaveProperty('from');
    expect(apply.mock.calls[0][0]).not.toHaveProperty('to');
  });
  it('clear status on source change; no fabricated status enum', async () => {
    await mount({ date_mode: 'ALL', status: 'SUBMITTED' });
    await act(async () =>
      tree.root.findAllByType(FilterChipRow)[0].props.onSelect('NFC'),
    );
    expect(tree.root.findByType(Input).props.value).toBe('');
    await press('Hủy');
    expect(apply).not.toHaveBeenCalled();
  });
  it('without verified timezone shortcuts and date fields fail closed', async () => {
    await mount({ date_mode: 'ALL' }, 'Invalid/Timezone');
    await mode('RANGE');
    expect(
      tree.root.findAllByType(Button).find(n => n.props.label === 'Đặt lại')!
        .props.disabled,
    ).toBe(true);
    expect(
      tree.root.findAll(
        n => n.props.accessibilityLabel === 'Từ ngày: Chọn ngày',
      )[0].props.disabled,
    ).toBe(true);
    await press('Áp dụng');
    expect(apply).not.toHaveBeenCalled();
  });
  it('date-only Reset keeps document scope and exact status while resetting dates to today', async () => {
    await mount(
      {
        date_mode: 'ALL',
        source: 'DOCUMENT',
        business: 'OUTBOUND',
        status: 'POSTED',
        keyword: 'PX',
      },
      'Asia/Ho_Chi_Minh',
      { section: 'dates', sourcesVisible: false },
    );
    expect(json()).not.toContain('Nguồn hoạt động');
    expect(tree.root.findAllByType(Input)).toHaveLength(0);
    await press('Đặt lại');
    await press('Áp dụng');
    expect(apply).toHaveBeenCalledWith({
      date_mode: 'RANGE',
      from: '2026-10-10',
      to: '2026-10-10',
      source: 'DOCUMENT',
      business: 'OUTBOUND',
      status: 'POSTED',
      keyword: 'PX',
    });
  });
  it('status-only Reset preserves both endpoints, source, business and keyword', async () => {
    await mount(
      {
        date_mode: 'RANGE',
        from: '2026-10-01',
        to: '2026-10-09',
        source: 'DOCUMENT',
        business: 'INBOUND',
        status: 'POSTED',
        keyword: 'PN',
      },
      'Asia/Ho_Chi_Minh',
      { section: 'status', sourcesVisible: false },
    );
    expect(json()).not.toContain('Khoảng thời gian');
    await press('Đặt lại');
    await press('Áp dụng');
    expect(apply).toHaveBeenCalledWith({
      date_mode: 'RANGE',
      from: '2026-10-01',
      to: '2026-10-09',
      source: 'DOCUMENT',
      business: 'INBOUND',
      status: undefined,
      keyword: 'PN',
    });
  });
});
