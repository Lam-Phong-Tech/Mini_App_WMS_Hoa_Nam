import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import {
  AccessibilityInfo,
  ActivityIndicator,
  StyleSheet,
  Text,
} from 'react-native';
import { ThemeProvider } from '../src/theme/ThemeProvider';
import { Button } from '../src/ui/Button';
import {
  P16DataState,
  type P16DataStateProps,
} from '../src/features/system/P16DataState';

const mounted: Renderer.ReactTestRenderer[] = [];
async function render(props: P16DataStateProps) {
  let tree!: Renderer.ReactTestRenderer;
  await act(async () => {
    tree = Renderer.create(
      <ThemeProvider>
        <P16DataState motion="off" scale={1} {...props} />
      </ThemeProvider>,
    );
  });
  mounted.push(tree);
  return tree;
}
const contents = (tree: Renderer.ReactTestRenderer) =>
  JSON.stringify(tree.toJSON());
const buttons = (tree: Renderer.ReactTestRenderer) =>
  tree.root.findAllByType(Button);
const visibleText = (tree: Renderer.ReactTestRenderer, id: string) =>
  tree.root.findAllByType(Text).find(node => node.props.testID === id)!;
async function press(tree: Renderer.ReactTestRenderer, label: string) {
  const target = tree.root
    .findAllByProps({ accessibilityLabel: label })
    .find(node => typeof node.props.onPress === 'function');
  if (!target) throw new Error('Missing button ' + label);
  await act(async () => {
    target.props.onPress();
  });
}
async function measure(
  tree: Renderer.ReactTestRenderer,
  id: string,
  height: number,
) {
  await act(async () =>
    tree.root.findByProps({ testID: id }).props.onLayout({
      nativeEvent: { layout: { x: 0, y: 0, width: 400, height } },
    }),
  );
}
afterEach(async () => {
  for (const tree of mounted.splice(0)) await act(async () => tree.unmount());
  jest.restoreAllMocks();
});

test('loading has six finite avatar/two-line/badge rows, not one generic status card', async () => {
  const tree = await render({ kind: 'loading', pending: true });
  expect(tree.root.findByProps({ testID: 'P16.S01' })).toBeDefined();
  for (let i = 0; i < 6; i++)
    expect(
      tree.root.findByProps({ testID: 'P16.skeleton.' + i }),
    ).toBeDefined();
  expect(tree.root.findAllByProps({ testID: 'P16.skeleton.6' })).toHaveLength(
    0,
  );
  expect(contents(tree)).toContain('Đang tải chứng từ…');
  expect(tree.root.findAllByType(ActivityIndicator)).toHaveLength(0);
  expect(buttons(tree)).toHaveLength(0);
});

test('motion off/reduced or no pending read never runs an ActivityIndicator', async () => {
  const reduced = jest
    .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
    .mockResolvedValue(false);
  for (const motion of ['off', 'reduced'] as const) {
    const tree = await render({ kind: 'loading', pending: true, motion });
    expect(tree.root.findAllByType(ActivityIndicator)).toHaveLength(0);
  }
  expect(reduced).not.toHaveBeenCalled();
  const waiting = await render({ kind: 'loading', pending: false });
  expect(contents(waiting)).toContain('Đang chờ nguồn dữ liệu');
  expect(contents(waiting)).not.toContain('Đang tải chứng từ…');
});

test('auto motion follows OS setting and removes its subscription', async () => {
  jest
    .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
    .mockResolvedValue(false);
  let changed!: (value: boolean) => void;
  const remove = jest.fn();
  const subscribe = jest
    .spyOn(AccessibilityInfo, 'addEventListener')
    .mockImplementation((_event, callback) => {
      changed = callback;
      return { remove };
    });
  const tree = await render({ kind: 'loading', pending: true, motion: 'auto' });
  expect(tree.root.findAllByType(ActivityIndicator)).toHaveLength(1);
  await act(async () => {
    changed(true);
  });
  expect(tree.root.findAllByType(ActivityIndicator)).toHaveLength(0);
  await act(async () => tree.unmount());
  expect(subscribe).toHaveBeenCalledWith(
    'reduceMotionChanged',
    expect.any(Function),
  );
  expect(remove).toHaveBeenCalledTimes(1);
  mounted.splice(mounted.indexOf(tree), 1);
});

test.each([undefined, null, false])(
  'empty never grants create for %s',
  async canCreate => {
    const create = jest.fn();
    const tree = await render({ kind: 'empty', canCreate, onCreate: create });
    expect(tree.root.findByProps({ testID: 'P16.S02' })).toBeDefined();
    expect(contents(tree)).toContain(
      'Chưa có chứng từ trong phạm vi được xem.',
    );
    expect(buttons(tree)).toHaveLength(0);
    expect(create).not.toHaveBeenCalled();
  },
);

test('verified create uses source-owned callback and source-local wording without mutation', async () => {
  const create = jest.fn();
  const tree = await render({
    kind: 'empty',
    sourceLabel: 'Nhập kho',
    canCreate: true,
    onCreate: create,
    createLabel: 'Tạo phiếu nhập',
  });
  expect(contents(tree)).toContain(
    'Nguồn Nhập kho chưa có chứng từ trong phạm vi được phép xem.',
  );
  expect(contents(tree)).not.toContain('Nguồn và kho đã được xác minh');
  await press(tree, 'Tạo phiếu nhập');
  expect(create).toHaveBeenCalledTimes(1);
  expect(tree.root.findByProps({ testID: 'P16.S02' })).toBeDefined();
});

test('true alone does not expose a create action without an owner handler', async () => {
  const tree = await render({ kind: 'empty', canCreate: true });
  expect(buttons(tree)).toHaveLength(0);
});

test('no-match preserves exact query and exposes primary Edit plus secondary Clear', async () => {
  const edit = jest.fn(),
    clear = jest.fn(),
    remove = jest.fn();
  const query = '  PN-9999\nHoa🌺  ';
  const tree = await render({
    kind: 'no-results',
    query,
    onClear: clear,
    onEditQuery: edit,
    onRemoveQuery: remove,
  });
  expect(tree.root.findByProps({ testID: 'P16.S03' })).toBeDefined();
  expect(contents(tree)).toContain('Không tìm thấy kết quả');
  expect(visibleText(tree, 'P16.condition.q').props.children).toBe(
    'Từ khóa: ' + query,
  );
  const actions = buttons(tree);
  expect(actions.map(node => [node.props.label, node.props.variant])).toEqual([
    ['Xóa bộ lọc', 'secondary'],
    ['Sửa từ khóa', 'primary'],
  ]);
  await press(tree, 'Sửa từ khóa');
  await press(tree, 'Xóa bộ lọc');
  await press(tree, 'Bỏ điều kiện Từ khóa: ' + query);
  expect(edit).toHaveBeenCalledTimes(1);
  expect(clear).toHaveBeenCalledTimes(1);
  expect(remove).toHaveBeenCalledTimes(1);
});

test('conditions-only no-match offers the existing filter picker rather than editing blank text', async () => {
  const adjust = jest.fn(),
    date = jest.fn(),
    status = jest.fn();
  const tree = await render({
    kind: 'no-results',
    query: '  ',
    onAdjustFilters: adjust,
    conditions: [
      { key: 'date', label: 'Ngày: 01/10/2026 – 28/10/2026', onRemove: date },
      {
        key: 'status',
        label: 'Trạng thái: Chờ xử lý trên Web',
        onRemove: status,
      },
    ],
  });
  expect(contents(tree)).not.toContain('Sửa từ khóa');
  await press(tree, 'Bỏ điều kiện Ngày: 01/10/2026 – 28/10/2026');
  expect(date).toHaveBeenCalledTimes(1);
  expect(status).not.toHaveBeenCalled();
  await press(tree, 'Điều chỉnh bộ lọc');
  expect(adjust).toHaveBeenCalledTimes(1);
});

test('busy controls refuse even a directly dispatched stale press; rendering never invokes actions', async () => {
  const action = jest.fn();
  const tree = await render({
    kind: 'no-results',
    busy: true,
    query: 'PN-9999',
    onClear: action,
    onEditQuery: action,
    onRemoveQuery: action,
  });
  expect(action).not.toHaveBeenCalled();
  expect(buttons(tree).every(node => node.props.disabled)).toBe(true);
  await press(tree, 'Sửa từ khóa');
  await press(tree, 'Xóa bộ lọc');
  await press(tree, 'Bỏ điều kiện Từ khóa: PN-9999');
  expect(action).not.toHaveBeenCalled();
});

test('long description is measured by rendered height; reader receives full original Unicode/newlines', async () => {
  const read = jest.fn(),
    query = '🌺<b>TEST</b>\n' + 'Kho'.repeat(800);
  const tree = await render({ kind: 'no-results', query, onReadText: read });
  const expected =
    'Không có chứng từ phù hợp với “' +
    query +
    '”.\nVui lòng thử lại với điều kiện khác.';
  const preview = () => tree.root.findByProps({ testID: 'P16.description' });
  expect(preview().props.numberOfLines).toBeUndefined();
  await measure(tree, 'P16.description.measure', 270);
  expect(preview().props.numberOfLines).toBe(3);
  await press(tree, 'Xem đầy đủ từ khóa tìm kiếm');
  expect(read).toHaveBeenCalledWith({
    title: 'Từ khóa tìm kiếm',
    text: expected,
  });
  // A short layout does not show a reader merely because the string is long.
  await measure(tree, 'P16.description.measure', 54);
  expect(preview().props.numberOfLines).toBeUndefined();
  expect(
    tree.root.findAllByProps({
      accessibilityLabel: 'Xem đầy đủ từ khóa tìm kiếm',
    }),
  ).toHaveLength(0);
});

test('no reader never hides long content; changing query discards old overflow measurement', async () => {
  const tree = await render({ kind: 'no-results', query: 'Q'.repeat(2000) });
  await measure(tree, 'P16.description.measure', 270);
  expect(
    tree.root.findByProps({ testID: 'P16.description' }).props.numberOfLines,
  ).toBeUndefined();
  await act(async () =>
    tree.update(
      <P16DataState
        kind="no-results"
        query="mới"
        onReadText={jest.fn()}
        motion="off"
        scale={1}
      />,
    ),
  );
  expect(
    tree.root.findByProps({ testID: 'P16.description' }).props.numberOfLines,
  ).toBeUndefined();
});

test('long condition reader is a sibling of Remove and receives that condition only', async () => {
  const read = jest.fn(),
    remove = jest.fn(),
    label = 'Loại: ' + 'X'.repeat(250);
  const tree = await render({
    kind: 'no-results',
    conditions: [{ key: 'type', label, onRemove: remove }],
    onReadText: read,
  });
  await measure(tree, 'P16.condition.type.measure', 112);
  expect(visibleText(tree, 'P16.condition.type').props.numberOfLines).toBe(1);
  await press(tree, 'Xem đầy đủ điều kiện đang áp dụng');
  expect(read).toHaveBeenCalledWith({
    title: 'Điều kiện đang áp dụng',
    text: label,
  });
  expect(remove).not.toHaveBeenCalled();
});

test('error title/art/retry stay stable; technical details remain exact and separate below retry', async () => {
  const retry = jest.fn(),
    details = jest.fn();
  const errorMessage = 'Chuỗi nguồn\n  giữ nguyên khoảng trắng.';
  const tree = await render({
    kind: 'error',
    onRetry: retry,
    errorCode: 'OWNER-503',
    errorMessage,
    onReadError: details,
    canCreate: true,
    onCreate: jest.fn(),
  });
  expect(tree.root.findByProps({ testID: 'P16.S04' })).toBeDefined();
  expect(tree.root.findByProps({ testID: 'P16.artwork' })).toBeDefined();
  expect(contents(tree)).toContain('Không tải được dữ liệu');
  expect(buttons(tree).map(node => node.props.label)).toEqual(['Thử lại']);
  expect(contents(tree)).not.toContain(errorMessage);
  await press(tree, 'Xem chi tiết lỗi OWNER-503');
  expect(details).toHaveBeenCalledWith({
    code: 'OWNER-503',
    message: errorMessage,
  });
  await press(tree, 'Thử lại');
  expect(retry).toHaveBeenCalledTimes(1);
});

test('missing error code is not invented; full noninteractive code is not silently clipped', async () => {
  const tree = await render({ kind: 'error' });
  expect(contents(tree)).not.toContain('HN-ERR');
  expect(contents(tree)).not.toContain('Mã lỗi:');
  const longCode = 'CODE'.repeat(80);
  await act(async () =>
    tree.update(
      <P16DataState kind="error" motion="off" errorCode={longCode} scale={1} />,
    ),
  );
  const code = tree.root
    .findAllByType(Text)
    .find(node => node.props.children === 'Mã lỗi: ' + longCode);
  expect(code).toBeDefined();
  expect(code!.props.numberOfLines).toBeUndefined();
});

test('trusted error details remain readable when no source code was provided', async () => {
  const details = jest.fn(),
    message = 'Nguồn tạm thời không khả dụng.\nĐọc lại sau.';
  const tree = await render({
    kind: 'error',
    errorMessage: message,
    onReadError: details,
  });
  expect(contents(tree)).not.toContain('Mã lỗi:');
  await press(tree, 'Xem chi tiết lỗi');
  expect(details).toHaveBeenCalledWith({ code: null, message });
});

test('a late OS preference query cannot undo a newer reduced-motion event', async () => {
  let finish!: (value: boolean) => void, changed!: (value: boolean) => void;
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockImplementation(
    () =>
      new Promise(resolve => {
        finish = resolve;
      }),
  );
  jest
    .spyOn(AccessibilityInfo, 'addEventListener')
    .mockImplementation((_event, callback) => {
      changed = callback;
      return { remove: jest.fn() };
    });
  const tree = await render({ kind: 'loading', pending: true, motion: 'auto' });
  await act(async () => {
    changed(true);
    finish(false);
  });
  expect(tree.root.findAllByType(ActivityIndicator)).toHaveLength(0);
});

test.each(['loading', 'error'] as const)(
  'retained %s is a compact cache notice without replacing owner rows',
  async kind => {
    const retry = jest.fn();
    const tree = await render({
      kind,
      retained: true,
      pending: kind === 'loading',
      onRetry: retry,
      retryLabel: 'Đọc lại từ trang đầu',
    });
    expect(contents(tree)).toContain('Đang hiển thị dữ liệu đã tải trước đó.');
    expect(tree.root.findAllByProps({ testID: 'P16.artwork' })).toHaveLength(0);
    expect(
      tree.root.findAllByProps({
        testID: kind === 'loading' ? 'P16.S01' : 'P16.S04',
      }),
    ).toHaveLength(0);
    if (kind === 'error') {
      await press(tree, 'Đọc lại từ trang đầu');
      expect(retry).toHaveBeenCalledTimes(1);
    }
  },
);

test('narrow scale retains touch target, paired actions and full-state minimum without owning a scroller', async () => {
  const tree = await render({
    kind: 'no-results',
    query: 'PN-9999',
    scale: 320 / 494,
    onClear: jest.fn(),
    onEditQuery: jest.fn(),
  });
  for (const action of buttons(tree))
    expect(
      StyleSheet.flatten(action.props.style).minHeight,
    ).toBeGreaterThanOrEqual(44);
  const state = tree.root.findByProps({ testID: 'P16.S03' });
  expect(StyleSheet.flatten(state.props.style).minHeight).toBeCloseTo(
    (440 * 320) / 494,
  );
  expect(contents(tree)).not.toContain('ScrollView');
  expect(global.fetch).not.toHaveBeenCalled();
});
