import { HN_UI } from '../src/theme/uiKitV3';
import { HN_OPERATIONS } from '../src/ui/hnHomeTokens';
/** Local P03 rendering/owner wiring. Fixtures never call the backend. */
import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { BackHandler, View, StyleSheet } from 'react-native';
import { AppProviders } from '../src/app/App';
import { P03Dialog, P03Surface } from '../src/features/scan/P03Dialog';
import { BottomNav } from '../src/ui/BottomNav';
import { ScanTaskPickerScreen } from '../src/features/scan/ScanTaskPickerScreen';
import { P04NativeFlow } from '../src/features/inbound/P04NativeFlow';
import {
  createP04Flow,
  type P04FlowState,
} from '../src/features/inbound/p04Flow';
import { getP03Context } from '../src/services/wms/p03Drafts';
import { fetchHomeWarehouse } from '../src/services/wms/home';
import { initialInboundDraft } from '../src/features/inbound/inboundDraft';
import {
  createMemoryBackend,
  createStorage,
  setAppStorageForTesting,
} from '../src/storage/storage';
jest.mock('../src/services/wms/p03Drafts', () => ({
  getP03Context: jest.fn(),
}));
jest.mock('../src/services/wms/home', () => ({
  fetchHomeWarehouse: jest.fn(),
}));
jest.mock('../src/features/inbound/p04Flow', () => ({
  createP04Flow: jest.fn(),
}));
jest.mock('../src/features/inbound/InboundCreateScreen', () => ({
  InboundCreateScreen: () => null,
}));
let tree: Renderer.ReactTestRenderer | undefined;
beforeEach(() => {
  jest.clearAllMocks();
  setAppStorageForTesting(createStorage(createMemoryBackend()));
});
afterEach(async () => {
  if (tree) await act(async () => tree!.unmount());
  tree = undefined;
  jest.restoreAllMocks();
});
const p03Buttons = () =>
  (tree!.root.findAllByType(P03Surface)[0]?.props.actions ?? []) as Array<{
    label: string;
    onPress: () => void;
    disabled?: boolean;
  }>;
const press = async (label: string) => {
  const b = p03Buttons().find(n => n.label === label)!;
  expect(b).toBeDefined();
  await act(async () => b.onPress());
};
const p03 = () =>
  tree!.root.findAllByType(P03Dialog).find(d => d.props.visible)!;
async function picker(status = 'READY', save = true, profile = 'ACTIVE') {
  (getP03Context as jest.Mock).mockResolvedValue({
    active_warehouse_id: 'warehouse-qa',
    warehouse_context: { status },
    warehouse_profile: { allowed: true },
    permissions: { INBOUND: { save }, OUTBOUND: { save }, WARRANTY: { save } },
  });
  (fetchHomeWarehouse as jest.Mock).mockResolvedValue({ status: profile });
  const select = jest.fn(),
    home = jest.fn();
  await act(async () => {
    tree = Renderer.create(
      <AppProviders>
        <ScanTaskPickerScreen
          onSelect={select}
          onHome={home}
          onLookupNfc={jest.fn()}
        />
      </AppProviders>,
    );
  });
  return { select, home };
}
test('S01 exactly four locked choices in order; no NFC/camera or write is mounted', async () => {
  await picker();
  const surface = tree!.root.findByType(P03Surface);
  expect(surface.props.panel).toBe('S01');
  expect(surface.props.disabledChoices).toEqual([]);
  expect(JSON.stringify(tree!.toJSON())).not.toContain('Tra cứu bằng NFC');
});
test('S01 leaves locked bottom navigation to AppShell so the picker cannot render a duplicate footer', async () => {
  const selectTab = jest.fn(),
    home = jest.fn();
  (getP03Context as jest.Mock).mockResolvedValue({
    active_warehouse_id: 'warehouse-qa',
    warehouse_context: { status: 'READY' },
    warehouse_profile: { allowed: true },
    permissions: {
      INBOUND: { save: true },
      OUTBOUND: { save: true },
      WARRANTY: { save: true },
    },
  });
  (fetchHomeWarehouse as jest.Mock).mockResolvedValue({ status: 'ACTIVE' });
  await act(async () => {
    tree = Renderer.create(
      <AppProviders>
        <ScanTaskPickerScreen
          onSelect={jest.fn()}
          onHome={home}
          onLookupNfc={jest.fn()}
          onSelectTab={selectTab}
        />
      </AppProviders>,
    );
  });
  expect(tree!.root.findAllByType(BottomNav)).toHaveLength(0);
  expect(selectTab).not.toHaveBeenCalled();
});
test.each(['inbound', 'outbound', 'warranty', 'lookup'])(
  'S01 %s routes once even with an immediate duplicate event',
  async choice => {
    const f = await picker(),
      surface = tree!.root.findByType(P03Surface);
    await act(async () => {
      surface.props.onChoose(choice);
      surface.props.onChoose(choice);
    });
    expect(f.select.mock.calls).toEqual([[choice]]);
  },
);
test.each(['REQUIRED', 'UNAVAILABLE'])(
  'S01 %s locks writes without claiming stopped or success; lookup remains read-only',
  async status => {
    const f = await picker(status);
    expect(tree!.root.findByType(P03Surface).props.panel).toBe('S01');
    for (const label of ['Nhập kho', 'Xuất kho', 'Bảo hành']) {
      expect(tree!.root.findByType(P03Surface).props.disabledChoices).toContain(
        label === 'Nhập kho'
          ? 'inbound'
          : label === 'Xuất kho'
          ? 'outbound'
          : 'warranty',
      );
      await act(async () =>
        tree!.root
          .findByType(P03Surface)
          .props.onChoose(
            label === 'Nhập kho'
              ? 'inbound'
              : label === 'Xuất kho'
              ? 'outbound'
              : 'warranty',
          ),
      );
    }
    expect(f.select).not.toHaveBeenCalled();
    await act(async () =>
      tree!.root.findByType(P03Surface).props.onChoose('lookup'),
    );
    expect(f.select).toHaveBeenCalledWith('lookup');
    expect(fetchHomeWarehouse).not.toHaveBeenCalled();
  },
);
test('S01 missing permission locks write after confirmed ACTIVE profile', async () => {
  const f = await picker('READY', false);
  await act(async () =>
    tree!.root.findByType(P03Surface).props.onChoose('inbound'),
  );
  expect(f.select).not.toHaveBeenCalled();
});
test('S01 uses the approved dimmed picker stage and no implicit dismiss/navigation handler', async () => {
  const f = await picker();
  const backdrop = tree!.root
    .findAllByType(View)
    .find(n => n.props.testID === 'p03-backdrop')!;
  expect(StyleSheet.flatten(backdrop.props.style)).toMatchObject({
    backgroundColor: HN_UI.scrim,
    borderRadius: 0,
  });
  await act(async () => backdrop.props.onResponderRelease());
  expect(f.home).not.toHaveBeenCalled();
  expect(f.select).not.toHaveBeenCalled();
  expect(tree!.root.findByType(P03Surface).props.panel).toBe('S01');
});
test.each([320, 390, 494])(
  'TC19 S01 scales from the mobile Note at width%s without shrinking to frame494',
  async width => {
    await picker();
    const root = tree!.root.findAll(
      n =>
        n.props.testID === 'P03.S01' && typeof n.props.onLayout === 'function',
    )[0];
    await act(async () =>
      root.props.onLayout({ nativeEvent: { layout: { width } } }),
    );
    const row = tree!.root.findAll(
      n =>
        n.props.testID === 'p03-choice-inbound' &&
        n.props.accessibilityRole === 'button',
    )[0];
    expect(StyleSheet.flatten(row.props.style).minHeight).toBeCloseTo(
      65 * Math.min(1, width / 390),
    );
    expect(
      row
        .findAllByType(View)
        .some(
          n =>
            StyleSheet.flatten(n.props.style)?.backgroundColor ===
            HN_OPERATIONS.inbound.soft,
        ),
    ).toBe(true);
  },
);
test('TC19 Note uses a light destructive confirmation and keeps its non-dismissible backdrop', async () => {
  await act(async () => {
    tree = Renderer.create(
      <AppProviders>
        <P03Surface panel="S04" onBack={jest.fn()} />
      </AppProviders>,
    );
  });
  const backdrop = tree!.root
    .findAllByType(View)
    .find(n => n.props.testID === 'p03-backdrop')!;
  expect(StyleSheet.flatten(backdrop.props.style)).toMatchObject({
    backgroundColor: HN_UI.canvas,
    borderRadius: 0,
  });
});
test('S03 inactive profile blocks business actions; explicit Home only, no fabricated admin contact', async () => {
  const f = await picker('READY', true, 'INACTIVE');
  expect(tree!.root.findByType(P03Surface).props.panel).toBe('S03');
  expect(p03Buttons().some(a => a.label === 'Liên hệ quản trị')).toBe(false);
  await press('Về Trang chủ');
  expect(f.home).toHaveBeenCalledTimes(1);
  expect(f.select).not.toHaveBeenCalled();
});
function nativeFixture(
  resume: boolean,
  phase: P04FlowState['phase'] = 'ready',
) {
  let state = {
    phase,
    types: [],
    busy: false,
    resume,
    context:
      phase === 'error'
        ? {
            warehouse_status: 'INACTIVE',
            warehouse_context: { status: 'UNAVAILABLE' },
          }
        : undefined,
    message: phase === 'error' ? 'Kho chưa hoạt động' : undefined,
    run: {
      ui: { ...initialInboundDraft, name: 'QA only', step: 0 },
      identity: { documentId: 'audit-draft', scanSessionId: 'audit-scan' },
      scope: { actorId: 'a', authSessionId: 's', warehouseId: 'w' },
      items: [],
      rows: [],
      closed: false,
    },
  } as unknown as P04FlowState;
  let change: (s: P04FlowState) => void = () => undefined;
  const update = (patch: Partial<P04FlowState>) => {
    state = { ...state, ...patch };
    change(state);
  };
  const flow = {
    begin: jest.fn(async () => change(state)),
    snapshot: () => state,
    isCurrent: jest.fn(
      binding =>
        !!state.run &&
        JSON.stringify(binding.identity) ===
          JSON.stringify(state.run.identity) &&
        JSON.stringify(binding.scope) === JSON.stringify(state.run.scope),
    ),
    dispose: jest.fn(),
    resume: jest.fn(() => update({ resume: false })),
    saveAndLeave: jest.fn(async () => true),
    cancel: jest.fn(async () => true),
    dismiss: jest.fn(),
    view: jest.fn(),
  };
  (createP04Flow as jest.Mock).mockImplementation(({ onChange }) => {
    change = onChange;
    return flow;
  });
  return { flow, update, data: JSON.stringify(state.run) };
}
async function inbound(
  f = nativeFixture(true),
  exit = jest.fn(),
  onSelectTab = jest.fn(),
) {
  await act(async () => {
    tree = Renderer.create(
      <AppProviders>
        <P04NativeFlow onExit={exit} onSelectTab={onSelectTab} />
      </AppProviders>,
    );
  });
  return { ...f, exit, onSelectTab };
}
test('S02 four choices delegate Continue/Hủy without save/cancel or data changes', async () => {
  const f = await inbound();
  expect(p03().props.panel).toBe('S02');
  expect(p03().props.actions.map((a: { label: string }) => a.label)).toEqual([
    'Tiếp tục phiếu',
    'Lưu nháp và thoát',
    'Bỏ phiếu',
    'Hủy',
  ]);
  await press('Tiếp tục phiếu');
  expect(f.flow.resume).toHaveBeenCalledTimes(1);
  expect(f.flow.saveAndLeave).not.toHaveBeenCalled();
  expect(f.flow.cancel).not.toHaveBeenCalled();
  expect(JSON.stringify(f.flow.snapshot().run)).toBe(f.data);
});
test.each([true, false])(
  'S02 save result %s waits and suppresses duplicate submit',
  async confirmed => {
    const f = await inbound();
    let resolve!: (ok: boolean) => void;
    f.flow.saveAndLeave.mockImplementation(
      () =>
        new Promise<boolean>(done => {
          resolve = done;
        }),
    );
    const button = () =>
      p03Buttons().find(n => n.label === 'Lưu nháp và thoát')!;
    await act(async () => {
      button().onPress();
      button().onPress();
    });
    expect(f.flow.saveAndLeave).toHaveBeenCalledTimes(1);
    expect(f.exit).not.toHaveBeenCalled();
    expect(p03().props.busy).toBe(true);
    await act(async () => resolve(confirmed));
    expect(f.exit).toHaveBeenCalledTimes(confirmed ? 1 : 0);
    if (!confirmed) expect(p03().props.panel).toBe('S02');
    expect(JSON.stringify(f.flow.snapshot().run)).toBe(f.data);
  },
);
test('S04 opens before cancel; Quay lại and hardware Back restore S02/data without mutation', async () => {
  let back!: () => boolean;
  jest
    .spyOn(BackHandler, 'addEventListener')
    .mockImplementation((_e, handler) => {
      back = handler as () => boolean;
      return { remove: jest.fn() };
    });
  const f = await inbound();
  await press('Bỏ phiếu');
  expect(p03().props.panel).toBe('S04');
  expect(f.flow.cancel).not.toHaveBeenCalled();
  await press('Quay lại');
  expect(p03().props.panel).toBe('S02');
  await press('Bỏ phiếu');
  await act(async () => {
    expect(back()).toBe(true);
  });
  expect(p03().props.panel).toBe('S02');
  expect(f.flow.cancel).not.toHaveBeenCalled();
  expect(JSON.stringify(f.flow.snapshot().run)).toBe(f.data);
});
test.each([true, false])(
  'S04 cancel result %s only leaves after confirmation and suppresses duplicate submit',
  async confirmed => {
    const f = await inbound();
    let resolve!: (ok: boolean) => void;
    f.flow.cancel.mockImplementation(
      () =>
        new Promise<boolean>(done => {
          resolve = done;
        }),
    );
    await press('Bỏ phiếu');
    const button = () => p03Buttons().find(n => n.label === 'Bỏ phiếu')!;
    await act(async () => {
      button().onPress();
      button().onPress();
    });
    expect(f.flow.cancel).toHaveBeenCalledTimes(1);
    expect(f.exit).not.toHaveBeenCalled();
    await act(async () => resolve(confirmed));
    expect(f.exit).toHaveBeenCalledTimes(confirmed ? 1 : 0);
    if (!confirmed) expect(p03().props.panel).toBe('S04');
  },
);
test('S02 footer queues unfinished-work navigation; S04 blocks taps without writing or losing work', async () => {
  const f = await inbound();
  let nav = tree!.root.findAllByType(BottomNav).find(n => !n.props.disabled)!;
  await act(async () => nav.props.onSelect('history'));
  expect(f.onSelectTab).not.toHaveBeenCalled();
  expect(f.flow.saveAndLeave).not.toHaveBeenCalled();
  expect(f.flow.cancel).not.toHaveBeenCalled();
  await press('Bỏ phiếu');
  nav = tree!.root.findByType(BottomNav);
  expect(nav.props.disabled).toBe(true);
  await act(async () => nav.props.onSelect('home'));
  expect(f.onSelectTab).not.toHaveBeenCalled();
  expect(f.exit).not.toHaveBeenCalled();
  expect(JSON.stringify(f.flow.snapshot().run)).toBe(f.data);
});
test('S03 inbound inactive displays locked dialog; unknown context never impersonates inactive', async () => {
  const f = nativeFixture(false, 'error');
  await inbound(f);
  expect(p03().props.panel).toBe('S03');
  await act(async () =>
    f.update({
      context: {
        warehouse_status: null,
        warehouse_context: { status: 'UNAVAILABLE' },
      } as P04FlowState['context'],
    }),
  );
  expect(
    tree!.root.findAllByType(P03Dialog).filter(d => d.props.visible),
  ).toHaveLength(0);
});
test('S02/S04 UNKNOWN retained by owner is not a successful save or permission to discard', async () => {
  const f = await inbound();
  await act(async () =>
    f.update({
      run: {
        ...f.flow.snapshot().run!,
        pending: {
          outcome: 'UNKNOWN',
          command: 'SAVE',
          key: 'qa-frozen-key',
          version: 1,
          body: {},
        } as unknown as NonNullable<P04FlowState['run']>['pending'],
      },
    }),
  );
  expect(
    tree!.root.findAllByType(P03Dialog).filter(d => d.props.visible),
  ).toHaveLength(0);
  expect(f.flow.cancel).not.toHaveBeenCalled();
  expect(f.exit).not.toHaveBeenCalled();
  expect(f.flow.snapshot().run!.pending!.key).toBe('qa-frozen-key');
});
