import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { BackHandler } from 'react-native';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { useHardwareBack as useBrowserBack } from '../src/app/useHardwareBack.web';
declare const __dirname: string;

test('browser back abstraction does not call Android BackHandler or invoke a flow action', async () => {
  const add = jest.spyOn(BackHandler, 'addEventListener'),
    action = jest.fn(() => true);
  function BrowserFlow() {
    useBrowserBack(action);
    return null;
  }
  let tree!: Renderer.ReactTestRenderer;
  try {
    await act(async () => {
      tree = Renderer.create(<BrowserFlow />);
    });
    await act(async () => tree.update(<BrowserFlow />));
    expect(add).not.toHaveBeenCalled();
    expect(action).not.toHaveBeenCalled();
  } finally {
    if (tree) await act(async () => tree.unmount());
    add.mockRestore();
  }
});
test('all flows route hardware back through the platform abstraction, never react-native BackHandler directly', () => {
  const src = path.resolve(__dirname, '../src');
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap(e =>
      e.isDirectory()
        ? walk(path.join(dir, e.name))
        : /\.[jt]sx?$/.test(e.name)
        ? [path.join(dir, e.name)]
        : [],
    );
  const offenders = walk(src)
    .filter(file => file !== path.join(src, 'app/useHardwareBack.ts'))
    .filter(file =>
      /\bBackHandler\s*[,}]|\bBackHandler\.(?:addEventListener|removeEventListener|exitApp)/.test(
        readFileSync(file, 'utf8'),
      ),
    );
  expect(offenders).toEqual([]);
  for (const name of [
    'inbound/P04NativeFlow.tsx',
    'outbound/P05NativeFlow.tsx',
    'outbound/P05CreateNativeFlow.tsx',
  ])
    expect(readFileSync(path.join(src, 'features', name), 'utf8')).toContain(
      'useHardwareBack(',
    );
});
