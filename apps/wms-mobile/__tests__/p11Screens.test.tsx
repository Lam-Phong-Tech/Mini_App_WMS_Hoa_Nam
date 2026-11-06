import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { TextInput } from 'react-native';
import * as InputModule from '../src/features/profile/P11Presentation';
import { P11Button } from '../src/features/profile/P11Frame';
import { AppProviders } from '../src/app/App';
import {
  P11PasswordScreen,
  P11SessionsScreen,
  P11PasswordResultScreen,
  securityTime,
} from '../src/features/profile/P11SecurityScreens';
import { decodeProfile } from '../src/services/wms/profile';
import {
  captureSecurityOwner,
  decodeSecuritySessions,
  decodePasswordChangeResult,
  clearSecurityResultNotice,
} from '../src/services/wms/security';
import { passwordPolicy } from './fixtures/p11Policy';
import { decodePasswordPolicy } from '../src/contracts/p11Security';
import { setSession, clearSession } from '../src/auth/session';
import {
  createMemoryBackend,
  createStorage,
  setAppStorageForTesting,
} from '../src/storage/storage';
import { AppError } from '../src/errors/AppError';
import { resetHardwareBackForTest } from '../src/app/useHardwareBack';
import {
  USER_ID,
  FAMILY,
  profileResponse,
  sessionsResponse,
  authResponse,
  revokeResponse,
} from './fixtures/p10Contract';
beforeEach(() => {
  setAppStorageForTesting(createStorage(createMemoryBackend()));
  clearSession();
  setSession({
    accessToken: 'offline-access',
    userId: USER_ID,
    authSessionId: FAMILY,
  });
  resetHardwareBackForTest();
  clearSecurityResultNotice();
});
afterEach(() => {
  clearSession();
  clearSecurityResultNotice();
});
async function render(element: React.ReactNode) {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    tree = ReactTestRenderer.create(<AppProviders>{element}</AppProviders>);
  });
  return tree;
}
async function press(tree: ReactTestRenderer.ReactTestRenderer, label: string) {
  await ReactTestRenderer.act(async () => {
    tree.root.findByProps({ accessibilityLabel: label }).props.onPress();
  });
}
async function edit(
  tree: ReactTestRenderer.ReactTestRenderer,
  label: string,
  value: string,
) {
  await ReactTestRenderer.act(async () => {
    tree.root
      .findAllByType(TextInput)
      .find(n => n.props.accessibilityLabel === label)!
      .props.onChangeText(value);
  });
}
async function unmount(tree: ReactTestRenderer.ReactTestRenderer) {
  await ReactTestRenderer.act(() => tree.unmount());
}
const user = () => decodeProfile(profileResponse());
const fields = async (tree: ReactTestRenderer.ReactTestRenderer) => {
  for (const [label, value] of [
    ['Mật khẩu hiện tại', 'offline-current'],
    ['Mật khẩu mới', 'offline-new-value'],
    ['Xác nhận mật khẩu mới', 'offline-new-value'],
  ])
    await edit(tree, label, value);
};
test('missing policy blocks submit, input has no UTF16 maxLength and eye retains node/value', async () => {
  const change = jest.fn(),
    tree = await render(
      <P11PasswordScreen
        user={{ id: USER_ID }}
        fetchUser={async () => user()}
        onBack={() => {}}
        changePasswordFn={change}
      />,
    );
  await fields(tree);
  await press(tree, 'Cập nhật mật khẩu');
  expect(change).not.toHaveBeenCalled();
  const input = tree.root
    .findAllByType(TextInput)
    .find(n => n.props.accessibilityLabel === 'Mật khẩu mới')!;
  expect(input.props.maxLength).toBeUndefined();
  await press(tree, 'Hiện mật khẩu mới');
  expect(
    tree.root
      .findAllByType(TextInput)
      .find(n => n.props.accessibilityLabel === 'Mật khẩu mới'),
  ).toBe(input);
  expect(input.props.value.length > 0).toBe(true);
  await unmount(tree);
});
test('mismatch never dispatches; same-frame double submit only once; 422 updates policy and field keeps auth', async () => {
  let reject!: (e: unknown) => void;
  const change = jest.fn(
      () =>
        new Promise<any>((_r, j) => {
          reject = j;
        }),
    ),
    tree = await render(
      <P11PasswordScreen
        user={user()}
        fetchUser={async () => user()}
        onBack={() => {}}
        changePasswordFn={change}
      />,
    );
  await fields(tree);
  await edit(tree, 'Xác nhận mật khẩu mới', 'mismatch');
  await press(tree, 'Cập nhật mật khẩu');
  expect(change).not.toHaveBeenCalled();
  await edit(tree, 'Xác nhận mật khẩu mới', 'offline-new-value');
  await ReactTestRenderer.act(async () => {
    const button = tree.root.findByProps({
      accessibilityLabel: 'Cập nhật mật khẩu',
    });
    button.props.onPress();
    button.props.onPress();
  });
  expect(change).toHaveBeenCalledTimes(1);
  await ReactTestRenderer.act(async () =>
    reject(
      new AppError({
        kind: 'http',
        status: 422,
        code: 'CURRENT_PASSWORD_INCORRECT',
        message: 'rejected',
        passwordPolicy: decodePasswordPolicy(passwordPolicy('argon2id')),
      }),
    ),
  );
  expect(
    tree.root
      .findAllByType(TextInput)
      .find(n => n.props.accessibilityLabel === 'Mật khẩu hiện tại')!.props
      .value.length > 0,
  ).toBe(true);
  await unmount(tree);
});
test('server field error focuses the current input only after it becomes editable', async () => {
  jest.useFakeTimers();
  const focusEvents: { label?: string; editable?: boolean }[] = [];
  const inputSpy = jest.spyOn(InputModule, 'P11PasswordField').mockImplementation(props => {
    React.useImperativeHandle(props.inputRef, () => ({
      focus: () => focusEvents.push({ label: props.label, editable: props.editable }),
    } as unknown as React.ComponentRef<typeof TextInput>));
    return <TextInput accessibilityLabel={props.label} value={props.value}
      editable={props.editable} onChangeText={props.onChangeText} />;
  });
  let reject!: (error: unknown) => void;
  let tree: ReactTestRenderer.ReactTestRenderer | undefined;
  try {
    tree = await render(<P11PasswordScreen user={user()} fetchUser={async () => user()}
      onBack={() => {}} changePasswordFn={() => new Promise((_resolve, fail) => { reject = fail; })} />);
    await fields(tree);
    await press(tree, 'Cập nhật mật khẩu');
    expect(tree.root.findAllByType(TextInput).every(n => n.props.editable === false)).toBe(true);
    await ReactTestRenderer.act(async () => reject(new AppError({
      kind: 'http', status: 422, code: 'CURRENT_PASSWORD_INCORRECT', message: 'rejected',
    })));
    await ReactTestRenderer.act(async () => jest.advanceTimersByTime(20));
    expect(focusEvents).toEqual([{ label: 'Mật khẩu hiện tại', editable: true }]);
  } finally {
    if (tree) await unmount(tree);
    inputSpy.mockRestore();
    jest.useRealTimers();
  }
});

test('unmount cancels server-error focus before the next native frame', async () => {
  jest.useFakeTimers();
  const focus = jest.fn();
  const inputSpy = jest.spyOn(InputModule, 'P11PasswordField').mockImplementation(props => {
    React.useImperativeHandle(props.inputRef, () => ({ focus } as unknown as React.ComponentRef<typeof TextInput>));
    return <TextInput accessibilityLabel={props.label} value={props.value}
      editable={props.editable} onChangeText={props.onChangeText} />;
  });
  let reject!: (error: unknown) => void;
  let tree: ReactTestRenderer.ReactTestRenderer | undefined;
  try {
    tree = await render(<P11PasswordScreen user={user()} fetchUser={async () => user()}
      onBack={() => {}} changePasswordFn={() => new Promise((_resolve, fail) => { reject = fail; })} />);
    await fields(tree);
    await press(tree, 'Cập nhật mật khẩu');
    await ReactTestRenderer.act(async () => reject(new AppError({
      kind: 'http', status: 422, code: 'CURRENT_PASSWORD_INCORRECT', message: 'rejected',
    })));
    await unmount(tree);
    tree = undefined;
    await ReactTestRenderer.act(async () => jest.advanceTimersByTime(20));
    expect(focus).not.toHaveBeenCalled();
  } finally {
    if (tree) await unmount(tree);
    inputSpy.mockRestore();
    jest.useRealTimers();
  }
});

test('S03 uses server time/null; no auth hydration or deep-link synthetic result', async () => {
  const result = decodePasswordChangeResult(authResponse('password'));
  clearSession();
  const done = jest.fn(),
    tree = await render(
      <P11PasswordResultScreen result={result} onContinue={done} />,
    );
  expect(securityTime(null)).toBe('Chưa có thời điểm từ WMS');
  expect(securityTime(result.passwordChangedAt)).toContain('2026');
  await press(tree, 'Đăng nhập lại');
  expect(done).toHaveBeenCalledTimes(1);
  await unmount(tree);
});

test('S03 shows the supplied account/warehouse context in the reference summary rows, without exposing policy internals',async()=>{
  const result={...decodePasswordChangeResult(authResponse('password')),displayContext:{accountName:'Nhân viên TEST',warehouseName:'Kho TEST'}};
  clearSession();
  const tree=await render(<P11PasswordResultScreen result={result} onContinue={jest.fn()}/>);
  try {
    const output=JSON.stringify(tree.toJSON());
    expect(output).toContain('Tài khoản');expect(output).toContain('Nhân viên TEST');
    expect(output).toContain('Kho TEST');expect(output).toContain('Thời gian cập nhật');
    expect(output).not.toContain('Chính sách đã áp dụng');
  } finally {await unmount(tree);}
});
test('current outside page and current relation contradiction lock actual handler', async () => {
  const raw = sessionsResponse();
  raw.data.data[0].session_id = FAMILY;
  raw.data.data[0].auth_session_id = FAMILY;
  const page = decodeSecuritySessions(raw, captureSecurityOwner()),
    revoke = jest.fn(),
    tree = await render(
      <P11SessionsScreen
        onBack={() => {}}
        fetchSessionsFn={async () => page}
        revokeSessionFn={revoke}
      />,
    );
  expect(revoke).not.toHaveBeenCalled();
  expect(tree.root.findAllByProps({ accessibilityLabel: 'Thu hồi phiên' })).toHaveLength(0);
  expect(
    tree.root.findAllByProps({ accessibilityLabel: 'Xác nhận thu hồi' }),
  ).toHaveLength(0);
  await unmount(tree);
});
test('confirmed DELETE followed by list failure stays confirmed and cannot repeat target', async () => {
  const page = decodeSecuritySessions(
      sessionsResponse(),
      captureSecurityOwner(),
    ),
    fetchPage = jest
      .fn()
      .mockResolvedValueOnce(page)
      .mockRejectedValue(new AppError({ kind: 'network', message: 'offline' })),
    revoke = jest.fn(async () => revokeResponse().data.data),
    tree = await render(
      <P11SessionsScreen
        onBack={() => {}}
        fetchSessionsFn={fetchPage}
        revokeSessionFn={revoke}
      />,
    );
  await press(tree, 'Thu hồi phiên');
  await press(tree, 'Xác nhận thu hồi');
  expect(revoke).toHaveBeenCalledTimes(1);
  await press(tree, 'Đóng');
  await press(tree, 'Thu hồi phiên');
  expect(revoke).toHaveBeenCalledTimes(1);
  await unmount(tree);
});
test('Back clears transient input; late password completion after unmount cannot touch new actor', async () => {
  let resolve!: (v: any) => void;
  const change = jest.fn(
      () =>
        new Promise<any>(r => {
          resolve = r;
        }),
    ),
    back = jest.fn();
  const tree = await render(
    <P11PasswordScreen
      user={user()}
      fetchUser={async () => user()}
      onBack={back}
      changePasswordFn={change}
    />,
  );
  await fields(tree);
  await press(tree, 'Quay lại');
  expect(back).toHaveBeenCalledTimes(1);
  expect(
    tree.root.findAllByType(TextInput).every(n => n.props.value === ''),
  ).toBe(true);
  await fields(tree);
  await press(tree, 'Cập nhật mật khẩu');
  await unmount(tree);
  setSession({
    accessToken: 'other-offline',
    userId: 'other-user',
    authSessionId: 'other-family',
  });
  await ReactTestRenderer.act(async () =>
    resolve(decodePasswordChangeResult(authResponse('password'))),
  );
  expect(change).toHaveBeenCalledTimes(1);
});
test('S04 shows current/other groups, opens original nullable diagnostics and cancel does not revoke', async () => {
  const raw = sessionsResponse();
  const other = raw.data.data[0];
  raw.data.data.push({
    ...other,
    id: '11111111-1111-4111-8111-111111111111',
    session_id: FAMILY,
    auth_session_id: FAMILY,
    is_current: true,
    can_revoke: false,
    device_label: null,
    location: null,
    ip_address: null,
    user_agent: null,
  });
  raw.data.meta.total = 2;
  raw.data.meta.to = 2;
  const page = decodeSecuritySessions(raw, captureSecurityOwner());
  const revoke = jest.fn();
  const tree = await render(<P11SessionsScreen onBack={() => {}}
    fetchSessionsFn={async () => page} revokeSessionFn={revoke} />);
  const content = JSON.stringify(tree.toJSON());
  expect(content).toContain('Thiết bị hiện tại');
  expect(content).toContain('Thiết bị khác');
  expect(content).toContain('Chưa có thông tin thiết bị');
  expect(content).not.toContain('iPhone');
  expect(tree.root.findAllByType(P11Button).filter(n => n.props.label === 'Đăng xuất từ xa')).toHaveLength(1);
  await ReactTestRenderer.act(async () => {
    tree.root.findAllByProps({ accessibilityLabel: 'Thông tin phiên' })[0].props.onPress();
  });
  expect(JSON.stringify(tree.toJSON())).toContain('WMS chưa cung cấp');
  expect(revoke).not.toHaveBeenCalled();
  await press(tree, 'Đóng');
  await press(tree, 'Thu hồi phiên');
  await press(tree, 'Huỷ');
  expect(revoke).not.toHaveBeenCalled();
  await unmount(tree);
});

test('S04 current outside page preserves paging controls and does not fabricate current metadata', async () => {
  const raw = sessionsResponse();
  raw.data.meta.total = 21;
  raw.data.meta.last_page = 2;
  const page = decodeSecuritySessions(raw, captureSecurityOwner());
  const tree = await render(<P11SessionsScreen onBack={() => {}}
    fetchSessionsFn={async () => page} revokeSessionFn={jest.fn()} />);
  expect(JSON.stringify(tree.toJSON())).toContain('Phiên hiện tại không có trong trang này.');
  expect(tree.root.findByProps({ accessibilityLabel: 'Trang sau' }).props.disabled).toBe(false);
  expect(tree.root.findByProps({ accessibilityLabel: 'Trang trước' }).props.disabled).toBe(true);
  await unmount(tree);
});
