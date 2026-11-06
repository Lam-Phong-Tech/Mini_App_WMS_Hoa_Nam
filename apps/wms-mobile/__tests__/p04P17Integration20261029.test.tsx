// Owner/presenter integration only. Isolated storage/transport; no device or BE writes.
import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { AppProviders } from '../src/app/App';
import { P04NativeFlow } from '../src/features/inbound/P04NativeFlow';
import { InboundCreateScreen } from '../src/features/inbound/InboundCreateScreen';
import { InboundReviewScreen } from '../src/features/inbound/InboundReviewScreen';
import { InboundResultScreen } from '../src/features/inbound/InboundResultScreen';
import { BusinessScanScreen } from '../src/features/scan/BusinessScanScreen';
import { P17ScanExceptions } from '../src/features/scan/P17ScanExceptions';
import { Dialog } from '../src/ui/Dialog';
import { Sheet } from '../src/ui/Sheet';
import { createMemoryBackend, createStorage } from '../src/storage/storage';
import {
  createP04ReviewService, P04_REVIEW_SESSION, type P04ReviewScenario,
} from '../src/web/p04ReviewService';
import type { P04Run } from '../src/features/inbound/p04Flow';
import { createP04Flow } from '../src/features/inbound/p04Flow';
import type { Session } from '../src/auth/session';
import type { RequestOptions } from '../src/api/client';
import { AppError } from '../src/errors/AppError';
import { P03Dialog } from '../src/features/scan/P03Dialog';

// The shared scanner has separate camera bridge tests. Keep this test at the
// public owner seam and assert it is unmounted, never poke its private state.
jest.mock('../src/features/scan/BusinessScanScreen', () => ({
  BusinessScanScreen: (props: object) =>
    require('react').createElement('ScannerOwnerSeam', props),
}));

const valid = 'HN1|SKU=DCJZ2090i|ITEM=LOCAL-P04-KEPT';
async function mount(scenario: P04ReviewScenario = 'normal') {
  const storage = createStorage(createMemoryBackend());
  const calls: RequestOptions[] = [];
  const service = createP04ReviewService({ scenario, calls });
  const exit = jest.fn();
  let session: Session | undefined = { ...P04_REVIEW_SESSION };
  let tree!: Renderer.ReactTestRenderer;
  await act(async () => {
    tree = Renderer.create(<AppProviders><P04NativeFlow onExit={exit}
      service={service} storage={storage} getSession={() => session}
    /></AppProviders>);
  });
  const create = tree.root.findByType(InboundCreateScreen);
  await act(async () => create.props.onChange({
    ...create.props.draft, name: 'P04 exception test', inboundCategory: 'PRODUCT',
  }));
  await act(async () => tree.root.findByType(InboundCreateScreen).props.onContinue());
  const journal = () => storage.getObject<P04Run>(storage.keys().find(k =>
    k.startsWith('p04.runs.v1/'))!)!;
  const scan = async (raw: string) => {
    let error: unknown;
    await act(async () => {
      try { await tree.root.findByType(BusinessScanScreen).props.onScan(raw, 'MANUAL'); }
      catch (e) { error = e; }
    });
    if (error) throw error;
  };
  return { tree, storage, service, calls, exit, journal, scan,
    setSession: (next: Session | undefined) => { session = next; },
    close: () => act(() => tree.unmount()),
  };
}
const shownDialogs = (tree: Renderer.ReactTestRenderer) =>
  tree.root.findAllByType(Dialog).filter(node => node.props.visible);
const exception = (tree: Renderer.ReactTestRenderer) => tree.root.findByType(P17ScanExceptions);

test('classified invalid opens S01 with same raw/reason/count, Back restores view and kept rows without another request', async () => {
  const f = await mount();
  await f.scan(valid);
  await act(async () => f.tree.root.findByType(BusinessScanScreen).props.p04Context.onViewChange({
    filter: 'valid', all: true, manual: true, rawInput: 'BAD', scroll: { 2: 173 },
    manualFocused: true, manualSelection: { start: 1, end: 2 },
  }));
  const kept = f.journal();
  await f.scan('BAD');
  const p17 = exception(f.tree);
  expect(p17.props.view).toMatchObject({
    panel: 'P17.S01', raw: 'BAD',
    reason: 'Mã chưa hợp lệ cho nhập kho. Kiểm tra và nhập lại.',
    context: { documentNo: kept.server!.document_no, acceptedCodeCount: 1 },
  });
  expect(p17.props.isCurrent()).toBe(true);
  expect(f.tree.root.findAllByType(BusinessScanScreen)).toHaveLength(0);
  expect(shownDialogs(f.tree)).toHaveLength(0);
  const beforeBack = f.calls.length;
  await act(async () => p17.props.onBack());
  const scanner = f.tree.root.findByType(BusinessScanScreen);
  expect(scanner.props.p04Context.viewState).toMatchObject({
    filter: 'valid', all: true, manual: true, rawInput: 'BAD', scroll: { 2: 173 },
    exceptionReturn: { mode: 'previous', focus: true, selection: { start: 1, end: 2 } },
  });
  expect(f.journal().identity).toEqual(kept.identity);
  expect(f.journal().items).toEqual(kept.items);
  expect(f.journal().ui.codes).toEqual(kept.ui.codes);
  expect(f.journal().ui.scanAttempts!.at(-1)).toMatchObject({ raw: 'BAD', kind: 'invalid' });
  expect(f.calls).toHaveLength(beforeBack);
  expect(f.calls.some(c => JSON.stringify(c.body ?? {}).includes('exceptionReturn'))).toBe(false);
  expect(f.exit).not.toHaveBeenCalled();
  f.close();
});

test('raw -> manual returns the exact string without validating or changing accepted data', async () => {
  const f = await mount();
  const raw = '  HN1|SKU=INACTIVE|ITEM=Unicode-đ-01  ';
  await f.scan(valid);
  const kept = f.journal();
  await f.scan(raw);
  const before = f.calls.length;
  await act(async () => exception(f.tree).props.onManual(raw));
  expect(f.tree.root.findByType(BusinessScanScreen).props.p04Context.viewState).toMatchObject({
    manual: true, rawInput: raw,
    exceptionReturn: { mode: 'manual', focus: true, selection: { start: raw.length, end: raw.length } },
  });
  expect(f.journal().items).toEqual(kept.items);
  expect(f.journal().identity).toEqual(kept.identity);
  expect(f.calls).toHaveLength(before);
  f.close();
});

test('DUPLICATE stays a duplicate; BOX/new SKU requiring input do not become invalid panels', async () => {
  const f = await mount();
  await f.scan(valid);
  await f.scan(valid);
  expect(f.tree.root.findAllByType(P17ScanExceptions)).toHaveLength(0);
  expect(f.journal().ui.scanAttempts!.at(-1)?.kind).toBe('duplicate');
  expect(f.journal().items).toHaveLength(1);
  await f.scan('NEW-LOCAL-CANDIDATE');
  expect(f.tree.root.findAllByType(P17ScanExceptions)).toHaveLength(0);
  expect(f.tree.root.findAllByType(Sheet).filter(s => s.props.visible)).toHaveLength(1);
  expect(f.journal().items).toHaveLength(1);
  f.close();
});

test('pending RECORD S04 uses original operation key/version, awaits check and reaches verified result without another mutation', async () => {
  const f = await mount('record-timeout');
  await f.scan(valid);
  await act(async () => f.tree.root.findByType(BusinessScanScreen).props.onDone());
  await act(async () => f.tree.root.findByType(InboundReviewScreen).props.onRecord());
  const original = f.journal();
  const p = original.pending!;
  expect(p.command).toBe('RECORD');
  expect(p.outcome).toBe('UNKNOWN');
  expect(p.key).not.toBe(p.requestId);
  expect(exception(f.tree).props.view.identity).toEqual({
    operationKey: p.key, draftId: original.identity.documentId,
    scanSessionId: original.identity.scanSessionId, version: p.version, command: p.command,
  });
  expect(f.tree.root.findAllByType(InboundResultScreen)).toHaveLength(0);
  expect(shownDialogs(f.tree)).toHaveLength(0);
  const originalRead = f.service.reconcile.bind(f.service);
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const read = jest.spyOn(f.service, 'reconcile').mockImplementation(async (...args) => {
    await gate;
    return originalRead(...args);
  });
  const mutations = () => f.calls.filter(c => c.method === 'PUT' || c.path.endsWith('/record') || c.path.endsWith('/cancel'));
  const beforeWrites = mutations().length;
  let checking!: Promise<void>;
  let settled = false;
  await act(async () => {
    checking = exception(f.tree).props.onCheck().then(() => { settled = true; });
    await Promise.resolve();
  });
  expect(settled).toBe(false);
  expect(exception(f.tree).props.view.phase).toBe('checking');
  expect(f.journal().pending).toEqual(p);
  await act(async () => { release(); await checking; });
  expect(read).toHaveBeenCalledWith(original.scope, original.identity, p.key, p.command);
  expect(mutations()).toHaveLength(beforeWrites);
  expect(f.journal().pending).toBeUndefined();
  expect(f.journal().result?.data.stock_effect).toBe('NONE');
  expect(f.tree.root.findAllByType(P17ScanExceptions)).toHaveLength(0);
  expect(f.tree.root.findByType(InboundResultScreen).props.outcome).toBe('posted');
  f.close();
});

test('still UNKNOWN keeps original body/key/trace/scan/version, Back preserves journal and exposes no retry writer', async () => {
  const f = await mount('record-not-sent');
  await f.scan(valid);
  await act(async () => f.tree.root.findByType(BusinessScanScreen).props.onDone());
  await act(async () => f.tree.root.findByType(InboundReviewScreen).props.onRecord());
  const original = f.journal();
  const p = original.pending!;
  expect(exception(f.tree).props.onScanAgain).toBeUndefined();
  const writes = f.calls.filter(c => c.path.endsWith('/record')).length;
  await act(async () => exception(f.tree).props.onCheck());
  expect(exception(f.tree).props.view.phase).toBe('unknown');
  expect(f.journal().pending).toEqual({ ...p, retryAllowed: true });
  expect(f.calls.filter(c => c.path.endsWith('/record'))).toHaveLength(writes);
  expect(f.tree.root.findAllByType(InboundResultScreen)).toHaveLength(0);
  expect(shownDialogs(f.tree)).toHaveLength(0);
  await act(async () => exception(f.tree).props.onBack());
  expect(f.exit).toHaveBeenCalledTimes(1);
  expect(f.journal().closed).toBe(false);
  expect(f.journal().identity).toEqual(original.identity);
  expect(f.journal().pending?.body).toEqual(p.body);
  f.close();
});

test('SAVE UNKNOWN checks SAVE only, keeps accepted row, and cannot claim record success', async () => {
  const f = await mount('save-timeout');
  await f.scan(valid);
  const original = f.journal();
  expect(exception(f.tree).props.view.identity.command).toBe('SAVE');
  const read = jest.spyOn(f.service, 'reconcile');
  await act(async () => exception(f.tree).props.onCheck());
  expect(read).toHaveBeenCalledWith(original.scope, original.identity, original.pending!.key, 'SAVE');
  expect(f.journal().items).toEqual(original.items);
  expect(f.journal().result).toBeUndefined();
  expect(f.journal().pending).toBeUndefined();
  expect(f.calls.filter(c => c.path.endsWith('/record'))).toHaveLength(0);
  f.close();
});

test('stale auth family blocks exception return and check before any further request', async () => {
  const f = await mount('record-not-sent');
  await f.scan(valid);
  await act(async () => f.tree.root.findByType(BusinessScanScreen).props.onDone());
  await act(async () => f.tree.root.findByType(InboundReviewScreen).props.onRecord());
  const p17 = exception(f.tree);
  const original = f.journal();
  const count = f.calls.length;
  f.setSession({ ...P04_REVIEW_SESSION, authSessionId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' });
  expect(p17.props.isCurrent()).toBe(false);
  await act(async () => { await p17.props.onCheck(); p17.props.onBack(); });
  expect(f.calls).toHaveLength(count);
  expect(f.exit).not.toHaveBeenCalled();
  expect(f.journal().pending).toEqual(original.pending);
  f.close();
});

test('lost resolver response remains original owner-check recovery, not an invalid row or mutation S04', async () => {
  const f = await mount();
  jest.spyOn(f.service, 'validate').mockRejectedValue(new AppError({ kind: 'timeout', message: 'lost read response' }));
  await expect(f.scan(valid)).rejects.toBeDefined();
  expect(f.tree.root.findAllByType(P17ScanExceptions)).toHaveLength(0);
  expect(f.journal().pending).toBeUndefined();
  expect(f.journal().items).toHaveLength(0);
  expect(f.journal().ui.scanAttempts ?? []).toHaveLength(0);
  expect(f.journal().ownerChecks?.at(-1)).toMatchObject({ command: 'VALIDATE', outcome: 'UNKNOWN' });
  expect(shownDialogs(f.tree).map(d => d.props.title)).toEqual(['Cần kiểm tra kết quả thao tác']);
  f.close();
});

test.each([false, true])('CANCEL UNKNOWN keeps its original command; confirmed=%s never sends another cancel or RECORD', async confirmed => {
  const f = await mount();
  const originalCancel = f.service.cancel.bind(f.service);
  let committed!: Awaited<ReturnType<typeof f.service.cancel>>;
  const cancel = jest.spyOn(f.service, 'cancel').mockImplementation(async (...args) => {
    committed = await originalCancel(...args);
    throw new AppError({ kind: 'timeout', message: 'lost cancel response' });
  });
  await act(async () => f.tree.root.findByType(BusinessScanScreen).props.onBack());
  await act(async () => f.tree.root.findByType(InboundCreateScreen).props.onBack());
  await act(async () => f.tree.root.findByType(P03Dialog).props.actions.find((a: {label: string}) => a.label === 'Bỏ phiếu').onPress());
  await act(async () => f.tree.root.findByType(P03Dialog).props.actions.find((a: {label: string}) => a.label === 'Bỏ phiếu').onPress());
  const original = f.journal();
  expect(original.pending?.command).toBe('CANCEL');
  expect(exception(f.tree).props.view.identity).toMatchObject({ command: 'CANCEL', operationKey: original.pending!.key });
  expect(shownDialogs(f.tree)).toHaveLength(0);
  if (confirmed) {
    // Owner seam: the receipt was parsed by the production CANCEL adapter
    // before this test simulated losing its response. Return that exact proof.
    jest.spyOn(f.service, 'reconcile').mockResolvedValue({
      outcome: 'SUCCEEDED', state: 'CANCELLED', document: committed.document,
      receipt: committed.receipt, retry: 'NONE', new_document_allowed: false,
    });
  }
  await act(async () => exception(f.tree).props.onCheck());
  expect(cancel).toHaveBeenCalledTimes(1);
  if (confirmed) {
    expect(f.journal().pending).toBeUndefined();
    expect(f.journal().closed).toBe(true);
    expect(f.exit).toHaveBeenCalledTimes(1);
    expect(f.tree.root.findAllByType(P03Dialog).filter(d => d.props.visible)).toHaveLength(0);
  } else {
    // This fixture's CANCEL transport does not retain a request receipt. A
    // committed detail alone cannot replace the original UNKNOWN command.
    expect(f.journal().pending).toEqual({ ...original.pending, retryAllowed: true });
    expect(f.journal().closed).toBe(false);
    expect(f.exit).not.toHaveBeenCalled();
  }
  expect(f.journal().result).toBeUndefined();
  expect(f.calls.filter(c => c.path.endsWith('/record'))).toHaveLength(0);
  f.close();
});

test('current-run presentation binding rejects foreign identity/scope and disposed owner', async () => {
  let session: Session | undefined = P04_REVIEW_SESSION;
  const flow = createP04Flow({ service: createP04ReviewService(),
    storage: createStorage(createMemoryBackend()), getSession: () => session });
  await flow.begin();
  const original = flow.snapshot().run!;
  expect(flow.isCurrent(original)).toBe(true);
  expect(flow.isCurrent({ ...original, identity: { ...original.identity, scanSessionId: 'foreign' } })).toBe(false);
  expect(flow.isCurrent({ ...original, scope: { ...original.scope, actorId: 'foreign' } })).toBe(false);
  session = undefined;
  expect(flow.isCurrent(original)).toBe(false);
  session = P04_REVIEW_SESSION;
  flow.dispose();
  expect(flow.isCurrent(original)).toBe(false);
});
