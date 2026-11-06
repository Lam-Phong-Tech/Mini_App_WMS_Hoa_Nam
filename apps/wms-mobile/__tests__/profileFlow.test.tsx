import { requestProfileNavigation } from '../src/features/profile/profileNavigation';
import {
  securityContextFromProfile,
  captureSecurityOwner,
  type StableSessionId,
} from '../src/services/wms/security';
import { decodeProfile } from '../src/services/wms/profile';
import {
  USER_ID,
  FAMILY,
  sessionItem,
  profileResponse,
  authResponse,
  sessionsResponse,
  revokeResponse,
} from './fixtures/p10Contract';
/** Prompt 10 — contract và UI màn Cá nhân. Không test nào gọi mạng thật. */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { TextInput } from 'react-native';
import { AppProviders } from '../src/app/App';
import { resetHardwareBackForTest } from '../src/app/useHardwareBack';
import { clearSession, setSession } from '../src/auth/session';
import { AppError } from '../src/errors/AppError';
import { ProfileScreen } from '../src/features/profile/ProfileScreen';
import { P10Frame } from '../src/features/profile/P10Frame';
import { approvedWriteFor } from '../src/api/writeGate';
import {
  changeProfilePassword,
  fetchProfileSessions,
  revokeProfileSession,
  updateCurrentProfile,
  type ProfileServiceDeps,
} from '../src/services/wms/profile';
import {
  createMemoryBackend,
  createStorage,
  setAppStorageForTesting,
} from '../src/storage/storage';

beforeEach(() => {
  setAppStorageForTesting(createStorage(createMemoryBackend()));
  resetHardwareBackForTest();
  setSession({
    accessToken: 'fixture-access',
    refreshToken: 'fixture-refresh',
    userId: USER_ID,
    authSessionId: FAMILY,
    issuedAtMs: Date.UTC(2026, 8, 19, 2, 0),
  });
});

afterEach(() => {
  jest.useRealTimers();
});

function collectText(node: unknown, out: string[] = []): string[] {
  if (typeof node === 'string' || typeof node === 'number') {
    out.push(String(node));
    return out;
  }
  if (Array.isArray(node)) {
    for (const child of node) collectText(child, out);
    return out;
  }
  if (typeof node === 'object' && node !== null && 'children' in node) {
    collectText((node as { children?: unknown }).children, out);
  }
  return out;
}

async function renderProfile(
  props: React.ComponentProps<typeof ProfileScreen>,
): Promise<ReactTestRenderer.ReactTestRenderer> {
  let tree: ReactTestRenderer.ReactTestRenderer | undefined;
  await ReactTestRenderer.act(async () => {
    tree = ReactTestRenderer.create(
      <AppProviders>
        <ProfileScreen {...props} />
      </AppProviders>,
    );
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
  if (tree === undefined) throw new Error('Không dựng được ProfileScreen.');
  return tree;
}

function textOf(tree: ReactTestRenderer.ReactTestRenderer): string {
  return collectText(tree.toJSON()).join(' | ');
}

async function unmount(
  tree: ReactTestRenderer.ReactTestRenderer,
): Promise<void> {
  await ReactTestRenderer.act(() => tree.unmount());
}

const USER = {
  id: USER_ID,
  name: 'Nguyễn Minh Anh với tên hiển thị rất dài để kiểm tra xuống dòng',
  email: 'minhanh@hoanam.vn',
  phone: '0901234567',
  role: 'Nhân viên kho',
  permissions: ['inbound.read', 'outbound.read'],
  warehouse_scope_ids: ['KHO-HN'],
  version: '7',
};

describe('profile service contract', () => {
  it('PATCH /auth/me chỉ gửi display_name + phone và If-Match', async () => {
    const seen: unknown[] = [];
    const request: NonNullable<ProfileServiceDeps['request']> = async <T,>(
      options: unknown,
    ) => {
      seen.push(options);
      return {
        status: 200,
        data: {
          ...profileResponse(8).data,
          data: { ...profileResponse(8).data.data, display_name: 'Tên mới' },
        } as T,
        header: name => (name.toLowerCase() === 'etag' ? '"8"' : undefined),
      };
    };
    const result = await updateCurrentProfile(
      { displayName: ' Tên mới ', phone: null },
      '7',
      { request },
    );
    expect(seen).toEqual([
      {
        path: '/api/v1/auth/me',
        method: 'PATCH',
        headers: { 'If-Match': '"7"' },
        body: { display_name: 'Tên mới', phone: null },
      },
    ]);
    expect(result).toMatchObject({
      id: USER_ID,
      name: 'Tên mới',
      phone: null,
      version: '8',
    });
  });

  it('không cho update rỗng hoặc thiếu version', async () => {
    await expect(updateCurrentProfile({}, '7')).rejects.toMatchObject({
      code: 'PROFILE_EMPTY_UPDATE',
    });
    await expect(
      updateCurrentProfile({ displayName: 'Tên' }, undefined),
    ).rejects.toMatchObject({ code: 'INVALID_VERSION' });
  });

  it('đổi mật khẩu đúng body rồi xóa phiên local sau response thành công', async () => {
    const clearLocalSession = jest.fn(async () => undefined);
    const seen: unknown[] = [];
    const request: NonNullable<ProfileServiceDeps['request']> = async <T,>(
      options: unknown,
    ) => {
      seen.push(options);
      return { status: 200, data: authResponse('password').data as T };
    };
    await changeProfilePassword(
      {
        currentPassword: 'old-password',
        newPassword: 'new-password',
        newPasswordConfirmation: 'new-password',
      },
      {
        request,
        clearLocalSession,
        context: securityContextFromProfile(decodeProfile(profileResponse())),
      },
    );
    expect(seen).toEqual([
      {
        path: '/api/v1/auth/change-password',
        method: 'POST',
        body: {
          current_password: 'old-password',
          new_password: 'new-password',
          new_password_confirmation: 'new-password',
        },
      },
    ]);
    expect(clearLocalSession).toHaveBeenCalledTimes(1);
  });

  it('map danh sách phiên và thu hồi đúng một session id', async () => {
    const seen: unknown[] = [];
    const request: NonNullable<ProfileServiceDeps['request']> = async <T,>(
      options: any,
    ) => {
      seen.push(options);
      return (options.method === 'GET'
        ? sessionsResponse()
        : revokeResponse()) as any as { status: number; data: T };
    };
    const page = await fetchProfileSessions({ request });
    expect(page.items).toEqual([sessionItem]);
    expect(page.meta.total).toBe(21);
    await revokeProfileSession(page.items[0], { request }, page);
    expect(seen[1]).toEqual({
      path: '/api/v1/auth/sessions/' + sessionItem.id,
      method: 'DELETE',
    });
  });

  it('write gate chỉ mở đúng ba route Prompt 10', () => {
    expect(approvedWriteFor('PATCH', '/api/v1/auth/me')).toBe('profile.update');
    expect(approvedWriteFor('POST', '/api/v1/auth/change-password')).toBe(
      'profile.changePassword',
    );
    expect(approvedWriteFor('DELETE', '/api/v1/auth/sessions/session-1')).toBe(
      'profile.revokeSession',
    );
    expect(approvedWriteFor('PATCH', '/api/v1/auth/me/role')).toBeUndefined();
    expect(
      approvedWriteFor('DELETE', '/api/v1/auth/sessions/../../roles/1'),
    ).toBeUndefined();
  });
});

describe('ProfileScreen states and navigation', () => {
  it('success dùng dữ liệu /me, xử lý tên dài và không bịa ca/công việc', async () => {
    const tree = await renderProfile({ fetchUser: async () => USER });
    const text = textOf(tree);
    expect(text).toContain(USER.name);
    expect(text).toContain('Nhân viên kho');
    expect(text).toContain('WMS chưa cung cấp phạm vi kho');
    expect(text).toContain('Chỉnh sửa hồ sơ');
    expect(text).toContain('Tài khoản & bảo mật');
    expect(text).toContain('Kết thúc ca');
    expect(
      tree.root
        .findAll(n => /^Kết thúc ca\./.test(n.props.accessibilityLabel ?? ''))
        .some(n => n.props.accessibilityState?.disabled === true),
    ).toBe(true);
    expect(text).not.toContain('Bắt đầu ca thành công');
    await unmount(tree);
  });

  it('thiếu avatar/vai trò/phạm vi hiện fallback rõ ràng', async () => {
    const tree = await renderProfile({
      fetchUser: async () => ({ id: USER_ID, name: 'An' }),
    });
    const text = textOf(tree);
    expect(text).toContain('A');
    expect(text).toContain('WMS chưa cung cấp vai trò');
    expect(text).toContain('WMS chưa cung cấp phạm vi kho');
    await unmount(tree);
  });

  it('lỗi /me có Retry và không render snapshot phiên như hồ sơ thật', async () => {
    let attempt = 0;
    const tree = await renderProfile({
      fetchUser: async () => {
        attempt += 1;
        if (attempt === 1)
          throw new AppError({ kind: 'network', message: 'mất mạng' });
        return { ...USER, name: 'Tài khoản sau retry' };
      },
    });
    expect(textOf(tree)).toContain('Không tải được hồ sơ');
    expect(textOf(tree)).not.toContain('user-a');
    const retry = tree.root.findByProps({ accessibilityLabel: 'Thử lại' });
    await ReactTestRenderer.act(async () => {
      retry.props.onPress();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(textOf(tree)).toContain('Tài khoản sau retry');
    await unmount(tree);
  });

  it('đổi account không giữ dữ liệu người trước', async () => {
    let active = 'A';
    const fetchUser = async () =>
      active === 'A'
        ? { ...USER, id: USER_ID, name: 'Người dùng A' }
        : { ...USER, id: 'user-b', name: 'Người dùng B' };
    const tree = await renderProfile({ fetchUser });
    expect(textOf(tree)).toContain('Người dùng A');
    active = 'B';
    await ReactTestRenderer.act(async () => {
      setSession({ accessToken: 'fixture-b', userId: 'user-b' });
      tree.update(
        <AppProviders>
          <ProfileScreen fetchUser={fetchUser} />
        </AppProviders>,
      );
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(textOf(tree)).toContain('Người dùng B');
    expect(textOf(tree)).not.toContain('Người dùng A');
    await unmount(tree);
  });

  it('chỉnh hồ sơ chỉ gửi field thay đổi và cập nhật UI từ response', async () => {
    const updateProfileFn = jest.fn(async () => ({
      ...USER,
      name: 'Tên đã sửa',
      version: '8',
    }));
    const tree = await renderProfile({
      fetchUser: async () => USER,
      updateProfileFn,
    });
    const edit = tree.root.findByProps({
      accessibilityLabel:
        'Chỉnh sửa hồ sơ. Cập nhật tên hiển thị và số điện thoại',
    });
    await ReactTestRenderer.act(async () => edit.props.onPress());
    const name = tree.root
      .findAllByType(TextInput)
      .find(node => node.props.accessibilityLabel === 'Họ và tên');
    if (name === undefined) throw new Error('Thiếu ô Họ và tên.');
    await ReactTestRenderer.act(async () =>
      name.props.onChangeText('Tên đã sửa'),
    );
    const save = tree.root.findByProps({ accessibilityLabel: 'Lưu thay đổi' });
    await ReactTestRenderer.act(async () => {
      save.props.onPress();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(updateProfileFn).toHaveBeenCalledWith(
      { displayName: 'Tên đã sửa' },
      USER,
    );
    expect(textOf(tree)).toContain('Đã cập nhật hồ sơ');
    await unmount(tree);
  });

  it('Công việc & quyền chỉ render permission thật và nói rõ phần BA-blocked', async () => {
    const tree = await renderProfile({ fetchUser: async () => USER });
    const access = tree.root.findByProps({
      accessibilityLabel:
        'Công việc & quyền. Xem vai trò, phạm vi kho và quyền truy cập',
    });
    await ReactTestRenderer.act(async () => access.props.onPress());
    expect(textOf(tree)).toContain('Chưa xác minh quyền của từng chức năng');
    for (const label of [
      'Nhập kho',
      'Xuất kho',
      'Bảo hành',
      'Thẻ NFC',
      'Chứng từ',
      'Tra cứu',
    ])
      expect(textOf(tree)).toContain(label);
    expect(textOf(tree)).not.toContain('inbound.read');
    await ReactTestRenderer.act(async () =>
      tree.root
        .findByProps({ accessibilityLabel: 'Xem quyền chi tiết' })
        .props.onPress(),
    );
    const text = textOf(tree);
    expect(text).toContain('inbound.read');
    expect(text).toContain('outbound.read');
    expect(text).toContain('Quyền do quản trị viên cấp');
    expect(text).toContain('Chưa xác minh');
    await unmount(tree);
  });

  it('Bảo mật mở form đổi mật khẩu và danh sách phiên thật', async () => {
    const fetchSessionsFn = jest.fn(async () => ({
      owner: captureSecurityOwner(),
      currentStableSessionId: FAMILY as StableSessionId,
      items: [
        {
          ...sessionItem,
          id: sessionItem.id,
          stableSessionId: FAMILY as StableSessionId,
          authSessionId: FAMILY,
          deviceLabel: 'Samsung A30',
          isCurrent: true,
          canRevoke: false,
        },
        { ...sessionItem, deviceLabel: 'Chrome Windows' },
      ],
      meta: {
        total: 2,
        current_page: 1,
        per_page: 20,
        last_page: 1,
        from: 1,
        to: 2,
      },
      links: {},
    }));
    const tree = await renderProfile({
      fetchUser: async () => USER,
      fetchSessionsFn,
    });
    const security = tree.root.findByProps({
      accessibilityLabel:
        'Tài khoản & bảo mật. Đổi mật khẩu và quản lý phiên đăng nhập',
    });
    await ReactTestRenderer.act(async () => security.props.onPress());
    expect(textOf(tree)).toContain('Đổi mật khẩu');
    const sessions = tree.root.findByProps({
      accessibilityLabel:
        'Phiên đăng nhập. Xem và thu hồi các thiết bị đã đăng nhập',
    });
    await ReactTestRenderer.act(async () => {
      sessions.props.onPress();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(fetchSessionsFn).toHaveBeenCalledTimes(1);
    expect(textOf(tree)).toContain('Samsung A30');
    expect(textOf(tree)).toContain('Chrome Windows');
    expect(
      tree.root.findAllByProps({ accessibilityLabel: 'Thu hồi phiên' }).length,
    ).toBeGreaterThan(0);
    expect(textOf(tree)).toContain('Thiết bị hiện tại');
    expect(textOf(tree)).toContain('Đang hoạt động');
    await unmount(tree);
  });

  it('double tap Đăng xuất trong cùng frame chỉ gọi logout một lần', async () => {
    jest.useFakeTimers();
    const logoutFn = jest.fn(async () => {
      clearSession();
    });
    const onLogoutStarted = jest.fn();
    const onLoggedOut = jest.fn();
    const tree = await renderProfile({
      fetchUser: async () => USER,
      logoutFn,
      onLogoutStarted,
      onLoggedOut,
    });
    const row = tree.root.findByProps({
      accessibilityLabel: 'Đăng xuất. Thoát khỏi tài khoản hiện tại',
    });
    await ReactTestRenderer.act(async () => row.props.onPress());
    const confirm = tree.root.findByProps({ accessibilityLabel: 'Đăng xuất' });
    await ReactTestRenderer.act(async () => {
      confirm.props.onPress();
      confirm.props.onPress();
      await Promise.resolve();
    });
    expect(logoutFn).toHaveBeenCalledTimes(1);
    expect(onLogoutStarted).toHaveBeenCalledTimes(1);
    await ReactTestRenderer.act(async () => {
      jest.runOnlyPendingTimers();
    });
    expect(onLoggedOut).toHaveBeenCalledTimes(1);
    await unmount(tree);
  });
});

async function press(tree: ReactTestRenderer.ReactTestRenderer, label: string) {
  await ReactTestRenderer.act(async () => {
    tree.root.findByProps({ accessibilityLabel: label }).props.onPress();
  });
}
async function editField(
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
const EDIT = 'Chỉnh sửa hồ sơ. Cập nhật tên hiển thị và số điện thoại';
it('dirty Back and discard never PATCH; clearing phone sends null', async () => {
  const updateProfileFn = jest.fn(async () => ({
    ...USER,
    phone: null,
    version: '8',
  }));
  const tree = await renderProfile({
    fetchUser: async () => USER,
    updateProfileFn,
  });
  await press(tree, EDIT);
  await editField(tree, 'Họ và tên', 'Draft');
  await press(tree, 'Quay lại');
  await press(tree, 'Bỏ thay đổi');
  expect(updateProfileFn).not.toHaveBeenCalled();
  await press(tree, EDIT);
  await editField(tree, 'Số điện thoại', '');
  await press(tree, 'Lưu thay đổi');
  expect(updateProfileFn).toHaveBeenCalledWith({ phone: null }, USER);
  await unmount(tree);
});
it.each([412, 428])(
  'conflict %s reload/review preserves draft without automatic PATCH',
  async status => {
    const updateProfileFn = jest.fn(async () => {
      throw new AppError({ kind: 'http', status, message: 'conflict' });
    });
    const fetchUser = jest
      .fn()
      .mockResolvedValueOnce(USER)
      .mockResolvedValue({ ...USER, name: 'Server changed', version: '8' });
    const tree = await renderProfile({ fetchUser, updateProfileFn });
    await press(tree, EDIT);
    await editField(tree, 'Họ và tên', 'Local draft');
    await press(tree, 'Lưu thay đổi');
    await press(tree, 'Tải hồ sơ mới để xem xét');
    expect(updateProfileFn).toHaveBeenCalledTimes(1);
    await press(tree, 'Đã xem xét, tiếp tục chỉnh sửa');
    expect(updateProfileFn).toHaveBeenCalledTimes(1);
    expect(
      tree.root
        .findAllByType(TextInput)
        .find(n => n.props.accessibilityLabel === 'Họ và tên')!.props.value,
    ).toBe('Local draft');
    await unmount(tree);
  },
);
it('confirmed DELETE then failed GET never repeats DELETE', async () => {
  const page = {
    owner: captureSecurityOwner(),
    currentStableSessionId: FAMILY as StableSessionId,
    items: [sessionItem],
    meta: {
      total: 1,
      current_page: 1,
      per_page: 20,
      last_page: 1,
      from: 1,
      to: 1,
    },
    links: {},
  };
  const fetchSessionsFn = jest
    .fn()
    .mockResolvedValueOnce(page)
    .mockRejectedValue(new AppError({ kind: 'network', message: 'offline' }));
  const revokeSessionFn = jest.fn(async () => revokeResponse().data.data);
  const tree = await renderProfile({
    fetchUser: async () => USER,
    fetchSessionsFn,
    revokeSessionFn,
  });
  await press(
    tree,
    'Tài khoản & bảo mật. Đổi mật khẩu và quản lý phiên đăng nhập',
  );
  await press(
    tree,
    'Phiên đăng nhập. Xem và thu hồi các thiết bị đã đăng nhập',
  );
  await press(tree, 'Thu hồi phiên');
  await press(tree, 'Xác nhận thu hồi');
  expect(revokeSessionFn).toHaveBeenCalledTimes(1);
  expect(fetchSessionsFn).toHaveBeenCalledTimes(2);
  await unmount(tree);
});
it('pending profile still offers confirmed local logout', async () => {
  const logoutFn = jest.fn(async () => {
    clearSession();
  });
  const tree = await renderProfile({
    fetchUser: async () => {
      throw new AppError({ kind: 'blocked_by_gate', message: 'pending' });
    },
    logoutFn,
  });
  await press(tree, 'Đăng xuất trên thiết bị');
  expect(logoutFn).not.toHaveBeenCalled();
  await press(tree, 'Đăng xuất');
  expect(logoutFn).toHaveBeenCalledTimes(1);
  await unmount(tree);
});

it('profile dirty tab exit asks confirmation, cancel keeps draft, discard navigates without PATCH', async () => {
  const updateProfileFn = jest.fn(async () => USER),
    navigate = jest.fn();
  const tree = await renderProfile({
    fetchUser: async () => USER,
    updateProfileFn,
  });
  await press(tree, EDIT);
  await editField(tree, 'Họ và tên', 'Tab draft');
  await ReactTestRenderer.act(async () => requestProfileNavigation(navigate));
  expect(navigate).not.toHaveBeenCalled();
  expect(textOf(tree)).toContain('Thông tin chưa lưu');
  await press(tree, 'Tiếp tục chỉnh sửa');
  expect(navigate).not.toHaveBeenCalled();
  await ReactTestRenderer.act(async () => requestProfileNavigation(navigate));
  await press(tree, 'Bỏ thay đổi');
  expect(navigate).toHaveBeenCalledTimes(1);
  expect(updateProfileFn).not.toHaveBeenCalled();
  await unmount(tree);
  const next = jest.fn();
  requestProfileNavigation(next);
  expect(next).toHaveBeenCalledTimes(1);
});

it('S04 security information opens read-only dialog and closes back to the same panel', async () => {
  const tree = await renderProfile({ fetchUser: async () => USER });
  await press(
    tree,
    'Tài khoản & bảo mật. Đổi mật khẩu và quản lý phiên đăng nhập',
  );
  await press(
    tree,
    'Thông tin bảo mật. Xem thông tin tài khoản và phiên hiện tại',
  );
  expect(textOf(tree)).toContain('Lần xác thực gần nhất');
  expect(textOf(tree)).toContain('Môi trường');
  await press(tree, 'Đóng');
  expect(textOf(tree)).toContain('Tài khoản & bảo mật');
  expect(textOf(tree)).not.toContain('Lần xác thực gần nhất');
  await unmount(tree);
});

it('P10 restores each caller scroll independently when returning from a child', async () => {
  const tree = await renderProfile({ fetchUser: async () => USER });
  await ReactTestRenderer.act(async () =>
    tree.root.findByType(P10Frame).props.onScrollPositionChange(240),
  );
  await press(
    tree,
    'Tài khoản & bảo mật. Đổi mật khẩu và quản lý phiên đăng nhập',
  );
  expect(tree.root.findByType(P10Frame).props.initialScrollY).toBe(0);
  await ReactTestRenderer.act(async () =>
    tree.root.findByType(P10Frame).props.onScrollPositionChange(120),
  );
  await press(tree, 'Quay lại');
  expect(tree.root.findByType(P10Frame).props.initialScrollY).toBe(240);
  await press(
    tree,
    'Tài khoản & bảo mật. Đổi mật khẩu và quản lý phiên đăng nhập',
  );
  expect(tree.root.findByType(P10Frame).props.initialScrollY).toBe(120);
  await unmount(tree);
});

it.each([
  {
    permissions: [],
    expected: 'WMS trả về danh sách quyền chi tiết rỗng.',
    absent: 'WMS chưa cung cấp danh sách quyền chi tiết.',
  },
  {
    permissions: undefined,
    expected: 'WMS chưa cung cấp danh sách quyền chi tiết.',
    absent: 'WMS trả về danh sách quyền chi tiết rỗng.',
  },
])('P10 keeps empty vs missing canonical permissions distinct (%#)', async row => {
  const tree = await renderProfile({
    fetchUser: async () => ({ ...USER, permissions: row.permissions }),
  });
  await press(
    tree,
    'Công việc & quyền. Xem vai trò, phạm vi kho và quyền truy cập',
  );
  expect(textOf(tree)).toContain('Chưa xác minh quyền của từng chức năng');
  await press(tree, 'Xem quyền chi tiết');
  expect(textOf(tree)).toContain(row.expected);
  expect(textOf(tree)).not.toContain(row.absent);
  expect(
    tree.root.findAll(n => n.props.accessibilityRole === 'checkbox'),
  ).toHaveLength(0);
  await unmount(tree);
});
