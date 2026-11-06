import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { AppProviders } from '../src/app/App';
import { Dialog } from '../src/ui/Dialog';
import { InboundReviewScreen } from '../src/features/inbound/InboundReviewScreen';
import { P04NativeFlow } from '../src/features/inbound/P04NativeFlow';
import { P17ScanExceptions } from '../src/features/scan/P17ScanExceptions';
import {
  createP04Flow,
  type P04FlowState,
} from '../src/features/inbound/p04Flow';
import { initialInboundDraft } from '../src/features/inbound/inboundDraft';
import {
  createMemoryBackend,
  createStorage,
  setAppStorageForTesting,
} from '../src/storage/storage';
jest.mock('../src/features/inbound/p04Flow', () => ({
  createP04Flow: jest.fn(),
}));

test.each(['FAILED', 'UNKNOWN'] as const)(
  'restored %s has recovery actions while S03 stays locked without false loading',
  async outcome => {
    setAppStorageForTesting(createStorage(createMemoryBackend()));
    const state = {
      phase: 'ready',
      types: [],
      busy: false,
      resume: false,
      run: {
        ui: { ...initialInboundDraft, step: 2, name: 'Retained' },
        identity: { documentId: 'draft', scanSessionId: 'scan' },
        scope: { actorId: 'actor', authSessionId: 'auth', warehouseId: 'warehouse' },
        items: [],
        rows: [],
        closed: false,
        pending: {
          command: 'RECORD',
          outcome,
          key: 'same-key',
          version: 2,
          body: { warehouse_id: 'warehouse', scan_session_id: 'scan' },
        },
      },
    } as unknown as P04FlowState;
    (createP04Flow as jest.Mock).mockImplementation(({ onChange }) => ({
      begin: async () => onChange(state),
      dispose: jest.fn(),
      view: jest.fn(),
      snapshot: () => state,
      isCurrent: () => true,
    }));
    let tree!: Renderer.ReactTestRenderer;
    await act(async () => {
      tree = Renderer.create(
        <AppProviders>
          <P04NativeFlow onExit={() => undefined} />
        </AppProviders>,
      );
    });
    const screens = tree.root.findAllByType(InboundReviewScreen);
    if (outcome === 'UNKNOWN') {
      expect(screens).toHaveLength(0);
      const exception = tree.root.findByType(P17ScanExceptions);
      expect(exception.props.view.panel).toBe('P17.S04');
      expect(exception.props.view.identity).toEqual({
        operationKey: 'same-key', draftId: 'draft', scanSessionId: 'scan',
        version: 2, command: 'RECORD',
      });
      expect(tree.root.findAllByType(Dialog).filter(d => d.props.visible)).toHaveLength(0);
      await act(async () => tree.unmount());
      return;
    }
    if (!screens.length)
      throw new Error(
        'Restored screen unavailable: ' + JSON.stringify(tree.toJSON()),
      );
    const screen = screens[0];
    expect(screen.props.recording).toBe(false);
    expect(screen.props.locked).toBe(true);
    const shown = tree.root.findAllByType(Dialog).filter(d => d.props.visible);
    expect(shown).toHaveLength(1);
    expect(shown[0].props.dismissible).toBe(false);
    expect(shown[0].props.title).toBe('Thông tin phiếu nhập');
    const content = JSON.stringify(tree.toJSON());
    expect(content).toContain(
      'Kiểm tra để sửa phiếu',
    );
    await act(async () => tree.unmount());
  },
);

test('current server review excludes rejected cached codes from valid counts but preserves saved draft data', async () => {
  setAppStorageForTesting(createStorage(createMemoryBackend()));
  const code = {
    key: 'kept',
    raw: 'REGISTERED-OLD',
    sku: 'SKU-A',
    quantity: 1,
    source: 'MANUAL',
    at: 1,
  };
  const state = {
    phase: 'ready',
    types: [],
    busy: false,
    resume: false,
    run: {
      ui: { ...initialInboundDraft, step: 2, name: 'Kept', codes: [code] },
      items: [{ raw_code: code.raw, quantity: 1, scan_source: 'MANUAL' }],
      identity: { documentId: 'draft', scanSessionId: 'scan' },
      closed: false,
    },
    review: {
      can_record: false,
      items: [
        {
          raw_code: code.raw,
          outcome: 'REJECTED',
          reason_code: 'ITEM_ALREADY_REGISTERED',
          message: 'Mã đã đăng ký; không nhập lại.',
        },
      ],
    },
  } as unknown as P04FlowState;
  (createP04Flow as jest.Mock).mockImplementation(({ onChange }) => ({
    begin: async () => onChange(state),
    dispose: jest.fn(),
    view: jest.fn(),
    snapshot: () => state,
  }));
  let tree!: Renderer.ReactTestRenderer;
  await act(async () => {
    tree = Renderer.create(
      <AppProviders>
        <P04NativeFlow onExit={() => undefined} />
      </AppProviders>,
    );
  });
  const review = tree.root.findByType(InboundReviewScreen);
  expect(review.props.draft.codes).toEqual([]);
  expect(review.props.canSend).toBe(false);
  expect(review.props.revalidationErrors).toEqual([
    { raw: code.raw, message: 'Mã đã đăng ký; không nhập lại.' },
  ]);
  expect(state.run!.ui.codes).toEqual([code]);
  expect(state.run!.items).toHaveLength(1);
  await act(async () => tree.unmount());
});
