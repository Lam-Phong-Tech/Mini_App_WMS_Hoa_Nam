import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { AppProviders } from '../src/app/App';
import { Button } from '../src/ui/Button';
import { Input } from '../src/ui/Input';
import { P04Icon } from '../src/features/inbound/P04Icon';
import { WarrantyListScreen } from '../src/features/warranty/WarrantyListScreen';
import { WarrantyIntakeScreen } from '../src/features/warranty/WarrantyIntakeScreen';
import { WarrantyCaseDetail } from '../src/features/warranty/WarrantyCaseDetail';
import { P09ScanEntry } from '../src/features/warranty/P09ScanEntry';
import {
  P09Value,
  P09Hero,
  p09ActorName,
} from '../src/features/warranty/P09Presentation';
import { p09CommandOwner } from '../src/features/warranty/p09Controller';
import {
  createMemoryBackend,
  createStorage,
  setAppStorageForTesting,
} from '../src/storage/storage';
import {
  harness,
  envelope,
  resolved,
  caseRow,
  pageMeta,
  receipt,
  id,
} from './fixtures/p09Mock';

jest.mock('../src/services/geo/useGeo', () => ({
  useProvinces: () => ({ items: [], phase: 'ready', reload: jest.fn() }),
  useWards: () => ({ items: [], phase: 'ready', reload: jest.fn() }),
}));
let tree: Renderer.ReactTestRenderer;
beforeEach(() => setAppStorageForTesting(createStorage(createMemoryBackend())));
afterEach(async () => {
  if (tree) await act(() => tree.unmount());
});
async function render(element: React.ReactElement) {
  await act(async () => {
    tree = Renderer.create(<AppProviders>{element}</AppProviders>);
  });
}
async function press(label: string) {
  await act(() =>
    tree.root
      .findAllByType(Button)
      .find(
        node =>
          node.props.label === label || node.props.accessibilityLabel === label,
      )!
      .props.onPress(),
  );
}
async function tab(label: string) {
  await act(() =>
    tree.root
      .findAllByProps({ accessibilityRole: 'tab', accessibilityLabel: label })
      .find(node => typeof node.props.onPress === 'function')!
      .props.onPress(),
  );
}
const json = () => JSON.stringify(tree.toJSON());

it.each([
  [true, 'Linh kiện đã xuất (3)'],
  [false, 'Linh kiện đã xuất (—)'],
])(
  'TC30 keeps quantity separate from the one POSTED document (projection=%s)',
  async (complete, heading) => {
    const row = { ...caseRow(), status: 'CHECKING' as const };
    const h = harness(options => {
      if (options.path.endsWith('/' + id(4))) return envelope(row);
      if (options.path.endsWith('/component-issues'))
        return envelope(
          [
            {
              component_issue_document_id: id(55),
              warranty_case_id: id(4),
              status: 'POSTED',
              can_open: false,
              detail_url: null,
            },
          ],
          { ...pageMeta, total: 1 },
        );
      return envelope([], { ...pageMeta, total: 0 });
    });
    await render(
      <WarrantyCaseDetail
        service={h.service}
        warrantyCase={row}
        onBack={() => {}}
        componentPresentation={
          complete
            ? {
                [id(55)]: {
                  number: 'TEST-POSTED-1',
                  postedAt: '2026-11-02T08:00:00+07:00',
                  lines: [
                    { code: 'LK-A', name: 'Verified part A', quantity: 1 },
                    { code: 'LK-B', name: 'Verified part B', quantity: 2 },
                  ],
                },
              }
            : undefined
        }
      />,
    );
    expect(json()).toContain(heading);
    if (complete) {
      expect(json()).toContain('Verified part A');
      expect(json()).toContain('Verified part B');
    } else {
      expect(json()).toContain('Chưa đủ dữ liệu số lượng linh kiện.');
      expect(json()).not.toContain('Linh kiện đã xuất (1)');
    }
  },
);

it.each([null, '', id(1)])(
  'TC18 rejects missing names and UUIDs as actor display names (%s)',
  value => {
    expect(p09ActorName(value)).toBe('Chưa có dữ liệu người thực hiện');
  },
);
it('TC18 preserves a verified display name', () => {
  expect(p09ActorName('Nguyễn An')).toBe('Nguyễn An');
});

it('TC13 keeps the camera above the exact verified product rows and exposes an optional note', async () => {
  const h = harness(() => envelope(resolved));
  await render(
    <WarrantyIntakeScreen
      service={h.service}
      initialCode="S-EXACT"
      scanAvailable={false}
      onBack={() => {}}
      onScan={() => {}}
      resolvedPresentation={{
        item_id: resolved.item_id,
        serial_number: resolved.serial_number,
        product_name: 'Exact model',
        customer_name: 'Exact customer',
        customer_phone: '0100000000',
      }}
    />,
  );
  expect(tree.root.findAllByType(P09ScanEntry)).toHaveLength(1);
  expect(json()).toContain('Thông tin sản phẩm');
  expect(json()).toContain('3. Thông tin bổ sung');
  expect(json()).toContain('1. Xác định sản phẩm');
  expect(json()).toContain('2. Chọn lỗi tiếp nhận');
  expect(
    tree.root
      .findAllByType(P09Value)
      .filter(node =>
        ['Sản phẩm', 'Serial', 'Khách hàng', 'Liên hệ'].includes(
          node.props.label,
        ),
      )
      .map(node => node.props.value),
  ).toEqual([
    'Exact model',
    resolved.serial_number,
    'Exact customer',
    '0100000000',
  ]);
  expect(
    tree.root.findAllByType(Input).some(node => node.props.label === 'Ghi chú'),
  ).toBe(true);
  expect(
    h.calls.filter(
      call => call.path.endsWith('/warranty-cases') && call.method === 'POST',
    ),
  ).toHaveLength(0);
});

it('TC12/27 uses a vector search glyph and centers a filter without a blank text label', async () => {
  const h = harness(() => envelope([caseRow()], { ...pageMeta, total: 82 }));
  await render(
    <WarrantyListScreen
      service={h.service}
      onBack={() => {}}
      onManualEntry={() => {}}
    />,
  );
  expect(
    tree.root.findAllByType(P04Icon).some(node => node.props.name === 'search'),
  ).toBe(true);
  const filter = tree.root
    .findAllByProps({
      accessibilityRole: 'button',
      accessibilityLabel: 'Lọc hồ sơ bảo hành',
    })
    .find(node => typeof node.props.onPress === 'function')!;
  expect(
    tree.root
      .findAllByType(Button)
      .some(
        node =>
          node.props.accessibilityLabel === 'Lọc hồ sơ bảo hành' &&
          node.props.label === '',
      ),
  ).toBe(false);
  await act(() => filter.props.onPress());
  expect(json()).toContain('Lọc hồ sơ bảo hành');
  expect(h.calls.filter(call => call.query?.per_page === 1)).toHaveLength(0);
  expect(json()).toContain('82');
});

it('TC17/30 has concise info rows and a right action while retained attachments stay reachable through History', async () => {
  const row = {
    ...caseRow(),
    status: 'CHECKING' as const,
    serial_number: 'SN-EXACT',
    sku_code: 'SKU-NOT-A-PN',
    accessories_received: 'Retained accessories',
    received_condition: 'Retained intake condition',
  };
  const h = harness(options =>
    options.path.endsWith('/' + id(4))
      ? envelope(row)
      : envelope([], { ...pageMeta, total: 0 }),
  );
  await render(
    <WarrantyCaseDetail
      service={h.service}
      warrantyCase={row}
      onBack={() => {}}
    />,
  );
  const labels = tree.root
    .findAllByType(P09Value)
    .map(node => node.props.label);
  expect(labels).toContain('Phụ kiện');
  expect(labels).not.toContain('Tình trạng khi nhận');
  expect(labels).not.toContain('Trạng thái');
  expect(json()).not.toContain('Tệp đính kèm');
  expect(json()).toContain('Serial:');
  const hero = tree.root.findByType(P09Hero);
  expect(
    JSON.stringify(hero.findAllByType(P09Value).map(node => node.props.value)),
  ).not.toContain('SKU-NOT-A-PN');
  await press('Xem tất cả →');
  expect(
    tree.root
      .findAllByProps({
        accessibilityRole: 'tab',
        accessibilityLabel: 'Linh kiện',
      })
      .some(node => node.props.accessibilityState?.selected),
  ).toBe(true);
  await tab('Lịch sử');
  expect(json()).toContain('Tệp đính kèm');
  expect(json()).toContain('Retained accessories');
  expect(json()).toContain('Retained intake condition');
  expect(h.calls.every(call => call.method === 'GET')).toBe(true);
});

it('TC18 never substitutes another event actor for the original command actor', async () => {
  const row = { ...caseRow(), status: 'COMPLETED' as const, version: 3 };
  const h = harness(options => {
    if (options.method === 'PATCH')
      return envelope({
        receipt: receipt('SUCCEEDED', {
          operation: 'UPDATE',
          request_id: options.headers?.['X-Request-ID'],
          version: 3,
          status: 'COMPLETED',
        }),
      });
    if (options.path.endsWith('/' + id(4))) return envelope(row);
    if (options.path.endsWith('/events'))
      return envelope(
        [
          {
            event_id: id(99),
            warranty_case_id: id(4),
            actor: { user_id: id(98), display_name: 'Different employee' },
            event_at: '2026-11-02T09:00:00+07:00',
            from_status: 'CHECKING',
            to_status: 'COMPLETED',
            message: 'Verified event of another actor',
            message_redacted: false,
          },
        ],
        { ...pageMeta, total: 1 },
      );
    return envelope([], { ...pageMeta, total: 0 });
  });
  await p09CommandOwner(h.service).confirm(() =>
    h.service.prepareUpdate(
      { ...row, version: 2, status: 'CHECKING' },
      { status: 'COMPLETED', confirmed_defect: 'Checked', note: 'Updated' },
    ),
  );
  await render(
    <WarrantyCaseDetail
      service={h.service}
      warrantyCase={row}
      onBack={() => {}}
    />,
  );
  const actor = tree.root
    .findAllByType(P09Value)
    .find(node => node.props.label === 'Người thực hiện')!;
  expect(actor.props.value).toBe('Chưa có dữ liệu người thực hiện');
  expect(actor.props.value).not.toBe(id(1));
  expect(
    tree.root
      .findAllByType(Button)
      .filter(node => node.props.label === 'Xem hồ sơ →'),
  ).toHaveLength(1);
  expect(
    tree.root
      .findAllByType(Button)
      .some(node => node.props.label === 'Về danh sách bảo hành'),
  ).toBe(true);
});
