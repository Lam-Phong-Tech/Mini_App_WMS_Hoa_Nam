import {
  createP09CommandOwner,
  p09CommandOwner,
} from '../src/features/warranty/p09Controller';
import {
  p09RecoveryJournal,
  P09_RECOVERY_PREFIX,
} from '../src/features/warranty/p09RecoveryJournal';
import {
  createStorage,
  createMemoryBackend,
  setAppStorageForTesting,
} from '../src/storage/storage';
import {
  harness,
  context,
  fields,
  resolved,
  envelope,
  receipt,
  caseRow,
  id,
} from './fixtures/p09Mock';
import { AppError } from '../src/errors/AppError';

const identity = { mode: 'IDENTIFIED' as const, resolved };
beforeEach(() => setAppStorageForTesting(createStorage(createMemoryBackend())));
test('process restart retains GET-only original request, without customer form/credentials or writer replay', async () => {
  const store = createStorage(createMemoryBackend());
  const first = harness(() => {
    throw new AppError({ kind: 'timeout', message: 'lost' });
  });
  const owner = createP09CommandOwner(
    first.service,
    p09RecoveryJournal(first.service, store),
  );
  await owner.confirm(() => first.service.prepareCreate(identity, fields));
  expect(owner.snapshot().phase).toBe('unknown');
  const encoded = store.getString(store.keys()[0])!;
  expect(encoded).not.toMatch(
    /customer_name|customer_phone|description|offline-token|accessToken/,
  );
  const second = harness(options =>
    options.path.includes('/warranty-requests/')
      ? envelope({ receipt: receipt('SUCCEEDED') })
      : envelope(caseRow()),
  );
  const restored = createP09CommandOwner(
    second.service,
    p09RecoveryJournal(second.service, store),
  );
  expect(restored.snapshot().command?.requestId).toBe(
    owner.snapshot().command?.requestId,
  );
  await expect(
    second.service.send(restored.snapshot().command!),
  ).rejects.toMatchObject({ code: 'P09_RECOVERY_CHECK_ONLY' });
  expect(second.calls).toHaveLength(0);
  await restored.reconcile();
  expect(restored.snapshot().phase).toBe('succeeded');
  expect(second.calls.map(c => c.method)).toEqual(['GET', 'GET']);
  expect(second.calls[0].path).toContain(owner.snapshot().command!.requestId);
});
test('journal storage failure blocks dispatch and keeps the original identity locked', async () => {
  const store = createStorage(createMemoryBackend());
  store.setString = () => {
    throw Error('disk full');
  };
  const h = harness();
  const owner = createP09CommandOwner(
    h.service,
    p09RecoveryJournal(h.service, store),
  );
  await expect(
    owner.confirm(() => h.service.prepareCreate(identity, fields)),
  ).rejects.toThrow('disk full');
  expect(h.calls).toHaveLength(0);
  expect(owner.snapshot().phase).toBe('unknown');
  expect(owner.snapshot().command?.requestId).toBe(id(20));
  await expect(
    owner.confirm(() => h.service.prepareCreate(identity, fields)),
  ).rejects.toThrow();
});
test('malformed or foreign recovery journal is retained and fails closed', () => {
  const store = createStorage(createMemoryBackend()),
    h = harness();
  const key = P09_RECOVERY_PREFIX + [id(1), id(2), id(3)].join('/');
  store.setString(key, 'not json');
  const owner = createP09CommandOwner(
    h.service,
    p09RecoveryJournal(h.service, store),
  );
  expect(owner.snapshot().phase).toBe('unknown');
  expect(owner.snapshot().error).toBeDefined();
  expect(store.has(key)).toBe(true);
  expect(h.calls).toHaveLength(0);
});
test('a new auth scope gets its own owner without erasing or rebinding the older UNKNOWN request', async () => {
  const h = harness(() => {
    throw Error('offline');
  });
  const old = p09CommandOwner(h.service);
  await old.confirm(() => h.service.prepareCreate(identity, fields));
  const c = context();
  h.setContext({
    ...c,
    session: { ...c.session!, authSessionId: id(99) },
    user: { ...c.user!, auth_session_id: id(99) },
  });
  const fresh = p09CommandOwner(h.service);
  expect(fresh).not.toBe(old);
  expect(fresh.snapshot().phase).toBe('idle');
  h.setContext(c);
  expect(p09CommandOwner(h.service)).toBe(old);
  expect(old.snapshot().phase).toBe('unknown');
  expect(h.calls).toHaveLength(1);
});
test('an added permission does not create an idle writer beside the original UNKNOWN command', async () => {
  const h = harness(() => {
    throw Error('lost');
  });
  const old = p09CommandOwner(h.service);
  await old.confirm(() => h.service.prepareCreate(identity, fields));
  const current = h.context();
  h.setContext({
    ...current,
    user: {
      ...current.user!,
      permissions: [...current.user!.permissions!, 'inventory.view'],
    },
  });
  const same = p09CommandOwner(h.service);
  expect(same).toBe(old);
  await expect(
    same.confirm(() => h.service.prepareCreate(identity, fields)),
  ).rejects.toThrow();
  expect(h.calls).toHaveLength(1);
});
