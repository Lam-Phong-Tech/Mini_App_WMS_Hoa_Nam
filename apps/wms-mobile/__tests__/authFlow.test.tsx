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
import { LoginScreen } from '../src/features/auth/LoginScreen';
import { AppProviders } from '../src/app/App';
import { getSession, setSession } from '../src/auth/session';
import { resetServerClock } from '../src/auth/serverClock';
import { AppError } from '../src/errors/AppError';
import {
  createMemoryBackend,
  createStorage,
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

  it('đăng xuất xoá phiên cục bộ TRƯỚC khi gọi máy chủ', async () => {
    setSession({ accessToken: 'cũ', refreshToken: 'r' });
    let sessionAtCallTime: unknown = 'chưa gọi';
    await logout({
      post: async () => {
        sessionAtCallTime = getSession();
        return {};
      },
    });
    // Nếu phiên vẫn còn lúc gọi mạng, thì mạng hỏng = không đăng xuất được.
    expect(sessionAtCallTime).toBeUndefined();
    expect(getSession()).toBeUndefined();
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
  await ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(<AppProviders>{element}</AppProviders>);
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

describe('màn Đăng nhập dựng được và bám ảnh 02', () => {
  it('hiện nhãn, placeholder và chân trang đúng như ảnh', async () => {
    const view = await render(<LoginScreen loginFn={async () => {
      throw new Error('không được gọi');
    }} />);
    expect(view.text).toContain('WMS HOA NAM');
    expect(view.text).toContain('Quản lý vận hành kho');
    expect(view.text).toContain('Sử dụng tài khoản được cấp để tiếp tục.');
    expect(view.text).toContain('Đăng nhập');
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
    expect(view.text).toContain('Cần xử lý');
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
    expect(view.text).toContain('Chưa có phiếu nào');
    await view.unmount();
  });

  it('"Đã duyệt hôm nay" dùng cùng snapshot trạng thái với Mini App', async () => {
    const view = await render(
      <HomeScreen
        deps={{
          fetchDocuments: async () => emptyPage,
          fetchInboundPending: async () => emptyPage,
          fetchOutboundPending: async () => emptyPage,
        }}
      />,
    );
    expect(view.text).toContain('Đã duyệt hôm nay');
    expect(view.text).toContain('Hoàn tất');
    await view.unmount();
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
    expect(view.text).toContain('2 phiếu');
    expect(inboundQuery).toMatchObject({ status: 'WAITING_APPROVAL', per_page: 50 });
    expect(outboundQuery).toMatchObject({ ready_for_post: true, ready_for_issue: true, per_page: 50 });
    await view.unmount();
  });
});
