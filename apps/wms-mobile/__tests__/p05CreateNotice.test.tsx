// Isolated presentation regression; does not create/reconcile a live document.
import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { Text, TextInput, View, StyleSheet, Pressable } from 'react-native';
import { AppProviders } from '../src/app/App';
import { Button } from '../src/ui/Button';
import { P04Info } from '../src/features/inbound/P04Frame';
import { P17ScanExceptions } from '../src/features/scan/P17ScanExceptions';
import { P17Action } from '../src/features/scan/P17Primitives';
import { P05LinkedNativeFlow } from '../src/features/outbound/P05NativeFlow';
import { createP05NativeOwner } from '../src/features/outbound/p05NativeOwner';
import type { Snapshot } from '../src/features/outbound/linked/types';
import { P05CreateNativeFlow } from '../src/features/outbound/P05CreateNativeFlow';
import {
  createP05CreateOwner,
  type P05CreateState,
} from '../src/features/outbound/p05CreateOwner';
import { createStorage, createMemoryBackend } from '../src/storage/storage';

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
function fixture(patch: Partial<P05CreateState> = {}) {
  const base = createP05CreateOwner({
    storage: createStorage(createMemoryBackend()),
  });
  const blank = base.snapshot();
  const state: P05CreateState = {
    ...blank,
    unknown: true,
    retry: 'SAME_REQUEST_ONLY',
    form: {
      ...blank.form,
      name: 'TEST-UNKNOWN',
      recipient: 'Test',
      phone: '0901234567',
    },
    context: {
      actor_id: id(1),
      auth_session_id: id(2),
      active_warehouse_id: id(3),
      warehouse_context: { status: 'READY' },
      available_warehouses: [
        { warehouse_id: id(3), name: 'Kho test', status: 'ACTIVE' },
      ],
      permissions: { read: true, save: true, cancel: true, record: true },
      record: { reconcile_mode: 'P03_LINKED' },
      address_contract: { format: 'TEXT', structured_codes_supported: false },
    },
    pending: {
      mode: 'manual-create',
      command: 'SAVE',
      key: id(10),
      draftId: blank.draftId,
      scanSessionId: blank.scanSessionId,
      method: 'PUT',
      path: `/api/v1/mini-app/drafts/${blank.draftId}`,
      body: { unchanged_test_body: true },
      headers: { 'Idempotency-Key': id(10), 'If-Match': '"0"' },
      form: blank.form,
      batch: [],
    },
    ...patch,
  };
  const owner = {
    ...base,
    snapshot: () => JSON.parse(JSON.stringify(state)) as P05CreateState,
    initialize: jest.fn(async () => true),
    exceptionScope: () => 'TEST-ORIGINAL-OWNER',
    isDirty: () => !!patch.savedSignature,
    check: jest.fn(async () => false),
    retrySame: jest.fn(async () => false),
    save: jest.fn(async () => false),
    send: jest.fn(async () => false),
    leave: jest.fn(),
    errors: () => ({}),
    canRecord: () => false,
  };
  const exit = jest.fn();
  return { owner, state, exit };
}
async function mount(f: ReturnType<typeof fixture>) {
  let tree!: Renderer.ReactTestRenderer;
  await act(async () => {
    tree = Renderer.create(
      <AppProviders>
        <P05CreateNativeFlow owner={f.owner} onExit={f.exit} />
      </AppProviders>,
    );
  });
  return tree;
}
function assertControlsAreOutsideText(tree: Renderer.ReactTestRenderer) {
  for (const text of tree.root.findAllByType(Text)) {
    expect(text.findAllByType(Button)).toHaveLength(0);
    expect(text.findAllByType(TextInput)).toHaveLength(0);
    expect(text.findAllByType(Pressable)).toHaveLength(0);
  }
}

test.each([1, 2, 3] as const)(
  'UNKNOWN from S0%s uses standalone P17 controls outside Text with no old generic card',
  async step => {
    const f = fixture({ step });
    const tree = await mount(f),
      card = tree.root.findByType(P17ScanExceptions);
    assertControlsAreOutsideText(tree);
    expect(card.props.view).toMatchObject({
      panel: 'P17.S04',
      identity: {
        command: 'SAVE',
        operationKey: f.state.pending!.key,
        version: 0,
      },
    });
    expect(tree.root.findAllByType(P04Info)).toHaveLength(0);
    const actions = card.findAllByType(P17Action);
    expect(actions.map(v => v.props.label)).toEqual([
      'Kiểm tra trạng thái',
      'Gửi lại',
    ]);
    for (const button of actions) {
      const style = StyleSheet.flatten(
        button.findAll(
          node =>
            node.props.accessibilityRole === 'button' &&
            node.props.accessibilityLabel === button.props.label &&
            node.props.style,
        )[0]!.props.style,
      );
      expect(style.minHeight).toBeGreaterThanOrEqual(44);
      expect(style.position).not.toBe('absolute');
    }
    expect(actions.find(v => v.props.label === 'Gửi lại')!.props.disabled).toBe(
      true,
    );
    await act(async () => tree.unmount());
  },
);

test('standalone UNKNOWN checks only; resend stays disabled and Home preserves the original request/form', async () => {
  const f = fixture(),
    before = JSON.stringify(f.state),
    tree = await mount(f);
  const action = (label: string) =>
    tree.root
      .findByType(P17ScanExceptions)
      .findAllByType(P17Action)
      .find(v => v.props.label === label)!;
  await act(async () => action('Kiểm tra trạng thái').props.onPress());
  expect(f.owner.check).toHaveBeenCalledTimes(1);
  expect(f.owner.retrySame).not.toHaveBeenCalled();
  expect(action('Gửi lại').props.disabled).toBe(true);
  await act(async () => tree.root.findByType(P17ScanExceptions).props.onBack());
  expect(f.exit).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(f.state)).toBe(before);
  expect(f.owner.save).not.toHaveBeenCalled();
  expect(f.owner.send).not.toHaveBeenCalled();
  await act(async () => tree.unmount());
});

test('standalone UNKNOWN disables check/resend while checking and unmounts the underlying primary CTA', async () => {
  const f = fixture({ retry: 'NONE', busy: true }),
    tree = await mount(f);
  expect(
    tree.root
      .findByType(P17ScanExceptions)
      .findAllByType(P17Action)
      .map(v => v.props.label),
  ).toEqual(['Đang kiểm tra…', 'Gửi lại']);
  expect(
    tree.root
      .findByType(P17ScanExceptions)
      .findAllByType(P17Action)
      .every(v => v.props.disabled),
  ).toBe(true);
  expect(
    tree.root
      .findAllByType(Button)
      .filter(v => v.props.label === 'Bắt đầu soạn hàng'),
  ).toHaveLength(0);
  assertControlsAreOutsideText(tree);
  await act(async () => tree.unmount());
});

test.each([
  {
    title: 'Chưa thể tiếp tục',
    patch: { unknown: false, pending: null, error: 'Lỗi test dài '.repeat(30) },
  },
  {
    title: 'Có thông tin hoặc mã chưa lưu',
    patch: {
      unknown: false,
      pending: null,
      step: 3,
      savedSignature: 'dirty-test',
    },
  },
])(
  '$title action is also outside Text, sharing the same stacked control layout',
  async ({ title, patch }) => {
    const f = fixture(patch as Partial<P05CreateState>),
      tree = await mount(f);
    const card = tree.root
      .findAllByType(P04Info)
      .find(v => v.props.title === title)!;
    expect(card).toBeDefined();
    assertControlsAreOutsideText(tree);
    expect(
      card.findAllByType(View).some(v => v.props.testID === 'p04-info-actions'),
    ).toBe(true);
    await act(async () => tree.unmount());
  },
);

test('retained source-linked UNKNOWN also uses sibling controls and retains its original operation', async () => {
  const base = createP05NativeOwner({
    onChange: () => {},
    storage: createStorage(createMemoryBackend()),
  });
  const state: Snapshot = {
    ...base.snapshot(),
    step: 1,
    draftId: id(21),
    scanSessionId: id(22),
    unknown: true,
    retry: 'SAME_REQUEST_ONLY',
    context: fixture().state.context,
    pending: {
      command: 'SAVE',
      key: id(20),
      draftId: id(21),
      scanSessionId: id(22),
      sourceId: id(23),
      sourceVersion: 4,
      method: 'PUT',
      path: `/api/v1/mini-app/drafts/${id(21)}`,
      headers: { 'Idempotency-Key': id(20), 'If-Match': '"0"' },
      body: { unchanged_linked_test: true },
    },
  };
  const check = jest.fn(async () => false),
    retry = jest.fn(async () => false);
  const owner = {
    ...base,
    snapshot: () => state,
    start: jest.fn(),
    initialize: jest.fn(async () => true),
    exceptionScope: () => 'TEST-LINKED-ORIGINAL-OWNER',
    check,
    retrySame: retry,
    leave: jest.fn(),
  };
  let tree!: Renderer.ReactTestRenderer;
  await act(async () => {
    tree = Renderer.create(
      <AppProviders>
        <P05LinkedNativeFlow owner={owner} onExit={() => {}} />
      </AppProviders>,
    );
  });
  assertControlsAreOutsideText(tree);
  const card = tree.root.findByType(P17ScanExceptions);
  const controls = card.findAllByType(P17Action);
  expect(controls.map(v => v.props.label)).toEqual([
    'Kiểm tra trạng thái',
    'Gửi lại',
  ]);
  expect(tree.root.findAllByType(P04Info)).toHaveLength(0);
  const prior = JSON.stringify(state.pending);
  await act(async () =>
    controls
      .find(v => v.props.label === 'Kiểm tra trạng thái')!
      .props.onPress(),
  );
  expect(check).toHaveBeenCalledTimes(1);
  expect(retry).not.toHaveBeenCalled();
  expect(JSON.stringify(state.pending)).toBe(prior);
  await act(async () => tree.unmount());
});
