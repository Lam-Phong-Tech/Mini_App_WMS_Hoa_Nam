import { p09CommandOwner } from '../src/features/warranty/p09Controller';
jest.mock('../src/config/p09Release', () => ({
  ...jest.requireActual('../src/config/p09Release'),
  p09DevReadEnabled: () => false,
}));
import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { StyleSheet } from 'react-native';
import { AppProviders } from '../src/app/App';
import { WarrantyIntakeScreen } from '../src/features/warranty/WarrantyIntakeScreen';
import { WarrantyCaseDetail } from '../src/features/warranty/WarrantyCaseDetail';
import { WarrantyListScreen } from '../src/features/warranty/WarrantyListScreen';
import { P09Boundary, P09Error } from '../src/features/warranty/P09Support';
import { Input } from '../src/ui/Input';
import { Button } from '../src/ui/Button';
import { P09Frame } from '../src/features/warranty/P09Presentation';
import { P09ScanEntry } from '../src/features/warranty/P09ScanEntry';
import { P09NativeCamera } from '../src/features/warranty/P09NativeCamera';
import {
  harness,
  envelope,
  resolved,
  caseRow,
  pageMeta,
  receipt,
  id,
  deferred,
} from './fixtures/p09Mock';
import { AppError } from '../src/errors/AppError';
import {
  createMemoryBackend,
  createStorage,
  setAppStorageForTesting,
} from '../src/storage/storage';
jest.mock('../src/services/geo/useGeo', () => ({
  useProvinces: () => ({ items: [], phase: 'ready', reload: jest.fn() }),
  useWards: () => ({ items: [], phase: 'ready', reload: jest.fn() }),
}));
const noDefects = async () => ({ items: [], meta: { total: 0 } });
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
const text = () => JSON.stringify(tree.toJSON());
async function press(label: string) {
  await act(async () => {
    const button = tree.root
      .findAllByType(Button)
      .find(
        b => b.props.label === label || b.props.accessibilityLabel === label,
      );
    if (button) button.props.onPress();
    else
      tree.root
        .findAllByProps({
          accessibilityRole: 'button',
          accessibilityLabel: label,
        })
        .find(node => typeof node.props.onPress === 'function')!
        .props.onPress();
  });
}
async function field(label: string, value: string) {
  await act(async () => {
    tree.root
      .findAllByType(Input)
      .find(
        b => b.props.label === label || b.props.accessibilityLabel === label,
      )!
      .props.onChangeText(value);
  });
}
async function toggleSymptom(label: string) {
  await act(() =>
    tree.root
      .findAllByProps({
        accessibilityRole: 'checkbox',
        accessibilityLabel: label,
      })
      .find(node => typeof node.props.onPress === 'function')!
      .props.onPress(),
  );
}
it('OFF boundary never mounts child hooks', async () => {
  const mount = jest.fn();
  function Child() {
    React.useEffect(mount, []);
    return null;
  }
  await render(
    <P09Boundary onBack={() => {}}>
      <Child />
    </P09Boundary>,
  );
  expect(mount).not.toHaveBeenCalled();
  expect(text()).toContain('chờ kích hoạt');
});
it.each([false, null])(
  'intake eligibility %s never enables TEMP_ONLY automatically',
  async eligible_for_warranty => {
    const h = harness(() => envelope({ ...resolved, eligible_for_warranty }));
    await render(
      <WarrantyIntakeScreen
        initialCode="serial"
        service={h.service}
        loadDefects={noDefects}
        onBack={() => {}}
        onScan={() => {}}
      />,
    );
    expect(text()).toContain('Mã chưa đủ điều kiện');
    expect(text()).not.toContain('Thông tin khách hàng');
    expect(
      tree.root
        .findAllByType(Input)
        .some(x => x.props.label === 'Lý do thiếu mã*'),
    ).toBe(false);
    expect(h.calls.filter(c => c.path.endsWith('resolve-code'))).toHaveLength(
      1,
    );
  },
);
it('camera entry hides customer inputs before, during and after failed identity lookup', async () => {
  const response = deferred<unknown>();
  const h = harness(() => response.promise);
  await render(
    <WarrantyIntakeScreen
      service={h.service}
      onBack={() => {}}
      onScan={() => {}}
    />,
  );
  expect(text()).not.toContain('Thông tin khách hàng');
  expect(text()).toContain('2. Chọn lỗi tiếp nhận');
  expect(text()).toContain('1. Xác định sản phẩm');
  expect(text()).not.toContain('Chưa có dữ liệu');
  await act(() => tree.root.findByType(P09ScanEntry).props.onRead('serial'));
  expect(text()).not.toContain('Thông tin khách hàng');
  await act(async () => response.resolve(envelope({ invalid: true })));
  expect(text()).not.toContain('Thông tin khách hàng');
  expect(h.calls.filter(c => c.path.endsWith('resolve-code'))).toHaveLength(1);
});

it('TC17 v5 intake keeps camera guidance and the owner product-lookup CTA', async () => {
  const h = harness(() => envelope(resolved));
  await render(
    <WarrantyIntakeScreen
      service={h.service}
      onBack={() => {}}
      onScan={() => {}}
      onLookup={() => {}}
    />,
  );
  expect(text()).toContain('Quét mã để tiếp nhận bảo hành');
  expect(text()).toContain('Quét hoặc nhập đúng serial thiết bị');
  expect(tree.root.findAllByType(P09NativeCamera)).toHaveLength(1);
  expect(text()).toContain('Tra cứu sản phẩm');
  expect(text()).toContain('2. Chọn lỗi tiếp nhận');
  expect(text()).toContain('3. Thông tin bổ sung');
  expect(text()).toContain('Ghi chú');
  expect(text()).not.toContain('Mô tả yêu cầu*');
  const submit = tree.root
    .findAllByType(Button)
    .find(button => button.props.label === 'Tiếp nhận bảo hành')!;
  expect(submit.props.trailing).toBeDefined();
});

it('verified eligible identity exposes missing customer inputs and retains them when changing product', async () => {
  const h = harness(() => envelope(resolved));
  await render(
    <WarrantyIntakeScreen
      initialCode="serial"
      service={h.service}
      onBack={() => {}}
      onScan={() => {}}
      resolvedPresentation={{
        item_id: resolved.item_id,
        serial_number: resolved.serial_number ?? null,
        product_name: 'Verified product',
      }}
    />,
  );
  expect(text()).toContain('Thông tin khách hàng');
  await field('Tên khách hàng*', 'Retained customer');
  await press('Đổi sản phẩm');
  expect(text()).not.toContain('Thông tin khách hàng');
  await press('Giữ sản phẩm hiện tại');
  expect(
    tree.root
      .findAllByType(Input)
      .find(n => n.props.label === 'Tên khách hàng*')!.props.value,
  ).toBe('Retained customer');
  expect(
    h.calls.filter(
      c => c.path.endsWith('warranty-cases') && c.method === 'POST',
    ),
  ).toHaveLength(0);
});
it('editing code invalidates late resolver response', async () => {
  const d = deferred<unknown>(),
    h = harness(() => d.promise);
  await render(
    <WarrantyIntakeScreen
      initialCode="first"
      service={h.service}
      loadDefects={noDefects}
      onBack={() => {}}
      onScan={() => {}}
    />,
  );
  await field('Mã sản phẩm / serial*', 'second');
  await act(async () => d.resolve(envelope(resolved)));
  expect(text()).not.toContain('Mã đủ điều kiện bảo hành');
});
it('explicit temporary intake allows optional address; saved/unloaded only retries GET', async () => {
  let fail = true;
  const h = harness(o => {
    if (o.method === 'POST') return envelope({ receipt: receipt() });
    if (fail) throw Error('offline');
    return envelope(caseRow());
  });
  await render(
    <WarrantyIntakeScreen
      onCreated={() => {}}
      initialTempOnly
      service={h.service}
      loadDefects={noDefects}
      onBack={() => {}}
      onScan={() => {}}
    />,
  );
  await field('Tên khách hàng*', 'A');
  await field('Số điện thoại*', '0100000000');
  await field('Ghi chú', 'Bệnh/lỗi: dòng do khách nhập');
  await field('Mô tả sản phẩm thủ công*', 'Offline motor');
  await press('Chọn tình trạng của thiết bị');
  await act(() =>
    tree.root
      .findAllByProps({
        accessibilityRole: 'checkbox',
        accessibilityLabel: 'Máy không lên nguồn',
      })
      .find(n => typeof n.props.onPress === 'function')!
      .props.onPress(),
  );
  await press('Đóng');
  await press('Tiếp nhận bảo hành');
  const create = tree.root
    .findAllByType(Button)
    .find(b => String(b.props.label).includes('Tạo hồ sơ'))!;
  await act(async () => {
    create.props.onPress();
    create.props.onPress();
  });
  expect(h.calls.filter(o => o.method === 'POST')).toHaveLength(1);
  expect(h.calls[0].body).not.toHaveProperty('customer_address');
  expect(
    (h.calls[0].body as Record<string, unknown> | undefined)?.description,
  ).toContain('Bệnh/lỗi: dòng do khách nhập');
  expect(text()).toContain('Đã lưu, chưa tải lại hồ sơ');
  fail = false;
  await press('Tải lại hồ sơ đã lưu');
  expect(h.calls.map(c => c.method)).toEqual(['POST', 'GET', 'GET']);
  expect(text()).toContain('Mở hồ sơ đã lưu');
});
it('detail requires canonical read, never uses list row as fallback', async () => {
  const h = harness(() => envelope(caseRow(99)));
  await render(
    <WarrantyCaseDetail
      warrantyCase={caseRow()}
      service={h.service}
      onBack={() => {}}
    />,
  );
  expect(text()).toContain('Chưa hoàn tất thao tác');
  expect(text()).not.toContain('Cập nhật xử lý');
});
it('TC18 V5 detail separates intake and repair without an inline edit/issue action', async () => {
  const h = harness(o =>
    o.path.endsWith('/' + id(4))
      ? envelope(caseRow())
      : envelope([], { ...pageMeta, total: 0 }),
  );
  await render(
    <WarrantyCaseDetail
      warrantyCase={caseRow()}
      service={h.service}
      onBack={() => {}}
      onIssueComponents={() => {}}
    />,
  );
  expect(text()).not.toContain('Thông tin chung');
  expect(text()).toContain('Linh kiện đã xuất (0)');
  expect(text()).toContain('Chưa có linh kiện đã xuất.');
  expect(text()).toContain('Thông tin tiếp nhận');
  expect(text()).not.toContain('Thông tin bảo hành');
  expect(text()).toContain('Xử lý sửa chữa');
  expect(text()).not.toContain('Xuất linh kiện →');
  expect(text()).not.toContain('Chỉnh sửa');
  const actions = tree.root
    .findAllByType(Button)
    .map(button => button.props.label);
  expect(actions).toContain('Xem linh kiện');
  expect(actions).toContain('Cập nhật xử lý');
});
it('completed opens structured handover, never a bare RETURNED/upload/stock action', async () => {
  const h = harness(o =>
    o.path.endsWith('/' + id(4))
      ? envelope({ ...caseRow(), status: 'COMPLETED' })
      : envelope([], pageMeta),
  );
  await render(
    <WarrantyCaseDetail
      warrantyCase={caseRow()}
      service={h.service}
      onBack={() => {}}
    />,
  );
  await press('Bàn giao khách hàng');
  const labels = tree.root.findAllByType(Button).map(b => b.props.label);
  expect(labels).toContain('Xác nhận bàn giao');
  expect(labels).not.toContain('Trả khách');
  expect(labels).not.toContain('Xuất linh kiện');
  expect(labels).not.toContain('Tải lên');
  expect(h.calls.filter(c => c.path.endsWith('/attachments'))).toHaveLength(1);
  expect(text()).toContain('Chờ bàn giao');
  await press('Xác nhận bàn giao');
  expect(h.calls.filter(c => c.method === 'PATCH')).toHaveLength(0);
  expect(text()).not.toContain('Bước 4 trên 4: Trả khách');
});
it('list query and scroll restored after Back using server total', async () => {
  const h = harness(() => envelope([caseRow()], { ...pageMeta, total: 87 }));
  const element = <WarrantyListScreen service={h.service} />;
  await render(element);
  await field('Tìm hồ sơ', 'serial');
  await act(async () => tree.root.findByType(Input).props.onSubmitEditing());
  await act(() => {
    tree.root.findByType(P09Frame).props.onScrollPositionChange(310);
  });
  await act(() => tree.unmount());
  await render(element);
  expect(tree.root.findByType(P09Frame).props.initialScrollY).toBe(310);
  expect(tree.root.findByType(Input).props.value).toBe('serial');
  expect(text()).toContain('87');
});
it('TC16 v5 keeps the compact list with caller Back, plain plus and honest quick-status filters', async () => {
  const h = harness(() => envelope([caseRow()], { ...pageMeta, total: 1 }));
  await render(
    <WarrantyListScreen
      service={h.service}
      onBack={jest.fn()}
      onManualEntry={jest.fn()}
      onCreateWithoutCode={jest.fn()}
      onOpenCase={jest.fn()}
    />,
  );
  expect(
    tree.root.findAllByProps({ accessibilityLabel: 'Quay lại' }),
  ).not.toHaveLength(0);
  const add = tree.root
    .findAllByProps({ accessibilityRole: 'button', accessibilityLabel: 'Tiếp nhận bảo hành' })
    .find(button => typeof button.props.onPress === 'function')!;
  expect(StyleSheet.flatten(add.props.style)).toMatchObject({
    width: 48,
    height: 48,
    backgroundColor: 'transparent',
  });
  expect(StyleSheet.flatten(add.props.style).borderRadius).toBeUndefined();
  expect(tree.root.findAllByProps({ accessibilityLabel: 'Lọc Chờ bàn giao (—)' }).length).toBeGreaterThan(0);
  expect(text()).toContain('Tất cả trạng thái (1)');
  expect(text()).toContain('Ngày tạo mới nhất');
  expect(text()).not.toContain('Lọc nhanh trạng thái');
  expect(text()).not.toContain('Mất tem/mã · Tạo hồ sơ tạm');
  expect(text()).not.toContain(caseRow().description!);
  expect(h.calls.filter(call => call.query?.per_page === 1)).toHaveLength(0);
});
it('filter dialog owns retained status, including REPAIRING beyond the four quick filters', async () => {
  const h = harness(options =>
    envelope([caseRow()], {
      ...pageMeta,
      total: options.query?.status === 'CHECKING' ? 17 : 87,
    }),
  );
  const element = <WarrantyListScreen service={h.service} />;
  await render(element);
  await press('Lọc hồ sơ bảo hành');
  await act(() =>
    tree.root
      .findAllByProps({
        accessibilityRole: 'radio',
        accessibilityLabel: 'Đang kiểm tra',
      })
      .find(node => typeof node.props.onPress === 'function')!
      .props.onPress(),
  );
  await press('Áp dụng');
  expect(text()).toContain('Đang kiểm tra (17)');
  await press('Lọc hồ sơ bảo hành');
  expect(
    tree.root.findAllByProps({
      accessibilityRole: 'radio',
      accessibilityLabel: 'Đang sửa',
    }).length,
  ).toBeGreaterThan(0);
  expect(
    tree.root
      .findAllByProps({
        accessibilityRole: 'radio',
        accessibilityLabel: 'Đang kiểm tra',
      })
      .some(node => node.props.accessibilityState?.checked),
  ).toBe(true);
  await press('Hủy');
  await act(() => tree.unmount());
  await render(element);
  await press('Lọc hồ sơ bảo hành');
  expect(
    tree.root
      .findAllByProps({
        accessibilityRole: 'radio',
        accessibilityLabel: 'Đang kiểm tra',
      })
      .some(node => node.props.accessibilityState?.checked),
  ).toBe(true);
  expect(h.calls.every(call => call.method === 'GET')).toBe(true);
});
it('list total comes from the owner page and emits no quick-count requests', async () => {
  const h = harness(() => envelope([caseRow()], { ...pageMeta, total: 87 }));
  await render(<WarrantyListScreen service={h.service} />);
  expect(text()).toContain('Tất cả trạng thái (87)');
  expect(text()).not.toContain('Lọc nhanh trạng thái');
  expect(h.calls.filter(call => call.query?.per_page === 1)).toHaveLength(0);
});
it('multiple intake symptoms stay selected across search and reopening without sending a request', async () => {
  const h = harness(() => envelope(resolved));
  const element = (
    <WarrantyIntakeScreen
      service={h.service}
      scanAvailable={false}
      onBack={() => {}}
      onScan={() => {}}
    />
  );
  await render(element);
  await press('Lỗi tiếp nhận');
  const options = () =>
    tree.root
      .findAllByProps({ accessibilityRole: 'checkbox' })
      .filter(node => typeof node.props.onPress === 'function');
  expect(options()).toHaveLength(18);
  const toggle = async (name: string) =>
    act(() =>
      options()
        .find(node => node.props.accessibilityLabel === name)!
        .props.onPress(),
    );
  await toggle('Máy không lên nguồn');
  await field('Tìm lỗi tiếp nhận', 'USB');
  await toggle('Không kết nối USB');
  await field('Tìm lỗi tiếp nhận', '');
  expect(
    options()
      .filter(node => node.props.accessibilityState?.checked)
      .map(node => node.props.accessibilityLabel),
  ).toEqual(['Máy không lên nguồn', 'Không kết nối USB']);
  await press('Đóng');
  await act(() => tree.unmount());
  await render(element);
  await press('Lỗi tiếp nhận');
  expect(
    options()
      .filter(node => node.props.accessibilityState?.checked)
      .map(node => node.props.accessibilityLabel),
  ).toEqual(['Máy không lên nguồn', 'Không kết nối USB']);
  await toggle('Máy không lên nguồn');
  expect(
    options()
      .filter(node => node.props.accessibilityState?.checked)
      .map(node => node.props.accessibilityLabel),
  ).toEqual(['Không kết nối USB']);
  expect(h.calls).toHaveLength(0);
});
it('Other coexists with known symptoms and only unchecking Other hides its retained textarea', async () => {
  const h = harness(() => envelope(resolved));
  await render(
    <WarrantyIntakeScreen
      service={h.service}
      scanAvailable={false}
      onBack={() => {}}
      onScan={() => {}}
    />,
  );
  expect(text()).not.toContain('Mô tả tình trạng khác*');
  await press('Lỗi tiếp nhận');
  await field('Tìm lỗi tiếp nhận', 'khac');
  expect(
    tree.root.findAllByProps({
      accessibilityRole: 'checkbox',
      accessibilityLabel: 'Khác',
    }).length,
  ).toBeGreaterThan(0);
  await act(() =>
    tree.root
      .findAllByProps({
        accessibilityRole: 'checkbox',
        accessibilityLabel: 'Khác',
      })
      .find(node => typeof node.props.onPress === 'function')!
      .props.onPress(),
  );
  await press('Đóng');
  await field('Mô tả tình trạng khác*', 'Biểu hiện riêng cần giữ');
  await press('Lỗi tiếp nhận');
  await act(() =>
    tree.root
      .findAllByProps({
        accessibilityRole: 'checkbox',
        accessibilityLabel: 'Máy không lên nguồn',
      })
      .find(node => typeof node.props.onPress === 'function')!
      .props.onPress(),
  );
  await press('Đóng');
  expect(
    tree.root
      .findAllByType(Input)
      .some(node => node.props.label === 'Mô tả tình trạng khác*'),
  ).toBe(true);
  await press('Lỗi tiếp nhận');
  await toggleSymptom('Khác');
  await press('Đóng');
  expect(
    tree.root
      .findAllByType(Input)
      .some(node => node.props.label === 'Mô tả tình trạng khác*'),
  ).toBe(false);
  await press('Lỗi tiếp nhận');
  await act(() =>
    tree.root
      .findAllByProps({
        accessibilityRole: 'checkbox',
        accessibilityLabel: 'Khác',
      })
      .find(node => typeof node.props.onPress === 'function')!
      .props.onPress(),
  );
  await press('Đóng');
  expect(
    tree.root
      .findAllByType(Input)
      .find(node => node.props.label === 'Mô tả tình trạng khác*')!.props.value,
  ).toBe('Biểu hiện riêng cần giữ');
  expect(h.calls).toHaveLength(0);
});
it('selected faults and Other reach the confirmed CREATE description exactly once', async () => {
  const h = harness(options =>
    options.method === 'POST'
      ? envelope({ receipt: receipt() })
      : envelope(caseRow()),
  );
  await render(
    <WarrantyIntakeScreen
      service={h.service}
      initialTempOnly
      scanAvailable={false}
      onBack={() => {}}
      onScan={() => {}}
    />,
  );
  await field('Tên khách hàng*', 'A');
  await field('Số điện thoại*', '0100000000');
  await field('Ghi chú', 'Khách báo sau vận chuyển');
  await field('Mô tả sản phẩm thủ công*', 'Máy kiểm thử local');
  await press('Lỗi tiếp nhận');
  await toggleSymptom('Máy không lên nguồn');
  await toggleSymptom('Không kết nối USB');
  await toggleSymptom('Khác');
  await press('Đóng');
  await field('Mô tả tình trạng khác*', 'Lỗi nguồn khi máy nóng');
  await press('Tiếp nhận bảo hành');
  expect(text()).toContain(
    'Máy không lên nguồn, Không kết nối USB, Lỗi nguồn khi máy nóng',
  );
  await press('Tạo hồ sơ bảo hành');
  const writes = h.calls.filter(call => call.method === 'POST');
  expect(writes).toHaveLength(1);
  expect(writes[0].body).toMatchObject({
    description:
      'Bệnh/lỗi: Máy không lên nguồn, Không kết nối USB, Lỗi nguồn khi máy nóng\nKhách báo sau vận chuyển',
  });
  expect(writes[0].body).not.toHaveProperty('defect_ids');
});
it('requires at least one fault and a nonblank Other description even alongside a known fault', async () => {
  const h = harness(() => envelope(resolved));
  await render(
    <WarrantyIntakeScreen
      service={h.service}
      initialTempOnly
      scanAvailable={false}
      onBack={() => {}}
      onScan={() => {}}
    />,
  );
  await field('Tên khách hàng*', 'A');
  await field('Số điện thoại*', '0100000000');
  await field('Ghi chú', 'Kiểm tra máy');
  await field('Mô tả sản phẩm thủ công*', 'Máy kiểm thử local');
  const submitDisabled = () =>
    tree.root
      .findAllByType(Button)
      .find(node => node.props.label === 'Tiếp nhận bảo hành')!.props.disabled;
  expect(submitDisabled()).toBe(true);
  await press('Lỗi tiếp nhận');
  await toggleSymptom('Máy không lên nguồn');
  await toggleSymptom('Khác');
  await press('Đóng');
  await field('Mô tả tình trạng khác*', '   ');
  expect(submitDisabled()).toBe(true);
  await press('Lỗi tiếp nhận');
  await toggleSymptom('Khác');
  await press('Đóng');
  expect(submitDisabled()).toBe(false);
  await press('Lỗi tiếp nhận');
  await toggleSymptom('Máy không lên nguồn');
  await press('Đóng');
  expect(submitDisabled()).toBe(true);
  expect(h.calls).toHaveLength(0);
});
it('explicit normal entry overrides retained TEMP_ONLY without deleting customer work', async () => {
  const h = harness(() => envelope(resolved));
  await render(
    <WarrantyIntakeScreen
      service={h.service}
      initialTempOnly
      onBack={() => {}}
      onScan={() => {}}
    />,
  );
  await field('Tên khách hàng*', 'Giữ bản nhập');
  await act(() => tree.unmount());
  await render(
    <WarrantyIntakeScreen
      service={h.service}
      initialTempOnly={false}
      scanAvailable={false}
      onBack={() => {}}
      onScan={() => {}}
    />,
  );
  expect(tree.root.findAllByType(P09ScanEntry)).toHaveLength(1);
  expect(
    tree.root
      .findAllByType(Input)
      .some(node => node.props.label === 'Lý do thiếu mã*'),
  ).toBe(false);
  await act(() => tree.unmount());
  await render(
    <WarrantyIntakeScreen
      service={h.service}
      initialTempOnly
      onBack={() => {}}
      onScan={() => {}}
    />,
  );
  expect(
    tree.root
      .findAllByType(Input)
      .find(node => node.props.label === 'Tên khách hàng*')!.props.value,
  ).toBe('Giữ bản nhập');
});
it.each([401, 403])(
  'auth/permission %s uses shared status owner',
  async status => {
    await render(
      <P09Error
        error={new AppError({ kind: 'http', status, message: 'denied' })}
        onBack={() => {}}
      />,
    );
    expect(text()).toContain('Dữ liệu chưa gửi không được tự động gửi lại.');
  },
);

it('camera return explicitly selects identified intake while retaining entered customer', async () => {
  const h = harness(() => envelope(resolved));
  await render(
    <WarrantyIntakeScreen
      initialTempOnly
      service={h.service}
      loadDefects={noDefects}
      onBack={() => {}}
      onScan={() => {}}
    />,
  );
  await field('Tên khách hàng*', 'Retained');
  await act(() => tree.unmount());
  await render(
    <WarrantyIntakeScreen
      initialCode="serial"
      service={h.service}
      loadDefects={noDefects}
      onBack={() => {}}
      onScan={() => {}}
    />,
  );
  expect(
    tree.root
      .findAllByType(Input)
      .some(i => i.props.accessibilityLabel === 'Mã sản phẩm / serial*'),
  ).toBe(true);
  expect(
    tree.root
      .findAllByType(Input)
      .find(i => i.props.label === 'Tên khách hàng*')!.props.value,
  ).toBe('Retained');
});

it.each(['SUCCEEDED', 'UNKNOWN'] as const)(
  'opening another case does not display original %s as its result',
  async state => {
    const h = harness(o =>
      o.method === 'PATCH'
        ? envelope({ receipt: receipt(state, { operation: 'UPDATE' }) })
        : o.path.endsWith('/' + id(4))
        ? envelope(caseRow())
        : o.path.endsWith('/' + id(8))
        ? envelope(caseRow(8))
        : envelope([], { ...pageMeta, total: 0 }),
    );
    await p09CommandOwner(h.service).confirm(() =>
      h.service.prepareUpdate(caseRow(), { note: 'Offline' }),
    );
    await render(
      <WarrantyCaseDetail
        warrantyCase={caseRow(8)}
        service={h.service}
        onBack={() => {}}
      />,
    );
    expect(text()).not.toContain('Đã cập nhật kết quả');
    if (state === 'UNKNOWN')
      expect(text()).toContain('Có yêu cầu của hồ sơ khác cần đối chiếu');
  },
);

it.each(['Xem hồ sơ →', 'Về danh sách bảo hành'])(
  'TC19 matching receipt result exits via %s without replaying the command',
  async action => {
    let version = 2;
    const onBackToList = jest.fn();
    const h = harness(o => {
      if (o.method === 'PATCH') {
        version = 3;
        return envelope({ receipt: receipt('SUCCEEDED', {
          operation: 'UPDATE', request_id: o.headers?.['X-Request-ID'], version, status: 'COMPLETED',
        }) });
      }
      return o.path.endsWith('/' + id(4))
        ? envelope({ ...caseRow(), version, status: version === 3 ? 'COMPLETED' : 'CHECKING' })
        : envelope([], { ...pageMeta, total: 0 });
    });
    await render(<WarrantyCaseDetail warrantyCase={caseRow()} service={h.service} onBack={onBackToList} />);
    await press('Cập nhật xử lý');
    await field('Kết quả kiểm tra', 'Đã kiểm tra');
    await field('Ghi chú mới / lý do hủy', 'Đã sửa chữa');
    await press('Xác nhận cập nhật');
    expect(tree.root.findByType(P09Frame).props.panel).toBe(4);
    expect(text()).toContain('Đã cập nhật kết quả');
    expect(text()).toContain('Linh kiện đã sử dụng');
    expect(text()).toContain('Chưa có dữ liệu người thực hiện');
    const resultActions = tree.root.findAllByType(Button).map(button => button.props.label);
    expect(resultActions).toContain('Xem hồ sơ →');
    expect(resultActions).toContain('Về danh sách bảo hành');
    await press(action);
    expect(onBackToList).toHaveBeenCalledTimes(action === 'Về danh sách bảo hành' ? 1 : 0);
    expect(tree.root.findByType(P09Frame).props.panel).toBe(3);
    expect(h.calls.filter(o => o.method === 'PATCH')).toHaveLength(1);
    await act(() => tree.unmount());
    await render(<WarrantyCaseDetail warrantyCase={caseRow()} service={h.service} onBack={onBackToList} />);
    expect(tree.root.findByType(P09Frame).props.panel).toBe(3);
  },
);

it('hydrated detail advanced beyond the receipt never uses the newer case as the result receipt', async () => {
  let version = 2;
  const h = harness(o => {
    if (o.method === 'PATCH') {
      version = 4;
      return envelope({
        receipt: receipt('SUCCEEDED', {
          operation: 'UPDATE',
          request_id: o.headers?.['X-Request-ID'],
          version: 3,
          status: 'COMPLETED',
        }),
      });
    }
    return o.path.endsWith('/' + id(4))
      ? envelope({
          ...caseRow(),
          version,
          status: version === 4 ? 'COMPLETED' : 'CHECKING',
        })
      : envelope([], { ...pageMeta, total: 0 });
  });
  await render(
    <WarrantyCaseDetail
      warrantyCase={caseRow()}
      service={h.service}
      onBack={() => {}}
    />,
  );
  await press('Cập nhật xử lý');
  await field('Kết quả kiểm tra', 'Đã kiểm tra');
  await field('Ghi chú mới / lý do hủy', 'Đã sửa chữa');
  await press('Xác nhận cập nhật');
  expect(tree.root.findByType(P09Frame).props.panel).toBe(3);
  expect(text()).not.toContain('Đã cập nhật kết quả');
});

it('saved-unloaded outer detail displays recovery and GET hydration restores the verified result', async () => {
  let fail = false;
  const h = harness(o => {
    if (o.method === 'PATCH') {
      fail = true;
      return envelope({
        receipt: receipt('SUCCEEDED', {
          operation: 'UPDATE',
          request_id: o.headers?.['X-Request-ID'],
          version: 3,
          status: 'COMPLETED',
        }),
      });
    }
    if (o.path.endsWith('/' + id(4))) {
      if (fail) throw Error('offline');
      return envelope({ ...caseRow(), version: 3, status: 'COMPLETED' });
    }
    return envelope([], { ...pageMeta, total: 0 });
  });
  await p09CommandOwner(h.service).confirm(() =>
    h.service.prepareUpdate(
      { ...caseRow(), status: 'CHECKING' },
      { status: 'COMPLETED', note: 'saved', confirmed_defect: 'checked' },
    ),
  );
  await render(
    <WarrantyCaseDetail
      warrantyCase={caseRow()}
      service={h.service}
      onBack={() => {}}
    />,
  );
  expect(text()).toContain('Đã lưu, chưa tải lại hồ sơ');
  fail = false;
  await press('Tải lại hồ sơ đã lưu');
  expect(tree.root.findByType(P09Frame).props.panel).toBe(4);
  expect(h.calls.filter(o => o.method === 'PATCH')).toHaveLength(1);
});

it('read-only intake disables the create CTA even if the injected transport allows writes', async () => {
  const h = harness(() => envelope(resolved));
  h.setContext({
    ...h.context(),
    user: { ...h.context().user!, permissions: ['warranty.view'] },
  });
  await render(
    <WarrantyIntakeScreen
      service={h.service}
      initialTempOnly
      onBack={() => {}}
      onScan={() => {}}
    />,
  );
  expect(
    tree.root
      .findAllByType(Button)
      .find(b => b.props.label === 'Tiếp nhận bảo hành')!.props.disabled,
  ).toBe(true);
  expect(h.calls).toHaveLength(0);
});

it('canceling update preserves the selected history tab and does not send a write', async () => {
  const h = harness(o =>
    o.path.endsWith('/' + id(4))
      ? envelope({ ...caseRow(), status: 'CHECKING' })
      : envelope([], { ...pageMeta, total: 0 }),
  );
  const element = (
    <WarrantyCaseDetail
      service={h.service}
      warrantyCase={caseRow()}
      onBack={() => {}}
    />
  );
  await render(element);
  await act(() =>
    tree.root
      .findAllByProps({
        accessibilityRole: 'tab',
        accessibilityLabel: 'Lịch sử',
      })
      .find(n => typeof n.props.onPress === 'function')!
      .props.onPress(),
  );
  await press('Cập nhật xử lý');
  await field('Ghi chú mới / lý do hủy', 'Nháp giữ nguyên');
  await press('Hủy');
  expect(
    tree.root
      .findAllByProps({
        accessibilityRole: 'tab',
        accessibilityLabel: 'Lịch sử',
      })
      .some(n => n.props.accessibilityState?.selected === true),
  ).toBe(true);
  await act(() => tree.unmount());
  await render(element);
  await press('Cập nhật xử lý');
  expect(
    tree.root
      .findAllByType(Input)
      .find(n => n.props.label === 'Ghi chú mới / lý do hủy')!.props.value,
  ).toBe('Nháp giữ nguyên');
  expect(h.calls.every(c => c.method === 'GET')).toBe(true);
});

it.each([false, true])(
  'resolved metadata binds only to the exact item and serial (%s)',
  async match => {
    const h = harness(() =>
      envelope({ ...resolved, serial_number: 'Exact serial' }),
    );
    await render(
      <WarrantyIntakeScreen
        initialCode="Exact serial"
        service={h.service}
        onBack={() => {}}
        onScan={() => {}}
        resolvedPresentation={{
          item_id: match ? resolved.item_id : id(99),
          serial_number: 'Exact serial',
          product_name: 'Product identity',
          customer_name: 'Verified customer',
          customer_phone: '0901 234 567',
        }}
      />,
    );
    if (match) {
      expect(text()).toContain('Verified customer');
      expect(
        tree.root
          .findAllByType(Input)
          .some(n => n.props.label === 'Tên khách hàng*'),
      ).toBe(false);
    } else {
      expect(
        tree.root
          .findAllByType(Input)
          .find(n => n.props.label === 'Tên khách hàng*')!.props.value,
      ).toBe('');
      expect(text()).not.toContain('Verified customer');
    }
  },
);

it('existing-case shortcut requires complete exact serial read and performs no CREATE', async () => {
  const onOpen = jest.fn();
  const row = {
    ...caseRow(),
    item_id: resolved.item_id,
    serial_number: 'S-EXACT',
    warranty_case_code: 'BH-001',
  };
  const h = harness(o =>
    o.path.endsWith('/resolve-code')
      ? envelope({
          ...resolved,
          serial_number: 'S-EXACT',
          eligible_for_warranty: false,
          active_warranty_exists: true,
        })
      : o.path.endsWith('/' + row.warranty_case_id)
      ? envelope(row)
      : envelope([row], { ...pageMeta, total: 1 }),
  );
  await render(
    <WarrantyIntakeScreen
      initialCode="S-EXACT"
      service={h.service}
      onBack={() => {}}
      onScan={() => {}}
      onOpenExisting={onOpen}
    />,
  );
  await press('Mở hồ sơ BH-001');
  expect(onOpen).toHaveBeenCalledWith(
    expect.objectContaining({ warranty_case_id: id(4) }),
  );
  expect(
    h.calls.filter(
      c => c.method === 'POST' && c.path.endsWith('/warranty-cases'),
    ),
  ).toHaveLength(0);
});

it('intake symptom composition does not erase a manually entered Bệnh/lỗi prefix', () => {
  const {
    composeP09Description,
  } = require('../src/features/warranty/WarrantyIntakeScreen');
  expect(
    composeP09Description(
      'Bệnh/lỗi: ghi chú do khách nhập\nDòng thứ hai',
      'Máy không lên nguồn',
    ),
  ).toBe(
    'Bệnh/lỗi: Máy không lên nguồn\nBệnh/lỗi: ghi chú do khách nhập\nDòng thứ hai',
  );
});

it('scan lookup displays exact catalog model and leaves missing customer data for manual entry', async () => {
  const h = harness(() => envelope(resolved));
  const load = jest.fn(async () => ({
    item_id: resolved.item_id,
    serial_number: resolved.serial_number,
    product_name: 'Model from WMS',
  }));
  await render(
    <WarrantyIntakeScreen
      service={h.service}
      onBack={() => {}}
      onScan={() => {}}
      loadResolvedPresentation={load}
    />,
  );
  await act(async () => {
    tree.root.findByType(P09ScanEntry).props.onRead('HN12345');
  });
  expect(load).toHaveBeenCalledWith(
    expect.objectContaining({ item_id: resolved.item_id }),
  );
  expect(text()).toContain('Model from WMS');
  expect(
    tree.root
      .findAllByType(Input)
      .find(i => i.props.label === 'Tên khách hàng*')!.props.value,
  ).toBe('');
  expect(h.calls.filter(c => c.method === 'POST').map(c => c.path)).toEqual([
    '/api/v1/mini-app/warranty/resolve-code',
  ]);
});
it('a late product read cannot replace the next code or customer fields', async () => {
  const pending = deferred<any>(),
    h = harness(() => envelope(resolved));
  await render(
    <WarrantyIntakeScreen
      service={h.service}
      onBack={() => {}}
      onScan={() => {}}
      loadResolvedPresentation={() => pending.promise}
    />,
  );
  await act(async () => {
    tree.root.findByType(P09ScanEntry).props.onRead('first');
  });
  await press('Đổi sản phẩm');
  await field('Mã sản phẩm / serial*', 'next');
  await act(async () => {
    pending.resolve({
      item_id: resolved.item_id,
      serial_number: resolved.serial_number,
      product_name: 'LATE MODEL',
      customer_name: 'LATE CUSTOMER',
      customer_phone: '0901234567',
    });
  });
  expect(text()).not.toContain('LATE MODEL');
  expect(text()).not.toContain('LATE CUSTOMER');
  expect(tree.root.findByType(P09ScanEntry).props.value).toBe('next');
});
