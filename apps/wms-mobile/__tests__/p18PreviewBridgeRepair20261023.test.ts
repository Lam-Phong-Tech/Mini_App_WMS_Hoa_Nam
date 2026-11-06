import { NativeModules, Platform } from 'react-native';
import { openP18Preview, renderP18Page } from '../src/native/p18Preview';
const id = '90000000-0000-4000-8000-000000000099';
const originalReader = global.FileReader;
const bridge = { open: jest.fn(), render: jest.fn(), close: jest.fn() };
beforeEach(() => {
  jest.replaceProperty(Platform, 'OS', 'android');
  NativeModules.P18Preview = bridge;
  jest.clearAllMocks();
  global.FileReader = class {
    result = 'data:application/pdf;base64,JVBERi0=';
    onload?: () => void;
    readAsDataURL() {
      this.onload?.();
    }
    abort() {}
  } as unknown as typeof FileReader;
  bridge.open.mockResolvedValue({
    id,
    mime: 'application/pdf',
    pages: 2,
    bytes: 5,
    width: 600,
    height: 800,
  });
});
afterEach(() => {
  global.FileReader = originalReader;
  delete NativeModules.P18Preview;
  jest.restoreAllMocks();
});
const blob = () => ({ size: 5, type: 'application/pdf' } as Blob);
test('bridge accepts only matching bytes/type/dimensions from the private preview', async () => {
  expect((await openP18Preview(blob(), 'application/pdf')).id).toBe(id);
  expect(bridge.open).toHaveBeenCalledWith('JVBERi0=', 'application/pdf');
});
test.each([{ bytes: 4 }, { pages: 0 }, { width: 0 }, { mime: 'text/html' }])(
  'bad native metadata closes its resource: %j',
  async extra => {
    bridge.open.mockResolvedValue({
      id,
      mime: 'application/pdf',
      pages: 2,
      bytes: 5,
      width: 600,
      height: 800,
      ...extra,
    });
    await expect(openP18Preview(blob(), 'application/pdf')).rejects.toThrow();
    expect(bridge.close).toHaveBeenCalledWith(id);
  },
);
test('oversize/unsupported content and an aborted owner never dispatch native open', async () => {
  await expect(
    openP18Preview({ size: 21 * 1024 * 1024 } as Blob, 'application/pdf'),
  ).rejects.toThrow();
  await expect(openP18Preview(blob(), 'text/html')).rejects.toThrow();
  const c = new AbortController();
  c.abort();
  await expect(
    openP18Preview(blob(), 'application/pdf', c.signal),
  ).rejects.toThrow();
  expect(bridge.open).not.toHaveBeenCalled();
});
test('render rejects a foreign URL or page before using it in Image', async () => {
  const preview = await openP18Preview(blob(), 'application/pdf');
  await expect(renderP18Page(preview, 3, 1000)).rejects.toThrow();
  expect(bridge.render).not.toHaveBeenCalled();
  bridge.render.mockResolvedValue({
    uri: 'https://foreign.invalid/private.png',
    width: 600,
    height: 800,
  });
  await expect(renderP18Page(preview, 1, 1000)).rejects.toThrow();
  bridge.render.mockResolvedValue({
    uri: 'file:///cache/p18-previews/' + id + '/page.png',
    width: 600,
    height: 800,
  });
  expect((await renderP18Page(preview, 1, 1000)).uri).toContain(id);
});
