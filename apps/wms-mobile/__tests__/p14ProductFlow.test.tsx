import React from 'react';
import Renderer from 'react-test-renderer';
import { AppProviders } from '../src/app/App';
import { P14ShiftScreen } from '../src/features/auth/P14ShiftScreen';
import { Button } from '../src/ui/Button';
import { Dialog } from '../src/ui/Dialog';
import { clearSession, setSession } from '../src/auth/session';
import {
  getShiftState,
  resetShiftState,
  publishShiftState,
  cancelShiftClose,
} from '../src/shift/shiftState';
import {
  createP14ShiftService,
  type LocalShiftEvidence,
} from '../src/shift/p14ShiftService';
import {
  registerShiftLocalOwner,
  REQUIRED_SHIFT_OWNERS,
} from '../src/shift/localOwners';
import {
  createMemoryBackend,
  createStorage,
  setAppStorageForTesting,
  getAppStorage,
} from '../src/storage/storage';
import { AppError } from '../src/errors/AppError';
import type { WorkShift } from '../src/services/wms/workShift';
import type { RequestOptions, ApiResponse } from '../src/api/client';
import type { P14DraftOverview } from '../src/shift/p14DraftOverview';
const id = '11111111-1111-4111-8111-111111111111',
  owner = { actorId: 'actor', authSessionId: 'family', warehouseId: id };
const shift: WorkShift = {
  shift_id: id,
  actor_id: owner.actorId,
  auth_session_id: owner.authSessionId,
  warehouse_id: id,
  status: 'ACTIVE',
  version: 1,
  preview_ready: true,
  started_at: '2026-10-14T01:00:00Z',
  ended_at: null,
  tracking_contract: 'p14-shift-v1',
  lifecycle: {
    contract: 'p01-p14-lifecycle-v1',
    mode: 'ENABLED',
    tracking_status: 'TRACKED',
    end_supported: true,
    end_unavailable_reason: null,
    end_readiness: 'REQUIRES_CLOSE_CHECK_AND_LOCAL_CLEAN',
    owner_coverage: 'PARTIAL_EXPLICIT_OWNER_PROTOCOLS',
    local_state_verified: false,
    legacy_upgrade_allowed: false,
  },
};
const clean: LocalShiftEvidence = {
  state: 'CLEAN',
  revision: 'r1',
  coverageComplete: true,
  busy: false,
  pendingRequestIds: [],
};
const data = {
  shift_id: id,
  actor_id: owner.actorId,
  auth_session_id: owner.authSessionId,
  warehouse_id: id,
  can_end: true,
  can_end_scope: 'SERVER_CHECK_ONLY',
  blockers: [],
  expected_version: 1,
  check_token: 'offline-only-capability',
  draft_count: 0,
  draft_scope: 'AUTH_SESSION_AT_CLOSE_NOT_SHIFT_OWNERSHIP',
  draft_owners_unchanged: true,
  client_confirmation_required: {
    local_state: 'CLEAN',
    pending_request_ids: [],
  },
};
const response = <T,>(v: unknown): ApiResponse<T> => ({
  status: 200,
  data: { success: true, data: v, meta: { contract: 'p14-shift-v1' } } as T,
});
let releases: Array<() => void> = [];
beforeEach(() => {
  setAppStorageForTesting(createStorage(createMemoryBackend()));
  clearSession();
  setSession({
    accessToken: 'offline-only',
    userId: owner.actorId,
    authSessionId: owner.authSessionId,
    activeWarehouseId: id,
  });
  resetShiftState();
  publishShiftState(shift, owner);
});
afterEach(() => {
  releases.forEach(f => f());
  releases = [];
  clearSession();
});
async function mount(
  request: (o: RequestOptions) => Promise<ApiResponse<unknown>>,
  local = clean,
  loadDrafts?: () => Promise<P14DraftOverview>,
  onResumeOwner?: jest.Mock,
  draftSaver?: React.ComponentProps<typeof P14ShiftScreen>['draftSaver'],
) {
  for (const ownerName of REQUIRED_SHIFT_OWNERS)
    releases.push(registerShiftLocalOwner(ownerName, () => local));
  const service = createP14ShiftService({ request, readLocal: () => local }),
    back = jest.fn(),
    history = jest.fn(),
    logout = jest.fn(async () => {});
  let tree!: Renderer.ReactTestRenderer;
  await Renderer.act(async () => {
    tree = Renderer.create(
      <AppProviders>
        <P14ShiftScreen
          service={service}
          onBack={back}
          onHistory={history}
          onLogout={logout}
          footer={<></>}
          loadDrafts={loadDrafts}
          onResumeOwner={onResumeOwner}
          draftSaver={draftSaver}
        />
      </AppProviders>,
    );
  });
  const button = (name: string) =>
    tree.root.findAllByType(Button).find(b => b.props.label === name)!;
  return { tree, service, button, back, history, logout };
}
test('blocked local owner has an explicit repair route instead of a dead disabled END', async () => {
  const resume = jest.fn(),
    p = await mount(
      async () => response(data),
      { ...clean, state: 'DIRTY' },
      undefined,
      resume,
    );
  expect(p.button('Lưu nháp trước khi kết thúc')).toBeDefined();
  expect(p.button('Kết thúc ca').props.disabled).toBe(true);
  await Renderer.act(async () =>
    p.button('Lưu nháp trước khi kết thúc').props.onPress(),
  );
  expect(resume).not.toHaveBeenCalled();
  expect(p.tree.root.findByType(Dialog).props.title).toBe(
    'Lưu nháp các phiếu đang mở?',
  );
  expect(p.tree.root.findByType(Dialog).props.message).toContain(
    'không gửi phiếu lên Web',
  );
  await Renderer.act(async () => p.button('Hủy').props.onPress());
  expect(p.tree.root.findByType(Dialog).props.visible).toBe(false);
  await Renderer.act(async () => p.tree.unmount());
});
test('save confirmation waits for verified SAVE, shows acknowledgement, refreshes close-check, and never dispatches END', async () => {
  jest.useFakeTimers();
  const local = { ...clean, state: 'DIRTY' as LocalShiftEvidence['state'] };
  let finish!: () => void;
  const save = jest.fn(
    () =>
      new Promise<void>(resolve => {
        finish = () => {
          local.state = 'CLEAN';
          resolve();
        };
      }),
  );
  const draftSaver = {
    plan: jest.fn(() => ({
      scope: {} as any,
      revision: 'r1',
      owners: ['P05' as const],
    })),
    save,
  };
  const request = jest.fn(async () => response(data)),
    p = await mount(request, local, undefined, jest.fn(), draftSaver);
  try {
    await Renderer.act(async () =>
      p.button('Lưu nháp trước khi kết thúc').props.onPress(),
    );
    expect(save).not.toHaveBeenCalled();
    await Renderer.act(async () => {
      jest.advanceTimersByTime(701);
    });
    await Renderer.act(async () => {
      p.button('Lưu nháp').props.onPress();
    });
    expect(save).toHaveBeenCalledTimes(1);
    expect(p.tree.root.findByType(Dialog).props.title).not.toBe('Đã lưu nháp');
    await Renderer.act(async () => finish());
    expect(p.tree.root.findByType(Dialog).props.title).toBe('Đã lưu nháp');
    expect(p.button('Đã hiểu')).toBeDefined();
    expect(
      request.mock.calls.every((call: any) => call[0].method === 'GET'),
    ).toBe(true);
    await Renderer.act(async () => p.button('Đã hiểu').props.onPress());
    expect(p.tree.root.findByType(Dialog).props.visible).toBe(false);
  } finally {
    await Renderer.act(async () => p.tree.unmount());
    jest.useRealTimers();
  }
});
test('current shift and verified auth-session drafts are visible before END', async () => {
  const drafts: P14DraftOverview = {
    total: 2,
    complete: true,
    items: [
      {
        document_id: '22222222-2222-4222-8222-222222222222',
        document_kind: 'STAGING_DRAFT',
        scan_session_id: '33333333-3333-4333-8333-333333333333',
        auth_session_id: owner.authSessionId,
        warehouse_id: id,
        operation: 'INBOUND',
        version: 1,
        status: 'DRAFT',
        codes: [],
        form: {},
        title: 'PN-0005',
        codes_validated: false,
        business_document_id: null,
        business_status: null,
        last_request_id: null,
        stock_effect: 'NONE',
      },
      {
        document_id: '44444444-4444-4444-8444-444444444444',
        document_kind: 'STAGING_DRAFT',
        scan_session_id: '55555555-5555-4555-8555-555555555555',
        auth_session_id: owner.authSessionId,
        warehouse_id: id,
        operation: 'OUTBOUND',
        version: 1,
        status: 'DRAFT',
        codes: [],
        form: {},
        title: 'PX-0005',
        codes_validated: false,
        business_document_id: null,
        business_status: null,
        last_request_id: null,
        stock_effect: 'NONE',
      },
    ],
  };
  const p = await mount(
    async () => response(data),
    clean,
    async () => drafts,
  );
  await Renderer.act(async () => Promise.resolve());
  const output = JSON.stringify(p.tree.toJSON());
  expect(output).not.toContain('Ca hiện tại · Đang hoạt động');
  expect(output).toContain('Phiếu đang thực hiện (2)');
  expect(output).toContain('PN-0005');
  expect(output).toContain('PX-0005');
  const details = p.tree.root.findAll(
    node =>
      node.props.accessibilityLabel === 'Xem tất cả nháp và yêu cầu đang chờ' &&
      typeof node.props.onPress === 'function',
  )[0];
  await Renderer.act(async () => details!.props.onPress());
  expect(JSON.stringify(p.tree.toJSON())).toContain(
    'Ca hiện tại · Đang hoạt động',
  );
  await Renderer.act(async () => p.tree.unmount());
});

test.each([0, 7])(
  'partial draft sources do not present available count %s as the full shift total and can retry by GET',
  async total => {
    const load = jest
      .fn<Promise<P14DraftOverview>, []>()
      .mockResolvedValueOnce({ total, complete: false, items: [] })
      .mockResolvedValueOnce({ total: 0, complete: true, items: [] });
    const request = jest.fn(async () => response(data));
    const p = await mount(request, clean, load);
    const output = JSON.stringify(p.tree.toJSON());
    expect(output).toContain('Phiếu đang thực hiện (—)');
    expect(output).toContain('Chưa tải đủ nguồn phiếu nháp');
    expect(output).not.toContain('Không có phiếu nháp trong phiên hiện tại.');
    expect(p.button('Tải lại phiếu nháp')).toBeDefined();
    await Renderer.act(async () =>
      p.button('Tải lại phiếu nháp').props.onPress(),
    );
    expect(JSON.stringify(p.tree.toJSON())).toContain(
      'Phiếu đang thực hiện (0)',
    );
    expect(JSON.stringify(p.tree.toJSON())).toContain(
      'Không có phiếu nháp trong phiên hiện tại.',
    );
    expect(request).not.toHaveBeenCalled();
    await Renderer.act(async () => p.tree.unmount());
  },
);
test('leaving S03 by unmount without END does not strand the shared CLOSING barrier', async () => {
  const p = await mount(async () => response(data));
  expect(getShiftState().closing).toBe(true);
  await Renderer.act(async () => p.tree.unmount());
  expect(getShiftState().closing).toBe(false);
});
test('TC23 an UNKNOWN owner can reach close-check without inventing SAVE or opening another owner', async () => {
  const resume = jest.fn();
  const request = jest.fn(async () => response({...data,can_end:false,blockers:['SHIFT_TRACKING_INCOMPLETE']}));
  const p = await mount(request,{...clean,state:'UNKNOWN',coverageComplete:false},undefined,resume);
  expect(p.button('Lưu nháp trước khi kết thúc')).toBeUndefined();
  await Renderer.act(async () => p.button('Đối chiếu dữ liệu trước khi kết thúc').props.onPress());
  expect(request).toHaveBeenCalledWith({method:'GET',path:`/api/v1/mini-app/work-shifts/${id}/close-check`,query:{warehouse_id:id}});
  expect(resume).not.toHaveBeenCalled();
  expect(p.button('Kết thúc ca').props.disabled).toBe(true);
  expect(getAppStorage().keys().some(k=>k.startsWith('p09-command-recovery/v1-clean-baseline/'))).toBe(false);
  await Renderer.act(async () => p.tree.unmount());
});

test('wired product S03 calls exact real-protocol GET, no body/END on mount; closing fences new work', async () => {
  const request = jest.fn(async (_o: RequestOptions) => response(data)),
    p = await mount(request);
  expect(request).not.toHaveBeenCalled();
  expect(getShiftState().closing).toBe(true);
  expect(p.button('Kết thúc ca').props.disabled).toBe(true);
  await Renderer.act(async () =>
    p.button('Kiểm tra điều kiện kết thúc ca').props.onPress(),
  );
  expect(request.mock.calls[0][0]).toEqual({
    method: 'GET',
    path: `/api/v1/mini-app/work-shifts/${id}/close-check`,
    query: { warehouse_id: id },
  });
  expect(request.mock.calls).toHaveLength(1);
  expect(p.tree.root.findByType(Dialog).props.visible).toBe(true);
  await Renderer.act(async () => p.tree.unmount());
  cancelShiftClose();
});
test.each(['DIRTY', 'UNKNOWN'] as const)(
  'server can_end cannot bypass local %s or invent SAVE',
  async state => {
    const request = jest.fn(async () => response(data)),
      p = await mount(request, { ...clean, state });
    await Renderer.act(async () =>
      p.button('Kiểm tra điều kiện kết thúc ca').props.onPress(),
    );
    expect(p.button('Kết thúc ca').props.disabled).toBe(true);
    expect(request).toHaveBeenCalledTimes(1);
    expect(
      getAppStorage()
        .keys()
        .some(k => k.startsWith('shift.end.')),
    ).toBe(false);
    await Renderer.act(async () => p.tree.unmount());
  },
);
test('503 is shown unavailable and does not create empty summary or successful S04', async () => {
  const p = await mount(async () => {
    throw new AppError({
      kind: 'http',
      status: 503,
      code: 'P14_SHIFT_NOT_ENABLED',
      message: 'Unavailable',
    });
  });
  await Renderer.act(async () =>
    p.button('Kiểm tra điều kiện kết thúc ca').props.onPress(),
  );
  expect(p.tree.root.findByType(Dialog).props.message).toContain(
    'chưa khả dụng',
  );
  expect(p.service.receipt).toBeUndefined();
  expect(p.service.summarySnapshot).toBeUndefined();
  expect(p.button('Kết thúc ca').props.disabled).toBe(true);
  await Renderer.act(async () => p.tree.unmount());
});
test('timeout and UNKNOWN cannot fabricate completion or POST again', async () => {
  let timedOut = false;
  const calls: RequestOptions[] = [];
  const p = await mount(async o => {
    calls.push(o);
    if (o.path.endsWith('/close-check')) return response(data);
    if (o.method === 'POST') {
      timedOut = true;
      throw new AppError({ kind: 'timeout', message: 'Timeout' });
    }
    if (o.path.includes('/requests/'))
      throw new AppError({
        kind: 'http',
        status: 404,
        code: 'SHIFT_REQUEST_UNKNOWN',
        message: 'Unknown',
      });
    return response({});
  });
  await Renderer.act(async () =>
    p.button('Kiểm tra điều kiện kết thúc ca').props.onPress(),
  );
  await Renderer.act(async () =>
    p.tree.root.findByType(Dialog).props.onDismiss(),
  );
  await Renderer.act(async () => p.button('Kết thúc ca').props.onPress());
  await Renderer.act(
    async () => new Promise(resolve => setTimeout(resolve, 750)),
  );
  await Renderer.act(async () =>
    p.tree.root
      .findAllByType(Button)
      .filter(b => b.props.label === 'Kết thúc ca')
      .at(-1)!
      .props.onPress(),
  );
  expect(timedOut).toBe(true);
  expect(p.service.pending).toBeDefined();
  expect(p.service.receipt).toBeUndefined();
  await Renderer.act(async () =>
    p.tree.root.findByType(Dialog).props.onDismiss(),
  );
  await Renderer.act(async () => p.button('Đối chiếu kết quả').props.onPress());
  expect(calls.filter(o => o.method === 'POST')).toHaveLength(1);
  expect(calls.at(-1)?.method).toBe('GET');
  expect(p.service.pending).toBeDefined();
  await Renderer.act(async () => p.tree.unmount());
  resetShiftState();
  const recoveryCalls: RequestOptions[] = [];
  const restored = await mount(async o => {
    recoveryCalls.push(o);
    throw new AppError({ kind: 'http', status: 404, message: 'still unknown' });
  });
  expect(restored.service.pending).toBeDefined();
  expect(restored.button('Đối chiếu kết quả').props.disabled).toBe(false);
  await Renderer.act(async () =>
    restored.button('Đối chiếu kết quả').props.onPress(),
  );
  expect(recoveryCalls.every(o => o.method === 'GET')).toBe(true);
  await Renderer.act(async () => restored.tree.unmount());
});
test('verified direct END opens product S04 and reads summary, preserves login and never posts stock', async () => {
  const calls: RequestOptions[] = [];
  const p = await mount(async o => {
    calls.push(o);
    if (o.path.endsWith('/close-check'))
      return response({ ...data, draft_count: 2 });
    if (o.method === 'POST')
      return response({
        shift_id: id,
        actor_id: owner.actorId,
        auth_session_id: owner.authSessionId,
        warehouse_id: id,
        request_id: o.headers?.['Idempotency-Key'],
        command: 'END',
        outcome: 'SUCCEEDED',
        status: 'ENDED',
        version: 2,
        ended_at: '2026-10-14T02:00:00Z',
        summary_id: id,
        login_preserved: true,
      });
    return response({
      contract: 'p14-shift-v1',
      shift_id: id,
      warehouse_id: id,
      // Same instant as the +00 shift value; deployed BE normalizes snapshots
      // to UTC while lifecycle reads may retain an explicit +07:00 offset.
      started_at: '2026-10-14T08:00:00+07:00',
      ended_at: '2026-10-14T02:00:00Z',
      immutable: true,
      kpis: {
        successful_request_count: 2,
        count_unit: 'TRACKED_OWNER_REQUEST',
        recorded_documents: {
          INBOUND: 1,
          OUTBOUND: 0,
          WARRANTY: 0,
          COMPONENT_ISSUE: 0,
        },
        recorded_documents_scope: 'EXPLICIT_RECORD_ROUTES_ONLY',
        quantity_total: null,
        quantity_status: 'NOT_PROJECTED',
        posted_total: null,
        posted_total_status: 'NOT_PROJECTED',
      },
      draft_snapshot: {
        scope: 'AUTH_SESSION_AT_CLOSE_NOT_SHIFT_OWNERSHIP',
        owner_unchanged: true,
        total: 2,
        page: 1,
        per_page: 20,
        last_page: 1,
        items: [
          {
            document_id: '22222222-2222-4222-8222-222222222222',
            scan_session_id: '33333333-3333-4333-8333-333333333333',
            last_request_id: '44444444-4444-4444-8444-444444444444',
            actor_id: owner.actorId,
            auth_session_id: owner.authSessionId,
            warehouse_id: id,
            status: 'DRAFT',
            version: 1,
            operation: 'INBOUND',
            title: 'PN-0005',
            codes: '[]',
            form: '{}',
          },
          {
            document_id: '55555555-5555-4555-8555-555555555555',
            scan_session_id: '66666666-6666-4666-8666-666666666666',
            last_request_id: '77777777-7777-4777-8777-777777777777',
            actor_id: owner.actorId,
            auth_session_id: owner.authSessionId,
            warehouse_id: id,
            status: 'DRAFT',
            version: 2,
            operation: 'OUTBOUND',
            title: null,
            codes: '[]',
            form: JSON.stringify({ p05_create: { name: 'PX-0005' } }),
          },
        ],
      },
    });
  });
  await Renderer.act(async () =>
    p.button('Kiểm tra điều kiện kết thúc ca').props.onPress(),
  );
  await Renderer.act(async () =>
    p.tree.root.findByType(Dialog).props.onDismiss(),
  );
  await Renderer.act(async () => p.button('Kết thúc ca').props.onPress());
  await Renderer.act(
    async () => new Promise(resolve => setTimeout(resolve, 750)),
  );
  await Renderer.act(async () =>
    p.tree.root
      .findAllByType(Button)
      .filter(b => b.props.label === 'Kết thúc ca')
      .at(-1)!
      .props.onPress(),
  );
  expect(p.service.receipt?.login_preserved).toBe(true);
  expect(getShiftState().phase).toBe('ENDED');
  expect(p.service.summarySnapshot?.kpis).toMatchObject({
    quantity_total: null,
    posted_total: null,
  });
  const rendered = JSON.stringify(p.tree.toJSON());
  expect(rendered).toContain('Phiếu nháp (2)');
  expect(rendered).toContain('PN-0005');
  expect(rendered).toContain('PX-0005');
  expect(rendered).toContain('Nhập kho · Đã lưu nháp');
  expect(rendered).toContain('Xuất kho · Đã lưu nháp');
  expect(rendered).toContain('Chứng từ đã ghi nhận');
  expect(calls.filter(o => o.method === 'POST')).toHaveLength(1);
  expect(calls.at(-1)?.path).toBe(`/api/v1/mini-app/work-shifts/${id}/summary`);
  expect(p.button('Xem lịch sử')).toBeDefined();
  expect(p.button('Đăng xuất')).toBeDefined();
  expect(p.logout).not.toHaveBeenCalled();
  await Renderer.act(async () => p.tree.unmount());
});
