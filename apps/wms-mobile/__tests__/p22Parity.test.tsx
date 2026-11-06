jest.mock('../src/services/wms/linkedHistoryRead', () => ({
  createLinkedHistoryRead: jest.fn(),
}));
import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { Platform, ScrollView, TextInput } from 'react-native';
import { AppProviders } from '../src/app/App';
import { P22NfcHistoryScreen } from '../src/features/history/P22NfcHistoryScreen';
import { HistoryHubScreen } from '../src/features/history/HistoryHubScreen';
import { P22Frame } from '../src/features/history/P22Frame';
import { P22Outcome, P22Value } from '../src/features/history/P22Presentation';
import { P08FilterDialog } from '../src/features/history/P08FilterDialog';
import { Dialog } from '../src/ui/Dialog';
import { createLinkedHistoryRead } from '../src/services/wms/linkedHistoryRead';
import { AppError } from '../src/errors/AppError';
import * as nativeNfc from '../src/native/nfc';
import { clearSession, setSession } from '../src/auth/session';
import {
  createMemoryBackend,
  createStorage,
  setAppStorageForTesting,
} from '../src/storage/storage';
import { context as baseContext, id, deferred } from './fixtures/p09Mock';

const context = () => {
  const c = baseContext();
  return { session: c.session, user: c.user };
};
const event = (n = 11, patch = {}) => ({
  recordId: 'NFC:' + id(10),
  activityId: 'NFC:' + id(n),
  eventId: id(n),
  type: 'Gán',
  status: null,
  statusSource: 'NOT_RECORDED',
  time: '2026-10-28T08:15:30+07:00',
  uid: ' UID<>&\n長-001 ',
  previousUid: null,
  serial: ' SERIAL\n001 ',
  product: 'Sản phẩm nguồn',
  actor: null,
  warehouse: 'Kho snapshot',
  reason: null,
  tagStatus: 'ACTIVE',
  ...patch,
});
let tree: Renderer.ReactTestRenderer | undefined;
let api: any;
const render = async (child: React.ReactElement) => {
  await act(async () => {
    tree = Renderer.create(<AppProviders>{child}</AppProviders>);
  });
};
const content = (n: any): string =>
  n == null
    ? ''
    : typeof n === 'string' || typeof n === 'number'
    ? String(n)
    : Array.isArray(n)
    ? n.map(content).join('')
    : content(n.children);
const text = () => content(tree!.toJSON());
function button(label: string) {
  return tree!.root.findAll(
    n =>
      typeof n.props.onPress === 'function' &&
      (n.props.accessibilityLabel === label || n.props.label === label),
  )[0];
}
const press = async (label: string) => {
  await act(async () => {
    button(label).props.onPress();
  });
};
const open = () =>
  render(<P22NfcHistoryScreen context={context()} onBack={() => {}} />);
beforeEach(() => {
  jest.clearAllMocks();
  setAppStorageForTesting(createStorage(createMemoryBackend()));
  clearSession();
  setSession(context().session!);
  api = {
    scopeKey: () => 'TEST_P22_SCOPE',
    nfcList: jest
      .fn()
      .mockResolvedValue({ items: [event()], total: 80, hasMore: false }),
    nfcSummary: jest
      .fn()
      .mockResolvedValue({
        grandTotal: 80,
        statusTotals: [{ status: null, total: 80 }],
      }),
    nfcDetail: jest.fn().mockResolvedValue(event()),
    nfcEvent: jest.fn().mockResolvedValue(event()),
  };
  (createLinkedHistoryRead as jest.Mock).mockReturnValue(api);
});
afterEach(async () => {
  if (tree) await act(async () => tree!.unmount());
  tree = undefined;
  clearSession();
  jest.restoreAllMocks();
});

test('P22 hub retains6exactownerentries without drafts or API; title has no forced newline', async () => {
  const openOwner = jest.fn();
  await render(
    <HistoryHubScreen
      warehouseName="Kho TEST"
      onBack={() => {}}
      onOpen={openOwner}
    />,
  );
  for (const [label, route] of [
    ['Lịch sử chung', { owner: 'P08', mode: 'records' }],
    ['Tổng hợp theo ngày', { owner: 'P08', mode: 'summary' }],
    [
      'Lịch sử nhập / xuất',
      { owner: 'P08', mode: 'records', source: 'DOCUMENT' },
    ],
    ['Lịch sử NFC', { owner: 'P22' }],
    ['Lịch sử bảo hành', { owner: 'P23', kind: 'warranty' }],
    ['Lịch sử phiên quét', { owner: 'P23', kind: 'sessions' }],
  ] as const) {
    await press(label);
    expect(openOwner).toHaveBeenLastCalledWith(route);
  }
  expect(text()).toContain('Xem lại công việc đã thực hiện');
  expect(text()).not.toContain('Phiếu dở');
  expect(createLinkedHistoryRead).not.toHaveBeenCalled();
});
test('P22 list fixed dock is outside scroll; servercount80 remains different from1loaded; original-null is neutral', async () => {
  await open();
  const frame = tree!.root.findByType(P22Frame);
  expect(frame.props.dock).toBeTruthy();
  const scroll = tree!.root
    .findAllByType(ScrollView)
    .find(n => n.props.testID === 'History.scroll')!;
  expect(scroll.findAllByType(TextInput)).toHaveLength(0);
  expect(text()).toContain('80 kết quả');
  expect(text()).toContain('Đã tải 1 sự kiện · Tổng nguồn 80');
  const outcome = tree!.root.findByType(P22Outcome);
  expect(outcome.props.status).toBeNull();
  expect(text()).toContain('Chưa ghi nhận kết quả');
  expect(text()).not.toContain('Thành công');
  expect(
    scroll.findAll(n => n.props.testID === 'P22.event.NFC:' + id(11)).length,
  ).toBeGreaterThan(0);
});
test('P22 hub accepts the parent-owned locked nav without rendering a second local footer', async () => {
  await render(<HistoryHubScreen onOpen={() => {}} onBack={() => {}} footer={<P22Outcome status={null} />} />);
  expect(tree!.root.findAllByType(P22Outcome)).toHaveLength(1);
  expect(tree!.root.findByType(P22Frame).props.footerOverride).toBeTruthy();
  expect(button('Về Trang chủ')).toBeUndefined();
});
test('P22 type/date/keyword remain serverfilter; compact clear keeps otherconditions andBack retains scroll', async () => {
  await open();
  await press('Thay thẻ');
  await act(async () =>
    tree!.root
      .findByType(P08FilterDialog)
      .props.onApply({ date_mode: 'DATE', date: '2026-10-28' }),
  );
  await act(async () =>
    tree!.root.findByType(TextInput).props.onChangeText('OLD-UID'),
  );
  await press('Áp dụng tìm kiếm');
  expect(api.nfcList.mock.calls.at(-1)[0]).toEqual({
    type: 'REPLACE',
    date_mode: 'DATE',
    date: '2026-10-28',
    keyword: 'OLD-UID',
  });
  await press('Xóa từ khóa');
  expect(api.nfcList.mock.calls.at(-1)[0]).toEqual({
    type: 'REPLACE',
    date_mode: 'DATE',
    date: '2026-10-28',
  });
  act(() => tree!.root.findByType(P22Frame).props.onScrollPositionChange(145));
  await press('Xem thao tác NFC');
  expect(api.nfcDetail.mock.calls.at(-1).slice(0, 2)).toEqual([
    'NFC:' + id(10),
    'NFC:' + id(11),
  ]);
  await press('Về lịch sử NFC');
  expect(tree!.root.findByType(P22Frame).props.initialScrollY).toBe(145);
  expect(text()).toContain('Vừa xem');
});
test('P22 resultfilter draftCancel doesnotread; ApplyUNKNOWN preservesexacttype/date', async () => {
  await open();
  await press('Thay thẻ');
  const count = api.nfcList.mock.calls.length;
  await press('Bộ lọc kết quả NFC');
  await press('Chưa ghi nhận kết quả');
  await press('Hủy');
  expect(api.nfcList).toHaveBeenCalledTimes(count);
  await press('Bộ lọc kết quả NFC');
  await press('Chưa ghi nhận kết quả');
  await press('Áp dụng');
  expect(api.nfcList.mock.calls.at(-1)[0]).toEqual({
    type: 'REPLACE',
    status: 'UNKNOWN',
  });
  await press('Bỏ lọc kết quả');
  expect(api.nfcList.mock.calls.at(-1)[0]).toEqual({ type: 'REPLACE' });
});
test('P22 S03 hashero plusoneUID/Serialmetadata block andsafe description; identifiers expandable/readable', async () => {
  await open();
  await press('Xem thao tác NFC');
  expect(text()).toContain('Gán thẻ');
  const metadata = tree!.root.findAll(
    n => n.props.testID === 'P22.metadata' && typeof n.type === 'string',
  );
  expect(metadata).toHaveLength(1);
  expect(text()).toContain('Nội dung thao tác');
  expect(text()).not.toContain('Liên kết thẻ đã được xác nhận');
  expect(button('Sao chép UID')).toBeDefined();
  expect(button('Sao chép Serial')).toBeDefined();
  await press('Thông tin đối chiếu');
  await press('Đọc đầy đủ ID sự kiện');
  const notice = tree!.root
    .findAllByType(Dialog)
    .find(d => d.props.visible && d.props.title === 'Thông báo');
  expect(notice?.props.message).toBe(id(11));
});
test('P22 copyinline uses raw exactstring single-flight; reader openedmidcopy suppresseslate notice', async () => {
  const pending = deferred<void>();
  const write = jest
    .spyOn(nativeNfc, 'copyNfcIdentifier')
    .mockReturnValue(pending.promise);
  await open();
  await press('Xem thao tác NFC');
  const handler = button('Sao chép UID').props.onPress;
  await act(async () => {
    handler();
    handler();
  });
  expect(write).toHaveBeenCalledTimes(1);
  expect(write).toHaveBeenCalledWith(event().uid);
  await press('Đọc đầy đủ UID');
  await act(async () => pending.resolve());
  expect(text()).not.toContain('Đã sao chép UID');
  expect(text()).toContain(event().uid);
});
test('P22 replacement keeps originaloldnewUID in distinctgroup and no UIDfallback', async () => {
  api.nfcDetail.mockResolvedValue(
    event(11, { type: 'Thay', previousUid: 'OLD-UID', uid: 'NEW-UID' }),
  );
  await open();
  await press('Xem thao tác NFC');
  expect(text()).toContain('Thay đổi thẻ NFC');
  expect(text()).toContain('Thẻ trước');
  expect(text()).toContain('Thẻ thay thế');
  expect(button('Sao chép UID trước')).toBeDefined();
  expect(button('Sao chép UID')).toBeDefined();
  expect(text()).toContain('OLD-UID');
  expect(text()).toContain('NEW-UID');
});
test.each([
  [503, 'HISTORY_SOURCE_UNAVAILABLE', 'P22.S04', true],
  [500, 'ERROR', 'P22.S02', false],
  [403, 'FORBIDDEN', 'P22.S02', false],
])(
  'P22 status%s isnotfakeempty; onlyunavailable usesdedicated footer/retry',
  async (status, code, panel, unavailable) => {
    api.nfcList.mockRejectedValue(
      new AppError({
        kind: 'http',
        status: status as number,
        code: code as string,
        message: 'Nguồn lỗi có nguồn',
      }),
    );
    await open();
    expect(
      tree!.root.findAll(n => n.props.testID === panel).length,
    ).toBeGreaterThan(0);
    expect(text()).not.toContain('Chưa có thao tác');
    expect(text()).not.toContain('0 kết quả');
    expect(!!tree!.root.findByType(P22Frame).props.dock).toBe(!unavailable);
    if (unavailable) {
      expect(text()).toContain('Chưa có dữ liệu lịch sử');
      expect(text()).toContain('Bạn vẫn có thể sử dụng các chức năng quét mã.');
      await press('Tải lại nguồn NFC');
      expect(api.nfcList).toHaveBeenCalledTimes(2);
    }
  },
);
test('P22 confirmedempty remainsS02 andscope-null never gets success', async () => {
  api.nfcList.mockResolvedValue({ items: [], total: 0, hasMore: false });
  await open();
  expect(text()).toContain('Chưa có thao tác');
  expect(text()).toContain('0 kết quả');
  expect(text()).not.toContain('Chưa có dữ liệu lịch sử');
});
test('P22 measuredreader exposes fullrawUnicode whenvalue clipped without rewriting it', async () => {
  const raw = ' UID<>&\n' + '長'.repeat(300),
    onRead = jest.fn();
  await render(<P22Value label="UID" value={raw} onRead={onRead} />);
  const measure = tree!.root.findAll(
    n =>
      n.props.testID === 'P22.measure.UID' &&
      typeof n.props.onTextLayout === 'function',
  )[0];
  await act(async () => {
    if (Platform.OS === 'web')
      measure.props.onLayout({ nativeEvent: { layout: { height: 100 } } });
    else measure.props.onTextLayout({ nativeEvent: { lines: [{}, {}, {}] } });
  });
  await press('Xem đầy đủ UID');
  expect(onRead).toHaveBeenCalledWith(raw);
  expect(text()).toContain(raw);
});
