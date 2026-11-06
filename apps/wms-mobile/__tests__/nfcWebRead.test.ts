import { NfcAssignment } from '../src/features/nfc/nfcAssignment';

// Mock hardware events below test real module wiring, not physical device UAT.
// Native tsconfig excludes DOM/Web; Jest still executes the real Web module.
const {
  cancelNfc,
  readNfcTag,
  writeNfcTextToTag,
  assertNfcAssignmentWritable,
} = jest.requireActual<{
  cancelNfc(): void;
  readNfcTag(): Promise<{
    hardwareUid: string;
    hasNdefData?: boolean;
    rawCode?: string;
  }>;
  assertNfcAssignmentWritable(): Promise<void>;
  writeNfcTextToTag(
    payload: string,
    uid: string,
    timeout: number,
  ): Promise<unknown>;
}>('../src/native/nfc.web');

class LifecycleTarget {
  handlers = new Map<string, Set<() => void>>();
  addEventListener(type: string, fn: () => void) {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type)!.add(fn);
  }
  removeEventListener(type: string, fn: () => void) {
    this.handlers.get(type)?.delete(fn);
  }
  emit(type: string) {
    this.handlers.get(type)?.forEach(fn => fn());
  }
}

class FakeReader {
  static instances: FakeReader[] = [];
  static start: (reader: FakeReader) => Promise<void> = async () => {};
  handlers = new Map<string, Set<(event: any) => void>>();
  signal?: AbortSignal;
  write = jest.fn();
  constructor() {
    FakeReader.instances.push(this);
  }
  addEventListener(type: string, fn: (event: any) => void) {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type)!.add(fn);
  }
  removeEventListener(type: string, fn: (event: any) => void) {
    this.handlers.get(type)?.delete(fn);
  }
  scan(options: { signal: AbortSignal }) {
    this.signal = options.signal;
    return FakeReader.start(this);
  }
  emit(type: string, event: any = {}) {
    this.handlers.get(type)?.forEach(fn => fn(event));
  }
}
const original = new Map<string, PropertyDescriptor | undefined>();
function define(key: string, value: unknown) {
  original.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
  Object.defineProperty(globalThis, key, {
    configurable: true,
    writable: true,
    value,
  });
}
let win: LifecycleTarget & {
  top: unknown;
  self: unknown;
  setTimeout: typeof setTimeout;
  clearTimeout: typeof clearTimeout;
};
let doc: LifecycleTarget & { visibilityState: string };
beforeEach(() => {
  jest.useFakeTimers();
  FakeReader.instances = [];
  FakeReader.start = async () => {};
  win = Object.assign(new LifecycleTarget(), {
    top: {},
    self: {},
    setTimeout,
    clearTimeout,
  });
  win.top = win.self;
  doc = Object.assign(new LifecycleTarget(), { visibilityState: 'visible' });
  define('window', win);
  define('document', doc);
  define('isSecureContext', true);
  define('NDEFReader', FakeReader);
});
afterEach(() => {
  cancelNfc();
  jest.useRealTimers();
  for (const [key, descriptor] of original) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
  original.clear();
});
test('first tap inside scan is not lost; stops reader and timers', async () => {
  FakeReader.start = async reader =>
    reader.emit('reading', {
      serialNumber: ' aa:01 ',
      message: { records: [] },
    });
  await expect(readNfcTag()).resolves.toEqual({
    hardwareUid: 'aa:01',
    hasNdefData: false,
  });
  expect(FakeReader.instances[0].signal?.aborted).toBe(true);
  expect(jest.getTimerCount()).toBe(0);
  expect(FakeReader.instances[0].write).not.toHaveBeenCalled();
});

test.each(
  [
    [],
    [{ recordType: 'empty' }],
    [{ recordType: 'empty', data: new DataView(new ArrayBuffer(0)) }],
  ].map(records => ({ records })),
)('only actual empty NDEF evidence is a blank tag: %p', async ({ records }) => {
  FakeReader.start = async reader =>
    reader.emit('reading', {
      serialNumber: 'real-reader-uid',
      message: { records },
    });
  await expect(readNfcTag()).resolves.toEqual({
    hardwareUid: 'real-reader-uid',
    hasNdefData: false,
  });
});

test.each([undefined, {}, { records: null }])(
  'missing/malformed NDEF evidence is not silently blank: %p',
  async message => {
    FakeReader.start = async reader =>
      reader.emit('reading', { serialNumber: 'real-reader-uid', message });
    const result = await readNfcTag();
    expect(result.hardwareUid).toBe('real-reader-uid');
    expect(result.hasNdefData).toBeUndefined();
  },
);

test.each(
  [
    [{ recordType: 'text', data: new DataView(new ArrayBuffer(0)) }],
    [{ recordType: 'url' }],
    [{ recordType: 'mime' }],
    [{ recordType: 'unknown' }],
    [{}],
    [null],
    [{ recordType: 'empty', data: new DataView(new ArrayBuffer(1)) }],
  ].map(records => ({ records })),
)(
  'any non-empty/unknown record blocks blank classification: %p',
  async ({ records }) => {
    FakeReader.start = async reader =>
      reader.emit('reading', {
        serialNumber: 'real-reader-uid',
        message: { records },
      });
    expect((await readNfcTag()).hasNdefData).toBe(true);
  },
);
test('empty UID is not identity proof', async () => {
  FakeReader.start = async reader =>
    reader.emit('reading', { serialNumber: '' });
  await expect(readNfcTag()).rejects.toMatchObject({
    code: 'NFC_UID_UNAVAILABLE',
  });
});
test('timeout settles and cleans the reader, not only the promise', async () => {
  const reading = readNfcTag().catch(error => error);
  jest.advanceTimersByTime(30000);
  expect(await reading).toMatchObject({ code: 'NFC_SCAN_TIMEOUT' });
  expect(FakeReader.instances[0].signal?.aborted).toBe(true);
  expect(FakeReader.instances[0].handlers.get('reading')?.size).toBe(0);
});
test('cancel ignores late result and permits a new explicit read', async () => {
  const first = readNfcTag().catch(error => error);
  cancelNfc();
  FakeReader.instances[0].emit('reading', { serialNumber: 'late' });
  expect(await first).toMatchObject({ code: 'NFC_READ_CANCELED' });
  FakeReader.start = async reader =>
    reader.emit('reading', { serialNumber: 'next' });
  await expect(readNfcTag()).resolves.toEqual({ hardwareUid: 'next' });
});
test('second read cannot silently cancel the first or start a second scan', async () => {
  const first = readNfcTag().catch(error => error);
  await expect(readNfcTag()).rejects.toMatchObject({ code: 'NFC_READ_BUSY' });
  expect(FakeReader.instances[1].signal).toBeUndefined();
  cancelNfc();
  expect(await first).toMatchObject({ code: 'NFC_READ_CANCELED' });
});
test('hiding the page cancels without accepting a later tap', async () => {
  const first = readNfcTag().catch(error => error);
  doc.visibilityState = 'hidden';
  doc.emit('visibilitychange');
  expect(await first).toMatchObject({ code: 'NFC_READ_CANCELED' });
});
test('permission denied is not logout or tag success', async () => {
  FakeReader.start = async () => {
    throw Object.assign(new Error(), { name: 'NotAllowedError' });
  };
  await expect(readNfcTag()).rejects.toMatchObject({
    code: 'NFC_PERMISSION_NOT_GRANTED',
    kind: 'unknown',
  });
  expect(jest.getTimerCount()).toBe(0);
});
test('readingerror cleans the scan with a distinct failure', async () => {
  FakeReader.start = async reader => reader.emit('readingerror');
  await expect(readNfcTag()).rejects.toMatchObject({
    code: 'NFC_TAG_READ_ERROR',
  });
});
test.each(['https', 'iframe', 'hidden'])(
  'rejects unsuitable %s context before scan',
  async mode => {
    if (mode === 'https')
      Object.defineProperty(globalThis, 'isSecureContext', { value: false });
    if (mode === 'iframe') win.top = {};
    if (mode === 'hidden') doc.visibilityState = 'hidden';
    await expect(readNfcTag()).rejects.toMatchObject({
      code: mode === 'hidden' ? 'NFC_PAGE_HIDDEN' : 'NFC_CONTEXT_UNSUPPORTED',
    });
    expect(FakeReader.instances[0].signal).toBeUndefined();
  },
);
test('UID-bound P07 Web writer remains disabled', async () => {
  await expect(
    writeNfcTextToTag('payload', 'uid', 30000),
  ).rejects.toMatchObject({ code: 'NFC_UID_BOUND_WRITE_UNSUPPORTED' });
  expect(FakeReader.instances).toHaveLength(0);
});

test.each([
  {
    message: { records: [] },
    expected: 'NFC_UID_BOUND_WRITE_UNSUPPORTED',
    empty: false,
  },
  {
    message: undefined,
    expected: 'NFC_TAG_CONTENT_UNVERIFIED',
    empty: undefined,
  },
  {
    message: { records: [{ recordType: 'url' }] },
    expected: 'NFC_TAG_NOT_EMPTY',
    empty: true,
  },
])(
  'real Web reader → owner rejects safely with $expected before any hold',
  async ({ message, expected, empty }) => {
    const context = {
      actorId: 'test-actor',
      authSessionId: 'test-session',
      warehouseId: 'test-warehouse',
    };
    const resolveTag = jest.fn(),
      prepare = jest.fn(),
      save = jest.fn(),
      write = jest.fn();
    const flow = new NfcAssignment({
      context: () => context,
      preflight: async () => undefined,
      assertWritable: assertNfcAssignmentWritable,
      now: () => 0,
      createKey: jest.fn(() => 'mock-key'),
      read: readNfcTag,
      write,
      resolveTag,
      prepare,
      confirm: jest.fn(),
      reconcile: jest.fn(),
      release: jest.fn(),
      load: () => undefined,
      save,
      remove: jest.fn(),
    });
    FakeReader.start = async reader =>
      reader.emit('reading', { serialNumber: 'test-reader-uid', message });
    await expect(flow.prepare('test-item')).rejects.toMatchObject({
      code: expected,
    });
    expect(flow.readSnapshot()?.hasNdefData).toBe(empty);
    expect(flow.snapshot()).toBeUndefined();
    expect(resolveTag).not.toHaveBeenCalled();
    expect(prepare).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  },
);
