import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { Modal } from 'react-native';
import { P04TypeSelect } from '../src/features/inbound/P04TypeSelect';
import { p04SelectPlacement } from '../src/features/inbound/p04SelectPlacement';

test('dropdown aligns to the trigger and flips above near the viewport bottom', () => {
  const viewport = { width: 411, height: 900, top: 26, bottom: 24 };
  expect(
    p04SelectPlacement(
      { x: 16, y: 230, width: 379, height: 48 },
      viewport,
      174,
    ),
  ).toEqual({ left: 16, top: 284, width: 379, maxHeight: 174 });
  expect(
    p04SelectPlacement(
      { x: 16, y: 800, width: 379, height: 48 },
      viewport,
      174,
    ),
  ).toEqual({ left: 16, top: 620, width: 379, maxHeight: 174 });
});

test('oversize popup stays within the usable viewport', () => {
  const placement = p04SelectPlacement(
    { x: 10, y: 150, width: 500, height: 48 },
    { width: 320, height: 300, top: 24, bottom: 20 },
    174,
  );
  expect(placement.left).toBe(0);
  expect(placement.width).toBe(320);
  expect(placement.top).toBeGreaterThanOrEqual(24);
  expect(placement.top + placement.maxHeight).toBeLessThanOrEqual(280);
});

function mount(disabled = false) {
  const onChange = jest.fn();
  let tree!: Renderer.ReactTestRenderer;
  act(() => {
    tree = Renderer.create(
      <P04TypeSelect value="PRODUCT" disabled={disabled} onChange={onChange} />,
    );
  });
  // The RN preset supplies a native host instance with no-op measurements.
  // Provide only its geometry; the dropdown and selection logic run unchanged.
  const nativeAnchor = tree.root.find(
    node =>
      node.props.collapsable === false && !!node.instance?.measureInWindow,
  ).instance;
  nativeAnchor.measureInWindow = (cb: (...args: number[]) => void) =>
    cb(16, 230, 379, 48);
  const button = (label: string) =>
    tree.root.findAll(
      p => p.props.accessibilityLabel === label && !!p.props.onPress,
    )[0];
  const open = () =>
    act(() => button('Loại nhập: Nhập sản phẩm').props.onPress());
  return { tree, onChange, button, open };
}

test('Back and outside dismissal preserve the current choice', () => {
  const f = mount();
  f.open();
  expect(f.tree.root.findByType(Modal).props.visible).toBe(true);
  act(() => f.tree.root.findByType(Modal).props.onRequestClose());
  expect(f.tree.root.findByType(Modal).props.visible).toBe(false);
  f.open();
  act(() => f.button('Đóng lựa chọn loại nhập').props.onPress());
  expect(f.tree.root.findByType(Modal).props.visible).toBe(false);
  expect(f.onChange).not.toHaveBeenCalled();
  act(() => f.tree.unmount());
});

test('selection emits exactly the chosen canonical category and closes', () => {
  const f = mount();
  f.open();
  const radio = f.button('Nhập linh kiện');
  expect(radio).toBeDefined();
  act(() => radio.props.onPress());
  expect(f.onChange.mock.calls).toEqual([['COMPONENT']]);
  expect(f.tree.root.findByType(Modal).props.visible).toBe(false);
  act(() => f.tree.unmount());
});

test('disabled control cannot open or change the category', () => {
  const f = mount(true);
  f.open();
  expect(f.tree.root.findByType(Modal).props.visible).toBe(false);
  expect(f.onChange).not.toHaveBeenCalled();
  act(() => f.tree.unmount());
});

test('becoming disabled dismisses an already-open dropdown', () => {
  const f = mount();
  f.open();
  act(() => {
    f.tree.update(
      <P04TypeSelect value="PRODUCT" disabled onChange={f.onChange} />,
    );
  });
  expect(f.tree.root.findByType(Modal).props.visible).toBe(false);
  expect(f.onChange).not.toHaveBeenCalled();
  act(() => f.tree.unmount());
});
