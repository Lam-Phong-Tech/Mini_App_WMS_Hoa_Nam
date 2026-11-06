import { createP04Flow } from '../src/features/inbound/p04Flow';
import { createMemoryBackend, createStorage } from '../src/storage/storage';
import {
  createP04ReviewService,
  P04_REVIEW_SESSION,
} from '../src/web/p04ReviewService';
import { AppError } from '../src/errors/AppError';

async function ready() {
  const calls: any[] = [];
  const service = createP04ReviewService({ calls });
  const flow = createP04Flow({
    service,
    storage: createStorage(createMemoryBackend()),
    getSession: () => P04_REVIEW_SESSION,
  });
  await flow.begin();
  flow.metadata({
    ...flow.snapshot().run!.ui,
    name: 'TEST read recovery',
    inboundCategory: 'PRODUCT',
  });
  await flow.next();
  return { service, flow, calls };
}
afterEach(() => jest.restoreAllMocks());
test('lost VALIDATE is checked with the original body/version/shift/trace; no item or write is synthesized', async () => {
  const f = await ready();
  const validate = jest
    .spyOn(f.service, 'validate')
    .mockRejectedValueOnce(
      new AppError({ kind: 'timeout', message: 'lost read' }),
    );
  await expect(
    f.flow.scan('HN1|SKU=DCJZ2090i|ITEM=LOCAL-01', 'CAMERA'),
  ).rejects.toThrow();
  const before = f.flow.snapshot().run!;
  expect(before.ownerChecks!.at(-1)!.outcome).toBe('UNKNOWN');
  expect(before.items).toHaveLength(0);
  const writes = f.calls.filter(c => c.method === 'PUT').length;
  expect(await f.flow.reconcileOwnerCheck()).toBe(true);
  expect(validate.mock.calls[1]).toEqual(validate.mock.calls[0]);
  const after = f.flow.snapshot().run!;
  expect(after.items).toHaveLength(0);
  expect(after.ownerChecks!.at(-1)!).toEqual({
    ...before.ownerChecks!.at(-1)!,
    outcome: 'SUCCEEDED',
  });
  expect(f.calls.filter(c => c.method === 'PUT')).toHaveLength(writes);
  expect(f.calls.some(c => c.path.endsWith('/record'))).toBe(false);
  await f.flow.scan('HN1|SKU=DCJZ2090i|ITEM=LOCAL-01', 'CAMERA');
  expect(f.flow.snapshot().run!.items).toHaveLength(1);
  f.flow.dispose();
});
test('lost REVIEW can be checked without changing the batch or automatically recording it', async () => {
  const f = await ready();
  await f.flow.scan('HN1|SKU=DCJZ2090i|ITEM=LOCAL-02', 'MANUAL');
  const review = jest
    .spyOn(f.service, 'review')
    .mockRejectedValueOnce(
      new AppError({ kind: 'timeout', message: 'lost review' }),
    );
  expect(await f.flow.next()).toBe(false);
  const before = f.flow.snapshot().run!;
  expect(before.ownerChecks!.at(-1)!.command).toBe('REVIEW');
  const writes = f.calls.filter(c => c.method === 'PUT').length;
  expect(await f.flow.reconcileOwnerCheck()).toBe(true);
  expect(review.mock.calls[1]).toEqual(review.mock.calls[0]);
  expect(f.flow.snapshot().run!.items).toEqual(before.items);
  expect(f.flow.snapshot().run!.ui.step).toBe(1);
  expect(f.calls.filter(c => c.method === 'PUT')).toHaveLength(writes);
  expect(f.calls.some(c => c.path.endsWith('/record'))).toBe(false);
  f.flow.dispose();
});
