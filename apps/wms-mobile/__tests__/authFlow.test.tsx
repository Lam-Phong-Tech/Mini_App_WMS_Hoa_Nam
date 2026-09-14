/**
 * Đợt 1 của Prompt 4 — logic đăng nhập, trạng thái form, và màn Trang chủ.
 *
 * Prompt 4 §F đòi *"unit test cho logic view model/state"* và *"component test
 * cho validation và trạng thái UI"*. Logic form nằm ở `loginForm.ts` (thuần,
 * test thẳng); phần render dùng `react-test-renderer` như `App.test.tsx`.
 *
 * ❗ Không test nào gọi mạng.
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { TextInput } from 'react-native';

import {
  MESSAGE_EMAIL_INVALID,
  MESSAGE_EMAIL_REQUIRED,
  MESSAGE_PASSWORD_REQUIRED,
  beginSubmit,
  failSubmit,
  initialLoginForm,
  setEmail,
  setPassword,
  submitLabel,
  validateLogin,
} from '../src/features/auth/loginForm';
import { classifyLoginError, login, logout } from '../src/services/wms/auth';
import { HomeScreen } from '../src/features/home/HomeScreen';
import { BOTTOM_NAV_ITEMS } from '../src/ui/BottomNav';
import { LoginScreen } from '../src/features/auth/LoginScreen';
import { SessionConfirmationScreen } from '../src/features/auth/SessionConfirmationScreen';
import { AppProviders } from '../src/app/App';
import { getSession, setSession } from '../src/auth/session';
import { resetServerClock } from '../src/auth/serverClock';
import { AppError } from '../src/errors/AppError';
import type {
  InboundDocument,
  OutboundDocument,
  Page,
} from '../src/services/wms/types';
import {
  createMemoryBackend,
  createStorage,
  getAppStorage,
  setAppStorageForTesting,
} from '../src/storage/storage';

beforeEach(() => {
  setAppStorageForTesting(createStorage(createMemoryBackend()));
  resetServerClock();
});

// ---------------------------------------------------------------------------
// Trạng thái form — ảnh 02–05
// ---------------------------------------------------------------------------

describe('form đăng nhập — trạng thái theo ảnh 02–05', () => {
  it('ô trống báo lỗi ở TỪNG ô, nguyên văn như ảnh 03', () => {
    const errors = validateLogin(initialLoginForm);
    expect(errors.email).toBe(MESSAGE_EMAIL_REQUIRED);
    expect(errors.password).toBe(MESSAGE_PASSWORD_REQUIRED);
    // Ảnh 03 đặt câu lỗi dưới từng ô, không gộp thành một câu chung.
    expect(MESSAGE_EMAIL_REQUIRED).toBe('Vui lòng nhập email.');
    expect(MESSAGE_PASSWORD_REQUIRED).toBe('Vui lòng nhập mật khẩu.');
  });

  it('email chỉ có khoảng trắng vẫn là trống', () => {
    const state = setEmail(initialLoginForm, '   ');
    expect(validateLogin(state).email).toBe(MESSAGE_EMAIL_REQUIRED);
  });

  it('email sai định dạng hiện đúng câu của Mini App hiện hành', () => {
    const state = setPassword(setEmail(initialLoginForm, 'thu-kho-01'), 'x');
    expect(validateLogin(state).email).toBe(MESSAGE_EMAIL_INVALID);
    expect(MESSAGE_EMAIL_INVALID).toBe('Vui lòng nhập đúng định dạng email.');
  });

  it('gõ lại chỉ xoá lỗi của CHÍNH ô đó', () => {
    const withErrors = {
      ...initialLoginForm,
      fieldErrors: {
        email: MESSAGE_EMAIL_REQUIRED,
        password: MESSAGE_PASSWORD_REQUIRED,
      },
    };
    const afterTyping = setEmail(withErrors, 'a@b.c');
    expect(afterTyping.fieldErrors.email).toBeUndefined();
    // Xoá cả hai sẽ làm câu lỗi dưới ô mật khẩu biến mất một cách khó hiểu.
    expect(afterTyping.fieldErrors.password).toBe(MESSAGE_PASSWORD_REQUIRED);
  });

  it('chặn double submit — bấm khi đang gửi thì không gửi thêm', () => {
    const submitting = { ...initialLoginForm, phase: 'submitting' as const };
    const { canSubmit, next } = beginSubmit(submitting);
    expect(canSubmit).toBe(false);
    expect(next).toBe(submitting);
  });

  it('form hợp lệ thì cho gửi và chuyển sang submitting', () => {
    const filled = setPassword(setEmail(initialLoginForm, 'a@b.c'), 'x');
    const { canSubmit, next } = beginSubmit(filled);
    expect(canSubmit).toBe(true);
    expect(next.phase).toBe('submitting');
  });

  it('thất bại giữ mật khẩu để người dùng sửa đúng trường cần thiết', () => {
    const filled = setPassword(setEmail(initialLoginForm, 'a@b.c'), 'sai');
    const failed = failSubmit(filled, 'Sai tài khoản hoặc mật khẩu.');
    expect(failed.password).toBe('sai');
    expect(failed.phase).toBe('failed');
    expect(failed.formError).toBe('Sai tài khoản hoặc mật khẩu.');
    // Email giữ lại để người dùng không phải gõ lại.
    expect(failed.email).toBe('a@b.c');
  });

  it('nhãn nút ĐỔI theo trạng thái, không cố định', () => {
    expect(submitLabel('idle')).toBe('Đăng nhập');
    expect(submitLabel('submitting')).toBe('Đang xử lý…');
    // Ảnh 05: sau khi thất bại, nút thành "Thử lại".
    expect(submitLabel('failed')).toBe('Thử lại');
  });
});

// ---------------------------------------------------------------------------
// Dịch vụ đăng nhập
// ---------------------------------------------------------------------------

describe('dịch vụ đăng nhập — luồng chạy THẬT qua ngoại lệ §2c', () => {
  const payload = {
    data: {
      access_token: 'access-1',
      refresh_token: 'refresh-1',
      expires_in: 3600,
    },
    meta: { timestamp: '2026-09-06T10:00:00+07:00' },
  };

  it('đăng nhập xong lưu phiên kèm refresh token và hạn', async () => {
    const session = await login(
      { email: 'a@b.c', password: 'x' },
      { post: async () => payload, now: () => 1_756_000_000_000 },
    );
    expect(session.accessToken).toBe('access-1');
    expect(session.refreshToken).toBe('refresh-1');
    expect(session.expiresAtMs).toBeGreaterThan(session.issuedAtMs ?? 0);
    expect(getSession()?.accessToken).toBe('access-1');
    expect(
      getAppStorage().getObject<{ refreshToken?: string }>('auth.session')?.refreshToken,
    ).toBeUndefined();
  });

  it('hạn tính từ expires_in, KHÔNG decode JWT', async () => {
    const at = 1_756_000_000_000;
    const session = await login(
      { email: 'a@b.c', password: 'x' },
      { post: async () => payload, now: () => at },
    );
    expect((session.expiresAtMs ?? 0) - (session.issuedAtMs ?? 0)).toBe(
      3600 * 1000,
    );
  });

  it('fixture đổi người dùng thay toàn bộ phiên cũ, không giữ định danh cũ', async () => {
    setSession({
      accessToken: 'fixture-access-user-a',
      refreshToken: 'fixture-refresh-user-a',
      userId: 'fixture-user-a',
    });

    const next = await login(
      { email: 'fixture-user-b@example.test', password: 'fixture-password-b' },
      {
        post: async () => ({
          data: {
            access_token: 'fixture-access-user-b',
            refresh_token: 'fixture-refresh-user-b',
            expires_in: 3600,
          },
          meta: { timestamp: '2026-09-11T12:00:00+07:00' },
        }),
        now: () => 1_756_000_000_000,
      },
    );

    expect(next.accessToken).toBe('fixture-access-user-b');
    expect(next.userId).toBeUndefined();
    expect(getSession()).toEqual(next);
    expect(getSession()?.accessToken).not.toBe('fixture-access-user-a');
    expect(getSession()?.userId).not.toBe('fixture-user-a');
  });

  it('đăng xuất xoá phiên cục bộ TRƯỚC khi gọi máy chủ', async () => {
    setSession({ accessToken: 'cũ', refreshToken: 'r' });
    let sessionAtCallTime: unknown = 'chưa gọi';
    let logoutBody: unknown;
    await logout({
      post: async (_path, body) => {
        sessionAtCallTime = getSession();
        logoutBody = body;
        return {};
      },
    });
    // Nếu phiên vẫn còn lúc gọi mạng, thì mạng hỏng = không đăng xuất được.
    expect(sessionAtCallTime).toBeUndefined();
    expect(getSession()).toBeUndefined();
    expect(logoutBody).toEqual({ refresh_token: 'r' });
  });

  it('máy chủ lỗi lúc đăng xuất KHÔNG chặn việc đăng xuất khỏi máy', async () => {
    setSession({ accessToken: 'cũ', refreshToken: 'r' });
    await expect(
      logout({
        post: async () => {
          throw new AppError({ kind: 'network', message: 'mất mạng' });
        },
      }),
    ).resolves.toBeUndefined();
    // Thủ kho bàn giao ca phải đăng xuất được kể cả khi rớt mạng.
    expect(getSession()).toBeUndefined();
  });

  it('phân biệt sai mật khẩu với bị chặn ở lớp biên', () => {
    expect(
      classifyLoginError(
        new AppError({ kind: 'auth', status: 401, message: 'Sai mật khẩu.' }),
      ).kind,
    ).toBe('credentials');

    // 403 trên luồng login dùng copy thân thiện giống Mini App.
    const blocked = classifyLoginError(
      new AppError({ kind: 'blocked_by_edge', status: 403, message: 'chặn' }),
    );
    expect(blocked.kind).toBe('blocked');
    expect(blocked.message).toBe('Tài khoản chưa có quyền truy cập Mini App kho.');
  });

  it('hiển thị đúng lỗi transport Web thay vì báo nhầm thiếu quyền', () => {
    const failure = classifyLoginError(
      new AppError({
        kind: 'http',
        status: 403,
        code: 'TOKEN_TRANSPORT_NOT_ALLOWED',
        message: 'Browser dùng cookie HttpOnly.',
      }),
    );
    expect(failure.kind).toBe('other');
    expect(failure.message).toContain('kênh phiên không phù hợp');
  });

  it('401 dùng cùng câu chung của Mini App thay vì lộ copy backend', () => {
    const serverMessage = 'Email, tài khoản hoặc mật khẩu không đúng.';
    expect(
      classifyLoginError(
        new AppError({ kind: 'auth', status: 401, message: serverMessage }),
    ).message,
    ).toBe('Sai tài khoản hoặc mật khẩu.');
  });
});

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

async function render(element: React.ReactElement) {
  let tree: ReactTestRenderer.ReactTestRenderer | undefined;
  await ReactTestRenderer.act(async () => {
    tree = ReactTestRenderer.create(<AppProviders>{element}</AppProviders>);
    // Flush một lượt effect async của các màn đọc dữ liệu. Không bỏ qua `act`,
    // vì làm vậy sẽ che warning khi test màn xác nhận phiên.
    await Promise.resolve();
    await Promise.resolve();
  });
  return {
    text: JSON.stringify(tree?.toJSON()),
    unmount: async () => {
      await ReactTestRenderer.act(() => {
        tree?.unmount();
      });
    },
  };
}

async function renderInteractive(element: React.ReactElement) {
  let tree: ReactTestRenderer.ReactTestRenderer | undefined;
  await ReactTestRenderer.act(async () => {
    tree = ReactTestRenderer.create(<AppProviders>{element}</AppProviders>);
    await Promise.resolve();
  });
  if (tree === undefined) {
    throw new Error('Không dựng được cây test.');
  }
  return tree;
}

describe('màn Đăng nhập dựng được và bám reference Designer', () => {
  it('hiện nhận diện Scanner, form và chân trang đúng trạng thái idle', async () => {
    const view = await render(<LoginScreen loginFn={async () => {
      throw new Error('không được gọi');
    }} />);
    expect(view.text).toContain('HOA NAM SCANNER');
    expect(view.text).toContain('WMS · Vận hành chuyên nghiệp');
    expect(view.text).toContain('Đăng nhập để bắt đầu phiên làm việc');
    expect(view.text).toContain('Tên đăng nhập');
    expect(view.text).toContain('Khôi phục tài khoản: Chưa áp dụng');
    expect(view.text).toContain('Đăng nhập');
    await view.unmount();
  });

  it('fixture hai lần chạm cùng frame chỉ gửi một request đăng nhập', async () => {
    let releaseLogin: (() => void) | undefined;
    const loginFn = jest.fn(
      () =>
        new Promise<Awaited<ReturnType<typeof login>>>(resolve => {
          releaseLogin = () =>
            resolve({
              accessToken: 'fixture-access-user-a',
              refreshToken: 'fixture-refresh-user-a',
            });
        }),
    );
    const tree = await renderInteractive(
      <LoginScreen loginFn={loginFn} />,
    );

    const inputs = tree.root.findAllByType(TextInput);
    const email = inputs[0];
    const password = inputs[1];
    await ReactTestRenderer.act(async () => {
      email.props.onChangeText('fixture-user-a@example.test');
      password.props.onChangeText('fixture-password-a');
    });

    const submit = tree.root.find(node =>
      node.props.accessibilityLabel === 'Đăng nhập' &&
      typeof node.props.onPress === 'function',
    );
    ReactTestRenderer.act(() => {
      submit.props.onPress();
      submit.props.onPress();
    });

    expect(loginFn).toHaveBeenCalledTimes(1);
    expect(loginFn).toHaveBeenCalledWith({
      email: 'fixture-user-a@example.test',
      password: 'fixture-password-a',
    });

    releaseLogin?.();
    await ReactTestRenderer.act(async () => {
      await Promise.resolve();
    });
    await ReactTestRenderer.act(async () => {
      tree.unmount();
    });
  });

  it('giữ nguyên giá trị và vị trí gõ khi hiện/ẩn mật khẩu', async () => {
    const tree = await renderInteractive(
      <LoginScreen loginFn={async () => {
        throw new Error('không được gọi');
      }} />,
    );

    const password = tree.root.findAllByType(TextInput)[1];
    await ReactTestRenderer.act(async () => {
      password.props.onChangeText('fixture-password');
      password.props.onSelectionChange({
        nativeEvent: { selection: { start: 7, end: 7 } },
      });
    });
    const reveal = tree.root.find(node =>
      node.props.accessibilityLabel === 'Hiện mật khẩu' &&
      typeof node.props.onPress === 'function',
    );
    await ReactTestRenderer.act(async () => {
      reveal.props.onPress();
    });

    const shown = tree.root.findAllByType(TextInput)[1];
    expect(shown.props.value).toBe('fixture-password');
    expect(shown.props.secureTextEntry).toBe(false);
    expect(shown.props.selection).toEqual({ start: 7, end: 7 });

    await ReactTestRenderer.act(async () => {
      tree.unmount();
    });
  });
});

describe('xác nhận phiên — không biến thành thao tác mở ca', () => {
  it('chỉ hiện dữ liệu BE trả về và thông báo rõ ca làm chưa áp dụng', async () => {
    const fetchUser = jest.fn(async () => ({
      name: 'Nguyễn Minh Anh',
      email: 'minh.anh@hoanam.vn',
      role: 'Thủ kho',
      warehouse_scope_ids: ['KHO-TONG-HN'],
    }));
    const logoutFn = jest.fn(async () => undefined);
    const onContinue = jest.fn();
    const onLoggedOut = jest.fn();
    const onIdentityResolved = jest.fn();

    const view = await render(
      <SessionConfirmationScreen
        fetchUser={fetchUser}
        logoutFn={logoutFn}
        onContinue={onContinue}
        onLoggedOut={onLoggedOut}
        onIdentityResolved={onIdentityResolved}
      />,
    );

    expect(view.text).toContain('Chào Nguyễn Minh Anh');
    expect(view.text).toContain('KHO-TONG-HN');
    expect(view.text).toContain('Bắt đầu ca làm việc: Chưa áp dụng');
    expect(view.text).toContain('Tiếp tục vào ứng dụng');
    expect(fetchUser).toHaveBeenCalledTimes(1);
    expect(onIdentityResolved).toHaveBeenCalledWith({
      name: 'Nguyễn Minh Anh',
      email: 'minh.anh@hoanam.vn',
      role: 'Thủ kho',
      warehouse_scope_ids: ['KHO-TONG-HN'],
    });
    expect(logoutFn).not.toHaveBeenCalled();
    expect(onContinue).not.toHaveBeenCalled();
    await view.unmount();
  });
});

describe('Trang chủ — bốn trạng thái của Prompt 4 §C', () => {
  const emptyPage = { items: [], meta: {}, links: {} };

  it('trạng thái loading hiện trước khi có dữ liệu', async () => {
    const view = await render(
      <HomeScreen
        deps={{
          // Không bao giờ resolve → giữ nguyên trạng thái loading.
          fetchDocuments: () => new Promise(() => {}),
          fetchInboundPending: () => new Promise(() => {}),
          fetchOutboundPending: () => new Promise(() => {}),
        }}
      />,
    );
    expect(view.text).toContain('Phiếu chờ duyệt');
    await view.unmount();
  });

  it('trạng thái lỗi có nút thử lại, không im lặng', async () => {
    const view = await render(
      <HomeScreen
        deps={{
          fetchDocuments: async () => {
            throw new AppError({ kind: 'network', message: 'mất mạng' });
          },
          fetchInboundPending: async () => emptyPage,
          fetchOutboundPending: async () => emptyPage,
        }}
      />,
    );
    expect(view.text).toContain('Không tải được');
    expect(view.text).toContain('Thử lại');
    expect(view.text).toContain('Chưa có dữ liệu để hiển thị');
    expect(view.text).not.toContain('0 phiếu');
    await view.unmount();
  });

  it('trạng thái rỗng nói rõ phải làm gì', async () => {
    const view = await render(
      <HomeScreen
        deps={{
          fetchDocuments: async () => emptyPage,
          fetchInboundPending: async () => emptyPage,
          fetchOutboundPending: async () => emptyPage,
        }}
      />,
    );
    expect(view.text).toContain('Chưa có chứng từ nào');
    await view.unmount();
  });

  it('KPI bảo hành chỉ dùng tổng do WMS trả theo các trạng thái đang mở', async () => {
    const seenStatuses: string[] = [];
    const view = await render(
      <HomeScreen
        deps={{
          fetchDocuments: async () => emptyPage,
          fetchInboundPending: async () => emptyPage,
          fetchOutboundPending: async () => emptyPage,
          fetchWarrantyOpen: async options => {
            seenStatuses.push(String(options?.query?.status));
            return { items: [{ warranty_case_id: 'fixture-case' }], meta: { total: 2 } };
          },
        }}
      />,
    );
    expect(seenStatuses).toEqual(['RECEIVED', 'CHECKING', 'REPAIRING']);
    expect(view.text).toContain('Bảo hành đang mở');
    expect(view.text).toContain('6');
    await view.unmount();
  });

  it('Board 02 dùng năm tab, với Chứng từ trước lối quét trung tâm', () => {
    expect(BOTTOM_NAV_ITEMS.map(item => item.label)).toEqual([
      'Trang chủ',
      'Chứng từ',
      'Quét mã',
      'Lịch sử',
      'Cá nhân',
    ]);
  });

  it('phân loại KPI theo trạng thái WMS của cùng danh sách dashboard', async () => {
    const view = await render(
      <HomeScreen
        deps={{
          fetchDocuments: async () => ({
            items: [
              { id: '1', status: 'WAITING_APPROVAL' },
              { id: '2', status: 'POSTED' },
            ],
          }),
          fetchInboundPending: async () => ({
            items: [{ id: '1', status: 'WAITING_APPROVAL' }],
            meta: { total: 1 },
          }),
          fetchOutboundPending: async () => ({ items: [], meta: { total: 0 } }),
        }}
      />,
    );
    expect(view.text).toContain('1');
    await view.unmount();
  });

  it('"Chờ duyệt" dùng đúng hai truy vấn hàng đợi của màn Duyệt phiếu', async () => {
    let inboundQuery: Record<string, unknown> | undefined;
    let outboundQuery: Record<string, unknown> | undefined;
    const view = await render(
      <HomeScreen
        deps={{
          fetchDocuments: async () => ({ items: [] }),
          fetchInboundPending: async options => {
            inboundQuery = options?.query;
            return { items: [{ id: 'in-1' }], meta: { total: 2 } };
          },
          fetchOutboundPending: async options => {
            outboundQuery = options?.query;
            return { items: [{ id: 'out-1' }], meta: { total: 3 } };
          },
        }}
      />,
    );
    expect(view.text).toContain('Phiếu chờ duyệt');
    expect(view.text).toContain('2');
    expect(inboundQuery).toMatchObject({ status: 'WAITING_APPROVAL', per_page: 50 });
    expect(outboundQuery).toMatchObject({ ready_for_post: true, ready_for_issue: true, per_page: 50 });
    await view.unmount();
  });

  it('avatar mở đúng tab Cá nhân khi callback điều hướng đã được nối', async () => {
    const onOpenProfile = jest.fn();
    const tree = await renderInteractive(
      <HomeScreen
        userName="Nguyễn Minh Anh"
        onOpenProfile={onOpenProfile}
        deps={{
          fetchDocuments: async () => emptyPage,
          fetchInboundPending: async () => emptyPage,
          fetchOutboundPending: async () => emptyPage,
        }}
      />,
    );

    const avatar = tree.root.find(node =>
      node.props.accessibilityLabel === 'Mở trang cá nhân' &&
      typeof node.props.onPress === 'function',
    );
    await ReactTestRenderer.act(async () => {
      avatar.props.onPress();
    });
    expect(onOpenProfile).toHaveBeenCalledTimes(1);
    await ReactTestRenderer.act(async () => {
      tree.unmount();
    });
  });

  it('request Home cũ không được ghi đè dữ liệu của lượt tải mới', async () => {
    let resolveOldInbound: ((value: Page<InboundDocument>) => void) | undefined;
    let resolveOldOutbound: ((value: Page<OutboundDocument>) => void) | undefined;
    const oldInboundPage = new Promise<Page<InboundDocument>>(resolve => {
      resolveOldInbound = resolve;
    });
    const oldOutboundPage = new Promise<Page<OutboundDocument>>(resolve => {
      resolveOldOutbound = resolve;
    });
    const oldDeps = {
      fetchDocuments: () => oldInboundPage,
      fetchInboundPending: () => oldInboundPage,
      fetchOutboundPending: () => oldOutboundPage,
    };
    const newPage = {
      items: [{ id: 'new-1', doc_no: 'NEW-001', status: 'POSTED' }],
      meta: {},
      links: {},
    };
    const newDeps = {
      fetchDocuments: async () => newPage,
      fetchInboundPending: async () => emptyPage,
      fetchOutboundPending: async () => emptyPage,
    };
    const tree = await renderInteractive(<HomeScreen deps={oldDeps} />);

    await ReactTestRenderer.act(async () => {
      tree.update(<AppProviders><HomeScreen deps={newDeps} /></AppProviders>);
      await Promise.resolve();
      await Promise.resolve();
    });
    resolveOldInbound?.({
      items: [{ id: 'old-1', doc_no: 'OLD-001', status: 'POSTED' }],
      meta: {},
      links: {},
    });
    resolveOldOutbound?.({ items: [], meta: {}, links: {} });
    await ReactTestRenderer.act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const text = JSON.stringify(tree.toJSON());
    expect(text).toContain('NEW-001');
    expect(text).not.toContain('OLD-001');
    await ReactTestRenderer.act(async () => {
      tree.unmount();
    });
  });

  it('reload lỗi vẫn giữ chứng từ của lượt tải thành công gần nhất', async () => {
    const successPage = {
      items: [{ id: 'saved-1', doc_no: 'SAVED-001', status: 'POSTED' }],
      meta: {},
      links: {},
    };
    const successfulDeps = {
      fetchDocuments: async () => successPage,
      fetchInboundPending: async () => emptyPage,
      fetchOutboundPending: async () => emptyPage,
    };
    const failingDeps = {
      fetchDocuments: async () => {
        throw new AppError({ kind: 'network', message: 'mất mạng' });
      },
      fetchInboundPending: async () => emptyPage,
      fetchOutboundPending: async () => emptyPage,
    };
    const tree = await renderInteractive(<HomeScreen deps={successfulDeps} />);
    await ReactTestRenderer.act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    await ReactTestRenderer.act(async () => {
      tree.update(<AppProviders><HomeScreen deps={failingDeps} /></AppProviders>);
      await Promise.resolve();
      await Promise.resolve();
    });

    const text = JSON.stringify(tree.toJSON());
    expect(text).toContain('SAVED-001');
    expect(text).toContain('Không tải được dữ liệu trang chủ');
    expect(text).not.toContain('Chưa có dữ liệu để hiển thị');
    await ReactTestRenderer.act(async () => {
      tree.unmount();
    });
  });
});
