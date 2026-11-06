import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { Keyboard, Modal, TextInput, Text, View } from 'react-native';
import { P03Dialog } from '../src/features/scan/P03Dialog';
import { P05FormChoice } from '../src/features/outbound/P05FormChoice';
import { P05CreateNativeFlow } from '../src/features/outbound/P05CreateNativeFlow';
import { createP05CreateOwner } from '../src/features/outbound/p05CreateOwner';
import { AppProviders } from '../src/app/App';
import { Button } from '../src/ui/Button';
import { createStorage, createMemoryBackend } from '../src/storage/storage';
import type { P05CreateService } from '../src/services/wms/p05Create';
import { p05ChoicePlacement } from '../src/features/outbound/p05ChoicePlacement';
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

test('group dialog keeps several checked names until Apply and discards them on Cancel', () => {
  const change = jest.fn(),
    single = jest.fn();
  let tree!: Renderer.ReactTestRenderer;
  act(() => {
    tree = Renderer.create(
      <AppProviders>
        <P05FormChoice
          label="Nhóm hàng *"
          value="a"
          presentation="dialog"
          options={[
            { id: 'a', name: 'Nhóm A' },
            { id: 'b', name: 'Nhóm B' },
            { id: 'c', name: 'Nhóm C' },
          ]}
          onChange={single}
          {...{ multiple: true, values: ['a'], onChangeMultiple: change }}
        />
      </AppProviders>,
    );
  });
  const tap = (label: string) =>
    act(() =>
      tree.root
        .findAll(
          n => n.props.accessibilityLabel === label && !!n.props.onPress,
        )[0]!
        .props.onPress(),
    );
  const action = (label: string) =>
    act(() =>
      tree.root
        .findAllByType(Button)
        .find(n => n.props.label === label)!
        .props.onPress(),
    );
  tap('Nhóm hàng');
  const checks = () =>
    tree.root.findAll(
      n => n.props.accessibilityRole === 'checkbox' && !!n.props.onPress,
    );
  expect(checks()).toHaveLength(3);
  tap('Nhóm B');
  expect(change).not.toHaveBeenCalled();
  expect(
    checks()
      .filter(n => n.props.accessibilityState.checked)
      .map(n => n.props.accessibilityLabel),
  ).toEqual(['Nhóm A', 'Nhóm B']);
  action('Áp dụng');
  expect(change.mock.calls).toEqual([[['a', 'b']]]);
  expect(single).not.toHaveBeenCalled();
  tap('Nhóm hàng');
  tap('Nhóm C');
  action('Hủy');
  expect(change).toHaveBeenCalledTimes(1);
  act(() => tree.unmount());
});

test('multi-group search keeps hidden checks and Back discards edits while long selected names retain a full reader', () => {
  const initial = 'Nhóm A dài ✓ '.repeat(40),
    read = jest.fn();
  function Choice() {
    const [values, setValues] = React.useState(['a']);
    return (
      <P05FormChoice
        label="Nhóm hàng *"
        value={values[0] ?? ''}
        multiple
        values={values}
        onChangeMultiple={setValues}
        onChange={() => {}}
        onRead={read}
        presentation="dialog"
        options={[
          { id: 'a', name: initial },
          { id: 'b', name: 'Nhóm B' },
          { id: 'c', name: 'Nhóm C' },
          ...Array.from({ length: 4 }, (_, i) => ({
            id: String(i),
            name: 'Khác ' + i,
          })),
        ]}
      />
    );
  }
  let tree!: Renderer.ReactTestRenderer;
  act(() => {
    tree = Renderer.create(
      <AppProviders>
        <Choice />
      </AppProviders>,
    );
  });
  const tap = (label: string) =>
    act(() =>
      tree.root
        .findAll(
          n => n.props.accessibilityLabel === label && !!n.props.onPress,
        )[0]!
        .props.onPress(),
    );
  const search = (text: string) =>
    act(() => tree.root.findByType(TextInput).props.onChangeText(text));
  tap('Nhóm hàng');
  search('Nhóm B');
  tap('Nhóm B');
  search('Nhóm C');
  tap('Nhóm C');
  act(() =>
    tree.root
      .findAllByType(Button)
      .find(n => n.props.label === 'Áp dụng')!
      .props.onPress(),
  );
  expect(
    tree.root.findAll(n => n.props.testID === 'p05-choice-value')[0]!.props
      .children,
  ).toBe(initial + ', Nhóm B, Nhóm C');
  tap('Nhóm hàng');
  search('Nhóm B');
  tap('Nhóm B');
  act(() => tree.root.findByType(Modal).props.onRequestClose());
  expect(
    tree.root.findAll(n => n.props.testID === 'p05-choice-value')[0]!.props
      .children,
  ).toBe(initial + ', Nhóm B, Nhóm C');
  // Same native measurement callback used by real long fields.
  const measured = tree.root.findAll(
    n =>
      n.props.onTextLayout && n.props.children === initial + ', Nhóm B, Nhóm C',
  )[0]!;
  act(() =>
    measured.props.onTextLayout({ nativeEvent: { lines: [{}, {}, {}] } }),
  );
  tap('Xem đầy đủ Nhóm hàng');
  expect(read.mock.calls).toEqual([
    ['Nhóm hàng', initial + '\nNhóm B\nNhóm C'],
  ]);
  act(() => tree.unmount());
});
test('floating choice filters, selects exact identity, closes on Back and never changes via dismissal', () => {
  const change = jest.fn();
  const dismissKeyboard = jest.spyOn(Keyboard, 'dismiss');
  let tree!: Renderer.ReactTestRenderer;
  act(() => {
    tree = Renderer.create(
      <AppProviders>
        <P05FormChoice
          label="Người nhận *"
          value="a"
          presentation="dialog"
          options={[
            { id: 'a', name: 'Đại lý A' },
            { id: 'b', name: 'Đại lý B' },
            ...Array.from({ length: 5 }, (_, i) => ({
              id: String(i),
              name: 'Lựa chọn ' + i,
            })),
          ]}
          onChange={change}
        />
      </AppProviders>,
    );
  });
  const anchor = tree.root.find(
    n => n.props.collapsable === false && !!n.instance?.measureInWindow,
  ).instance;
  anchor.measureInWindow = (
    cb: (x: number, y: number, w: number, h: number) => void,
  ) => cb(16, 230, 380, 48);
  const tap = (label: string) =>
    act(() =>
      tree.root
        .findAll(
          n => n.props.accessibilityLabel === label && !!n.props.onPress,
        )[0]
        .props.onPress(),
    );
  tap('Người nhận');
  expect(tree.root.findByType(Modal).props.visible).toBe(true);
  dismissKeyboard.mockClear();
  act(() => tree.root.findByType(TextInput).props.onChangeText('B'));
  expect(dismissKeyboard).not.toHaveBeenCalled();
  expect(
    tree.root
      .findAll(n => n.props.accessibilityRole === 'radio' && !!n.props.onPress)
      .map(n => n.props.accessibilityLabel),
  ).toEqual(['Đại lý B']);
  tap('Đại lý B');
  expect(dismissKeyboard).toHaveBeenCalledTimes(1);
  expect(change).not.toHaveBeenCalled();
  act(() =>
    tree.root
      .findAllByType(Button)
      .find(n => n.props.label === 'Áp dụng')!
      .props.onPress(),
  );
  expect(change.mock.calls).toEqual([['b']]);
  expect(tree.root.findByType(Modal).props.visible).toBe(false);
  tap('Người nhận');
  act(() => tree.root.findByType(Modal).props.onRequestClose());
  expect(change.mock.calls).toHaveLength(1);
  act(() => tree.unmount());
  dismissKeyboard.mockRestore();
});

test.each(['Tỉnh/Thành phố *', 'Phường/Xã *'])(
  '%s retains the same search input and query across keyboard show/hide',
  label => {
    const callbacks = new Map<string, (event: any) => void>();
    const listener = jest
      .spyOn(Keyboard, 'addListener')
      .mockImplementation((name, callback) => {
        callbacks.set(name, callback);
        return { remove: () => callbacks.delete(name) };
      });
    const change = jest.fn();
    let tree!: Renderer.ReactTestRenderer;
    act(() => {
      tree = Renderer.create(
        <P05FormChoice
          label={label}
          value=""
          options={Array.from({ length: 12 }, (_, i) => ({
            id: String(i),
            name: i === 0 ? 'Hà Nội' : `Lựa chọn ${i}`,
          }))}
          contentViewport={{ x: 0, y: 124, width: 411, height: 678 }}
          onChange={change}
        />,
      );
    });
    tree.root.find(
      n => n.props.collapsable === false && !!n.instance?.measureInWindow,
    ).instance.measureInWindow = (cb: (...v: number[]) => void) =>
      cb(19, 600, 374, 48);
    act(() =>
      tree.root
        .findAll(
          n =>
            n.props.accessibilityLabel === label.replace(' *', '') &&
            !!n.props.onPress,
        )[0]
        .props.onPress(),
    );
    const input = tree.root.findByType(TextInput);
    act(() => input.props.onChangeText('ha noi'));
    act(() =>
      callbacks.get('keyboardDidShow')!({
        endCoordinates: { screenY: 438, height: 395 },
      }),
    );
    expect(tree.root.findByType(TextInput)).toBe(input);
    expect(input.props.value).toBe('ha noi');
    expect(tree.root.findByType(Modal).props.visible).toBe(true);
    expect(
      tree.root.findAll(n => n.props.testID === 'p05-anchored-popup').length,
    ).toBeGreaterThan(0);
    act(() => callbacks.get('keyboardDidHide')!({}));
    expect(tree.root.findByType(TextInput)).toBe(input);
    expect(input.props.value).toBe('ha noi');
    expect(change).not.toHaveBeenCalled();
    act(() => tree.unmount());
    listener.mockRestore();
  },
);
test('province popup is anchored to control, has no extra title/close row, filters accents without changing height/side', () => {
  let tree!: Renderer.ReactTestRenderer;
  const options = Array.from({ length: 12 }, (_, i) => ({
    id: String(i),
    name: i === 0 ? 'Thành phố Hồ Chí Minh' : 'Tỉnh mẫu ' + i,
  }));
  act(() => {
    tree = Renderer.create(
      <P05FormChoice
        label="Tỉnh/Thành phố *"
        value="0"
        options={options}
        onChange={() => {}}
        contentViewport={{ x: 0, y: 124, width: 411, height: 678 }}
      />,
    );
  });
  const anchor = tree.root.find(
    n => n.props.collapsable === false && !!n.instance?.measureInWindow,
  ).instance;
  anchor.measureInWindow = (cb: (...v: number[]) => void) =>
    cb(19, 600, 374, 48);
  act(() =>
    tree.root
      .findAll(
        n =>
          n.props.accessibilityLabel === 'Tỉnh/Thành phố' && !!n.props.onPress,
      )[0]
      .props.onPress(),
  );
  const popup = () =>
    tree.root.findAll(n => n.props.testID === 'p05-anchored-popup')[0].props
      .style;
  const before = JSON.stringify(popup());
  act(() => tree.root.findByType(TextInput).props.onChangeText('ho chi minh'));
  expect(JSON.stringify(popup())).toBe(before);
  expect(
    tree.root
      .findAll(n => n.props.accessibilityRole === 'radio' && !!n.props.onPress)
      .map(n => n.props.accessibilityLabel),
  ).toEqual(['Thành phố Hồ Chí Minh']);
  expect(
    tree.root.findAll(
      n => n.props.accessibilityLabel === 'Đóng danh sách Tỉnh/Thành phố *',
    ),
  ).toHaveLength(0);
  expect(JSON.stringify(tree.toJSON())).not.toContain(
    'Mã phiếu sẽ được server cấp sau khi ghi nhận thành công.',
  );
  expect(JSON.stringify(tree.toJSON())).not.toContain('Đang soạn');
  act(() => tree.unmount());
});
test('popup stays within the form body and keeps its chosen side while resizing', () => {
  const a = { x: 19, y: 680, width: 374, height: 48 },
    v = { width: 411, height: 890, top: 124, bottom: 88 };
  const p = p05ChoicePlacement(a, v, 300)!;
  expect(p.side).toBe('above');
  expect(p.width).toBe(a.width);
  expect(p.top + p.height).toBe(a.y - 6);
  expect(p.top).toBeGreaterThanOrEqual(v.top);
  expect(p05ChoicePlacement({ ...a, y: 50 }, v, 300)).toBeNull();
  const later = p05ChoicePlacement(a, v, 300, p.side)!;
  expect(later).toEqual(p);
});
test('long selected choice has a separate full reader and does not nest buttons or truncate stored data', () => {
  const raw = 'Đại lý ' + '長'.repeat(500),
    read = jest.fn();
  let tree!: Renderer.ReactTestRenderer;
  act(() => {
    tree = Renderer.create(
      <P05FormChoice
        label="Người nhận *"
        value="a"
        options={[{ id: 'a', name: raw }]}
        onChange={() => {}}
        onRead={read}
      />,
    );
  });
  const measurement = tree.root
    .findAllByType(Text)
    .find(n => !!n.props.onTextLayout)!;
  act(() =>
    measurement.props.onTextLayout({ nativeEvent: { lines: [{}, {}, {}] } }),
  );
  const reader = tree.root.findAll(
    n =>
      n.props.accessibilityLabel === 'Xem đầy đủ Người nhận' &&
      !!n.props.onPress,
  )[0];
  act(() => reader.props.onPress());
  expect(read).toHaveBeenCalledWith('Người nhận', raw);
  expect(reader.parent?.props.accessibilityRole).not.toBe('button');
  act(() => tree.unmount());
});
test('full create S01 is editable, has no source select, guards dependent geography, validates raw quantity and phone', async () => {
  const scope = { actorId: id(1), authSessionId: id(2), warehouseId: id(3) },
    execute = jest.fn(),
    owner = createP05CreateOwner({
      storage: createStorage(createMemoryBackend()),
      uuid: (() => {
        let n = 100;
        return () => id(++n);
      })(),
      getScope: () => scope,
      geo: {
        provinces: async () => ({
          items: [{ code: '79', name: 'TP.HCM' }],
          stale: false,
        }),
        wards: async () => ({
          items: [{ code: '79001', name: 'Phường A' }],
          stale: false,
        }),
      },
      service: {
        baseUrl: 'isolated',
        context: async () => ({
          actor_id: scope.actorId,
          auth_session_id: scope.authSessionId,
          active_warehouse_id: scope.warehouseId,
          warehouse_context: { status: 'READY' },
          available_warehouses: [
            {
              warehouse_id: scope.warehouseId,
              name: 'Kho test',
              status: 'ACTIVE',
            },
          ],
          permissions: { read: true, save: true, record: true, cancel: true },
          record: { reconcile_mode: 'P03_LINKED' },
          address_contract: {
            format: 'TEXT',
            structured_codes_supported: false,
          },
        }),
        catalogue: async () => ({
          recipients: [],
          groups: ['Nhóm thật'],
          skuGroups: {},
        }),
        execute,
      } as unknown as P05CreateService,
    });
  let tree!: Renderer.ReactTestRenderer;
  await act(async () => {
    tree = Renderer.create(
      <AppProviders>
        <P05CreateNativeFlow owner={owner} onExit={() => {}} />
      </AppProviders>,
    );
  });
  expect(
    tree.root.findAll(n => n.props.accessibilityLabel === 'Chọn phiếu nguồn'),
  ).toHaveLength(0);
  expect(
    tree.root
      .findAllByType(Text)
      .some(n => n.props.children === 'Địa chỉ trong danh mục'),
  ).toBe(false);
  for (const view of tree.root.findAllByType(View))
    expect(
      (view.children ?? [])
        .filter(c => typeof c === 'string')
        .every(c => c === ''),
    ).toBe(true);
  const input = (label: string) =>
    tree.root
      .findAllByType(TextInput)
      .find(n => n.props.accessibilityLabel === label)!;
  expect(
    tree.root
      .findAllByType(TextInput)
      .some(n => n.props.accessibilityLabel === 'Địa chỉ chi tiết'),
  ).toBe(true);
  expect(
    tree.root.findAll(
      n => n.props.accessibilityLabel === 'Địa chỉ giao' && !!n.props.onPress,
    ),
  ).toHaveLength(0);
  expect(input('Địa chỉ chi tiết').props.editable).toBe(false);
  expect(input('Số lượng cần soạn').props.value).toBe('1');
  await act(async () => input('Số lượng cần soạn').props.onChangeText('1e2'));
  await act(async () =>
    input('Số điện thoại').props.onChangeText('0901234567x'),
  );
  await act(async () =>
    tree.root
      .findAllByType(Button)
      .find(n => n.props.label === 'Bắt đầu soạn hàng')!
      .props.onPress(),
  );
  expect(JSON.stringify(tree.toJSON())).toContain('Nhập số nguyên từ 1 đến 99');
  expect(owner.snapshot().form.phone).toBe('0901234567');
  expect(execute).not.toHaveBeenCalled();
  const addressDone = tree.root
    .findAllByType(Button)
    .find(n => n.props.label === 'Xong');
  if (addressDone) await act(async () => addressDone.props.onPress());
  await act(async () =>
    tree.root
      .findAll(
        n => n.props.accessibilityLabel === 'Quay lại' && !!n.props.onPress,
      )[0]
      .props.onPress(),
  );
  const exit = tree.root
    .findAllByType(P03Dialog)
    .find(n => n.props.visible && n.props.panel === 'S02')!;
  expect(exit.props.actions.map((n: { label: string }) => n.label)).toEqual([
    'Tiếp tục phiếu',
    'Lưu nháp và thoát',
    'Bỏ phiếu',
    'Hủy',
  ]);
  await act(async () =>
    exit.props.actions
      .find((n: { label: string }) => n.label === 'Tiếp tục phiếu')
      .onPress(),
  );
  expect(owner.snapshot().form.phone).toBe('0901234567');
  expect(execute).not.toHaveBeenCalled();
  await act(async () => tree.unmount());
});
