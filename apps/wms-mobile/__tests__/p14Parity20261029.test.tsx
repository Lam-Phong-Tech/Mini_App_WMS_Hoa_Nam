import { HN_OPERATIONS } from '../src/ui/hnHomeTokens';
/** Presentation regression with injected data only. No live OTP/START/END. */
import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { AppProviders } from '../src/app/App';
import { ForgotPasswordFlow } from '../src/features/auth/ForgotPasswordFlow';
import { SixDigitOtpInput } from '../src/features/auth/SixDigitOtpInput';
import { P14ShiftScreen } from '../src/features/auth/P14ShiftScreen';
import { Input } from '../src/ui/Input';
import { Button } from '../src/ui/Button';
import { Dialog } from '../src/ui/Dialog';
import { Banner } from '../src/ui/Banner';
import { AppIcon } from '../src/ui/AppIcon';
import { AppError } from '../src/errors/AppError';
import { clearSession, setSession } from '../src/auth/session';
import {
  createMemoryBackend,
  createStorage,
  setAppStorageForTesting,
} from '../src/storage/storage';
import { publishShiftState, resetShiftState } from '../src/shift/shiftState';
import type {
  createP14ShiftService,
  EndReceipt,
} from '../src/shift/p14ShiftService';
import type { CurrentUser } from '../src/services/wms/types';

let tree: Renderer.ReactTestRenderer | undefined;
const text = () => JSON.stringify(tree?.toJSON());
beforeEach(() => {
  setAppStorageForTesting(createStorage(createMemoryBackend()));
  clearSession();
  resetShiftState();
  jest.clearAllMocks();
});
afterEach(async () => {
  if (tree) await act(() => tree!.unmount());
  tree = undefined;
  clearSession();
  resetShiftState();
});
const button = (label: string) =>
  tree!.root.findAllByType(Button).find(node => node.props.label === label)!;
async function mount(element: React.ReactElement) {
  await act(async () => {
    tree = Renderer.create(<AppProviders>{element}</AppProviders>);
  });
}

test('recovery keeps the real email owner and coalesces Enter/tap in the same frame', async () => {
  let finish!: () => void;
  const post = jest.fn(
    () =>
      new Promise<object>(resolve => {
        finish = () => resolve({ success: true, data: {} });
      }),
  );
  await mount(
    <ForgotPasswordFlow
      onBack={() => undefined}
      onDone={() => undefined}
      deps={{ post }}
    />,
  );
  expect(post).not.toHaveBeenCalled();
  expect(text()).toContain('Quên mật khẩu');
  const input = tree!.root.findByType(Input);
  await act(() => input.props.onChangeText('ui@example.invalid'));
  const submit = button('Gửi mã OTP').props.onPress;
  await act(async () => {
    submit();
    submit();
  });
  expect(post).toHaveBeenCalledTimes(1);
  expect(post.mock.calls[0]).toEqual([
    '/api/v1/auth/forgot-password',
    { email: 'ui@example.invalid' },
  ]);
  await act(async () => finish());
  expect(tree!.root.findByType(SixDigitOtpInput)).toBeDefined();
  expect(text()).not.toContain('Yêu cầu đã tiếp nhận');
  expect(text()).not.toContain('RQ-');
});

test('failed recovery uses one app dialog and keeps the same input/value for retry', async () => {
  const post = jest.fn(async () => {
    throw new AppError({
      kind: 'network',
      message: 'offline',
      requestId: 'ui-only-request',
    });
  });
  await mount(
    <ForgotPasswordFlow
      onBack={() => undefined}
      onDone={() => undefined}
      deps={{ post }}
    />,
  );
  const input = tree!.root.findByType(Input);
  await act(() => input.props.onChangeText('ui@example.invalid'));
  await act(async () => button('Gửi mã OTP').props.onPress());
  expect(tree!.root.findByType(Dialog).props).toMatchObject({
    visible: true,
    dismissOnBackdrop: false,
  });
  expect(tree!.root.findAllByType(Banner)).toHaveLength(0);
  expect(tree!.root.findByType(Input)).toBe(input);
  expect(input.props.value).toBe('ui@example.invalid');
  await act(() => button('Đóng').props.onPress());
  expect(tree!.root.findByType(Dialog).props.visible).toBe(false);
  expect(input.props.value).toBe('ui@example.invalid');
  expect(post).toHaveBeenCalledTimes(1);
});

const id = '14141414-1414-4141-8141-000000000001';
const receipt: EndReceipt = {
  shift_id: id,
  actor_id: 'ui-actor',
  auth_session_id: 'ui-family',
  warehouse_id: id,
  request_id: '14141414-1414-4141-8141-000000000002',
  command: 'END',
  outcome: 'SUCCEEDED',
  status: 'ENDED',
  version: 2,
  ended_at: '2026-10-29T03:30:00Z',
  summary_id: id,
  login_preserved: true,
};
const user: CurrentUser = {
  id: 'ui-actor',
  name: 'TEST UI '.repeat(30),
  role: 'Nhân viên kho',
  available_warehouses: [
    { warehouse_id: id, name: 'Kho TEST UI '.repeat(25), status: 'ACTIVE' },
  ],
};
function fixture(summary?: Record<string, unknown>) {
  setSession({
    accessToken: 'offline-only',
    userId: 'ui-actor',
    authSessionId: 'ui-family',
    activeWarehouseId: id,
  });
  publishShiftState(
    {
      shift_id: id,
      actor_id: 'ui-actor',
      auth_session_id: 'ui-family',
      warehouse_id: id,
      status: 'ENDED',
      started_at: '2026-10-29T01:00:00Z',
      ended_at: receipt.ended_at,
      preview_ready: false,
      version: 2,
      tracking_contract: 'p14-shift-v1',
    },
    { actorId: 'ui-actor', authSessionId: 'ui-family', warehouseId: id },
  );
  const end = jest.fn(async () => receipt),
    reconcile = jest.fn(async () => receipt);
  const service = {
    receipt,
    summarySnapshot: summary,
    canEnd: false,
    blocker: undefined,
    pending: undefined,
    invalidateCheck: jest.fn(),
    end,
    reconcile,
    summary: jest.fn(async () => summary),
    closeCheck: jest.fn(),
  } as unknown as ReturnType<typeof createP14ShiftService>;
  return { service, end, reconcile };
}

test('compact summary retains distinct server counts, nullable NFC, full identity and empty success', async () => {
  const f = fixture({
    kpis: {
      successful_request_count: 15,
      recorded_documents: {
        INBOUND: 2,
        OUTBOUND: 1,
        WARRANTY: 1,
        COMPONENT_ISSUE: 0,
      },
      quantity_total: null,
      posted_total: null,
    },
    draft_snapshot: { total: 0, page: 1, last_page: 1, items: [] },
    started_at: '2026-10-29T01:00:00Z',
  });
  const footer = <Button label="UI FOOTER" onPress={() => undefined} />;
  await mount(
    <P14ShiftScreen
      service={f.service}
      user={user}
      onBack={() => undefined}
      onHistory={() => undefined}
      onLogout={async () => undefined}
      footer={footer}
    />,
  );
  expect(text()).toContain(user.name!);
  expect(text()).toContain(user.available_warehouses![0].name!);
  expect(text()).toContain('Số yêu cầu nghiệp vụ đã xác minh');
  expect(text()).not.toContain('Chứng từ: 15');
  const nfc = tree!.root.findByProps({ testID: 'p14-kpi-NFC' });
  expect(
    JSON.stringify(nfc.findAllByType(AppIcon).map(icon => icon.props.name)),
  ).toContain('nfc');
  expect(nfc.findAllByType(AppIcon)[0].props.color).toBe(HN_OPERATIONS.nfc.ink);
  const reader = tree!.root.findByProps({
    accessibilityLabel: 'Xem chi tiết phiếu nháp',
  });
  expect(reader.props.onPress).toEqual(expect.any(Function));
  await act(() => reader.props.onPress());
  expect(text()).toContain('Không có phiếu nháp tại thời điểm kết thúc ca.');
  expect(f.end).not.toHaveBeenCalled();
  expect(f.reconcile).not.toHaveBeenCalled();
  expect(button('UI FOOTER')).toBeDefined();
});

test('receipt without summary keeps unknown values and read retry instead of fabricating totals', async () => {
  const f = fixture();
  await mount(
    <P14ShiftScreen
      service={f.service}
      user={user}
      onBack={() => undefined}
      onHistory={() => undefined}
      onLogout={async () => undefined}
      footer={<></>}
    />,
  );
  expect(button('Tải lại tổng kết')).toBeDefined();
  expect(text()).not.toContain('Phiếu nháp (0)');
  expect(text()).not.toContain(
    'Không có phiếu nháp tại thời điểm kết thúc ca.',
  );
  expect(f.end).not.toHaveBeenCalled();
});

test('an overnight completed shift displays the end date in Vietnam instead of an ambiguous reversed clock range', async () => {
  const f = fixture({
    started_at: '2026-10-28T03:59:34Z',
    draft_snapshot: { total: 0, page: 1, last_page: 1, items: [] },
  });
  await mount(
    <P14ShiftScreen
      service={f.service}
      user={user}
      onBack={() => undefined}
      onHistory={() => undefined}
      onLogout={async () => undefined}
      footer={<></>}
    />,
  );
  expect(text()).toContain('28/10/2026');
  expect(text()).toContain('Kết thúc 29/10/2026');
  expect(text()).toContain('10:59 – 10:30');
  expect(f.end).not.toHaveBeenCalled();
});

test('summary preview counts only visible drafts while the reader retains every loaded draft', async () => {
  const items = Array.from({ length: 6 }, (_, index) => ({
    document_id: `draft-${index + 1}`,
    operation: 'INBOUND',
    form: JSON.stringify({ name: `PN-TEST-${index + 1}` }),
  }));
  const f = fixture({
    draft_snapshot: { total: 6, page: 1, last_page: 1, items },
  });
  await mount(
    <P14ShiftScreen
      service={f.service}
      user={user}
      onBack={() => undefined}
      onHistory={() => undefined}
      onLogout={async () => undefined}
      footer={<></>}
    />,
  );
  expect(
    new Set(
      tree!.root
        .findAll(node =>
          /^p14-summary-draft-\d+$/.test(node.props.testID ?? ''),
        )
        .map(node => node.props.testID),
    ).size,
  ).toBe(4);
  expect(text()).toContain('Đang hiển thị 4/6 phiếu nháp.');
  await act(() =>
    tree!.root
      .findByProps({ accessibilityLabel: 'Xem chi tiết phiếu nháp' })
      .props.onPress(),
  );
  expect(text()).toContain('PN-TEST-6');
  expect(f.end).not.toHaveBeenCalled();
});

test('a partial snapshot keeps read retry available and never calls END during a failed summary retry', async () => {
  const f = fixture({ draft_snapshot: { total: null, items: [] } });
  const read = jest
    .spyOn(f.service, 'summary')
    .mockRejectedValueOnce(
      new AppError({ kind: 'network', message: 'GET summary unavailable' }),
    )
    .mockResolvedValueOnce({
      draft_snapshot: { total: 0, page: 1, last_page: 1, items: [] },
    });
  await mount(
    <P14ShiftScreen
      service={f.service}
      user={user}
      onBack={() => undefined}
      onHistory={() => undefined}
      onLogout={async () => undefined}
      footer={<></>}
    />,
  );
  expect(button('Tải lại tổng kết')).toBeDefined();
  await act(async () => button('Tải lại tổng kết').props.onPress());
  expect(text()).not.toContain(
    'Không có phiếu nháp tại thời điểm kết thúc ca.',
  );
  expect(f.end).not.toHaveBeenCalled();
  expect(f.reconcile).not.toHaveBeenCalled();
  await act(() => button('Đóng').props.onPress());
  await act(async () => button('Tải lại tổng kết').props.onPress());
  expect(read).toHaveBeenCalledTimes(2);
  expect(text()).toContain('Không có phiếu nháp tại thời điểm kết thúc ca.');
  expect(f.end).not.toHaveBeenCalled();
});
