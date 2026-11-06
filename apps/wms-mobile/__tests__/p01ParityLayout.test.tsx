/** P01 parity29/10: source-level geometry checks, not screenshot acceptance. */
import React from 'react';
import Renderer from 'react-test-renderer';
import { Image, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '../src/theme/ThemeProvider';
import { LoginScreen } from '../src/features/auth/LoginScreen';
import { SessionConfirmationScreen } from '../src/features/auth/SessionConfirmationScreen';
import { P01ConfirmationBackdrop } from '../src/features/auth/P01ConfirmationBackdrop';
import { Input } from '../src/ui/Input';
import { Button } from '../src/ui/Button';
import {
  getAppStorage,
  createStorage,
  createMemoryBackend,
  setAppStorageForTesting,
} from '../src/storage/storage';
import { clearSession } from '../src/auth/session';
import type { CurrentUser } from '../src/services/wms/types';

let mockWidth = 494;
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({
    width: mockWidth,
    height: (950 * mockWidth) / 494,
    scale: 1,
    fontScale: 1,
  }),
}));

const warehouseId = '01010101-0101-4101-8101-010101010103';
const user: CurrentUser = {
  id: '01010101-0101-4101-8101-010101010101',
  auth_session_id: '01010101-0101-4101-8101-010101010102',
  name: 'TEST UI',
  role: 'Nhân viên kho',
  active_warehouse_id: warehouseId,
  warehouse_context: { status: 'READY' },
  warehouse_scope_ids: [warehouseId],
};
let trees: Renderer.ReactTestRenderer[] = [];
beforeEach(() => {
  mockWidth = 494;
  setAppStorageForTesting(createStorage(createMemoryBackend()));
  clearSession();
});
afterEach(async () => {
  await Renderer.act(async () => {
    trees.forEach(t => t.unmount());
  });
  trees = [];
  clearSession();
});
async function mount(element: React.ReactElement) {
  let tree!: Renderer.ReactTestRenderer;
  await Renderer.act(async () => {
    tree = Renderer.create(
      <SafeAreaProvider>
        <ThemeProvider>{element}</ThemeProvider>
      </SafeAreaProvider>,
    );
  });
  trees.push(tree);
  return tree;
}
const flat = (node: Renderer.ReactTestInstance) =>
  StyleSheet.flatten(node.props.style);
const byId = (tree: Renderer.ReactTestRenderer, testID: string) =>
  tree.root.findByProps({ testID });
const noCommand = async (): Promise<never> => {
  throw new Error('NO_LIVE_COMMAND');
};
async function confirmation(
  extra: Partial<React.ComponentProps<typeof SessionConfirmationScreen>> = {},
) {
  const fetchShift = jest.fn(async () => null),
    startShift = jest.fn(noCommand),
    onContinue = jest.fn();
  const tree = await mount(
    <SessionConfirmationScreen
      fetchUser={async () => user}
      fetchWarehouses={async () => ({
        items: [{ id: warehouseId, name: 'Kho TEST UI', status: 'ACTIVE' }],
      })}
      fetchShift={fetchShift}
      startShift={startShift}
      logoutFn={noCommand}
      switchContext={noCommand}
      onContinue={onContinue}
      onLoggedOut={() => undefined}
      {...extra}
    />,
  );
  return { tree, fetchShift, startShift, onContinue };
}

test.each([320, 360, 411, 494])(
  'S01 %ipx uses494 coordinate base with explicit artwork bounds and safe focus',
  async width => {
    mockWidth = width;
    const tree = await mount(<LoginScreen loginFn={noCommand} />),
      s = width / 494;
    const art = flat(tree.root.findByType(Image));
    expect(art.width).toBe(width);
    expect(art.height).toBeCloseTo(405 * s);
    const inputs = tree.root.findAllByType(Input);
    for (const input of inputs) {
      expect(input.props.fieldHeight).toBeCloseTo(Math.max(44, 56 * s));
      expect(input.props.inputStyle.fontSize).toBeGreaterThanOrEqual(16);
      expect(input.props.quietFocus).not.toBe(true);
      expect(StyleSheet.flatten(input.props.focusStyle).outlineWidth).toBe(2);
    }
    expect(flat(tree.root.findByType(Button)).minHeight).toBeCloseTo(
      Math.max(44, 66 * s),
    );
  },
);
test('S01 keeps the header at the top and distributes unused height above footer, not by zooming the whole composition', async () => {
  const tree = await mount(<LoginScreen loginFn={noCommand} />);
  const content = StyleSheet.flatten(
    tree.root.findByType(ScrollView).props.contentContainerStyle,
  );
  expect(content.justifyContent).not.toBe('center');
  expect(flat(byId(tree, 'P01.login.composition')).flexGrow).toBe(1);
  expect(flat(byId(tree, 'P01.login.footer')).marginTop).toBe('auto');
  const mark = flat(byId(tree, 'P01.login.brand-mark'));
  expect(mark).toMatchObject({ width: 56, height: 58 });
});
test('S01 reference vertical rhythm is explicit per field/CTA, not one generic form gap', async () => {
  const tree = await mount(<LoginScreen loginFn={noCommand} />);
  const [email, password] = tree.root.findAllByType(Input);
  expect(flat(byId(tree, 'P01.login.form')).gap).toBeUndefined();
  expect(StyleSheet.flatten(email!.props.containerStyle).gap).toBe(8);
  expect(StyleSheet.flatten(password!.props.containerStyle)).toMatchObject({
    marginTop: 23,
    gap: 8,
  });
  expect(StyleSheet.flatten(email!.props.labelStyle).lineHeight).toBe(20);
  expect(flat(byId(tree, 'P01.login.notice')).minHeight).toBe(76);
  const forgot = tree.root.find(
    node =>
      node.props.accessibilityLabel === 'Quên mật khẩu' &&
      typeof node.props.onPress === 'function',
  );
  expect(flat(forgot)).toMatchObject({
    minHeight: 44,
    marginTop: 2,
    justifyContent: 'center',
  });
  expect(email!.props.label).toBe('Email'); // Current BE/BA policy, not fixture username.
});
test.each([320, 360, 411, 494])(
  'S02 %ipx uses494 coordinate base for hero/CTA and preserves original photo aspect',
  async width => {
    mockWidth = width;
    const { tree, startShift, onContinue } = await confirmation(),
      s = width / 494;
    expect(flat(byId(tree, 'P01.session.hero')).minHeight).toBeCloseTo(276 * s);
    const start = tree.root
      .findAllByType(Button)
      .find(b => b.props.accessibilityLabel === 'Bắt đầu ca')!;
    expect(flat(start).minHeight).toBeCloseTo(70 * s);
    const photo = tree.root.findByType(P01ConfirmationBackdrop);
    expect(photo.props.width).toBe(width);
    expect(photo.props.heroHeight).toBeCloseTo(276 * s);
    expect(startShift).not.toHaveBeenCalled();
    expect(onContinue).not.toHaveBeenCalled();
    expect(getAppStorage().has('work-shift.start.pending')).toBe(false);
  },
);
test('S02 uses the source48px warehouse tile,74px notice and bottom-aligned footer', async () => {
  const { tree } = await confirmation();
  expect(flat(byId(tree, 'P01.session.warehouse-tile'))).toMatchObject({
    width: 48,
    height: 48,
  });
  expect(flat(byId(tree, 'P01.session.notice')).minHeight).toBe(74);
  expect(flat(byId(tree, 'P01.session.notice-copy')).maxWidth).toBe(300);
  expect(flat(byId(tree, 'P01.session.footer')).marginTop).toBe('auto');
});
test('S02 full dynamic identity stays readable and can grow; it is never replaced with baseline TEST values', async () => {
  const name = 'TEST ' + 'Tên kho và người dùng Unicode rất dài '.repeat(25);
  const { tree, startShift } = await confirmation({
    fetchUser: async () => ({ ...user, name }),
  });
  const json = JSON.stringify(tree.toJSON());
  expect(json).toContain(name);
  expect(byId(tree, 'P01.session.hero').props.onLayout).toEqual(
    expect.any(Function),
  );
  expect(startShift).not.toHaveBeenCalled();
});
