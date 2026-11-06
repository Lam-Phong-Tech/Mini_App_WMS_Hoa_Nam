jest.mock('../src/api/webPreviewHost', () =>
  jest.requireActual('../src/api/webPreviewHost.web'),
);

import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { TextInput } from 'react-native';
import { webPreviewHostProblem } from '../src/api/webPreviewHost.web';
import { LoginScreen } from '../src/features/auth/LoginScreen';
import { AppProviders } from '../src/app/App';
import { Button } from '../src/ui/Button';
import { Banner } from '../src/ui/Banner';

const original = Object.getOwnPropertyDescriptor(globalThis, 'location');
afterEach(() => {
  if (original) Object.defineProperty(globalThis, 'location', original);
  else Reflect.deleteProperty(globalThis, 'location');
});
function host(origin: string) {
  Object.defineProperty(globalThis, 'location', {
    configurable: true,
    value: { origin },
  });
}

test.each(['https://duc-nguyen98.github.io', 'https://another.github.io'])(
  'static Pages has no API proxy: %s',
  origin => {
    host(origin);
    expect(webPreviewHostProblem()).toContain('không có proxy /wms-api');
  },
);
test.each([
  'http://127.0.0.1:8799',
  'http://localhost:5175',
  'https://khohoanamdev.lptech.info.vn',
  'https://appqr.lptech.info.vn',
  'https://notgithub.io',
  'https://github.io.evil.invalid',
])(
  'host guard does not change other documented/native deployment paths: %s',
  origin => {
    host(origin);
    expect(webPreviewHostProblem()).toBeUndefined();
  },
);

test('Pages displays the real hosting problem and blocks login including Enter', async () => {
  host('https://duc-nguyen98.github.io');
  const loginFn = jest.fn();
  let tree!: Renderer.ReactTestRenderer;
  await act(async () => {
    tree = Renderer.create(
      <AppProviders>
        <LoginScreen loginFn={loginFn} />
      </AppProviders>,
    );
  });
  expect(tree.root.findByType(Banner).props.title).toBe(
    'Preview chưa có kết nối API',
  );
  for (const input of tree.root.findAllByType(TextInput))
    expect(input.props.editable).toBe(false);
  expect(tree.root.findByType(Button).props.disabled).toBe(true);
  await act(async () => {
    // Even invoking the submit handler directly cannot bypass the host guard.
    await tree.root.findByType(Button).props.onPress();
  });
  expect(loginFn).not.toHaveBeenCalled();
  await act(async () => tree.unmount());
});

test('local proxy preview keeps the existing real login form enabled', async () => {
  host('http://127.0.0.1:8799');
  let tree!: Renderer.ReactTestRenderer;
  await act(async () => {
    tree = Renderer.create(
      <AppProviders>
        <LoginScreen />
      </AppProviders>,
    );
  });
  expect(tree.root.findAllByType(Banner)).toHaveLength(0);
  expect(tree.root.findByType(Button).props.disabled).toBe(false);
  for (const input of tree.root.findAllByType(TextInput))
    expect(input.props.editable).toBe(true);
  await act(async () => tree.unmount());
});
