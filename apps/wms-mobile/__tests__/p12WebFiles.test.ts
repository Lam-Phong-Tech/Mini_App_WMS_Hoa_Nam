import {
  cancelP12Save,
  openP12File,
  saveP12Binary,
  p12SaveMessage,
} from '../src/native/p12Files.web';

const originalDocument = Object.getOwnPropertyDescriptor(
  globalThis,
  'document',
);
let createUrl: jest.SpyInstance, revoke: jest.SpyInstance;
let links: Array<{
  href: string;
  download?: string;
  target?: string;
  rel: string;
  style: { display?: string };
  click: jest.Mock;
  remove: jest.Mock;
}>;
beforeEach(() => {
  links = [];
  createUrl = jest
    .spyOn(URL, 'createObjectURL')
    .mockReturnValue('blob:https://appqr.lptech.info.vn/private-test');
  revoke = jest
    .spyOn(URL, 'revokeObjectURL')
    .mockImplementation(() => undefined);
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      body: { appendChild: jest.fn() },
      createElement: jest.fn(() => {
        const link = {
          href: '',
          rel: '',
          style: {},
          click: jest.fn(),
          remove: jest.fn(),
        };
        links.push(link);
        return link;
      }),
    },
  });
});
afterEach(() => {
  cancelP12Save();
  createUrl.mockRestore();
  revoke.mockRestore();
  if (originalDocument)
    Object.defineProperty(globalThis, 'document', originalDocument);
  else Reflect.deleteProperty(globalThis, 'document');
});

test('web dispatches actual owner Blob via a local URL, not native Android; no disk-success claim', async () => {
  const blob = new Blob(['%PDF-1.4\nreal-test-bytes'], {
    type: 'application/pdf',
  });
  const saved = await saveP12Binary(blob, 'sub/path.pdf', 'application/pdf');
  expect(createUrl).toHaveBeenCalledWith(blob);
  expect(saved.bytes).toBe(blob.size);
  expect(links[0].download).toBe('sub_path.pdf');
  expect(links[0].click).toHaveBeenCalledTimes(1);
  expect(links[0].remove).toHaveBeenCalledTimes(1);
  expect(links[0].href.startsWith('blob:')).toBe(true);
  expect(p12SaveMessage).toContain('không xác nhận được');
  await openP12File(saved.uri);
  expect(links[1].rel).toBe('noopener noreferrer');
  cancelP12Save();
  expect(revoke).toHaveBeenCalledWith(saved.uri);
  await expect(openP12File(saved.uri)).rejects.toThrow('ngữ cảnh');
});

test('web refuses arbitrary hosts, empty bytes and a metadata/MIME mismatch', async () => {
  await expect(openP12File('https://other.invalid/file')).rejects.toThrow();
  await expect(
    saveP12Binary(
      new Blob([], { type: 'image/png' }),
      'a.png',
      'image/png',
    ),
  ).rejects.toThrow();
  await expect(
    saveP12Binary(
      new Blob(['x'], { type: 'text/html' }),
      'a.pdf',
      'application/pdf',
    ),
  ).rejects.toThrow();
  expect(createUrl).not.toHaveBeenCalled();
});

test('a failed browser dispatch cleans up its URL rather than returning success', async () => {
  const createElement = Object.getOwnPropertyDescriptor(globalThis, 'document')!
    .value.createElement as jest.Mock;
  createElement.mockImplementation(() => {
    const link = {
      href: '',
      rel: '',
      style: {},
      click: jest.fn(() => {
        throw Error('blocked');
      }),
      remove: jest.fn(),
    };
    links.push(link);
    return link;
  });
  await expect(
    saveP12Binary(
      new Blob(['png'], { type: 'image/png' }),
      'a.png',
      'image/png',
    ),
  ).rejects.toThrow('blocked');
  expect(revoke).toHaveBeenCalled();
  expect(links[0].remove).toHaveBeenCalled();
});
