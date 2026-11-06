import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { Text as RNText } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '../src/theme/ThemeProvider';
import { Dialog } from '../src/ui/Dialog';
import {
  NoPermissionScreen,
  SessionExpiredScreen,
} from '../src/features/auth/StatusScreen';
import {
  P15ConnectionScreen,
  P15DeviceScreen,
  P15ExpiredScreen,
  P15PermissionScreen,
} from '../src/features/system/P15Screen';

// Allow cold native/SVG/Modal module initialization on a shared capture host.
// No product timeout, polling interval or business request is changed.
jest.setTimeout(60000);
let tree: Renderer.ReactTestRenderer;
const wrap = (node: React.ReactNode) => (
  <SafeAreaProvider>
    <ThemeProvider>{node}</ThemeProvider>
  </SafeAreaProvider>
);
const mount = async (node: React.ReactNode) => {
  await act(async () => {
    tree = Renderer.create(wrap(node));
  });
};
const update = async (node: React.ReactNode) => {
  await act(async () => {
    tree.update(wrap(node));
  });
};
const body = () => JSON.stringify(tree.toJSON());
const button = (label: string) => {
  const found = tree.root.findAll(
    (n) =>
      n.props.accessibilityRole === 'button' &&
      n.props.accessibilityLabel === label,
  )[0];
  if (!found) throw new Error('Missing action: ' + label);
  return found;
};
const press = async (label: string) => {
  await act(async () => {
    button(label).props.onPress();
  });
};
const visibleDialog = () =>
  tree.root.findAllByType(Dialog).find((n) => n.props.visible);
const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
beforeEach(() => jest.clearAllMocks());
afterEach(async () => {
  if (tree) await act(async () => tree.unmount());
  expect(global.fetch).not.toHaveBeenCalled();
});

test('S01 unknown never substitutes a read retry when original-request reconcile is absent', async () => {
  const read = jest.fn();
  await mount(<P15ConnectionScreen intent="read" unknown onRead={read} />);
  expect(body()).toContain('Không gửi lại phiếu trước khi đối chiếu');
  await press('Xem cách xử lý');
  expect(read).not.toHaveBeenCalled();
  expect(visibleDialog()?.props.message).toContain('yêu cầu gốc');
  expect(body()).not.toContain('Đã đồng bộ');
});

test('S01 read is explicit, single-flight and cannot report sync success from resolving a callback', async () => {
  const pending = deferred(),
    read = jest.fn(() => pending.promise);
  await mount(
    <P15ConnectionScreen ownerKey="scope-A" intent="read" onRead={read} />,
  );
  expect(read).not.toHaveBeenCalled();
  const handler = button('Tải lại').props.onPress;
  await act(async () => {
    handler();
    handler();
  });
  expect(read).toHaveBeenCalledTimes(1);
  expect(button('Đang tải…').props.accessibilityState.busy).toBe(true);
  await act(async () => pending.resolve());
  expect(button('Tải lại').props.accessibilityState.busy).toBe(false);
  expect(visibleDialog()).toBeUndefined();
  expect(body()).not.toContain('Đã đồng bộ');
});

test('S01 unknown invokes only supplied reconcile and retains original context text', async () => {
  const reconcile = jest.fn(),
    read = jest.fn();
  const number = 'PX-TEST-UI-' + 'ĐịnhDanh'.repeat(120);
  await mount(
    <P15ConnectionScreen
      intent="read"
      unknown
      context={{
        label: 'Phiếu xuất',
        number,
        status: 'Chưa xác định kết quả gửi',
      }}
      onRead={read}
      onReconcile={reconcile}
    />,
  );
  expect(body()).toContain(number);
  await press('Đối chiếu kết quả');
  expect(reconcile).toHaveBeenCalledTimes(1);
  expect(read).not.toHaveBeenCalled();
  expect(
    tree.root.findAll((n) => n.props.testID === 'p15-content-scroll').length,
  ).toBeGreaterThan(0);
  expect(
    tree.root.findAll((n) => n.props.testID === 'p15-action-dock').length,
  ).toBeGreaterThan(0);
});

test('late error from prior owner cannot open a dialog in the next scope', async () => {
  let reject!: (e: Error) => void;
  const promise = new Promise<void>((_r, j) => {
    reject = j;
  });
  await mount(
    <P15ConnectionScreen ownerKey="A" intent="read" onRead={() => promise} />,
  );
  await press('Tải lại');
  await update(<P15ConnectionScreen ownerKey="B" intent="unavailable" />);
  await act(async () => reject(new Error('old owner')));
  expect(visibleDialog()).toBeUndefined();
  expect(body()).not.toContain('old owner');
});

test('inactive or unmounted presenter cannot execute retained handlers', async () => {
  const read = jest.fn();
  await mount(<P15ConnectionScreen intent="read" onRead={read} />);
  const old = button('Tải lại').props.onPress;
  await update(
    <P15ConnectionScreen active={false} intent="read" onRead={read} />,
  );
  await act(async () => old());
  expect(tree.toJSON()).toBeNull();
  expect(read).not.toHaveBeenCalled();
  await act(async () => tree.unmount());
  await act(async () => old());
  expect(read).not.toHaveBeenCalled();
});

test('callback failure remains unverified and uses one non-backdrop-dismissed dialog', async () => {
  await mount(
    <P15ConnectionScreen
      intent="read"
      onRead={async () => {
        throw new Error('offline');
      }}
    />,
  );
  await press('Tải lại');
  const dialog = visibleDialog();
  expect(dialog?.props.title).toBe('Chưa hoàn tất thao tác');
  expect(dialog?.props.dismissOnBackdrop).toBe(false);
  expect(dialog?.props.message).toContain('Không gửi lại phiếu');
  expect(
    tree.root.findAllByType(Dialog).filter((n) => n.props.visible),
  ).toHaveLength(1);
});

test('S02 wrapper uses full panel and explicit login only; no protected footer is fabricated', async () => {
  const login = jest.fn();
  await mount(<SessionExpiredScreen onRelogin={login} />);
  expect(tree.root.findAllByType(P15ExpiredScreen)).toHaveLength(1);
  expect(body()).toContain('Đăng nhập lại và xác nhận phiên');
  expect(body()).toContain('không được tự động gửi lại');
  expect(body()).not.toContain('Chứng từ');
  expect(button('Quay lại').props.disabled).toBe(true);
  expect(login).not.toHaveBeenCalled();
  await press('Đăng nhập lại');
  expect(login).toHaveBeenCalledTimes(1);
});

test('S02 replacement retains distinct security explanation without classifying it as ordinary expiry', async () => {
  await mount(
    <P15ExpiredScreen
      reasonCode="AUTH_SESSION_REPLACED"
      onRelogin={() => undefined}
    />,
  );
  expect(body()).toContain('Phiên đăng nhập đã được thay thế');
  expect(body()).toContain('không tự gửi lại hoặc tiếp quản bằng phiên mới');
  expect(body()).not.toContain('Phiên đăng nhập hết hạn');
});

test('S03 wrapper prefers guarded caller Back and reports missing contact without inventing a channel', async () => {
  const home = jest.fn(),
    back = jest.fn();
  await mount(<NoPermissionScreen onHome={home} onBack={back} />);
  expect(tree.root.findAllByType(P15PermissionScreen)).toHaveLength(1);
  expect(body()).toContain('Chưa có kênh quản trị');
  await press('Hướng dẫn liên hệ quản trị');
  expect(visibleDialog()?.props.message).toContain('Chưa có kênh liên hệ');
  await act(async () => visibleDialog()!.props.onDismiss());
  await press('Quay lại');
  expect(back).toHaveBeenCalledTimes(1);
  expect(home).not.toHaveBeenCalled();
});

test('S03 configured contact is display-only and incomplete configuration remains missing', async () => {
  await mount(
    <P15PermissionScreen
      contact={{ label: 'Hỗ trợ TEST UI', value: 'Kênh nội bộ TEST UI' }}
    />,
  );
  await press('Liên hệ quản trị');
  expect(visibleDialog()?.props.message).toBe(
    'Hỗ trợ TEST UI: Kênh nội bộ TEST UI',
  );
  await update(
    <P15PermissionScreen
      ownerKey="new"
      contact={{ label: 'Hỗ trợ', value: '  ' }}
    />,
  );
  expect(body()).toContain('Chưa có kênh quản trị');
});

test('S04 mounts both capability cards without permission or NFC calls, and unsupported stays guidance-only', async () => {
  const request = jest.fn(),
    nfc = jest.fn();
  await mount(
    <P15DeviceScreen
      camera="not-requested"
      nfc="unsupported"
      onRequestCamera={request}
      onOpenNfc={nfc}
    />,
  );
  expect(request).not.toHaveBeenCalled();
  expect(nfc).not.toHaveBeenCalled();
  expect(body()).toContain('Chưa yêu cầu quyền');
  expect(body()).toContain('Không khả dụng trên thiết bị này');
  await press('Hướng dẫn thiết bị hỗ trợ');
  expect(visibleDialog()?.props.title).toBe('Thiết bị hỗ trợ NFC');
  expect(nfc).not.toHaveBeenCalled();
});

test.each(['denied', 'blocked'] as const)(
  'S04 camera %s never triggers permission request, even through a retained handler after state change',
  async (state) => {
    const request = jest.fn(),
      check = jest.fn();
    await mount(
      <P15DeviceScreen
        camera="not-requested"
        nfc="unavailable"
        onRequestCamera={request}
      />,
    );
    const stale = button('Cho phép camera').props.onPress;
    await update(
      <P15DeviceScreen
        camera={state}
        nfc="unavailable"
        onRequestCamera={request}
        onCheckCamera={check}
      />,
    );
    await act(async () => stale());
    expect(request).not.toHaveBeenCalled();
    await press('Hướng dẫn cấp quyền');
    expect(visibleDialog()?.props.title).toBe('Hướng dẫn cấp quyền camera');
    expect(check).not.toHaveBeenCalled();
  },
);

test('S04 explicit camera CTA is single-flight and state comes only from owner props', async () => {
  const pending = deferred(),
    request = jest.fn(() => pending.promise);
  await mount(
    <P15DeviceScreen
      camera="not-requested"
      nfc="disabled"
      onRequestCamera={request}
    />,
  );
  const handler = button('Cho phép camera').props.onPress;
  await act(async () => {
    handler();
    handler();
  });
  expect(request).toHaveBeenCalledTimes(1);
  await act(async () => pending.resolve());
  expect(body()).not.toContain('Đã cho phép camera');
  expect(body()).toContain('NFC đang tắt');
  await update(
    <P15DeviceScreen
      camera="granted"
      nfc="available"
      onRequestCamera={request}
    />,
  );
  expect(body()).toContain('Đã cho phép camera');
  expect(body()).not.toContain('Đã liên kết');
  expect(request).toHaveBeenCalledTimes(1);
});

test('owner footer is passed through without copying global navigation', async () => {
  await mount(
    <P15ConnectionScreen
      intent="unavailable"
      footer={<RNText>OWNER_FOOTER</RNText>}
    />,
  );
  expect(body()).toContain('OWNER_FOOTER');
  expect(body()).not.toContain('Chứng từ');
});
