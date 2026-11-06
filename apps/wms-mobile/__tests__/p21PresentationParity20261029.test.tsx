jest.mock('../src/services/wms/linkedHistoryRead', () => ({
  createLinkedHistoryRead: jest.fn(),
}));
jest.mock('../src/services/wms/p09Warranty', () => ({
  createP09Service: jest.fn(),
}));
jest.mock('../src/features/warranty/p19/p19OriginalRecovery', () => ({
  p19OriginalRecovery: jest.fn(),
  p19LocalPendingTasks: jest.fn(),
}));
jest.mock('../src/native/nfc', () => ({ copyNfcIdentifier: jest.fn() }));
jest.mock('../src/features/warranty/p19/p19LocalDrafts',()=>({
  p19UnsubmittedLocalDrafts:jest.fn(),prepareP19LocalDraftResume:jest.fn(),
}));
import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { ScrollView, StyleSheet } from 'react-native';
import {
  P21ResumeScreen,
  type P21Retained,
} from '../src/features/warranty/P21ResumeScreen';
import { AppProviders } from '../src/app/App';
import { Dialog } from '../src/ui/Dialog';
import { AppError } from '../src/errors/AppError';
import { copyNfcIdentifier } from '../src/native/nfc';
import {
  createLinkedHistoryRead,
  type ResumeTask,
} from '../src/services/wms/linkedHistoryRead';
import { createP09Service } from '../src/services/wms/p09Warranty';
import {
  p19OriginalRecovery,
  p19LocalPendingTasks,
} from '../src/features/warranty/p19/p19OriginalRecovery';
import { clearSession, setSession } from '../src/auth/session';
import {
  createStorage,
  createMemoryBackend,
  setAppStorageForTesting,
} from '../src/storage/storage';
import {
  context as contextFixture,
  id,
  caseRow,
  deferred,
} from './fixtures/p09Mock';
import type { P08Context } from '../src/services/wms/p08Types';
import type { ButtonProps } from '../src/ui/Button';
import {p19UnsubmittedLocalDrafts,prepareP19LocalDraftResume} from '../src/features/warranty/p19/p19LocalDrafts';

let tree: Renderer.ReactTestRenderer | undefined;
let api: { scopeKey: jest.Mock; tasks: jest.Mock; task: jest.Mock };
let readCheck: jest.Mock, warranty: { detail: jest.Mock }, task: ResumeTask;
const context = (): P08Context => {
  const c = contextFixture();
  return {
    session: c.session,
    user: {
      ...c.user,
      available_warehouses: [
        { warehouse_id: id(3), name: 'Kho TEST UI', status: 'ACTIVE' },
      ],
    },
  };
};
const content = (node: any): string =>
  node == null
    ? ''
    : typeof node === 'string' || typeof node === 'number'
    ? String(node)
    : Array.isArray(node)
    ? node.map(content).join('')
    : content(node.children);
const text = () => content(tree!.toJSON());
const button = (label: string) =>
  tree!.root.findAll(
    n =>
      typeof n.props.onPress === 'function' &&
      (n.props.accessibilityLabel === label || n.props.label === label),
  )[0];
const press = async (label: string) => {
  const target = button(label);
  expect(target).toBeDefined();
  await act(async () => {
    target.props.onPress();
  });
};
const mount = async (
  extra: Partial<React.ComponentProps<typeof P21ResumeScreen>> = {},
) => {
  await act(async () => {
    tree = Renderer.create(
      <AppProviders>
        <P21ResumeScreen
          context={context()}
          onBack={jest.fn()}
          onOpenResult={jest.fn()}
          {...extra}
        />
      </AppProviders>,
    );
  });
};
const hasPanel = (panel: string) =>
  tree!.root.findAll(n => n.props.testID === panel).length > 0;
beforeEach(() => {
  jest.clearAllMocks();
  setAppStorageForTesting(createStorage(createMemoryBackend()));
  clearSession();
  setSession(context().session!);
  task = {
    id: id(8),
    caseId: id(4),
    scanSessionId: id(9),
    version: 3,
    status: 'DRAFT',
    policy: 'OWNER_PREFLIGHT_REQUIRED',
    businessId: null,
    businessVersion: null,
    number: 'XLK-TEST-UI',
    postedAt: null,
    canOpenBusiness: false,
    quantity: 3,
    codeCount: 2,
    codes: [
      { raw_code: 'ITEM-TEST-UI', quantity: 1, scan_source: 'SCANNER' },
      { raw_code: 'BOX-TEST-UI', quantity: 2, scan_source: 'MANUAL' },
    ],
    lastKey: null,
    lastCommand: null,
  };
  api = {
    scopeKey: jest.fn(() => 'P21-scope'),
    tasks: jest.fn(async () => ({
      items: [task],
      total: 1,
      hasMore: false,
      nextPage: null,
    })),
    task: jest.fn(async () => task),
  };
  warranty = {
    detail: jest.fn(async () => ({
      ...caseRow(),
      warranty_case_code: 'BH-TEST-UI',
      sku_name: 'Sản phẩm TEST UI',
      status: 'CHECKING',
    })),
  };
  readCheck = jest.fn(async () => ({
    outcome: 'UNKNOWN',
    businessId: undefined,
    caseId: task.caseId,
    receipt: null,
  }));
  (createLinkedHistoryRead as jest.Mock).mockReturnValue(api);
  (createP09Service as jest.Mock).mockReturnValue(warranty);
  (p19LocalPendingTasks as jest.Mock).mockReturnValue([]);
  (p19OriginalRecovery as jest.Mock).mockReturnValue(undefined);
  (p19UnsubmittedLocalDrafts as jest.Mock).mockReturnValue({items:[],unresolved:0});
});
afterEach(async () => {
  if (tree) await act(async () => tree!.unmount());
  tree = undefined;
  clearSession();
});
function original(command = 'RECORD') {
  (p19OriginalRecovery as jest.Mock).mockReturnValue({
    key: id(90),
    command,
    check: readCheck,
  });
}

test('empty Web source still exposes a dirty local draft and opens exact case without a nonexistent server GET',async()=>{
  api.tasks.mockResolvedValue({items:[],total:0,hasMore:false,nextPage:null});
  const local={caseId:id(4),draftId:id(80),scanSessionId:id(81),version:0,codeCount:0,quantity:0,revision:'unit-checkpoint'};
  (p19UnsubmittedLocalDrafts as jest.Mock).mockReturnValue({items:[local],unresolved:0});
  const row=caseRow(),resume=jest.fn();(prepareP19LocalDraftResume as jest.Mock).mockResolvedValue(row);
  await mount({onResumeLocalDraft:resume});
  expect(text()).toContain('Nháp trên thiết bị (1)');expect(text()).not.toContain('Chưa có phiếu đang làm');
  await press('Tiếp tục nháp trên thiết bị');
  expect(resume).toHaveBeenCalledWith(row,local);expect(api.task).not.toHaveBeenCalled();
});
test('403 cannot expose local drafts or call local navigation',async()=>{
  api.tasks.mockRejectedValue(new AppError({kind:'http',status:403,message:'denied'}));
  (p19UnsubmittedLocalDrafts as jest.Mock).mockReturnValue({items:[{caseId:id(4),draftId:id(80),scanSessionId:id(81),version:0,codeCount:0,quantity:0,revision:'unit'}],unresolved:0});
  const resume=jest.fn();await mount({onResumeLocalDraft:resume});
  expect(text()).not.toContain('Nháp trên thiết bị (1)');expect(text()).not.toContain(id(80));expect(resume).not.toHaveBeenCalled();
});

test('S01 whole-card opens exact draft/scan and keeps dock outside content scrolling', async () => {
  await mount();
  expect(hasPanel('P21.S01')).toBe(true);
  expect(text()).toContain('1 phiếu đã tải');
  const dock = tree!.root.findAll(n => n.props.testID === 'P21.dock')[0];
  let parent = dock.parent;
  while (parent) {
    expect(parent.type).not.toBe(ScrollView);
    parent = parent.parent;
  }
  expect(StyleSheet.flatten(dock.props.style).flexShrink).toBe(0);
  await press('Xem checkpoint');
  expect(api.task.mock.calls[0].slice(0, 2)).toEqual([
    task.id,
    task.scanSessionId,
  ]);
  expect(hasPanel('P21.S02')).toBe(true);
  expect(text()).toContain('BH-TEST-UI');
  expect(text()).toContain('Sản phẩm TEST UI');
  expect(text()).toContain('Bản nhập đã giữ');
  expect(text()).not.toContain('Mã đã lưu trên phiếu được xác minh');
  expect(button('Tiếp tục quét').props.disabled).toBe(true);
  expect(readCheck).not.toHaveBeenCalled();
});
test('S02 snapshot has no destructive controls and does not turn missing quantity into zero', async () => {
  task.quantity = null;
  task.codes[1].quantity = null;
  await mount();
  await press('Xem checkpoint');
  expect(text()).toContain('Chưa xác minh linh kiện');
  expect(text()).not.toContain('0 linh kiện');
  expect(
    tree!.root.findAll(n =>
      ['Xóa mã', 'Xuất linh kiện', 'Lưu phiếu', 'Gửi lại'].includes(
        n.props.label,
      ),
    ).length,
  ).toBe(0);
  expect(text()).not.toContain(task.scanSessionId);
  expect(text()).not.toContain('Version');
  await press('Chi tiết đối chiếu');
  expect(text()).toContain(task.scanSessionId);
  expect(text()).toContain('Version bản nhập hiện tại: 3');
});
test('S03 presents monitor guidance and returns to the list without mutation', async () => {
  task.policy = 'READ_ONLY_INCOMPLETE_SNAPSHOT';
  task.quantity = null;
  await mount();
  await press('Xem checkpoint');
  await press('Kiểm tra phiếu');
  expect(hasPanel('P21.S03')).toBe(true);
  expect(text()).toContain('Cần đối chiếu trên Web');
  expect(text()).toContain('Chưa xác minh được mã đã quét');
  await press('Hướng dẫn đối chiếu');
  expect(tree!.root.findByType(Dialog).props.dismissOnBackdrop).toBe(false);
  expect(text()).toContain(task.id);
  expect(text()).toContain('Không tạo phiếu bù');
  await act(async () => tree!.root.findByType(Dialog).props.onDismiss());
  expect(hasPanel('P21.S03')).toBe(true);
  await press('Về phiếu đang thực hiện');
  expect(hasPanel('P21.S01')).toBe(true);
  expect(readCheck).not.toHaveBeenCalled();
});
test('long/unicode raw codes remain intact in one reader and Back dismisses only the reader', async () => {
  const raw = '  BOX-ĐỎ\n' + 'Đ'.repeat(2200) + '\n  ';
  task.codes[0].raw_code = raw;
  await mount();
  await press('Xem checkpoint');
  await press('Xem đầy đủ · Mã 1');
  expect(text()).toContain(raw);
  expect(tree!.root.findAllByType(Dialog)).toHaveLength(1);
  await act(async () => tree!.root.findByType(Dialog).props.onDismiss());
  expect(tree!.root.findAllByType(Dialog)).toHaveLength(0);
  expect(hasPanel('P21.S02')).toBe(true);
});
test('S04 unknown uses exact original request and repeated checks do not rotate identity', async () => {
  original();
  await mount();
  await press('Xem checkpoint');
  expect(readCheck).not.toHaveBeenCalled();
  await press('Kiểm tra kết quả yêu cầu cũ');
  expect(hasPanel('P21.S04')).toBe(true);
  expect(text()).toContain('Đang chờ xác định kết quả');
  expect(text()).not.toContain('UNKNOWN');
  expect(text()).not.toContain(id(90));
  await press('Kiểm tra kết quả xuất');
  expect(readCheck).toHaveBeenCalledTimes(2);
  await press('Chi tiết đối chiếu');
  expect(text()).toContain('Yêu cầu gốc: ' + id(90));
  expect(text()).toContain('Lệnh gốc: RECORD');
  expect(task.version).toBe(3);
});
test('inflight recovery disables dock and never provides a write retry', async () => {
  const pending = deferred<any>();
  readCheck.mockReturnValue(pending.promise);
  original();
  await mount();
  await press('Xem checkpoint');
  await press('Kiểm tra kết quả yêu cầu cũ');
  const props = button('Kiểm tra kết quả xuất').props as ButtonProps;
  expect(props.loading).toBe(true);
  expect(readCheck).toHaveBeenCalledTimes(1);
  await press('Kiểm tra kết quả xuất');
  expect(readCheck).toHaveBeenCalledTimes(1);
  await act(async () =>
    pending.resolve({ outcome: 'UNKNOWN', caseId: task.caseId }),
  );
  expect(button('Kiểm tra kết quả xuất').props.loading).toBe(false);
});
test('SAVE unknown keeps save wording and does not claim an issued quantity', async () => {
  original('SAVE');
  await mount();
  await press('Xem checkpoint');
  await press('Kiểm tra kết quả yêu cầu cũ');
  expect(text()).toContain('Yêu cầu lưu phiếu chưa rõ kết quả');
  expect(button('Kiểm tra kết quả lưu phiếu')).toBeDefined();
  expect(text()).not.toContain('Xuất linh kiện thành công');
});
test('only a matching verified result exposes exact case/business navigation', async () => {
  original();
  readCheck.mockResolvedValue({
    outcome: 'SUCCEEDED',
    businessId: id(80),
    caseId: task.caseId,
  });
  const open = jest.fn();
  await mount({ onOpenResult: open });
  await press('Xem checkpoint');
  await press('Kiểm tra kết quả yêu cầu cũ');
  expect(open).not.toHaveBeenCalled();
  await press('Mở kết quả đã xác minh');
  expect(open).toHaveBeenCalledWith(task.caseId, id(80));
});
test('mismatched recovered case is never presented as success', async () => {
  original();
  readCheck.mockResolvedValue({
    outcome: 'SUCCEEDED',
    businessId: id(80),
    caseId: id(99),
  });
  await mount();
  await press('Xem checkpoint');
  await press('Kiểm tra kết quả yêu cầu cũ');
  expect(button('Mở kết quả đã xác minh')).toBeUndefined();
  expect(text()).toContain('Đang chờ xác định kết quả');
});
test('closed case still checks original UNKNOWN but never offers a scan transition', async () => {
  task.policy = 'READ_ONLY_CASE_STATE';
  original();
  await mount();
  await press('Xem checkpoint');
  expect(text()).toContain('Hồ sơ không cho phép xuất mới');
  await press('Kiểm tra kết quả yêu cầu cũ');
  expect(readCheck).toHaveBeenCalledTimes(1);
  expect(hasPanel('P21.S04')).toBe(true);
});
test('403 clears protected details and local pending cannot masquerade as an empty successful page', async () => {
  (p19LocalPendingTasks as jest.Mock).mockReturnValue([task]);
  api.tasks.mockRejectedValue(
    new AppError({
      kind: 'http',
      status: 403,
      message: 'Không có quyền đọc',
    }),
  );
  await mount();
  expect(text()).not.toContain('Chưa có phiếu đang làm');
  expect(button('Xem checkpoint')).toBeUndefined();
});
test('retained original key survives remount but no automatic GET runs on reentry', async () => {
  const retained: P21Retained = {};
  original();
  await mount({ retained });
  await press('Xem checkpoint');
  await press('Kiểm tra kết quả yêu cầu cũ');
  await act(async () => tree!.unmount());
  tree = undefined;
  expect(retained.current?.check).toEqual({ key: id(90), command: 'RECORD' });
  readCheck.mockClear();
  await mount({ retained });
  expect(hasPanel('P21.S04')).toBe(true);
  expect(readCheck).not.toHaveBeenCalled();
  await press('Kiểm tra kết quả xuất');
  expect(readCheck).toHaveBeenCalledTimes(1);
});
test('new auth scope closes a protected reader and discards its retained selection', async () => {
  await mount();
  await press('Xem checkpoint');
  await press('Chi tiết đối chiếu');
  expect(tree!.root.findAllByType(Dialog)).toHaveLength(1);
  await act(async () => {
    setSession({ ...context().session!, authSessionId: id(999) });
    tree!.update(
      <AppProviders>
        <P21ResumeScreen
          context={{
            ...context(),
            session: { ...context().session!, authSessionId: id(999) },
          }}
          onBack={jest.fn()}
          onOpenResult={jest.fn()}
        />
      </AppProviders>,
    );
  });
  expect(tree!.root.findAllByType(Dialog)).toHaveLength(0);
  expect(hasPanel('P21.S01')).toBe(true);
});

test('copy success waits for resolution and replaces the same dialog with allowlisted feedback', async () => {
  const copying = deferred<void>();
  (copyNfcIdentifier as jest.Mock).mockReturnValue(copying.promise);
  original();
  await mount();
  await press('Xem checkpoint');
  await press('Chi tiết đối chiếu');
  await press('Sao chép thông tin đối chiếu');
  expect(tree!.root.findAllByType(Dialog)).toHaveLength(1);
  expect(tree!.root.findByType(Dialog).props.title).toBe('Chi tiết đối chiếu');
  const payload = (copyNfcIdentifier as jest.Mock).mock.calls[0][0];
  expect(payload).toContain('Yêu cầu gốc: ' + id(90));
  expect(payload).not.toContain('offline-token');
  expect(payload).not.toContain('accessToken');
  await act(async () => copying.resolve());
  expect(tree!.root.findAllByType(Dialog)).toHaveLength(1);
  expect(tree!.root.findByType(Dialog).props.title).toBe(
    'Đã sao chép thông tin đối chiếu',
  );
});

test('copy rejection retains multiline raw identity for manual copy', async () => {
  (copyNfcIdentifier as jest.Mock).mockRejectedValue(
    new Error('clipboard blocked'),
  );
  await mount();
  await press('Xem checkpoint');
  await press('Chi tiết đối chiếu');
  await press('Sao chép thông tin đối chiếu');
  expect(tree!.root.findByType(Dialog).props.title).toBe('Chưa sao chép được');
  expect(text()).toContain(
    'ID phiếu: ' + task.id + '\nID hồ sơ: ' + task.caseId,
  );
});

test('closing a pending copy suppresses late feedback', async () => {
  const copying = deferred<void>();
  (copyNfcIdentifier as jest.Mock).mockReturnValue(copying.promise);
  await mount();
  await press('Xem checkpoint');
  await press('Chi tiết đối chiếu');
  await press('Sao chép thông tin đối chiếu');
  await press('Đóng');
  await act(async () => copying.resolve());
  expect(tree!.root.findAllByType(Dialog)).toHaveLength(0);
  expect(hasPanel('P21.S02')).toBe(true);
});

test('original UNKNOWN has priority over a current linked result', async () => {
  task.canOpenBusiness = true;
  task.businessId = id(88);
  original();
  await mount();
  await press('Xem checkpoint');
  expect(button('Mở phiếu đã ghi nhận')).toBeUndefined();
  expect(button('Kiểm tra kết quả yêu cầu cũ')).toBeDefined();
  await press('Kiểm tra kết quả yêu cầu cũ');
  expect(readCheck).toHaveBeenCalledTimes(1);
});

test('a successful SAVE cannot expose a returned business receipt as an issued result', async () => {
  original('SAVE');
  readCheck.mockResolvedValue({
    outcome: 'SUCCEEDED',
    businessId: id(80),
    caseId: task.caseId,
  });
  const open = jest.fn();
  await mount({ onOpenResult: open });
  await press('Xem checkpoint');
  await press('Kiểm tra kết quả yêu cầu cũ');
  expect(text()).toContain('Đã xác minh lưu phiếu');
  expect(button('Mở kết quả đã xác minh')).toBeUndefined();
  expect(open).not.toHaveBeenCalled();
});

test('unmounting during copy ignores its later resolution', async () => {
  const copying = deferred<void>();
  (copyNfcIdentifier as jest.Mock).mockReturnValue(copying.promise);
  await mount();
  await press('Xem checkpoint');
  await press('Chi tiết đối chiếu');
  await press('Sao chép thông tin đối chiếu');
  await act(async () => tree!.unmount());
  tree = undefined;
  await act(async () => copying.resolve());
  expect(copyNfcIdentifier).toHaveBeenCalledTimes(1);
});
