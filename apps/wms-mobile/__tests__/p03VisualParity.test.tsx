import { HN_UI } from '../src/theme/uiKitV3';
import { HN_OPERATIONS } from '../src/ui/hnHomeTokens';
/** P03 parity fixes: source CSS/priority-touch/readable rules, not pixel approval. */
import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import {
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '../src/theme/ThemeProvider';
import {
  P03Dialog,
  P03Surface,
  P03_COPY,
  type P03Action,
  type P03Panel,
} from '../src/features/scan/P03Dialog';
import { BottomNav } from '../src/ui/BottomNav';
import { SvgXml } from 'react-native-svg';

let tree: Renderer.ReactTestRenderer | undefined;
function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SafeAreaProvider>
      <ThemeProvider>{children}</ThemeProvider>
    </SafeAreaProvider>
  );
}
afterEach(async () => {
  if (tree) await act(async () => tree!.unmount());
  tree = undefined;
  jest.restoreAllMocks();
});
const element = (id: string) =>
  tree!.root.findAll(
    n => n.props.testID === id && typeof n.type === 'string',
  )[0] ?? tree!.root.findAll(n => n.props.testID === id)[0];
const style = (id: string) => StyleSheet.flatten(element(id).props.style);
const button = (label: string) =>
  tree!.root.findAll(
    n =>
      n.props.accessibilityRole === 'button' &&
      n.props.accessibilityLabel === label &&
      typeof n.props.onPress === 'function',
  )[0];
async function render(
  panel: P03Panel = 'S01',
  props: Partial<React.ComponentProps<typeof P03Surface>> = {},
) {
  await act(async () => {
    tree = Renderer.create(
      <Providers>
        <P03Surface panel={panel} onBack={jest.fn()} {...props} />
      </Providers>,
    );
  });
}
async function resize(width: number) {
  const root = tree!.root.findAll(
    n =>
      n.props.testID?.startsWith('P03.S') &&
      typeof n.props.onLayout === 'function',
  )[0];
  await act(async () =>
    root.props.onLayout({ nativeEvent: { layout: { width } } }),
  );
}
const actions: readonly P03Action[] = [
  { label: 'Tiếp tục phiếu', kind: 'primary', onPress: jest.fn() },
  { label: 'Lưu nháp và thoát', onPress: jest.fn() },
  { label: 'Bỏ phiếu', kind: 'danger-outline', onPress: jest.fn() },
  { label: 'Hủy', kind: 'text', onPress: jest.fn() },
];

test.each(['S01', 'S02', 'S03', 'S04'] as const)(
  '%s header keeps47px and reserves44px Back target/centered title',
  async panel => {
    await render(panel);
    expect(style('p03-header')).toMatchObject({
      height: 47,
      alignItems: 'center',
      paddingHorizontal: 18,
      gap: 23,
    });
    expect(StyleSheet.flatten(button('Quay lại').props.style)).toMatchObject({
      width: 44,
      height: 44,
    });
    // 18 +44 +23 =85, matching the reference header with priority-touch applied.
    expect(
      style('p03-header').paddingHorizontal +
        StyleSheet.flatten(button('Quay lại').props.style).width +
        style('p03-header').gap,
    ).toBe(85);
  },
);
test.each([320, 390, 494])(
  'Back/close targets reserve real44px space at width%s without touching footer geometry',
  async width => {
    await render();
    await resize(width);
    expect(StyleSheet.flatten(button('Quay lại').props.style)).toMatchObject({
      width: 44,
      height: 44,
    });
    expect(
      StyleSheet.flatten(button('Đóng chọn tác vụ quét').props.style),
    ).toMatchObject({ width: 44, height: 44 });
    expect(style('p03-header').height).toBeGreaterThanOrEqual(44);
    expect(tree!.root.findAllByType(BottomNav)).toHaveLength(0);
  },
);
test('header SVG covers the measured outer width instead of the padded native content width', async () => {
  await render();
  await resize(390);
  const header = element('p03-header');
  const gradient = header
    .findAllByType(SvgXml)
    .find(n => String(n.props.xml).includes('linearGradient'))!;
  expect(gradient.props.width).toBe(390);
  expect(gradient.props.height).toBe(style('p03-header').height);
});
test('S01 close shares the heading/description row and cannot sit over a task or long text', async () => {
  await render('S01', {
    message: 'Nội dung nguồn cần đọc đầy đủ.\n'.repeat(30),
  });
  const row = element('p03-sheet-heading');
  expect(StyleSheet.flatten(row.props.style)).toMatchObject({
    flexDirection: 'row',
    alignItems: 'center',
  });
  expect(
    row.findAll(n => n.props.accessibilityLabel === 'Đóng chọn tác vụ quét')
      .length,
  ).toBeGreaterThan(0);
  expect(row.findAllByType(Text).map(n => n.props.children)).toContain(
    P03_COPY.S01[0],
  );
  expect(
    StyleSheet.flatten(button('Đóng chọn tác vụ quét').props.style).position,
  ).not.toBe('absolute');
  expect(tree!.root.findAllByType(ScrollView).length).toBeGreaterThan(0);
});
test.each(['S02', 'S03', 'S04'] as const)(
  '%s confirmation inherits readable1.5 leading without fixed popup heights',
  async panel => {
    await render(panel, { actions });
    const description = tree!.root
      .findAllByType(Text)
      .find(n => n.props.accessibilityLiveRegion === 'polite')!;
    const textStyle = StyleSheet.flatten(description.props.style);
    expect(textStyle.lineHeight).toBe(textStyle.fontSize * 1.5);
    expect(style('p03-confirmation').height).toBeUndefined();
    expect(style('p03-confirmation')).toMatchObject({
      flexShrink: 1,
      minHeight: 0,
    });
    expect(style('p03-backdrop')).toMatchObject({
      backgroundColor: panel === 'S04' ? HN_UI.canvas : HN_UI.scrim,
      borderRadius: 0,
    });
  },
);
test('S01 retains TC19 scale390/task geometry and the approved dimmed stage', async () => {
  await render();
  expect(style('p03-backdrop').backgroundColor).toBe(HN_UI.scrim);
  const inbound = button('Nhập kho');
  expect(StyleSheet.flatten(inbound.props.style)).toMatchObject({
    minHeight: 65,
    paddingHorizontal: 8,
    paddingVertical: 6,
    gap: 18,
  });
  const tile = inbound
    .findAllByType(View)
    .find(
      n =>
        StyleSheet.flatten(n.props.style)?.backgroundColor ===
        HN_OPERATIONS.inbound.soft,
    )!;
  expect(StyleSheet.flatten(tile.props.style)).toMatchObject({
    width: 50,
    height: 50,
    borderRadius: 11,
  });
  await resize(320);
  expect(
    StyleSheet.flatten(button('Nhập kho').props.style).minHeight,
  ).toBeCloseTo((65 * 320) / 390);
});
test.each(['S02', 'S03', 'S04'] as const)(
  '%s action targets remain44px at narrow width while modal content stays scrollable',
  async panel => {
    await render(panel, { actions });
    await resize(320);
    expect(
      StyleSheet.flatten(button('Tiếp tục phiếu').props.style).minHeight,
    ).toBeGreaterThanOrEqual(44);
    expect(tree!.root.findAllByType(ScrollView).length).toBeGreaterThan(0);
  },
);
test('web keyboard focus uses UI Kit blue2px ring/3px offset and suppresses the browser black outline', async () => {
  jest.replaceProperty(Platform, 'OS', 'web');
  await render('S02', { actions });
  const first = () => button('Tiếp tục phiếu');
  expect(StyleSheet.flatten(first().props.style).outlineWidth).toBe(0);
  await act(async () =>
    first().props.onFocus({ currentTarget: { matches: () => true } }),
  );
  expect(StyleSheet.flatten(first().props.style)).toMatchObject({
    outlineColor: HN_UI.focus,
    outlineWidth: 2,
    outlineOffset: 3,
    outlineStyle: 'solid',
  });
  await act(async () => first().props.onBlur());
  expect(StyleSheet.flatten(first().props.style).outlineWidth).toBe(0);
  await act(async () =>
    first().props.onFocus({ currentTarget: { matches: () => false } }),
  );
  expect(StyleSheet.flatten(first().props.style).outlineWidth).toBe(0);
});
test('web focus styling does not enable disabled operations or change their route callbacks', async () => {
  jest.replaceProperty(Platform, 'OS', 'web');
  const choose = jest.fn();
  await render('S01', {
    disabledChoices: ['inbound', 'warranty'],
    onChoose: choose,
  });
  expect(button('Nhập kho').props.disabled).toBe(true);
  expect(button('Bảo hành').props.disabled).toBe(true);
  await act(async () => {
    button('Nhập kho').props.onPress();
    button('Bảo hành').props.onPress();
    button('Xuất kho').props.onPress();
  });
  expect(choose.mock.calls).toEqual([['outbound']]);
});
test.each(['S01', 'S02', 'S03', 'S04'] as const)(
  '%s backdrop never routes, confirms, saves or cancels',
  async panel => {
    const back = jest.fn(),
      choose = jest.fn();
    await render(panel, { onBack: back, onChoose: choose, actions });
    await act(async () => element('p03-backdrop').props.onResponderRelease());
    expect(back).not.toHaveBeenCalled();
    expect(choose).not.toHaveBeenCalled();
  },
);
test('S04 keeps the same BottomNav component locked and Back only calls the supplied safe callback', async () => {
  const back = jest.fn(),
    tab = jest.fn(),
    cancel = jest.fn();
  await act(async () => {
    tree = Renderer.create(
      <Providers>
        <P03Dialog
          visible
          panel="S04"
          onBack={back}
          onSelectTab={tab}
          actions={[
            { label: 'Quay lại', onPress: back },
            {
              label: 'Bỏ phiếu',
              kind: 'danger',
              disabled: true,
              onPress: cancel,
            },
          ]}
        />
      </Providers>,
    );
  });
  const nav = tree!.root.findByType(BottomNav);
  expect(nav.props.disabled).toBe(true);
  await act(async () => {
    nav.props.onSelect('home');
    tree!.root.findByType(Modal).props.onRequestClose();
    button('Bỏ phiếu').props.onPress();
  });
  expect(tab).not.toHaveBeenCalled();
  expect(cancel).not.toHaveBeenCalled();
  expect(back).toHaveBeenCalledTimes(1);
});
test('TC19 V4 S04 keeps the locked copy for a server-linked draft without changing cancel safety', async () => {
  await render('S04', { actions, serverLinked: true });
  const copy = tree!.root
    .findAllByType(Text)
    .find(node => node.props.accessibilityLiveRegion === 'polite')!;
  expect(copy.props.children).toBe(P03_COPY.S04[1]);
  expect(copy.props.children).toBe(
    'Dữ liệu chưa lưu sẽ bị xóa.\nBạn có chắc chắn muốn bỏ phiếu này?',
  );
  expect(String(copy.props.children)).not.toContain('Server phải xác nhận');
});
