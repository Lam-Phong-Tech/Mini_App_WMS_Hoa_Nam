// Render/callback wiring only; no claim of physical camera or live P19 writes.
import React from 'react';
import fs from 'node:fs';
import path from 'node:path';
import Renderer, { act } from 'react-test-renderer';
import { Text as NativeText } from 'react-native';
import { AppProviders } from '../src/app/App';
import { P19NativeFlow } from '../src/features/warranty/p19/P19NativeFlow';
import {
  createP19NativeController,
  P19_NATIVE_RELEASE,
} from '../src/features/warranty/p19/p19NativeController';
import { P09NativeCamera } from '../src/features/warranty/P09NativeCamera';
import { scope, id, linkedServer } from './fixtures/p19LinkedServer';
import type { P19Scope } from '../src/features/warranty/p19/p19Types';
jest.mock('../src/features/warranty/P09NativeCamera', () => ({
  P09NativeCamera: jest.fn((props: any) =>
    props.renderSurface({
      caption: 'Camera TEST',
      camera: require('react').createElement(require('react-native').View, {
        testID: 'mock-camera',
      }),
    }),
  ),
}));
let tree: Renderer.ReactTestRenderer | undefined;
afterEach(async () => {
  if (tree) await act(() => tree!.unmount());
  tree = undefined;
  jest.clearAllMocks();
});
const text = () => JSON.stringify(tree?.toJSON());
function controller(offline = false, status = 'CHECKING') {
  return createP19NativeController({
    getScope: () => scope as P19Scope,
    caseId: id(4),
    presentation: { caseLabel: 'WC-TEST', status },
    ...(offline ? { offlineRequest: linkedServer().request } : {}),
  });
}
async function mount(c: ReturnType<typeof controller>, allowed = () => true) {
  await act(async () => {
    tree = Renderer.create(
      <AppProviders>
        <P19NativeFlow
          controller={c}
          onBack={() => {}}
          canCaptureReadOnly={allowed}
        />
      </AppProviders>,
    );
    await c.initialize();
  });
}
test('Web/native surface can read a code locally with live P19 OFF, never calling resolver/SAVE/RECORD', async () => {
  const c = controller(),
    scan = jest.spyOn(c.flow, 'scan');
  let allowed = true;
  await mount(c, () => allowed);
  const camera = tree!.root.findByType(P09NativeCamera);
  expect(camera.props.autoStart).toBe(false);
  expect(camera.props.disabled).toBe(false);
  await act(() => camera.props.onRead('BOX-TEST'));
  expect(text()).toContain('BOX-TEST');
  expect(text()).toContain('Mã vừa đọc · chưa xác minh');
  const feedback = tree!.root.findAllByType(NativeText).find(node =>
    typeof node.props.children === 'string' && node.props.children.startsWith('Đã đọc mã bằng camera.'),
  )!;
  const nativeDelegate = fs.readFileSync(path.resolve(__dirname, '../node_modules/react-native/ReactAndroid/src/main/java/com/facebook/react/uimanager/ReactAccessibilityDelegate.kt'), 'utf8');
  const roleBlock = nativeDelegate.match(/enum class AccessibilityRole\s*\{([\s\S]*?);/)!;
  const nativeRoles = new Set(roleBlock[1].split(',').map(role => role.trim().toLowerCase()));
  expect(nativeRoles.has(feedback.props.accessibilityRole)).toBe(true);
  expect(feedback.props.accessibilityLiveRegion).toBe('polite');
  expect(c.snapshot().counts.codes).toBe(0);
  expect(c.snapshot().canPost).toBe(false);
  expect(scan).not.toHaveBeenCalled();
  expect(P19_NATIVE_RELEASE.activation).toBe(true);
  expect(P19_NATIVE_RELEASE.production).toBe(false);
  const oldRead = camera.props.onRead;
  allowed = false;
  await act(() => oldRead('FOREIGN-CALLER'));
  expect(text()).not.toContain('FOREIGN-CALLER');
  expect(scan).not.toHaveBeenCalled();
});
test.each(['no-permission', 'closed', 'unknown'])(
  '%s never enables the read-only camera',
  async mode => {
    const c = controller(false, mode === 'closed' ? 'CLOSED' : 'CHECKING');
    if (mode === 'unknown')
      jest
        .spyOn(c, 'snapshot')
        .mockReturnValue({ ...c.snapshot(), unknown: true });
    await mount(c, () => mode !== 'no-permission');
    expect(tree!.root.findAllByType(P09NativeCamera)).toHaveLength(0);
  },
);
test('ready owner receives CAMERA source through the same verified flow, without a manual-source fallback', async () => {
  const c = controller(true);
  await mount(c, () => false);
  const scan = jest.spyOn(c.flow, 'scan');
  await act(async () =>
    tree!.root.findByType(P09NativeCamera).props.onRead('ITEM1'),
  );
  expect(scan).toHaveBeenCalledWith('ITEM1', 'CAMERA');
  expect(c.snapshot().counts.codes).toBe(1);
});
