/** TC_UI_02 focus/zoom regression; offline only, no credentials or API. */
import React from 'react';
import Renderer from 'react-test-renderer';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { StyleSheet, TextInput, View } from 'react-native';
import { AppProviders } from '../src/app/App';
import { Input } from '../src/ui/Input';
import { LoginScreen } from '../src/features/auth/LoginScreen';

const root = resolve(__dirname, '..');
const source = readFileSync(
  resolve(root, 'src/features/auth/LoginScreen.tsx'),
  'utf8',
);
const index = readFileSync(resolve(root, 'index.html'), 'utf8');
const css = readFileSync(resolve(root, 'src/web/global.css'), 'utf8');
const review = readFileSync(
  resolve(root, 'docs/p01-local-review.html'),
  'utf8',
);

test('TC_UI_02 viewport policy prevents mobile page zoom/text reflow', () => {
  expect(index).toContain('initial-scale=1');
  expect(index).toContain('maximum-scale=1');
  expect(index).toContain('user-scalable=no');
  expect(index).toContain('-webkit-text-size-adjust: 100%');
  expect(review).toContain('maximum-scale=1');
  expect(css).toContain('-webkit-text-size-adjust: 100%');
  expect(css).toContain('input:focus');
});

test('TC_UI_02 web focus skips native responder auto-scroll', () => {
  expect(source).toContain("if (Platform.OS === 'web') return;");
  expect(source.indexOf("if (Platform.OS === 'web') return;")).toBeLessThan(
    source.indexOf('scrollResponderScrollNativeHandleToKeyboard'),
  );
});

test('TC_UI_02 P01 inputs stay at least 16px and remove inner focus outline', async () => {
  let tree!: Renderer.ReactTestRenderer;
  await Renderer.act(async () => {
    tree = Renderer.create(
      <AppProviders>
        <LoginScreen loginFn={async () => ({ accessToken: 'offline-only' })} />
      </AppProviders>,
    );
  });
  const inputs = tree.root.findAllByType(TextInput);
  expect(inputs).toHaveLength(2);
  for (const input of inputs) {
    const style = StyleSheet.flatten(input.props.style);
    expect(style.fontSize).toBeGreaterThanOrEqual(16);
    expect(style.outlineWidth).toBe(0);
  }
  await Renderer.act(async () => tree.unmount());
});

test('TC_UI_02 quietFocus keeps field border stable before/after focus', async () => {
  let tree!: Renderer.ReactTestRenderer;
  await Renderer.act(async () => {
    tree = Renderer.create(
      <AppProviders>
        <Input label="Email" quietFocus fieldHeight={56} />
      </AppProviders>,
    );
  });
  const field = () =>
    tree.root
      .findAllByType(View)
      .find(node => StyleSheet.flatten(node.props.style)?.borderWidth === 1)!;
  const before = StyleSheet.flatten(field().props.style).borderColor;
  tree.root.findByType(TextInput).props.onFocus({ nativeEvent: {} });
  await Renderer.act(async () => Promise.resolve());
  const after = StyleSheet.flatten(field().props.style).borderColor;
  expect(after).toBe(before);
  await Renderer.act(async () => tree.unmount());
});

test.each(['Email', 'Mật khẩu'])('P01 %s highlights the outer field on focus and restores it on blur', async label => {
  const loginFn = jest.fn();
  let tree!: Renderer.ReactTestRenderer;
  await Renderer.act(async () => {
    tree = Renderer.create(<AppProviders><LoginScreen loginFn={loginFn} /></AppProviders>);
  });
  const control = tree.root.findAllByType(Input).find(node => node.props.label === label)!;
  const field = () => control.findAllByType(View).find(node => StyleSheet.flatten(node.props.style)?.borderWidth === 1)!;
  const input = control.findByType(TextInput);
  const resting = StyleSheet.flatten(field().props.style);
  await Renderer.act(async () => input.props.onFocus({nativeEvent: {}}));
  const active = StyleSheet.flatten(field().props.style);
  expect(active.borderColor).not.toBe(resting.borderColor);
  expect(active.outlineWidth).toBe(2);
  expect(active.outlineColor).toBe('#0C6286');
  expect(active.outlineOffset).toBe(3);
  expect(control.findByType(TextInput)).toBe(input);
  expect(StyleSheet.flatten(input.props.style).outlineWidth).toBe(0);
  await Renderer.act(async () => input.props.onBlur({nativeEvent: {}}));
  expect(StyleSheet.flatten(field().props.style)).toEqual(resting);
  expect(loginFn).not.toHaveBeenCalled();
  await Renderer.act(async () => tree.unmount());
});
