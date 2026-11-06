import { NativeModules, Platform } from 'react-native';
import {
  cancelP12Save,
  hashNativeFile,
  openP12File,
  saveP12Binary,
} from '../src/native/p12Files.ios';
import {
  closeP18Preview,
  openP18Preview,
  renderP18Page,
} from '../src/native/p18Preview.ios';

const id = '90000000-0000-4000-8000-000000000099';
const uri = 'file:///private/cache/p18-previews/' + id + '/document.png';
const savedURI = 'file:///private/export/receipt.pdf';
const originalReader = global.FileReader;
const documents = {
  save: jest.fn(),
  open: jest.fn(),
  hashFile: jest.fn(),
  cancel: jest.fn(),
};
const preview = { open: jest.fn(), render: jest.fn(), close: jest.fn() };
const pdf = () => ({ size: 5, type: 'application/pdf' } as Blob);
const pdfInfo = () => ({
  id,
  mime: 'application/pdf',
  pages: 2,
  width: 600,
  height: 800,
  bytes: 5,
});

beforeEach(() => {
  jest.replaceProperty(Platform, 'OS', 'ios');
  jest.clearAllMocks();
  NativeModules.P12Documents = documents;
  NativeModules.P18Preview = preview;
  documents.save.mockResolvedValue({ uri: savedURI, bytes: 5 });
  documents.open.mockResolvedValue(true);
  documents.hashFile.mockResolvedValue({ sha256: 'a'.repeat(64), bytes: 5 });
  preview.open.mockResolvedValue(pdfInfo());
  preview.render.mockResolvedValue({
    uri: uri.replace('document', 'page'),
    width: 600,
    height: 800,
  });
  global.FileReader = class {
    result = 'data:application/pdf;base64,JVBERi0=';
    onload?: () => void;
    readAsDataURL() {
      this.onload?.();
    }
    abort() {}
  } as unknown as typeof FileReader;
});

afterEach(() => {
  cancelP12Save();
  closeP18Preview(id);
  global.FileReader = originalReader;
  delete NativeModules.P12Documents;
  delete NativeModules.P18Preview;
  jest.restoreAllMocks();
});

test('iOS exports authorized bytes and opens the returned saved URI', async () => {
  expect(await saveP12Binary(pdf(), 'receipt.pdf', 'application/pdf')).toEqual({
    uri: savedURI,
    bytes: 5,
  });
  expect(documents.save).toHaveBeenCalledWith(
    'JVBERi0=',
    'receipt.pdf',
    'application/pdf',
  );
  expect(await openP12File(savedURI)).toBe(true);
  expect(documents.open).toHaveBeenCalledWith(savedURI);
});

test('iOS refuses a save result with wrong byte count', async () => {
  documents.save.mockResolvedValue({ uri: savedURI, bytes: 4 });
  await expect(
    saveP12Binary(pdf(), 'receipt.pdf', 'application/pdf'),
  ).rejects.toThrow('Số bytes');
});

test('iOS hashes the selected local source and rejects malformed digests', async () => {
  expect(await hashNativeFile(savedURI)).toEqual({
    sha256: 'a'.repeat(64),
    bytes: 5,
  });
  expect(documents.hashFile).toHaveBeenCalledWith(savedURI);
  for (const result of [
    { sha256: 'bad', bytes: 5 },
    { sha256: 'a'.repeat(64), bytes: 0 },
  ]) {
    documents.hashFile.mockResolvedValue(result);
    await expect(hashNativeFile(savedURI)).rejects.toThrow('hash/bytes');
  }
});

test('iOS preview uses matching private PDF metadata and renders within its page range', async () => {
  const opened = await openP18Preview(pdf(), 'application/pdf');
  expect(opened).toMatchObject(pdfInfo());
  expect(preview.open).toHaveBeenCalledWith('JVBERi0=', 'application/pdf');
  expect(await renderP18Page(opened, 2, 9999)).toEqual({
    uri: uri.replace('document', 'page'),
    width: 600,
    height: 800,
  });
  expect(preview.render).toHaveBeenCalledWith(id, 2, 1800);
  await expect(renderP18Page(opened, 3, 1000)).rejects.toThrow('Trang ngoài');
  expect(preview.render).toHaveBeenCalledTimes(1);
});

test.each([{ bytes: 4 }, { pages: 0 }, { width: 0 }, { mime: 'text/html' }])(
  'iOS closes a native preview whose metadata does not match the source: %j',
  async extra => {
    preview.open.mockResolvedValue({ ...pdfInfo(), ...extra });
    await expect(openP18Preview(pdf(), 'application/pdf')).rejects.toThrow(
      'xác minh',
    );
    expect(preview.close).toHaveBeenCalledWith(id);
  },
);

test('iOS image preview accepts only an exact private local URI for the returned ID', async () => {
  const image = { size: 5, type: 'image/png' } as Blob;
  preview.open.mockResolvedValue({
    ...pdfInfo(),
    mime: 'image/png',
    pages: 1,
    uri,
  });
  expect((await openP18Preview(image, 'image/png')).uri).toBe(uri);
  for (const foreign of [
    'https://example.invalid/' + id + '/image.png',
    uri + '?token=secret',
    uri.replace(id, id + '-other'),
    uri.replace('/document.png', '/../outside.png'),
    uri.replace('/document.png', '/%2e%2e/outside.png'),
  ]) {
    preview.open.mockResolvedValue({
      ...pdfInfo(),
      mime: 'image/png',
      pages: 1,
      uri: foreign,
    });
    await expect(openP18Preview(image, 'image/png')).rejects.toThrow();
  }
});

test('iOS rejects oversize content, type mismatch and aborted owner before native work', async () => {
  await expect(
    openP18Preview({ size: 20 * 1024 * 1024 + 1 } as Blob, 'application/pdf'),
  ).rejects.toThrow('20 MiB');
  await expect(openP18Preview(pdf(), 'image/png')).rejects.toThrow('20 MiB');
  const controller = new AbortController();
  controller.abort();
  await expect(
    openP18Preview(pdf(), 'application/pdf', controller.signal),
  ).rejects.toThrow('Đã đóng');
  expect(preview.open).not.toHaveBeenCalled();
});

test('iOS releases a native preview returned after owner cancellation', async () => {
  const controller = new AbortController();
  preview.open.mockImplementationOnce(async () => {
    controller.abort();
    return pdfInfo();
  });
  await expect(
    openP18Preview(pdf(), 'application/pdf', controller.signal),
  ).rejects.toThrow('Đã đóng');
  expect(preview.close).toHaveBeenCalledWith(id);
});

test('iOS render refuses remote URI and nonfinite requested dimensions', async () => {
  const opened = await openP18Preview(pdf(), 'application/pdf');
  preview.render.mockResolvedValue({
    uri: 'https://example.invalid/page.png',
    width: 600,
    height: 800,
  });
  await expect(renderP18Page(opened, 1, 1000)).rejects.toThrow('Trang xem');
  preview.render.mockClear();
  await expect(renderP18Page(opened, 1, Number.NaN)).rejects.toThrow();
  expect(preview.render).not.toHaveBeenCalled();
});

test('iOS native bridges fail clearly when unavailable', async () => {
  delete NativeModules.P12Documents;
  delete NativeModules.P18Preview;
  await expect(
    saveP12Binary(pdf(), 'receipt.pdf', 'application/pdf'),
  ).rejects.toThrow('Chưa có');
  await expect(openP18Preview(pdf(), 'application/pdf')).rejects.toThrow(
    'chưa sẵn sàng',
  );
});
