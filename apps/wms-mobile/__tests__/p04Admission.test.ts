import { createP04Flow, type P04Run } from '../src/features/inbound/p04Flow';
import {
  createP04ReviewService,
  P04_REVIEW_SESSION,
} from '../src/web/p04ReviewService';
import { createMemoryBackend, createStorage } from '../src/storage/storage';
import type { P04Admission } from '../src/shift/p04Admission';
import { AppError } from '../src/errors/AppError';

test('P04 creates a new trace distinct from operation key before fixture SAVE and persists binding metadata', async () => {
  const calls: Array<{ command: string; version: number }> = [];
  const admission: P04Admission = async (_scope, command, version) => {
    calls.push({ command, version });
    return { shiftId: '00000000-0000-4000-8000-000000000001' };
  };
  const storage = createStorage(createMemoryBackend());
  const service = createP04ReviewService({});
  const send = service.save;
  const save = jest
    .spyOn(service, 'save')
    .mockImplementation(async (...args) => {
      const [, identity, body, key, version, binding] = args;
      const journal = storage.getObject<P04Run>(
        'p04.runs.v1/' + identity.documentId,
      );
      expect(binding?.requestId).toMatch(/^[0-9a-f-]{36}$/i);
      expect(binding?.requestId).not.toBe(key);
      expect(journal?.pending).toMatchObject({
        command: 'SAVE',
        key,
        body,
        version,
        outcome: 'IN_FLIGHT',
        requestId: binding!.requestId,
        shiftId: binding!.shiftId,
      });
      return send(...args);
    });
  const flow = createP04Flow({
    service,
    storage,
    getSession: () => P04_REVIEW_SESSION,
    admission,
  });
  await flow.begin();
  const run = flow.snapshot().run!;
  expect(calls.length).toBeGreaterThan(0);
  expect(calls.every(call => call.command === 'SAVE')).toBe(true);
  expect(run.saveReceipt?.request_id).toBeTruthy();
  expect(save).toHaveBeenCalledTimes(1);
  expect(run.completed?.[0].request.requestId).not.toBe(
    run.completed?.[0].request.key,
  );
  await flow.dispose();
});

test('UNKNOWN SAVE retains original trace, shift, body, key and version across permitted same-request retry', async () => {
  const storage = createStorage(createMemoryBackend());
  const service = createP04ReviewService({});
  const admission = jest.fn(async () => ({
    shiftId: '00000000-0000-4000-8000-000000000001',
  }));
  const save = jest
    .spyOn(service, 'save')
    .mockRejectedValue(new AppError({ kind: 'timeout', message: 'unknown' }));
  jest
    .spyOn(service, 'reconcile')
    .mockResolvedValue({
      outcome: 'UNKNOWN',
      retry: 'SAME_REQUEST_ONLY',
      new_document_allowed: false,
    });
  const flow = createP04Flow({
    service,
    storage,
    getSession: () => P04_REVIEW_SESSION,
    admission,
  });
  await flow.begin();
  const original = flow.snapshot().run!.pending!;
  expect(original.outcome).toBe('UNKNOWN');
  await flow.check();
  await flow.retry();
  expect(save).toHaveBeenCalledTimes(2);
  expect(save.mock.calls[1]).toEqual(save.mock.calls[0]);
  expect(admission.mock.calls.at(-1)).toEqual([
    flow.snapshot().run!.scope,
    'SAVE',
    original.version,
    original.shiftId,
  ]);
  expect(flow.snapshot().run!.pending).toMatchObject({
    requestId: original.requestId,
    shiftId: original.shiftId,
    key: original.key,
    body: original.body,
    version: original.version,
    outcome: 'UNKNOWN',
  });
  flow.dispose();
});
