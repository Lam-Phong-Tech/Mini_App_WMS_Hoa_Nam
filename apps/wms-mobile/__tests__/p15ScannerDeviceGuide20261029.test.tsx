// Scoped memory/native-port tests. No real hardware, API or session is used.
import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { AppState, PermissionsAndroid, Platform } from 'react-native';
import { Camera } from 'react-native-camera-kit';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '../src/theme/ThemeProvider';
import {
  BusinessScanScreen,
  type BusinessScanScreenProps,
} from '../src/features/scan/BusinessScanScreen';
import { P15DeviceScreen } from '../src/features/system/P15Screen';
import { P04ScanPresentation } from '../src/features/inbound/P04ScanPresentation';
import { CodeInput } from '../src/ui/CodeInput';
import { Sheet } from '../src/ui/Sheet';
import {
  captureSessionScope,
  clearSession,
  getSessionGeneration,
  isSessionScopeCurrent,
  setSession,
} from '../src/auth/session';
import {
  createMemoryBackend,
  createStorage,
  setAppStorageForTesting,
} from '../src/storage/storage';
import {
  resetTierCheckForTesting,
  setTierCheckForTesting,
} from '../src/services/wms/tierCheck';
import * as nfc from '../src/native/nfc';
import * as imageScanner from '../src/features/scan/imageQrScanner';

jest.mock('../src/features/scan/imageQrScanner', () => ({
  supportsImageQrScan: true,
  pickQrImage: jest.fn(async () => undefined),
  decodeQrImage: jest.fn(async () => ({ code: 'UI-IMAGE-CODE', format: 'qr' })),
}));

jest.mock('../src/native/nfc', () => ({
  getNfcAvailability: jest.fn(async () => 'unavailable'),
  readNfcTag: jest.fn(() => {
    throw new Error('NO_TAG_READ_ALLOWED');
  }),
  writeNfcTextToTag: jest.fn(() => {
    throw new Error('NO_TAG_WRITE_ALLOWED');
  }),
}));

jest.setTimeout(60000);
let tree: Renderer.ReactTestRenderer | undefined;
let appStateListeners: Array<(state: string) => void>;
const originalAppState = AppState.currentState;
const session = {
  accessToken: 'TEST_UI_MEMORY_ONLY',
  userId: 'p15-ui-actor',
  authSessionId: 'p15-ui-family-A',
  activeWarehouseId: 'p15-ui-warehouse-A',
};
const wrap = (node: React.ReactNode) => (
  <SafeAreaProvider>
    <ThemeProvider>{node}</ThemeProvider>
  </SafeAreaProvider>
);
const root = () => {
  if (!tree) throw Error('Tree not mounted');
  return tree.root;
};
const button = (label: string) => {
  const found = root().findAll(
    (n) =>
      (n.props.label === label || n.props.accessibilityLabel === label) &&
      typeof n.props.onPress === 'function',
  )[0];
  if (!found) throw Error('Missing ' + label);
  return found;
};
const press = async (label: string) =>
  act(async () => {
    button(label).props.onPress();
  });
const guide = () => root().findByType(P15DeviceScreen);
const modal = () =>
  root().findAll(
    (n) =>
      n.props.testID === 'p15-scanner-device-guide' &&
      typeof n.props.onRequestClose === 'function',
  )[0];
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
const base = {
  title: 'TEST UI scanner',
  documentName: 'TEST UI retained document',
  sessionLabel: 'TEST UI scan',
  scannedCount: 1,
  layout: 'board' as const,
  onBack: jest.fn(),
  onDone: jest.fn(),
  onScan: jest.fn(async () => ({ accepted: true })),
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.replaceProperty(Platform, 'OS', 'android');
  AppState.currentState = 'active';
  appStateListeners = [];
  jest
    .spyOn(AppState, 'addEventListener')
    .mockImplementation((_event, listener) => {
      appStateListeners.push(listener as (state: string) => void);
      return { remove: jest.fn() };
    });
  jest.spyOn(PermissionsAndroid, 'check').mockResolvedValue(false);
  jest.spyOn(PermissionsAndroid, 'request').mockResolvedValue('denied');
  setAppStorageForTesting(createStorage(createMemoryBackend()));
  clearSession();
  setSession(session);
  setTierCheckForTesting({ status: 'matched', expected: 'dev-test' });
  (nfc.getNfcAvailability as jest.Mock).mockResolvedValue('unavailable');
});
afterEach(async () => {
  if (tree) await act(async () => tree!.unmount());
  tree = undefined;
  clearSession();
  resetTierCheckForTesting();
  jest.restoreAllMocks();
  AppState.currentState = originalAppState;
  expect(nfc.readNfcTag).not.toHaveBeenCalled();
  expect(nfc.writeNfcTextToTag).not.toHaveBeenCalled();
  expect(global.fetch).not.toHaveBeenCalled();
});
async function mount(props: Partial<BusinessScanScreenProps> = {}) {
  await act(async () => {
    tree = Renderer.create(wrap(<BusinessScanScreen {...base} {...props} />));
  });
}

test('inbound board provides Tiếp tục quét through the real guarded camera resume without submitting a code or leaving the owner',async()=>{
 await mount({p04Context:{documentRef:'PN-TEST-ONLY',codes:[{raw:'KEEP-UI-1',sku:'SKU-TEST',quantity:1,at:1}],attempts:[]}});
 expect(button('Tiếp tục quét').props.disabled).toBe(false);
 await press('Tiếp tục quét');
 expect(PermissionsAndroid.request).toHaveBeenCalledTimes(1);
 expect(base.onScan).not.toHaveBeenCalled();expect(base.onDone).not.toHaveBeenCalled();expect(base.onBack).not.toHaveBeenCalled();
 expect(root().findByType(P04ScanPresentation).props.codeCount).toBe(1);
});
test.each([{scanPaused:true},{p04Context:{documentRef:'PN-TEST-ONLY',codes:[],attempts:[],processing:true}}])('inbound continue cannot open the camera through a disabled/blocked callback: %j',async extra=>{
 await mount({p04Context:{documentRef:'PN-TEST-ONLY',codes:[],attempts:[]},...extra});
 expect(button('Tiếp tục quét').props.disabled).toBe(true);await press('Tiếp tục quét');
 expect(PermissionsAndroid.request).not.toHaveBeenCalled();expect(base.onScan).not.toHaveBeenCalled();expect(base.onDone).not.toHaveBeenCalled();
});

test('no NFC/status or permission request on mount; explicit help mounts the actual product guide in owner Modal', async () => {
  await mount();
  expect(nfc.getNfcAvailability).not.toHaveBeenCalled();
  expect(PermissionsAndroid.check).toHaveBeenCalledTimes(1);
  expect(PermissionsAndroid.request).not.toHaveBeenCalled();
  await press('Hướng dẫn Camera và NFC');
  expect(modal().props.visible).toBe(true);
  expect(guide().props.camera).toBe('denied');
  expect(nfc.getNfcAvailability).toHaveBeenCalledTimes(1);
  expect(guide().props.onOpenNfc).toBeUndefined();
  expect(button('Về màn NFC để kiểm tra').props.disabled).toBe(true);
  expect(PermissionsAndroid.check).toHaveBeenCalledTimes(1);
});

test('native Back and close return to the same scanner without invoking owner navigation or clearing typed/filter state', async () => {
  const onViewChange = jest.fn();
  const codes = [{ raw: 'UI-ACCEPTED-1', sku: 'UI-SKU', quantity: 2, at: 1 }];
  const context = {
    documentRef: 'UI-DOCUMENT-1',
    codes,
    attempts: [],
    onViewChange,
    viewState: {
      rawInput: ' UI typed kept ',
      manual: true,
      filter: 'invalid' as const,
      all: true,
    },
  };
  await mount({ p04Context: context });
  const before = JSON.stringify(onViewChange.mock.calls);
  await press('Hướng dẫn Camera và NFC');
  await act(async () => modal().props.onRequestClose());
  expect(modal()).toBeUndefined();
  expect(root().findByType(CodeInput).props.value).toBe(' UI typed kept ');
  const presentation = root().findByType(P04ScanPresentation);
  expect(presentation.props.filter).toBe('invalid');
  expect(presentation.props.all).toBe(true);
  expect(presentation.props.codeCount).toBe(1);
  expect(presentation.props.quantity).toBe(2);
  expect(JSON.stringify(onViewChange.mock.calls)).toBe(before);
  expect(base.onBack).not.toHaveBeenCalled();
  expect(base.onDone).not.toHaveBeenCalled();
  expect(base.onScan).not.toHaveBeenCalled();
  await press('Hướng dẫn Camera và NFC');
  await press('Đóng hướng dẫn');
  expect(modal()).toBeUndefined();
  expect(root().findByType(CodeInput).props.value).toBe(' UI typed kept ');
});

test('permission check reuses the existing hook and granting while open does not resume camera on close', async () => {
  await mount();
  await press('Hướng dẫn Camera và NFC');
  (PermissionsAndroid.check as jest.Mock).mockResolvedValue(true);
  await act(async () => {
    await guide().props.onCheckCamera();
  });
  expect(PermissionsAndroid.check).toHaveBeenCalledTimes(2);
  expect(PermissionsAndroid.request).not.toHaveBeenCalled();
  expect(root().findAllByType(Camera)).toHaveLength(0);
  await act(async () => modal().props.onRequestClose());
  expect(root().findAllByType(Camera)).toHaveLength(0);
  await press('Bật camera');
  expect(root().findAllByType(Camera)).toHaveLength(1);
  expect(PermissionsAndroid.request).not.toHaveBeenCalled();
});

test('only explicit request callback may request permission; NFC recheck is status-only', async () => {
  await mount();
  await press('Hướng dẫn Camera và NFC');
  await act(async () => {
    await guide().props.onRequestCamera();
  });
  expect(PermissionsAndroid.request).toHaveBeenCalledTimes(1);
  await press('Kiểm tra lại NFC');
  expect(nfc.getNfcAvailability).toHaveBeenCalledTimes(2);
  expect(root().findAllByType(Camera)).toHaveLength(0);
});

test('rapid open/check is single-flight; close invalidates an outstanding NFC observation', async () => {
  const pending = deferred<nfc.NfcAvailability>();
  (nfc.getNfcAvailability as jest.Mock).mockReturnValue(pending.promise);
  await mount();
  const open = button('Hướng dẫn Camera và NFC').props.onPress;
  await act(async () => {
    open();
    open();
  });
  expect(nfc.getNfcAvailability).toHaveBeenCalledTimes(1);
  const check = button('Kiểm tra lại NFC').props.onPress;
  await act(async () => check());
  expect(nfc.getNfcAvailability).toHaveBeenCalledTimes(1);
  await act(async () => modal().props.onRequestClose());
  await act(async () => pending.resolve('available'));
  expect(modal()).toBeUndefined();
  expect(root().findAllByType(Camera)).toHaveLength(0);
});

test.each(['family', 'warehouse'] as const)(
  'old guide callbacks cannot navigate/update after %s changes, even if generation is unchanged',
  async (change) => {
    const route = jest.fn(),
      pending = deferred<nfc.NfcAvailability>();
    (nfc.getNfcAvailability as jest.Mock).mockReturnValue(pending.promise);
    await mount({ onOpenNfcDeviceGuide: route });
    await press('Hướng dẫn Camera và NFC');
    const oldRoute = guide().props.onOpenNfc,
      oldCheck = guide().props.onCheckCamera;
    const generation = getSessionGeneration();
    await act(async () =>
      setSession({
        ...session,
        ...(change === 'family'
          ? { authSessionId: 'p15-ui-family-B' }
          : { activeWarehouseId: 'p15-ui-warehouse-B' }),
      }),
    );
    if (change === 'warehouse') expect(getSessionGeneration()).toBe(generation);
    expect(modal()).toBeUndefined();
    await act(async () => {
      await oldRoute();
      await oldCheck();
      pending.resolve('available');
    });
    expect(route).not.toHaveBeenCalled();
    expect(PermissionsAndroid.check).toHaveBeenCalledTimes(1);
    expect(modal()).toBeUndefined();
    expect(root().findAllByType(Camera)).toHaveLength(0);
  },
);

test('busy owner and detached handler cannot open the guide', async () => {
  await mount();
  const open = button('Hướng dẫn Camera và NFC').props.onPress;
  await act(async () =>
    tree!.update(wrap(<BusinessScanScreen {...base} scanPaused />)),
  );
  await act(async () => open());
  expect(modal()).toBeUndefined();
  expect(nfc.getNfcAvailability).not.toHaveBeenCalled();
  await act(async () => tree!.unmount());
  tree = undefined;
  await act(async () => open());
  expect(nfc.getNfcAvailability).not.toHaveBeenCalled();
});

test('caller-supplied NFC route is guarded before invocation; no fallback route is invented', async () => {
  const scope = captureSessionScope(),
    route = jest.fn(() => {
      if (!isSessionScopeCurrent(scope)) throw Error('scope changed');
    });
  await mount({ onOpenNfcDeviceGuide: route });
  await press('Hướng dẫn Camera và NFC');
  await act(async () => {
    await guide().props.onOpenNfc();
  });
  expect(route).toHaveBeenCalledTimes(1);
  expect(modal()).toBeUndefined();
});

test('ready/granted toolbar does not gain the denied help control or an extra permission hook', async () => {
  (PermissionsAndroid.check as jest.Mock).mockResolvedValue(true);
  await mount({ p04Context: { codes: [], attempts: [] } });
  expect(
    root().findAll((n) => n.props.label === 'Hướng dẫn Camera và NFC'),
  ).toHaveLength(0);
  await press('Bật camera');
  expect(root().findAllByType(Camera)).toHaveLength(1);
  expect(PermissionsAndroid.check).toHaveBeenCalledTimes(1);
  expect(nfc.getNfcAvailability).not.toHaveBeenCalled();
});

test('old camera frames cannot decode while guide is open, after close, or after explicit resume of a new camera epoch', async () => {
  (PermissionsAndroid.check as jest.Mock).mockResolvedValue(true);
  await mount();
  const stale = root().findByType(Camera).props.onReadCode;
  (PermissionsAndroid.check as jest.Mock).mockResolvedValue(false);
  await act(async () => {
    for (const listener of appStateListeners) listener('active');
  });
  await press('Hướng dẫn Camera và NFC');
  const event = {
    nativeEvent: { codeStringValue: 'UI-OLD-FRAME', codeFormat: 'qr' },
  };
  await act(async () => stale(event));
  expect(base.onScan).not.toHaveBeenCalled();
  await act(async () => modal().props.onRequestClose());
  await act(async () => stale(event));
  expect(root().findAllByType(Camera)).toHaveLength(0);
  expect(base.onScan).not.toHaveBeenCalled();
  (PermissionsAndroid.request as jest.Mock).mockResolvedValue('granted');
  await press('Bật camera');
  expect(root().findAllByType(Camera)).toHaveLength(1);
  await act(async () => stale(event));
  expect(base.onScan).not.toHaveBeenCalled();
});

test('explicit image scan after closing guide remains available while camera stays off', async () => {
  (imageScanner.pickQrImage as jest.Mock).mockResolvedValue({
    uri: 'memory-only',
  });
  await mount({ layout: 'immersive' });
  await press('Hướng dẫn Camera và NFC');
  await act(async () => modal().props.onRequestClose());
  await press('Chọn ảnh để quét QR');
  expect(imageScanner.decodeQrImage).toHaveBeenCalledTimes(1);
  expect(base.onScan).toHaveBeenCalledWith('UI-IMAGE-CODE', 'CAMERA');
  expect(root().findAllByType(Camera)).toHaveLength(0);
  expect(PermissionsAndroid.request).not.toHaveBeenCalled();
});

test('background status completion does not leave the guide permanently busy on foreground', async () => {
  const pending = deferred<nfc.NfcAvailability>();
  (nfc.getNfcAvailability as jest.Mock).mockReturnValueOnce(pending.promise);
  await mount();
  await press('Hướng dẫn Camera và NFC');
  await act(async () => {
    for (const listener of appStateListeners) listener('background');
  });
  await act(async () => pending.resolve('available'));
  await act(async () => {
    for (const listener of appStateListeners) listener('active');
  });
  expect(modal()).toBeDefined();
  expect(button('Kiểm tra lại NFC').props.disabled).toBe(false);
  expect(nfc.getNfcAvailability).toHaveBeenCalledTimes(1);
  await press('Kiểm tra lại NFC');
  expect(nfc.getNfcAvailability).toHaveBeenCalledTimes(2);
});

test('queued manual-open and help actions never stack scanner modals; Back restores the queued manual state', async () => {
  await mount();
  const manual = button('Nhập tay').props.onPress;
  const help = button('Hướng dẫn Camera và NFC').props.onPress;
  await act(async () => {
    manual();
    help();
  });
  expect(modal()).toBeDefined();
  expect(
    root()
      .findAllByType(Sheet)
      .filter((s) => s.props.visible),
  ).toHaveLength(0);
  await act(async () => modal().props.onRequestClose());
  expect(
    root()
      .findAllByType(Sheet)
      .filter((s) => s.props.visible),
  ).toHaveLength(1);
  expect(base.onScan).not.toHaveBeenCalled();
});

test('guard passed to async NFC navigation becomes false after scope replacement', async () => {
  const pending = deferred<void>();
  const navigate = jest.fn();
  const route = jest.fn(async (current: () => boolean) => {
    await pending.promise;
    if (current()) navigate();
  });
  await mount({ onOpenNfcDeviceGuide: route });
  await press('Hướng dẫn Camera và NFC');
  let operation!: Promise<void>;
  await act(async () => {
    operation = guide().props.onOpenNfc();
  });
  await act(async () =>
    setSession({ ...session, activeWarehouseId: 'UI-WAREHOUSE-NEW' }),
  );
  await act(async () => {
    pending.resolve();
    await operation;
  });
  expect(route).toHaveBeenCalledTimes(1);
  expect(navigate).not.toHaveBeenCalled();
  expect(modal()).toBeUndefined();
});

test('callbacks from a closed guide cannot close or recheck its replacement in the same scope', async () => {
  await mount();
  await press('Hướng dẫn Camera và NFC');
  const oldClose = modal().props.onRequestClose;
  const oldCheck = guide().props.onCheckCamera;
  await act(async () => oldClose());
  await press('Hướng dẫn Camera và NFC');
  await act(async () => {
    oldClose();
    await oldCheck();
  });
  expect(modal()).toBeDefined();
  expect(PermissionsAndroid.check).toHaveBeenCalledTimes(1);
  expect(nfc.getNfcAvailability).toHaveBeenCalledTimes(2);
});
