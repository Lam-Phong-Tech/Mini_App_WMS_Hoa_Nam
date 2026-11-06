// Local owner/presenter contract only. No backend, hardware, build or capture.
import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { AppProviders } from '../src/app/App';
import { P05CreateNativeFlow } from '../src/features/outbound/P05CreateNativeFlow';
import { P05LinkedNativeFlow } from '../src/features/outbound/P05NativeFlow';
import { P17ScanExceptions } from '../src/features/scan/P17ScanExceptions';
import { BusinessScanScreen } from '../src/features/scan/BusinessScanScreen';
import { P03Dialog } from '../src/features/scan/P03Dialog';
import { createP05CreateOwner } from '../src/features/outbound/p05CreateOwner';
import { createP05NativeOwner } from '../src/features/outbound/p05NativeOwner';
import {
  p05PendingIdentity,
  p05RejectedObservation,
} from '../src/features/outbound/linked/p05-exceptions';
import { p05ExceptionView } from '../src/features/outbound/P05Exceptions';
import { createMemoryBackend, createStorage } from '../src/storage/storage';
import type { P05CreateRequest } from '../src/services/wms/p05Create';
import type { FrozenRequest } from '../src/features/outbound/linked/types';
jest.mock('../src/features/scan/BusinessScanScreen', () => ({
  BusinessScanScreen: jest.fn(() => null),
}));
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const copy = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
const reservation = {
  redacted: false,
  can_open: true,
  document_id: id(9),
  doc_no: 'PX-PRIVATE',
  status: 'DRAFT',
};

test.each([
  [false, reservation],
  [true, { ...reservation, redacted: true }],
  [true, { ...reservation, can_open: false }],
  [true, { ...reservation, can_open: 'true' }],
  [true, { ...reservation, document_id: 'not-uuid' }],
  [true, { document_id: id(9), doc_no: 'PX-PRIVATE' }],
] as const)(
  'holder projection never derives permission from denial; readVerified=%s reservation=%j',
  (verified, r) => {
    const observed = p05RejectedObservation(
      'RAW',
      'event',
      {
        eligibility_code: 'ITEM_ALREADY_MATCHED',
        reason: 'PX-PRIVATE',
        reservation: r,
      },
      verified,
    );
    expect(observed.relatedDocument?.kind).toBe('redacted');
    expect(JSON.stringify(observed)).not.toContain('PX-PRIVATE');
    expect(JSON.stringify(observed)).not.toContain(id(9));
  },
);
test('projection only displays actual item_unique/SKU fields; missing reservation stays unverified and never uses serial', () => {
  const observed = p05RejectedObservation(
    'RAW',
    'event',
    {
      eligibility_code: 'ITEM_ALREADY_MATCHED',
      serial_number: 'SERIAL-ONLY',
      sku_id: id(8),
    },
    true,
  );
  expect(observed.product).toEqual({ code: null, name: null, sku: null });
  expect(observed.relatedDocument).toEqual({ kind: 'unavailable' });
  expect(
    p05RejectedObservation('RAW', 'e', { reservation: null }, true)
      .relatedDocument,
  ).toBeNull();
  expect(
    p05RejectedObservation('RAW', 'e', { reservation }, true).relatedDocument,
  ).toMatchObject({ kind: 'visible', documentId: id(9), canOpen: true });
});
test.each(['SAVE', 'CANCEL', 'RECORD'] as const)(
  '%s panel identity is frozen original operation key/version, not HTTP trace or current version',
  command => {
    const request = {
      command,
      key: id(1),
      draftId: id(2),
      scanSessionId: id(3),
      headers: {
        'X-Request-ID': id(99),
        'If-Match': '"7"',
        'X-Draft-Version': '7',
      },
    } as unknown as FrozenRequest;
    const before = JSON.stringify(request);
    expect(p05PendingIdentity(request)).toEqual({
      operationKey: id(1),
      draftId: id(2),
      scanSessionId: id(3),
      command,
      version: 7,
    });
    expect(JSON.stringify(request)).toBe(before);
    request.headers[command === 'RECORD' ? 'X-Draft-Version' : 'If-Match'] =
      'W/"7"';
    expect(p05PendingIdentity(request)).toBeNull();
  },
);

async function mount(mode: 'manual' | 'linked', unknown = false) {
  const storage = createStorage(createMemoryBackend());
  const base =
    mode === 'manual'
      ? createP05CreateOwner({ storage })
      : createP05NativeOwner({ storage, onChange: () => {} });
  const state: any = {
    ...base.snapshot(),
    step: 2,
    draftId: id(4),
    scanSessionId: id(5),
    version: 7,
    draftVersion: 7,
    unknown,
    pending: null,
    busy: false,
    scanBusy: false,
    accepted: [],
    rejected: unknown
      ? null
      : p05RejectedObservation(
          'RAW',
          'e',
          { reservation, eligibility_code: 'ITEM_ALREADY_MATCHED' },
          true,
        ),
    view: {
      manual: true,
      rawInput: 'RAW',
      filter: 'invalid',
      scroll: { 2: 88 },
    },
    nativeView: {
      manual: true,
      rawInput: 'RAW',
      filter: 'invalid',
      scroll: { 2: 88 },
    },
    document:
      mode === 'linked'
        ? { documentId: id(9), number: 'PX-TEST', planned: 1 }
        : undefined,
  };
  if (unknown)
    state.pending = {
      mode: mode === 'manual' ? 'manual-create' : undefined,
      command: 'RECORD',
      key: id(6),
      draftId: id(4),
      scanSessionId: id(5),
      sourceId: id(9),
      sourceVersion: 11,
      method: 'POST',
      path: '/api/v1/mini-app/outbound/record',
      body: {
        warehouse_id: id(3),
        source_document_id: id(9),
        source_version: 11,
        items: [{ raw_code: 'KEEP', scan_source: 'MANUAL' }],
      },
      headers: { 'Idempotency-Key': id(6), 'X-Draft-Version': '7' },
    } as P05CreateRequest | FrozenRequest;
  let scope: string | null = 'original-owner';
  const check = jest.fn(async () => false),
    save = jest.fn(),
    send = jest.fn(),
    retrySame = jest.fn(),
    open = jest.fn(),
    home = jest.fn(),
    read = jest.fn(async () => true);
  const owner: any = {
    ...base,
    snapshot: () => copy(state),
    initialize: async () => true,
    start: () => true,
    exceptionScope: () => scope,
    leave: jest.fn(),
    check,
    save,
    send,
    retrySame,
    readRejectedDocument: read,
    dismissRejected: jest.fn((event: string, key: string) => {
      if (event !== 'e' || key !== scope) return false;
      state.rejected = null;
      return true;
    }),
  };
  let tree!: Renderer.ReactTestRenderer;
  await act(async () => {
    tree = Renderer.create(
      <AppProviders>
        {mode === 'manual' ? (
          <P05CreateNativeFlow
            owner={owner}
            onExit={home}
            onViewDocument={open}
          />
        ) : (
          <P05LinkedNativeFlow
            owner={owner}
            returnDocumentId={id(9)}
            onExit={home}
            onViewDocument={open}
          />
        )}
      </AppProviders>,
    );
  });
  return {
    tree,
    state,
    owner,
    check,
    save,
    send,
    retrySame,
    open,
    home,
    read,
    move: () => {
      scope = 'other-owner';
    },
  };
}

test.each(['manual', 'linked'] as const)(
  '%s standalone rejected replaces scanner/generic dialogs; Scan other remounts exact retained scanner view',
  async mode => {
    const t = await mount(mode);
    expect(t.tree.root.findAllByType(BusinessScanScreen)).toHaveLength(0);
    expect(t.tree.root.findAllByType(P03Dialog)).toHaveLength(0);
    const p = t.tree.root.findByType(P17ScanExceptions);
    expect(p.props.view.panel).toBe('P17.S02');
    const before = copy(t.state);
    await act(async () => p.props.onScanOther());
    const scanner = t.tree.root.findByType(BusinessScanScreen);
    expect(scanner.props.p05Context.viewState).toEqual(before.view);
    for (const key of [
      'draftId',
      'scanSessionId',
      'accepted',
      'version',
      'draftVersion',
    ])
      expect(t.state[key]).toEqual(before[key]);
    expect(t.save).not.toHaveBeenCalled();
    expect(t.send).not.toHaveBeenCalled();
    expect(t.home).not.toHaveBeenCalled();
    await act(async () => t.tree.unmount());
  },
);

test.each(['manual', 'linked'] as const)(
  '%s holder opens exact ID only after current owner read; stale callback never navigates',
  async mode => {
    const t = await mount(mode),
      p = t.tree.root.findByType(P17ScanExceptions);
    await act(async () => p.props.onViewRelated(id(9)));
    expect(t.read.mock.calls).toEqual([['e', 'original-owner', id(9)]]);
    expect(t.open.mock.calls).toEqual([[id(9)]]);
    t.move();
    await act(async () => p.props.onViewRelated(id(9)));
    expect(t.read).toHaveBeenCalledTimes(1);
    expect(t.open).toHaveBeenCalledTimes(1);
    expect(p.props.isCurrent()).toBe(false);
    await act(async () => t.tree.unmount());
  },
);

test.each(['manual', 'linked'] as const)(
  '%s revoked holder projection remounts the presenter so an old full reader cannot retain private data',
  async mode => {
    const t = await mount(mode);
    const old = t.tree.root.findByType(P17ScanExceptions);
    t.read.mockImplementation(async () => {
      t.state.rejected.relatedDocument = { kind: 'unavailable' };
      return false;
    });
    await act(async () => old.props.onViewRelated(id(9)));
    const current = t.tree.root.findByType(P17ScanExceptions);
    expect(current).not.toBe(old);
    expect(current.props.view.relatedDocument).toEqual({ kind: 'unavailable' });
    expect(t.open).not.toHaveBeenCalled();
    expect(JSON.stringify(t.tree.toJSON())).not.toContain('PX-PRIVATE');
    await act(async () => t.tree.unmount());
  },
);

test.each(['manual', 'linked'] as const)(
  '%s mutation UNKNOWN uses only original check and rejects callback after body/source changes',
  async mode => {
    const t = await mount(mode, true),
      p = t.tree.root.findByType(P17ScanExceptions);
    expect(p.props.view).toMatchObject({
      panel: 'P17.S04',
      identity: { operationKey: id(6), version: 7, command: 'RECORD' },
    });
    const original = JSON.stringify(t.state.pending);
    await act(async () => p.props.onCheck());
    expect(t.check).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(t.state.pending)).toBe(original);
    expect(t.save).not.toHaveBeenCalled();
    expect(t.send).not.toHaveBeenCalled();
    expect(t.retrySame).not.toHaveBeenCalled();
    t.state.pending.body.source_version = 12;
    await act(async () => p.props.onCheck());
    expect(t.check).toHaveBeenCalledTimes(1);
    expect(
      p05ExceptionView({
        ...t.state,
        unknown: false,
        pending: null,
        ownerChecks: [{ outcome: 'UNKNOWN' }],
      }),
    ).toBeNull();
    await act(async () => t.tree.unmount());
  },
);
