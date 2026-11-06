import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { ThemeProvider } from '../src/theme/ThemeProvider';
import { Text } from '../src/ui/Text';
import {
  P23CaseCard,
  P23SessionCard,
  P23SessionDetail,
  P23WarrantyDetail,
  P23Readable,
  P23Tabs,
  p23TimelineOrder,
  p23WarrantyStatus,
} from '../src/features/history/P23Presentation';
import type { P09Case, P09Event } from '../src/services/wms/p09Warranty';
import type {
  LinkedHistoryRead,
  ScanSessionRow,
} from '../src/services/wms/linkedHistoryRead';

let tree: Renderer.ReactTestRenderer;
const render = async (node: React.ReactElement) =>
  act(async () => {
    tree = Renderer.create(<ThemeProvider>{node}</ThemeProvider>);
  });
function text(node: any = tree.toJSON()): string {
  return node == null
    ? ''
    : typeof node === 'string' || typeof node === 'number'
    ? String(node)
    : Array.isArray(node)
    ? node.map(text).join('')
    : text(node.children);
}
const press = async (label: string) =>
  act(async () =>
    tree.root
      .findAll(
        node =>
          node.props.accessibilityLabel === label &&
          typeof node.props.onPress === 'function',
      )[0]
      .props.onPress(),
  );
const record: P09Case = {
  warranty_case_id: '23232323-2323-4232-8232-000000000010',
  warranty_case_code: 'BH-RAW-001',
  sku_name: 'Sản phẩm nguyên văn',
  serial_number: 'SN-RAW-001',
  version: 3,
  status: 'COMPLETED',
  created_at: '2026-10-28T02:00:00Z',
};
const event = (
  id: string,
  time: string | null,
  message = 'Nội dung gốc',
): P09Event => ({
  event_id: id,
  warranty_case_id: record.warranty_case_id,
  event_at: time,
  actor: { user_id: null, display_name: 'Tên từ sự kiện' },
  from_status: 'CHECKING',
  to_status: 'REPAIRING',
  message,
  message_redacted: false,
});
const batch = (): ScanSessionRow => ({
  id: '23232323-2323-4232-8232-000000000030',
  number: 'PQ-RAW-001',
  sourceType: 'COMPONENT_ISSUE',
  status: null,
  createdAt: '2026-10-28T02:00:00Z',
  startedAt: null,
  endedAt: null,
  counts: {
    total: 1,
    accepted: 0,
    duplicate: 0,
    explicitRejected: 0,
    other: 1,
    rejected: null,
    issuedQuantity: null,
    quantity: null,
  },
});
const detail = (): Awaited<ReturnType<LinkedHistoryRead['session']>> => ({
  batch: batch(),
  latestEvent: {
    id: 'event-valid',
    status: 'VALID',
    occurredAt: '2026-10-28T02:10:00Z',
    rawCode: null,
    actor: null,
    reason: null,
    serial: null,
    sku: null,
    issuedQuantity: null,
  },
  latestEventStatus: 'RECORDED',
  events: [
    {
      id: 'SCAN:event-valid',
      eventId: 'event-valid',
      status: 'VALID',
      action: 'SCAN',
      time: '2026-10-28T02:10:00Z',
    },
  ],
  timezone: 'Asia/Ho_Chi_Minh',
  total: 1,
  availableTotal: 1,
  hasMore: false,
  nextCursor: null,
  nextPage: null,
  meta: {},
});
afterEach(async () => {
  if (tree) await act(async () => tree.unmount());
});

test('case card restores code/product/serial/date hierarchy and completed means waiting handover', async () => {
  const open = jest.fn();
  await render(<P23CaseCard row={record} onOpen={open} viewed />);
  expect(text()).toContain('Chờ bàn giao');
  expect(text()).not.toContain('Hoàn tất');
  expect(text().indexOf('Sản phẩm nguyên văn')).toBeLessThan(
    text().indexOf('Serial: SN-RAW-001'),
  );
  expect(text()).toContain('28/10/2026 09:00:00');
  expect(text()).toContain('Vừa xem');
  await press('Xem quá trình bảo hành');
  expect(open).toHaveBeenCalledTimes(1);
});
test('returned case remains an exact read entry and preserves full detail identifiers', async () => {
  const value = {
    ...record,
    status: 'RETURNED' as const,
    warranty_case_code: 'BH-' + 'A'.repeat(300),
    serial_number: 'SN-' + 'B'.repeat(300),
  };
  const open = jest.fn();
  await render(<P23CaseCard row={value} onOpen={open} />);
  await press('Xem quá trình bảo hành');
  expect(open).toHaveBeenCalledTimes(1);
  await act(async () =>
    tree.update(
      <ThemeProvider>
        <P23WarrantyDetail
          record={value}
          events={[]}
          onRead={jest.fn()}
          onComponents={jest.fn()}
        />
      </ThemeProvider>,
    ),
  );
  expect(text()).toContain(value.serial_number);
  expect(text()).toContain(value.warranty_case_code);
  expect(text()).not.toContain('Xác nhận');
});
test('session card distinguishes source status/counts and does not invent issued result', async () => {
  await render(<P23SessionCard row={batch()} onOpen={jest.fn()} />);
  expect(text()).toContain('Xuất linh kiện');
  expect(text()).toContain('Được chấp nhận 0');
  expect(text()).toContain('Ngày tạo: 28/10/2026 09:00:00');
  expect(text()).not.toContain('Đã xuất');
  expect(text()).not.toContain('1 linh kiện');
});
test('partial session source retains its warning without fabricating latest or zero totals', async () => {
  await render(
    <P23SessionCard
      row={{
        ...batch(),
        latestEventStatus: 'PARTIAL_SOURCE',
        counts: { accepted: null, duplicate: null, explicitRejected: null },
      }}
      onOpen={jest.fn()}
    />,
  );
  expect(text()).toContain('Nguồn sự kiện chưa đầy đủ');
  expect(text()).toContain('Được chấp nhận —');
});
test('S04 uses metadata card/three source metrics and keeps VALID separate from ACCEPTED', async () => {
  await render(<P23SessionDetail data={detail()} onRead={jest.fn()} />);
  expect(text()).toContain('Kết quả chứng từChưa có nguồn xác minh');
  expect(text()).toContain('0Lượt được chấp nhận');
  expect(text()).toContain('—Linh kiện đã xuất');
  expect(text()).toContain('Hợp lệ');
  expect(text()).toContain('Tổng lượt đã ghi nhận: 1');
  expect(text()).not.toContain('Trạng thái phiên: Đã ghi sổ');
});
test('safe events preserve every outcome and give one missing-evidence explanation', async () => {
  const data = detail();
  data.events.push({
    id: 'SCAN:rejected',
    eventId: 'rejected',
    status: 'REJECTED',
    action: 'SCAN',
    time: null,
  });
  await render(<P23SessionDetail data={data} onRead={jest.fn()} />);
  expect(text()).toContain('Bị từ chối');
  expect(
    text().split('Mã gốc, người thao tác và số lượng từng lượt').length - 1,
  ).toBe(1);
  expect(text()).not.toContain('Mã gốc: —');
});
test('only an explicit owner capability opens the unchanged exact-case history callback', async () => {
  const components = jest.fn();
  await render(
    <P23WarrantyDetail
      record={{
        ...record,
        capabilities: {
          attachments_read: false,
          attachments_download: false,
          posted_component_issues_read: true,
        },
      }}
      events={[]}
      onRead={jest.fn()}
      onComponents={components}
    />,
  );
  await press('Linh kiện đã xuất');
  expect(components).toHaveBeenCalledWith(record.warranty_case_id);
  await act(async () =>
    tree.update(
      <ThemeProvider>
        <P23WarrantyDetail
          record={record}
          events={[]}
          onRead={jest.fn()}
          onComponents={components}
        />
      </ThemeProvider>,
    ),
  );
  expect(
    tree.root.findAll(
      node => node.props.accessibilityLabel === 'Linh kiện đã xuất',
    ),
  ).toHaveLength(0);
});
test('timeline displays a rail and source latest ID without substituting case status', async () => {
  const items = [
    event('one', '2026-10-28T01:00:00Z'),
    event('two', '2026-10-28T02:00:00Z'),
  ];
  await render(
    <P23WarrantyDetail
      record={record}
      events={items}
      meta={{ latest_recorded_event_id: 'two' }}
      onRead={jest.fn()}
      onComponents={jest.fn()}
    />,
  );
  const nodes = tree.root.findAll(
    node =>
      typeof node.props.testID === 'string' &&
      node.props.testID.startsWith('P23.event.'),
  );
  expect([...new Set(nodes.map(node => node.props.testID))]).toEqual([
    'P23.event.two',
    'P23.event.one',
  ]);
  expect(text()).toContain('Sự kiện mới nhất đã ghi nhận');
  expect(text()).toContain('Tên từ sự kiện');
  expect(text()).toContain('Đang sửa chữa');
});
test.each(['missing', 'tie', 'invalid', 'naive', 'calendar'] as const)(
  'timeline %s time keeps server order and input immutable',
  mode => {
    const first = event('one', '2026-10-28T01:00:00Z');
    const second = event(
      'two',
      mode === 'missing'
        ? null
        : mode === 'tie'
        ? first.event_at
        : mode === 'naive'
        ? '2026-10-28 01:30:00'
        : mode === 'calendar'
        ? '2026-02-30T01:30:00Z'
        : 'invalid',
    );
    const source = [first, second];
    expect(p23TimelineOrder(source)).toBe(source);
    expect(source.map(row => row.event_id)).toEqual(['one', 'two']);
  },
);
test('fully timed timeline sorts a copy newest first without changing owner events', () => {
  const source = [
    event('one', '2026-10-28T01:00:00Z'),
    event('two', '2026-10-28T02:00:00Z'),
  ];
  expect(p23TimelineOrder(source).map(row => row.event_id)).toEqual([
    'two',
    'one',
  ]);
  expect(source[0].event_id).toBe('one');
});
test('a progressive timeline retains source order so append does not prepend new rows', async () => {
  const events = [
    event('one', '2026-10-28T01:00:00Z'),
    event('two', '2026-10-28T02:00:00Z'),
  ];
  await render(
    <P23WarrantyDetail
      record={record}
      events={events}
      newestFirst={false}
      onRead={jest.fn()}
      onComponents={jest.fn()}
    />,
  );
  const ids = [
    ...new Set(
      tree.root
        .findAll(
          node =>
            typeof node.props.testID === 'string' &&
            node.props.testID.startsWith('P23.event.'),
        )
        .map(node => node.props.testID),
    ),
  ];
  expect(ids).toEqual(['P23.event.one', 'P23.event.two']);
});
test('note reader opens only after measured overflow and preserves raw Unicode/newlines', async () => {
  const raw = 'Ghi chú <nguyên văn> & Unicode\n  Dòng hai\nDòng ba';
  const read = jest.fn();
  await render(
    <P23Readable text={raw} label="nội dung sự kiện" onRead={read} />,
  );
  expect(
    tree.root.findAll(
      node => node.props.accessibilityLabel === 'Đọc đầy đủ nội dung sự kiện',
    ),
  ).toHaveLength(0);
  const measure = tree.root
    .findAllByType(Text)
    .find(node => typeof node.props.onTextLayout === 'function')!;
  await act(async () =>
    measure.props.onTextLayout({ nativeEvent: { lines: [{}, {}, {}] } }),
  );
  await press('Đọc đầy đủ nội dung sự kiện');
  expect(read).toHaveBeenCalledWith(raw);
  await act(async () =>
    measure.props.onTextLayout({ nativeEvent: { lines: [{}, {}] } }),
  );
  expect(
    tree.root.findAll(
      node => node.props.accessibilityLabel === 'Đọc đầy đủ nội dung sự kiện',
    ),
  ).toHaveLength(0);
});
test('redacted notes use source masking and do not disclose raw message', async () => {
  const value = {
    ...event('masked', null, 'PRIVATE_MESSAGE'),
    message_redacted: true,
  };
  await render(
    <P23WarrantyDetail
      record={record}
      events={[value]}
      onRead={jest.fn()}
      onComponents={jest.fn()}
    />,
  );
  expect(text()).toContain('Nội dung được che theo quyền');
  expect(text()).not.toContain('PRIVATE_MESSAGE');
});
test('rectangular tabs preserve selected accessibility state and exact filter keys', async () => {
  const select = jest.fn();
  await render(
    <P23Tabs
      chips={[
        { key: 'ALL', label: 'Tất cả' },
        { key: 'RETURNED', label: 'Đã trả khách' },
      ]}
      activeKey="ALL"
      onSelect={select}
    />,
  );
  const active = tree.root.findAll(
    node => node.props.accessibilityLabel === 'Tất cả' && node.props.onPress,
  )[0];
  expect(active.props.accessibilityState.selected).toBe(true);
  await press('Đã trả khách');
  expect(select).toHaveBeenCalledWith('RETURNED');
  expect(p23WarrantyStatus('COMPLETED')).toBe('Chờ bàn giao');
});
