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
import {
  classifyLoginError,
  login,
  logout,
  MfaRequiredError,
  verifyMfaLogin,
} from '../src/services/wms/auth';
import { LoginScreen } from '../src/features/auth/LoginScreen';
import { SessionConfirmationScreen } from '../src/features/auth/SessionConfirmationScreen';
import { startWorkShift } from '../src/services/wms/workShift';
import { AppProviders } from '../src/app/App';
import { clearSession, getSession, setSession } from '../src/auth/session';
import { resetServerClock } from '../src/auth/serverClock';
import { AppError } from '../src/errors/AppError';
import {
  createMemoryBackend,
  createStorage,
  getAppStorage,
  setAppStorageForTesting,
} from '../src/storage/storage';

beforeEach(() => {
  clearSession();
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
    expect(MESSAGE_EMAIL_INVALID).toBe('Vui lòng nhập email hợp lệ.');
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
      getAppStorage().getObject<{ refreshToken?: string }>('auth.session')
        ?.refreshToken,
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

  it('login MFA giữ challenge ngoài session/loggable JSON và chưa phát access token', async () => {
    let challenge: MfaRequiredError | undefined;
    try {
      await login(
        { email: 'mfa@example.test', password: 'fixture-only' },
        {
          post: async () => ({
            success: true,
            data: {
              mfa_required: true,
              mfa_token: 'secret-mfa-challenge',
              expires_in: 300,
            },
          }),
        },
      );
    } catch (error) {
      challenge = error as MfaRequiredError;
    }
    expect(challenge).toBeInstanceOf(MfaRequiredError);
    expect(challenge?.mfaToken).toBe('secret-mfa-challenge');
    expect(challenge?.expiresIn).toBe(300);
    expect(JSON.stringify(challenge)).not.toContain('secret-mfa-challenge');
    expect(getSession()).toBeUndefined();
  });

  it('MFA verify gửi đúng challenge/code rồi mới lưu phiên', async () => {
    let observedPath = '',
      observedBody: unknown;
    const session = await verifyMfaLogin(
      { mfaToken: 'challenge-1', code: '123456' },
      {
        post: async (path, body) => {
          observedPath = path;
          observedBody = body;
          return {
            success: true,
            data: {
              access_token: 'mfa-access',
              refresh_token: 'mfa-refresh',
              expires_in: 3600,
              second_factor: 'totp',
            },
          };
        },
      },
    );
    expect(observedPath).toBe('/api/v1/auth/mfa/verify');
    expect(observedBody).toEqual({
      mfa_token: 'challenge-1',
      code: '123456',
    });
    expect(session.accessToken).toBe('mfa-access');
    expect(getSession()?.accessToken).toBe('mfa-access');
  });

  it('login access token carries must_change_password without opening MFA', async () => {
    const session = await login(
      { email: 'reset@example.test', password: 'fixture-only' },
      {
        post: async () => ({
          success: true,
          data: {
            access_token: 'reset-access',
            refresh_token: 'reset-refresh',
            expires_in: 3600,
            user: {
              user_id: '11111111-1111-4111-8111-111111111111',
              auth_session_id: '22222222-2222-4222-8222-222222222222',
              active_warehouse_id: '33333333-3333-4333-8333-333333333333',
              display_name: 'TEST reset',
              must_change_password: true,
            },
          },
        }),
      },
    );
    expect(session.mustChangePassword).toBe(true);
    expect(session).toMatchObject({
      userId: '11111111-1111-4111-8111-111111111111',
      authSessionId: '22222222-2222-4222-8222-222222222222',
      activeWarehouseId: '33333333-3333-4333-8333-333333333333',
      userName: 'TEST reset',
    });
    expect(getSession()?.mustChangePassword).toBe(true);
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
    expect(blocked.message).toBe(
      'Tài khoản chưa có quyền truy cập Mini App kho.',
    );
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
    const view = await render(
      <LoginScreen
        loginFn={async () => {
          throw new Error('không được gọi');
        }}
      />,
    );
    expect(view.text).toContain('HOA NAM SCANNER');
    expect(view.text).toContain('WMS - Vận hành chuyên nghiệp');
    expect(view.text).toContain('Đăng nhập để bắt đầu phiên làm việc');
    expect(view.text).toContain('Email');
    expect(view.text).toContain('Quên mật khẩu?');
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
    const tree = await renderInteractive(<LoginScreen loginFn={loginFn} />);

    const inputs = tree.root.findAllByType(TextInput);
    const email = inputs[0];
    const password = inputs[1];
    await ReactTestRenderer.act(async () => {
      email.props.onChangeText('fixture-user-a@example.test');
      password.props.onChangeText('fixture-password-a');
    });

    const submit = tree.root.find(
      node =>
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

  it('MFA mở bước 2, xoá password và chỉ hoàn tất sau verify', async () => {
    const onSuccess = jest.fn(),
      verifyMfaFn = jest.fn(async () => ({ accessToken: 'mfa-access' }));
    const tree = await renderInteractive(
      <LoginScreen
        loginFn={async () => {
          throw new MfaRequiredError('secret-ui-challenge', 300);
        }}
        verifyMfaFn={verifyMfaFn}
        onSuccess={onSuccess}
      />,
    );
    let inputs = tree.root.findAllByType(TextInput);
    await ReactTestRenderer.act(async () => {
      inputs[0].props.onChangeText('mfa@example.test');
      inputs[1].props.onChangeText('fixture-password');
    });
    const submit = tree.root.find(
      node =>
        node.props.accessibilityLabel === 'Đăng nhập' &&
        typeof node.props.onPress === 'function',
    );
    await ReactTestRenderer.act(async () => {
      await submit.props.onPress();
    });
    expect(JSON.stringify(tree.toJSON())).toContain('Xác thực hai bước');
    expect(JSON.stringify(tree.toJSON())).not.toContain('secret-ui-challenge');
    inputs = tree.root.findAllByType(TextInput);
    expect(inputs[0].props.value).toBe('');
    expect(inputs[1].props.value).toBe('');
    const mfaInput = inputs.find(
      node => node.props.accessibilityLabel === 'Mã xác thực',
    )!;
    await ReactTestRenderer.act(async () => {
      mfaInput.props.onChangeText('123456');
    });
    const verify = tree.root.find(
      node =>
        node.props.accessibilityLabel === 'Xác nhận' &&
        typeof node.props.onPress === 'function',
    );
    await ReactTestRenderer.act(async () => {
      await verify.props.onPress();
    });
    expect(verifyMfaFn).toHaveBeenCalledWith({
      mfaToken: 'secret-ui-challenge',
      code: '123456',
    });
    expect(onSuccess).toHaveBeenCalledTimes(1);
    await ReactTestRenderer.act(async () => tree.unmount());
  });

  it('stale MFA challenge is discarded before a later normal login', async () => {
    let attempt = 0;
    const onSuccess = jest.fn();
    const tree = await renderInteractive(
      <LoginScreen
        loginFn={async () => {
          attempt++;
          if (attempt === 1)
            throw new MfaRequiredError('old-challenge', 300);
          return { accessToken: 'normal-access', mustChangePassword: true };
        }}
        onSuccess={onSuccess}
      />,
    );
    let inputs = tree.root.findAllByType(TextInput);
    await ReactTestRenderer.act(async () => {
      inputs[0].props.onChangeText('reset@example.test');
      inputs[1].props.onChangeText('fixture-password');
    });
    let submit = tree.root.find(
      node =>
        node.props.accessibilityLabel === 'Đăng nhập' &&
        typeof node.props.onPress === 'function',
    );
    await ReactTestRenderer.act(async () => submit.props.onPress());
    expect(JSON.stringify(tree.toJSON())).toContain('Xác thực hai bước');
    const back = tree.root.find(
      node =>
        node.props.accessibilityLabel === 'Quay lại đăng nhập' &&
        typeof node.props.onPress === 'function',
    );
    await ReactTestRenderer.act(async () => back.props.onPress());
    expect(JSON.stringify(tree.toJSON())).not.toContain('Xác thực hai bước');
    inputs = tree.root.findAllByType(TextInput);
    await ReactTestRenderer.act(async () => {
      inputs[0].props.onChangeText('reset@example.test');
      inputs[1].props.onChangeText('fixture-password');
    });
    submit = tree.root.find(
      node =>
        node.props.accessibilityLabel === 'Đăng nhập' &&
        typeof node.props.onPress === 'function',
    );
    await ReactTestRenderer.act(async () => submit.props.onPress());
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(tree.toJSON())).not.toContain('Xác thực hai bước');
    await ReactTestRenderer.act(async () => tree.unmount());
  });

  it('giữ nguyên giá trị và vị trí gõ khi hiện/ẩn mật khẩu', async () => {
    const tree = await renderInteractive(
      <LoginScreen
        loginFn={async () => {
          throw new Error('không được gọi');
        }}
      />,
    );

    const password = tree.root.findAllByType(TextInput)[1];
    await ReactTestRenderer.act(async () => {
      password.props.onChangeText('fixture-password');
      password.props.onSelectionChange({
        nativeEvent: { selection: { start: 7, end: 7 } },
      });
    });
    const reveal = tree.root.find(
      node =>
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

describe('xác nhận phiên và bắt đầu ca kỹ thuật', () => {
  it('data:null giữ màn xác nhận; chỉ ca ACTIVE + preview_ready mới vào Home', async () => {
    const authSessionId = 'auth-session-fixture';
    const warehouseId = '11111111-1111-4111-8111-111111111111';
    const fetchUser = jest.fn(async () => ({
      id: 'user-1',
      auth_session_id: authSessionId,
      active_warehouse_id: warehouseId,
      name: 'Nguyễn Minh Anh',
      email: 'minh.anh@hoanam.vn',
      role: 'Thủ kho',
      warehouse_scope_ids: [warehouseId],
    }));
    const fetchShift = jest.fn(async () => null);
    const fetchWarehouses = jest.fn(async () => ({
      items: [],
      meta: {},
      links: {},
    }));
    const startShift = jest.fn(async () => ({
      actor_id: 'user-1',
      shift_id: 'shift-1',
      auth_session_id: authSessionId,
      warehouse_id: warehouseId,
      status: 'ACTIVE',
      started_at: '2026-10-05T08:00:00+07:00',
      preview_ready: true,
    })) as unknown as jest.MockedFunction<typeof startWorkShift>;
    const logoutFn = jest.fn(async () => undefined);
    const onContinue = jest.fn();
    const onLoggedOut = jest.fn();
    const onIdentityResolved = jest.fn();

    const tree = await renderInteractive(
      <SessionConfirmationScreen
        fetchUser={fetchUser}
        fetchShift={fetchShift}
        fetchWarehouses={fetchWarehouses}
        startShift={startShift}
        logoutFn={logoutFn}
        onContinue={onContinue}
        onLoggedOut={onLoggedOut}
        onIdentityResolved={onIdentityResolved}
      />,
    );

    const beforeStart = JSON.stringify(tree.toJSON());
    expect(beforeStart).toContain('Chào Nguyễn Minh Anh');
    expect(beforeStart).toContain(warehouseId);
    expect(beforeStart).toContain('Chưa bắt đầu ca');
    expect(beforeStart).toContain('Bắt đầu ca');
    expect(fetchUser).toHaveBeenCalledTimes(1);
    expect(fetchShift).toHaveBeenCalledTimes(1);
    expect(fetchWarehouses).toHaveBeenCalledTimes(1);
    expect(onIdentityResolved).toHaveBeenCalledWith({
      id: 'user-1',
      auth_session_id: authSessionId,
      active_warehouse_id: warehouseId,
      name: 'Nguyễn Minh Anh',
      email: 'minh.anh@hoanam.vn',
      role: 'Thủ kho',
      warehouse_scope_ids: [warehouseId],
    });
    expect(logoutFn).not.toHaveBeenCalled();
    expect(onContinue).not.toHaveBeenCalled();

    const start = tree.root.find(
      node =>
        node.props.accessibilityLabel === 'Bắt đầu ca' &&
        typeof node.props.onPress === 'function',
    );
    await ReactTestRenderer.act(async () => {
      start.props.onPress();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(startShift).toHaveBeenCalledTimes(1);
    expect(startShift.mock.calls[0]?.[0]).toEqual({
      actorId: 'user-1',
      authSessionId,
      warehouseId,
    });
    expect(startShift.mock.calls[0]?.[1]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(onContinue).toHaveBeenCalledTimes(1);
    await ReactTestRenderer.act(() => tree.unmount());
  });

  it('hiển thị tên kho từ danh mục, vẫn gửi active_warehouse_id làm UUID', async () => {
    const authSessionId = 'auth-session-name';
    const warehouseId = '33333333-3333-4333-8333-333333333333';
    const fetchUser = jest.fn(async () => ({
      id: 'user-name',
      auth_session_id: authSessionId,
      active_warehouse_id: warehouseId,
      name: 'Minh Anh',
      email: 'minh.anh@hoanam.vn',
      role: 'Thủ kho',
    }));
    const fetchWarehouses = jest.fn(async () => ({
      items: [{ id: warehouseId, name: 'Kho Hoa Nam', status: 'ACTIVE' }],
      meta: {},
      links: {},
    }));
    const fetchShift = jest.fn(async () => null);
    const startShift = jest.fn(async () => ({
      actor_id: 'user-name',
      shift_id: 'shift-name',
      auth_session_id: authSessionId,
      warehouse_id: warehouseId,
      status: 'ACTIVE',
      started_at: '2026-10-05T08:00:00+07:00',
      preview_ready: true,
    })) as unknown as jest.MockedFunction<typeof startWorkShift>;

    const tree = await renderInteractive(
      <SessionConfirmationScreen
        fetchUser={fetchUser}
        fetchWarehouses={fetchWarehouses}
        fetchShift={fetchShift}
        startShift={startShift}
        onContinue={jest.fn()}
        onLoggedOut={jest.fn()}
      />,
    );

    expect(JSON.stringify(tree.toJSON())).toContain('Kho Hoa Nam');
    expect(JSON.stringify(tree.toJSON())).not.toContain(warehouseId);
    const start = tree.root.find(
      node =>
        node.props.accessibilityLabel === 'Bắt đầu ca' &&
        typeof node.props.onPress === 'function',
    );
    await ReactTestRenderer.act(async () => {
      start.props.onPress();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(startShift.mock.calls[0]?.[0]).toEqual({
      actorId: 'user-name',
      authSessionId,
      warehouseId,
    });
    await ReactTestRenderer.act(() => tree.unmount());
  });
});

// Home source assertions migrated to homeApiRevision2.test.tsx: revision2
// requires dashboard totals, scoped recent capability and four warranty states.
// The previous page-length/inbound-only expectations are retained in the
// implementation handoff's before snapshot, not treated as backend evidence.

describe('revision2 UNKNOWN start giữ key và khóa gửi lại', () => {
  it('logout rời màn ngay, không gọi lại caller của phiên cũ sau network completion', async () => {
    let finish!: () => void;
    const onLoggedOut = jest.fn();
    const tree = await renderInteractive(
      <SessionConfirmationScreen
        fetchUser={async () => ({
          id: 'qa-actor',
          auth_session_id: 'qa-session',
          active_warehouse_id: '11111111-1111-4111-8111-111111111111',
        })}
        fetchShift={async () => null}
        fetchWarehouses={async () => ({ items: [] })}
        logoutFn={() =>
          new Promise<void>(resolve => {
            finish = resolve;
          })
        }
        onContinue={jest.fn()}
        onLoggedOut={onLoggedOut}
      />,
    );
    await ReactTestRenderer.act(async () => {
      tree.root
        .find(
          n =>
            n.props.accessibilityLabel === 'Đăng xuất' &&
            typeof n.props.onPress === 'function',
        )
        .props.onPress();
    });
    expect(onLoggedOut).toHaveBeenCalledTimes(1);
    await ReactTestRenderer.act(() => tree.unmount());
    await ReactTestRenderer.act(async () => finish());
    expect(onLoggedOut).toHaveBeenCalledTimes(1);
  });
  it('current lỗi không mở retry mù; đọc null rồi retry dùng đúng key/body', async () => {
    const me = {
      id: 'qa-actor',
      auth_session_id: 'qa-session',
      active_warehouse_id: '11111111-1111-4111-8111-111111111111',
    };
    const current = jest
      .fn()
      .mockResolvedValueOnce(null)
      .mockRejectedValueOnce(
        new AppError({ kind: 'network', message: 'unknown' }),
      )
      .mockResolvedValue(null);
    const start = jest
      .fn()
      .mockRejectedValue(new AppError({ kind: 'timeout', message: 'unknown' }));
    const tree = await renderInteractive(
      <SessionConfirmationScreen
        fetchUser={async () => me}
        fetchShift={current}
        startShift={start}
        fetchWarehouses={async () => ({ items: [] })}
        onContinue={jest.fn()}
        onLoggedOut={jest.fn()}
      />,
    );
    const button = () =>
      tree.root.find(
        n =>
          n.props.accessibilityLabel === 'Bắt đầu ca' &&
          typeof n.props.onPress === 'function',
      );
    await ReactTestRenderer.act(async () => button().props.onPress());
    expect(start).toHaveBeenCalledTimes(1);
    expect(button().props.disabled).toBe(true);
    await ReactTestRenderer.act(async () => button().props.onPress());
    expect(start).toHaveBeenCalledTimes(1);
    await ReactTestRenderer.act(async () =>
      tree.root
        .find(
          n =>
            n.props.accessibilityLabel === 'Kiểm tra lại ca' &&
            typeof n.props.onPress === 'function',
        )
        .props.onPress(),
    );
    expect(button().props.disabled).toBe(false);
    await ReactTestRenderer.act(async () => button().props.onPress());
    expect(start).toHaveBeenCalledTimes(2);
    expect(start.mock.calls[1]).toEqual(start.mock.calls[0]);
    await ReactTestRenderer.act(() => tree.unmount());
  });
});
