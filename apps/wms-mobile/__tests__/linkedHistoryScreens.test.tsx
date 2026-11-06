jest.mock('../src/services/wms/linkedHistoryRead', () => ({
  createLinkedHistoryRead: jest.fn(),
}));
jest.mock('../src/services/wms/p09Warranty', () => ({
  ...jest.requireActual('../src/services/wms/p09Warranty'),
  createP09Service: jest.fn(),
}));
import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { P21ResumeScreen } from '../src/features/warranty/P21ResumeScreen';
import { P22NfcHistoryScreen } from '../src/features/history/P22NfcHistoryScreen';
import { P23WarrantySessionsScreen } from '../src/features/history/P23WarrantySessionsScreen';
import { createLinkedHistoryRead } from '../src/services/wms/linkedHistoryRead';
import { createP09Service } from '../src/services/wms/p09Warranty';
import { AppProviders } from '../src/app/App';
import { HistoryHubScreen } from '../src/features/history/HistoryHubScreen';
import { P22Frame } from '../src/features/history/P22Frame';
import { TextInput } from 'react-native';
import { AppError } from '../src/errors/AppError';
import * as nativeNfc from '../src/native/nfc';
import { clearSession, setSession } from '../src/auth/session';
import {
  createStorage,
  createMemoryBackend,
  setAppStorageForTesting,
} from '../src/storage/storage';
import {
  context as sourceContext,
  id,
  caseRow,
  deferred,
} from './fixtures/p09Mock';
const context = () => {
  const c = sourceContext();
  return { session: c.session, user: c.user };
};
let tree: Renderer.ReactTestRenderer, api: any, warranty: any;
const render = async (node: React.ReactElement) =>
  act(async () => {
    tree = Renderer.create(<AppProviders>{node}</AppProviders>);
  });
function content(node: any): string {
  return node == null
    ? ''
    : typeof node === 'string' || typeof node === 'number'
    ? String(node)
    : Array.isArray(node)
    ? node.map(content).join('')
    : content(node.children);
}
const text = () => content(tree.toJSON());
const press = async (label: string) =>
  act(async () =>
    tree.root
      .findAll(
        n =>
          typeof n.props.onPress === 'function' &&
          (n.props.accessibilityLabel === label || n.props.label === label),
      )[0]
      .props.onPress(),
  );
beforeEach(() => {
  jest.clearAllMocks();
  setAppStorageForTesting(createStorage(createMemoryBackend()));
  clearSession();
  setSession(context().session!);
  api = {
    scopeKey: () => 'verified-scope',
    tasks: jest.fn(),
    task: jest.fn(),
    taskRequest: jest.fn(),
    nfcList: jest.fn(),
    nfcSummary: jest.fn(),
    nfcDetail: jest.fn(),
    sessions: jest.fn(),
    session: jest.fn(),
  };
  warranty = {
    contextKey: () => 'verified-scope',
    list: jest.fn(),
    detail: jest.fn(),
    events: jest.fn(),
  };
  (createLinkedHistoryRead as jest.Mock).mockReturnValue(api);
  (createP09Service as jest.Mock).mockReturnValue(warranty);
});
afterEach(async () => {
  if (tree) await act(async () => tree.unmount());
  clearSession();
});
test('P21 empty page with positive source total is not no-work; never exposes RECORD', async () => {
  api.tasks.mockResolvedValue({
    items: [],
    total: 4,
    hasMore: false,
    nextPage: null,
  });
  await render(
    <P21ResumeScreen
      context={context()}
      onBack={() => {}}
      onOpenResult={() => {}}
    />,
  );
  expect(text()).toContain('Trang rỗng nhưng tổng nguồn còn dữ liệu');
  expect(text()).not.toContain('Chưa có công việc');
  expect(api.taskRequest).not.toHaveBeenCalled();
});
test('P21 existing result opens exact business UUID, not staging or document number', async () => {
  const row = {
    id: id(8),
    caseId: id(4),
    scanSessionId: id(9),
    version: 2,
    businessId: id(11),
    businessVersion: 3,
    canOpenBusiness: true,
    policy: 'OPEN_EXISTING_RESULT',
    quantity: null,
    codeCount: 600,
    number: 'XLK-offline',
  };
  api.tasks.mockResolvedValue({ items: [row], total: 1, hasMore: false });
  api.task.mockResolvedValue(row);
  const open = jest.fn();
  await render(
    <P21ResumeScreen
      context={context()}
      onBack={() => {}}
      onOpenResult={open}
    />,
  );
  await press('Xem checkpoint');
  expect(text()).toContain('Chưa xác minh linh kiện');
  await press('Mở phiếu đã ghi nhận');
  expect(open).toHaveBeenCalledWith(id(4), id(11));
});
test('P22 missing event result is not SUCCESS; server error is not empty source', async () => {
  api.nfcList.mockResolvedValue({
    items: [
      {
        recordId: 'NFC:' + id(8),
        activityId: 'NFC:' + id(9),
        type: 'Gán',
        status: null,
        uid: null,
        serial: null,
        time: null,
      },
    ],
    total: 1,
    hasMore: false,
  });
  api.nfcSummary.mockResolvedValue({ grandTotal: 1 });
  await render(<P22NfcHistoryScreen context={context()} onBack={() => {}} />);
  expect(text()).toContain('Chưa ghi nhận kết quả');
  expect(text()).not.toContain('SUCCESS');
  api.nfcList.mockRejectedValue(
    new AppError({ kind: 'http', status: 503, message: 'Nguồn chưa khả dụng' }),
  );
  await press('Đọc lại');
  expect(text()).toContain('Chưa có dữ liệu lịch sử');
  expect(text()).not.toContain('Chưa có sự kiện NFC');
});
test('P23 timeline failure stays local while case identity/current status remain visible', async () => {
  warranty.detail.mockResolvedValue({
    ...caseRow(),
    warranty_case_code: 'BH-offline',
  });
  warranty.events.mockRejectedValue(
    new AppError({
      kind: 'http',
      status: 503,
      message: 'Timeline chưa khả dụng',
    }),
  );
  await render(
    <P23WarrantySessionsScreen
      context={context()}
      kind="warranty"
      initialCaseId={id(4)}
      onBack={() => {}}
      onComponents={() => {}}
    />,
  );
  expect(text()).toContain('BH-offline');
  expect(text()).toContain('Đã tiếp nhận');
  expect(text()).not.toContain('Trạng thái hiện tại: RECEIVED');
  expect(text()).toContain('Lỗi dòng thời gian: Timeline chưa khả dụng');
  expect(text()).not.toContain('Chưa có hồ sơ');
});
test('P23 collection and events keep distinct cursor identities and null issued quantity', async () => {
  api.sessions.mockResolvedValue({
    items: [
      {
        id: id(8),
        number: 'PQ-offline',
        sourceType: null,
        status: 'RESOLVED',
        createdAt: null,
        counts: { accepted: 0, duplicate: 0, explicitRejected: null },
      },
    ],
    total: null,
    availableTotal: 1,
    hasMore: true,
    nextCursor: 'collection-cursor',
  });
  api.session.mockResolvedValue({
    batch: {
      number: 'PQ-offline',
      status: null,
      startedAt: null,
      endedAt: null,
      counts: {
        total: 0,
        accepted: 0,
        duplicate: 0,
        explicitRejected: null,
        rejected: null,
        issuedQuantity: null,
      },
    },
    events: [
      { id: 'SCAN:' + id(90), status: 'RESOLVED', action: null, time: null },
    ],
    total: 2,
    hasMore: true,
    nextCursor: 'event-cursor',
  });
  await render(
    <P23WarrantySessionsScreen
      context={context()}
      kind="sessions"
      onBack={() => {}}
      onComponents={() => {}}
    />,
  );
  expect(text()).toContain('Tổng phiên: —');
  await press('Xem thông tin phiên quét');
  expect(text()).toContain('—Linh kiện đã xuất');
  const originalSession = await api.session.mock.results[0].value;
  api.session.mockResolvedValueOnce({
    ...originalSession,
    events: [
      { id: 'SCAN:' + id(91), status: 'REJECTED', action: null, time: null },
    ],
    hasMore: false,
    nextCursor: null,
  });
  await press('Trang sự kiện tiếp theo');
  expect(api.session.mock.calls.at(-1).slice(0, 2)).toEqual([
    id(8),
    'event-cursor',
  ]);
  expect(api.sessions).toHaveBeenCalledTimes(1);
  expect(text()).toContain('Đã phân giải');
  expect(text()).toContain('Bị từ chối');
});

test('P23 warranty timeline retains the first event and offers the returned-state server filter', async () => {
  const record = { ...caseRow(), warranty_case_id: id(4) };
  warranty.list.mockResolvedValue({
    items: [record],
    meta: { total: 1, hasMore: false, nextCursor: null, nextPage: null },
  });
  warranty.detail.mockResolvedValue(record);
  const event = (n: number) => ({
    event_id: id(n),
    warranty_case_id: id(4),
    actor: { user_id: null },
    message: 'Persisted event ' + n,
    event_at: null,
    from_status: null,
    to_status: 'CHECKING',
  });
  warranty.events.mockImplementation((_id: string, q: any) =>
    Promise.resolve({
      items: [event(q.cursor ? 61 : 60)],
      meta: {
        total: 2,
        hasMore: !q.cursor,
        nextCursor: q.cursor ? null : 'case-events-2',
        nextPage: null,
      },
    }),
  );
  await render(
    <P23WarrantySessionsScreen
      context={context()}
      kind="warranty"
      onBack={() => {}}
      onComponents={() => {}}
    />,
  );
  await press('Đã trả khách');
  expect(warranty.list.mock.calls.at(-1)[0]).toMatchObject({
    page: 1,
    status: 'RETURNED',
  });
  await press('Xem quá trình bảo hành');
  await press('Trang tiếp theo');
  expect(warranty.events.mock.calls.at(-1)[1]).toMatchObject({
    cursor: 'case-events-2',
  });
  expect(text()).toContain('Persisted event 60');
  expect(text()).toContain('Persisted event 61');
  await press('Tải lại dữ liệu');
  expect(text()).toContain('Persisted event 60');
  expect(text()).toContain('Persisted event 61');
});

test('P22 result filter uses persisted summary options and preserves the other server filters', async () => {
  api.nfcList.mockResolvedValue({
    items: [],
    total: 0,
    hasMore: false,
    nextCursor: null,
  });
  api.nfcSummary.mockResolvedValue({
    grandTotal: 2,
    statusTotals: [{ status: 'OWNER_RESULT', total: 2 }],
  });
  await render(<P22NfcHistoryScreen context={context()} onBack={() => {}} />);
  await press('Thay thẻ');
  await press('Bộ lọc kết quả NFC');
  await press('OWNER_RESULT');
  await press('Áp dụng');
  expect(api.nfcList.mock.calls.at(-1)[0]).toEqual({
    type: 'REPLACE',
    status: 'OWNER_RESULT',
  });
  expect(api.nfcSummary.mock.calls.at(-1)[0]).toEqual({
    type: 'REPLACE',
    status: 'OWNER_RESULT',
  });
  await press('Bộ lọc kết quả NFC');
  await press('Chưa ghi nhận kết quả');
  await press('Áp dụng');
  expect(api.nfcList.mock.calls.at(-1)[0]).toEqual({
    type: 'REPLACE',
    status: 'UNKNOWN',
  });
  await press('Bộ lọc kết quả NFC');
  await press('Tất cả kết quả');
  await press('Áp dụng');
  expect(api.nfcList.mock.calls.at(-1)[0]).toEqual({ type: 'REPLACE' });
});

test('P23 retains collection pages and never dispatches an old cursor under a new filter', async () => {
  api.sessions.mockImplementation((q: any) =>
    Promise.resolve({
      items: [
        {
          id: id(q.cursor ? 82 : 81),
          number: q.cursor ? 'PQ-second' : 'PQ-first',
          sourceType: 'INBOUND',
          status: 'SCANNING',
          createdAt: null,
          counts: { accepted: 0, duplicate: 0, explicitRejected: null },
        },
      ],
      total: 2,
      availableTotal: 2,
      hasMore: !q.cursor,
      nextCursor: q.cursor ? null : 'collection-page-two',
    }),
  );
  await render(
    <P23WarrantySessionsScreen
      context={context()}
      kind="sessions"
      onBack={() => {}}
      onComponents={() => {}}
    />,
  );
  await press('Trang tiếp theo');
  expect(text()).toContain('PQ-first');
  expect(text()).toContain('PQ-second');
  const before = api.sessions.mock.calls.length;
  await press('Đang quét');
  const calls = api.sessions.mock.calls.slice(before);
  expect(calls.length).toBeGreaterThan(0);
  for (const [query] of calls) {
    expect(query).toMatchObject({ page: 1, status: 'SCANNING' });
    expect(query).not.toHaveProperty('cursor');
  }
});

test('P23 timeline keeps verified events during append failure and retries the original cursor', async () => {
  warranty.detail.mockResolvedValue({
    ...caseRow(),
    warranty_case_code: 'BH-retained',
  });
  let fail = true;
  warranty.events.mockImplementation((_id: string, q: any) => {
    if (q.cursor && fail)
      throw new AppError({
        kind: 'http',
        status: 503,
        message: 'Timeline temporarily unavailable',
      });
    return Promise.resolve({
      items: [
        {
          event_id: id(q.cursor ? 72 : 71),
          event_at: null,
          actor: { user_id: null },
          message: q.cursor ? 'Event second retained' : 'Event first retained',
        },
      ],
      meta: {
        total: 2,
        hasMore: !q.cursor,
        nextCursor: q.cursor ? null : 'original-event-cursor',
        nextPage: null,
      },
    });
  });
  await render(
    <P23WarrantySessionsScreen
      context={context()}
      kind="warranty"
      initialCaseId={id(4)}
      onBack={() => {}}
      onComponents={() => {}}
    />,
  );
  await press('Trang tiếp theo');
  expect(text()).toContain('Timeline temporarily unavailable');
  expect(text()).toContain('BH-retained');
  expect(text()).toContain('Event first retained');
  fail = false;
  await press('Tải lại dữ liệu');
  expect(warranty.events.mock.calls.at(-1)[1]).toMatchObject({
    cursor: 'original-event-cursor',
  });
  expect(text()).toContain('Event first retained');
  expect(text()).toContain('Event second retained');
});

test('P22 inline copy is single-flight and cannot replace a newer reader with its late notice', async () => {
  api.nfcDetail.mockResolvedValue({
    recordId: 'NFC:' + id(30),
    activityId: 'NFC:' + id(31),
    eventId: id(31),
    type: 'Gán',
    status: null,
    uid: 'UID-EXACT',
    previousUid: null,
    serial: null,
    time: null,
  });
  const pending = deferred<void>();
  const copy = jest
    .spyOn(nativeNfc, 'copyNfcIdentifier')
    .mockReturnValue(pending.promise);
  try {
    await render(
      <P22NfcHistoryScreen
        context={context()}
        initial={{ recordId: 'NFC:' + id(30), activityId: 'NFC:' + id(31) }}
        onBack={() => {}}
      />,
    );
    const handler = tree.root.findAll(
      node =>
        node.props.accessibilityLabel === 'Sao chép UID' &&
        typeof node.props.onPress === 'function',
    )[0].props.onPress;
    await act(async () => {
      handler();
      handler();
    });
    expect(copy).toHaveBeenCalledTimes(1);
    expect(copy).toHaveBeenCalledWith('UID-EXACT');
    await press('Đọc đầy đủ UID');
    await act(async () => pending.resolve());
    expect(text()).not.toContain('Đã sao chép UID');
    expect(text()).toContain('UID-EXACT');
  } finally {
    copy.mockRestore();
  }
});

test('P23 meta timezone cannot silently assign a storage zone to naive persisted timestamps', async () => {
  api.sessions.mockResolvedValue({
    items: [
      {
        id: id(8),
        number: 'PQ-offline',
        sourceType: null,
        status: null,
        createdAt: '2026-10-15 03:45:57',
        timezone: 'Asia/Ho_Chi_Minh',
        latestEvent: { occurredAt: '2026-10-15T03:45:57Z' },
        counts: { accepted: 0, duplicate: 0, explicitRejected: null },
      },
    ],
    total: 1,
    availableTotal: 1,
    hasMore: false,
  });
  await render(
    <P23WarrantySessionsScreen
      context={context()}
      kind="sessions"
      onBack={() => {}}
      onComponents={() => {}}
    />,
  );
  expect(text()).toContain('2026-10-15 03:45:57 · Múi giờ chưa xác minh');
  expect(text()).toContain('15/10/2026 10:45:57');
});

test('P23 compact controls clear query and filters independently', async () => {
  warranty.list.mockResolvedValue({items:[caseRow()],meta:{total:1,hasMore:false,nextCursor:null,nextPage:null}});
  await render(<P23WarrantySessionsScreen context={context()} kind="warranty" onBack={()=>{}} onComponents={()=>{}}/>);
  await press('Đã trả khách');
  const input=()=>tree.root.findAllByType(TextInput).find(node=>node.props.accessibilityLabel==='Mã hồ sơ hoặc serial')!;
  await act(async()=>input().props.onChangeText('SN-raw'));
  await press('Áp dụng bộ lọc');
  expect(warranty.list.mock.calls.at(-1)[0]).toMatchObject({search:'SN-raw',status:'RETURNED'});
  await press('Xóa từ khóa');
  expect(warranty.list.mock.calls.at(-1)[0]).toMatchObject({status:'RETURNED'});
  expect(warranty.list.mock.calls.at(-1)[0]).not.toHaveProperty('search');
  await act(async()=>input().props.onChangeText('SN-keep'));
  await press('Áp dụng bộ lọc');
  await press('Xóa bộ lọc');
  expect(warranty.list.mock.calls.at(-1)[0]).toMatchObject({search:'SN-keep'});
  expect(warranty.list.mock.calls.at(-1)[0]).not.toHaveProperty('status');
});

test('P23 expanded filter commits only Apply and Cancel keeps the previous owner query', async () => {
  warranty.list.mockResolvedValue({items:[caseRow()],meta:{total:1,hasMore:false,nextCursor:null,nextPage:null}});
  await render(<P23WarrantySessionsScreen context={context()} kind="warranty" onBack={()=>{}} onComponents={()=>{}}/>);
  await press('Bộ lọc lịch sử');
  const before=warranty.list.mock.calls.length;
  await press('Đang sửa chữa');
  expect(warranty.list).toHaveBeenCalledTimes(before);
  await press('Hủy');
  expect(warranty.list).toHaveBeenCalledTimes(before);
  await press('Bộ lọc lịch sử');
  await press('Chờ bàn giao');
  await press('Áp dụng');
  expect(warranty.list.mock.calls.at(-1)[0]).toMatchObject({status:'COMPLETED'});
  await press('Bộ lọc lịch sử, đang áp dụng');
  const committed=warranty.list.mock.calls.length;
  await press('Đặt lại');
  await press('Hủy');
  expect(warranty.list).toHaveBeenCalledTimes(committed);
  expect(warranty.list.mock.calls.at(-1)[0]).toMatchObject({status:'COMPLETED'});
});

test('locked hub preserves six exact GET-owner routes and returns to caller without a fake draft count', async () => {
  const open = jest.fn(),
    back = jest.fn();
  await render(
    <HistoryHubScreen onOpen={open} onBack={back} warehouseName="Kho TEST" />,
  );
  expect(text()).toContain('Xem lại công việc');
  expect(text()).toContain('KHO TEST');
  expect(text()).not.toContain('1 phiếu linh kiện');
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
    expect(open).toHaveBeenLastCalledWith(route);
  }
  await press('Về Trang chủ');
  expect(back).toHaveBeenCalledTimes(1);
});
test('NFC card opens its exact event and filters restart server cursor without filtering only loaded rows', async () => {
  const event = (n: number) => ({
    recordId: 'NFC:' + id(n),
    activityId: 'NFC:' + id(n + 1),
    eventId: id(n + 1),
    type: 'Gán',
    status: null,
    uid: 'UID-' + n,
    serial: 'SN-' + n,
    time: '2026-10-14 07:18:40+00',
  });
  api.nfcList.mockImplementation((q: any) =>
    Promise.resolve({
      items: [event(q.cursor ? 20 : 10)],
      total: 2,
      hasMore: !q.cursor,
      nextCursor: q.cursor ? null : 'cursor-original',
    }),
  );
  api.nfcSummary.mockResolvedValue({ grandTotal: 2 });
  api.nfcDetail.mockResolvedValue({
    ...event(20),
    previousUid: null,
    product: null,
    actor: null,
    warehouse: null,
    reason: null,
    tagStatus: null,
  });
  await render(<P22NfcHistoryScreen context={context()} onBack={() => {}} />);
  expect(text()).toContain('14/10/2026');
  expect(text()).toContain('14:18');
  expect(text()).not.toContain('YYYY-MM-DD');
  await press('Tải thêm sự kiện NFC');
  expect(api.nfcList.mock.calls.at(-1)[0]).toEqual({
    cursor: 'cursor-original',
  });
  await act(async () =>
    tree.root
      .findAll(
        n =>
          n.props.testID === 'P22.event.NFC:' + id(21) &&
          typeof n.props.onPress === 'function',
      )[0]
      .props.onPress(),
  );
  expect(api.nfcDetail.mock.calls.at(-1).slice(0, 2)).toEqual([
    'NFC:' + id(20),
    'NFC:' + id(21),
  ]);
  await press('Về lịch sử NFC');
  await press('Thay thẻ');
  expect(api.nfcList.mock.calls.at(-1)[0]).toEqual({ type: 'REPLACE' });
  await act(async () =>
    tree.root
      .findAllByType(TextInput)
      .find(n => n.props.accessibilityLabel === 'UID, UID cũ hoặc serial')!
      .props.onChangeText('old-uid'),
  );
  await press('Áp dụng tìm kiếm');
  expect(api.nfcList.mock.calls.at(-1)[0]).toEqual({
    type: 'REPLACE',
    keyword: 'old-uid',
  });
});
test('new history frame keeps list scroll on Back from exact NFC detail', async () => {
  api.nfcSummary.mockResolvedValue({ grandTotal: 1 });
  api.nfcList.mockResolvedValue({
    items: [
      {
        recordId: 'NFC:' + id(30),
        activityId: 'NFC:' + id(31),
        type: 'Gán',
        status: null,
        time: null,
      },
    ],
    total: 1,
    hasMore: false,
  });
  api.nfcDetail.mockResolvedValue({
    recordId: 'NFC:' + id(30),
    activityId: 'NFC:' + id(31),
    type: 'Gán',
    status: null,
    time: null,
  });
  await render(<P22NfcHistoryScreen context={context()} onBack={() => {}} />);
  act(() =>
    tree.root.findByType(P22Frame).props.onScrollPositionChange(245),
  );
  await press('Xem thao tác NFC');
  expect(tree.root.findByType(P22Frame).props.initialScrollY).toBe(0);
  await press('Về lịch sử NFC');
  expect(tree.root.findByType(P22Frame).props.initialScrollY).toBe(245);
});
