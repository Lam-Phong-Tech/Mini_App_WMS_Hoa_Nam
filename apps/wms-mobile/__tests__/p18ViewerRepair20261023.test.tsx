jest.mock('../src/native/p18Preview', () => ({
  openP18Preview: jest.fn(),
  renderP18Page: jest.fn(),
  closeP18Preview: jest.fn(),
}));
import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { Image } from 'react-native';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AppProviders } from '../src/app/App';
import { P18ViewerScreen } from '../src/features/warranty/P18ViewerScreen';
import {
  openP18Preview,
  renderP18Page,
  closeP18Preview,
} from '../src/native/p18Preview';
import { deferred } from './fixtures/p09Mock';
const preview = {
  id: '90000000-0000-4000-8000-000000000099',
  mime: 'application/pdf',
  pages: 3,
  width: 600,
  height: 800,
  bytes: 10,
};
const uri = 'file:///data/private/p18-previews/' + preview.id + '/page.png';
let tree: Renderer.ReactTestRenderer | undefined;
const render = async (
  props: Partial<React.ComponentProps<typeof P18ViewerScreen>> = {},
) => {
  const load = jest
    .fn()
    .mockResolvedValue({ blob: { size: 10 }, mime: 'application/pdf' });
  const onBack = jest.fn();
  await act(async () => {
    tree = Renderer.create(
      <AppProviders>
        <P18ViewerScreen
          name="Owned.pdf"
          ownerKey="private-owner-file"
          load={load}
          isCurrent={() => true}
          onBack={onBack}
          {...props}
        />
      </AppProviders>,
    );
  });
  return { load, onBack };
};
const press = async (label: string) =>
  act(async () => {
    tree!.root
      .findAll(
        node =>
          node.props.accessibilityLabel === label &&
          typeof node.props.onPress === 'function',
      )[0]
      .props.onPress();
  });
beforeEach(() => {
  jest.clearAllMocks();
  (openP18Preview as jest.Mock).mockResolvedValue(preview);
  (renderP18Page as jest.Mock).mockResolvedValue({
    uri,
    width: 600,
    height: 800,
  });
});
afterEach(async () => {
  if (tree) await act(async () => tree!.unmount());
  tree = undefined;
});
test('PDF viewer pages, zooms and fits within the caller without another business request', async () => {
  const f = await render();
  expect(tree!.root.findByProps({ testID: 'P18.S02' })).toBeDefined();
  expect(tree!.root.findByType(Image).props.source.uri).toBe(uri);
  await press('Trang sau');
  expect((renderP18Page as jest.Mock).mock.calls.at(-1)[1]).toBe(2);
  await press('Phóng to');
  expect((renderP18Page as jest.Mock).mock.calls.at(-1)[2]).toBeGreaterThan(
    320,
  );
  await press('Vừa trang');
  expect(f.load).toHaveBeenCalledTimes(1);
  await press('Về tài liệu');
  expect(f.onBack).toHaveBeenCalledTimes(1);
});
test('leaving while native open is pending closes the late resource and never renders it', async () => {
  const pending = deferred<typeof preview>();
  (openP18Preview as jest.Mock).mockReturnValue(pending.promise);
  await render();
  await act(async () => tree!.unmount());
  tree = undefined;
  await act(async () => pending.resolve(preview));
  expect(closeP18Preview).toHaveBeenCalledWith(preview.id);
  expect(renderP18Page).not.toHaveBeenCalled();
});
test('changed owner before GET completes cannot open a native preview', async () => {
  const pending = deferred<{ blob: Blob; mime: string }>();
  let current = true;
  await render({ load: () => pending.promise, isCurrent: () => current });
  current = false;
  await act(async () =>
    pending.resolve({ blob: {} as Blob, mime: 'application/pdf' }),
  );
  expect(openP18Preview).not.toHaveBeenCalled();
});
test('preview errors are explicit and retry performs a fresh authorized GET, never save or POST', async () => {
  (openP18Preview as jest.Mock).mockRejectedValueOnce(new Error('PDF locked'));
  const f = await render();
  expect(JSON.stringify(tree!.toJSON())).toContain('PDF locked');
  await press('Đọc lại tài liệu');
  expect(f.load).toHaveBeenCalledTimes(2);
  expect(tree!.root.findByType(Image)).toBeDefined();
});
test('PDF process is isolated and cannot initialize the React Native session runtime', () => {
  const root = resolve(__dirname, '..');
  const manifest = readFileSync(
    resolve(root, 'android/app/src/main/AndroidManifest.xml'),
    'utf8',
  );
  expect(manifest).toMatch(
    /P18PdfService[\s\S]*?android:exported="false"[\s\S]*?android:isolatedProcess="true"/,
  );
  const application = readFileSync(
    resolve(
      root,
      'android/app/src/main/java/vn/info/lptech/wmshoanam/MainApplication.kt',
    ),
    'utf8',
  );
  expect(
    application.indexOf('Process.myUid() != applicationInfo.uid'),
  ).toBeLessThan(application.lastIndexOf('loadReactNative(this)'));
  const service = readFileSync(
    resolve(
      root,
      'android/app/src/main/java/vn/info/lptech/wmshoanam/documents/P18PdfService.kt',
    ),
    'utf8',
  );
  expect(service).toContain('PdfRenderer(input).use');
  expect(service).toContain('bitmap.recycle()');
  expect(service).not.toMatch(/HttpURLConnection|accessToken|MMKV|File\(/);
});
