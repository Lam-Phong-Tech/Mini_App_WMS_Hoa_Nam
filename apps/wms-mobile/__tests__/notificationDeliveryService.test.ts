import {
  setSession,
  clearSession,
  updateSessionIdentity,
} from '../src/auth/session';
import {
  createMemoryBackend,
  createStorage,
  setAppStorageForTesting,
} from '../src/storage/storage';
let factory: any;
try {
  factory =
    require('../src/features/notifications/delivery/registrationService').createDeliveryService;
} catch (e) {
  if (
    !String((e as any)?.message ?? e).includes('delivery/registrationService')
  )
    throw e;
}
const id = (n: number) =>
  `50505050-5050-4505-8505-${String(n).padStart(12, '0')}`;
const identity = { installationId: id(1), proof: 'A'.repeat(43) };
const data = {
  exists: true,
  registration_id: id(2),
  binding_version: 2,
  active: true,
  ownership: 'OWN',
  state: 'ACTIVE',
};
const response = (d: any = data) => ({
  status: 200,
  data: {
    success: true,
    data: d,
    meta: {
      contract: 'notification-delivery-v1',
      request_id: id(9),
      timestamp: '2026-11-05T01:00:00Z',
    },
  },
  header: (n: string) => (n.toLowerCase() === 'etag' ? '"2"' : undefined),
});
beforeEach(() => {
  setAppStorageForTesting(createStorage(createMemoryBackend()));
  setSession({ accessToken: 'offline', userId: id(10), authSessionId: id(11) });
  expect(typeof factory).toBe('function');
});
afterEach(clearSession);
const make = (request: any) =>
  factory({ client: { request }, verifyRuntime: async () => {} });
test('warehouse-only changes preserve installation consent owner and in-flight registry reads', async () => {
  const service = make(async () => {
    updateSessionIdentity({ activeWarehouseId: id(30) });
    return response();
  });
  await expect(service.read(identity)).resolves.toMatchObject({
    active: true,
    ownership: 'OWN',
  });
});
test('registration uses proof header and exact version; opt out sends no body', async () => {
  const calls: any[] = [];
  const service = make(async (o: any) => {
    calls.push(o);
    return response();
  });
  await service.register(identity, 'FAKE-TOKEN-NOT-A-CREDENTIAL', 1, 'WEB');
  await service.unregister(identity, 2);
  expect(calls[0]).toMatchObject({
    method: 'PUT',
    headers: { 'X-Installation-Proof': identity.proof },
    body: { platform: 'WEB', consent: 'GRANTED', expected_version: 1 },
  });
  expect(calls[1]).toMatchObject({
    method: 'DELETE',
    headers: { 'If-Match': '"2"' },
  });
  expect(calls[1].body).toBeUndefined();
  expect(calls[0].path).not.toContain(identity.proof);
});
test('late response and future calls from a replaced scope are rejected', async () => {
  let resolve: any;
  let calls = 0;
  const service = make(() => {
    calls++;
    return new Promise(r => (resolve = r));
  });
  const pending = service.read(identity);
  await Promise.resolve();
  await Promise.resolve();
  setSession({ accessToken: 'new', userId: id(20), authSessionId: id(21) });
  resolve(response());
  await expect(pending).rejects.toMatchObject({
    code: 'NOTIFICATION_DELIVERY_STALE_SCOPE',
  });
  await expect(service.read(identity)).rejects.toMatchObject({
    code: 'NOTIFICATION_DELIVERY_STALE_SCOPE',
  });
  expect(calls).toBe(1);
});
test('bad envelopes and invalid installation identity fail without registration', async () => {
  const service = make(async () => ({
    ...response(),
    data: { success: true, data, meta: { contract: 'legacy' } },
  }));
  await expect(service.read(identity)).rejects.toThrow();
  await expect(
    service.register(
      { ...identity, installationId: 'not-a-uuid' },
      'token',
      0,
      'WEB',
    ),
  ).rejects.toThrow();
});
