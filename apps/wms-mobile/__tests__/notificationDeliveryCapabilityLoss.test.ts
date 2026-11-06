import { NotificationDeliveryController } from '../src/features/notifications/delivery/controller';
import { AppError } from '../src/errors/AppError';

const id = (n: number) =>
  `50505050-5050-4505-8505-${String(n).padStart(12, '0')}`;

function fixture() {
  const states: any[] = [];
  const capabilities = {
    enabled: true,
    configurationStatus: 'CONFIGURED',
    selfTestEnabled: true,
    platforms: ['ANDROID'],
  };
  const platform: any = {
    platform: 'ANDROID',
    support: jest.fn(async () => 'granted'),
    requestPermission: jest.fn(async () => 'granted'),
    identity: async () => ({ installationId: id(1), proof: 'A'.repeat(43) }),
    token: jest.fn(async () => 'SYNTHETIC-TOKEN-NOT-REAL'),
    getBinding: async () => null,
    storeBinding: async () => {},
    clearBinding: async () => true,
    onMessage: () => () => {},
    onClick: () => () => {},
    newRequestKey: async () => id(9),
  };
  const service: any = {
    capabilities: jest.fn(async () => capabilities),
    read: async () => ({
      exists: false,
      active: false,
      ownership: 'UNBOUND',
      registrationId: null,
      bindingVersion: 0,
    }),
    register: jest.fn(async () => ({
      exists: true,
      active: true,
      ownership: 'OWN',
      registrationId: id(2),
      bindingVersion: 1,
    })),
    unregister: async () => ({}),
    test: jest.fn(),
    readTest: jest.fn(),
  };
  const controller = new NotificationDeliveryController(platform, service, {
    isCurrent: () => true,
    onState: s => states.push(s),
    onSignal: async () => {},
    onOpen: async () => {},
  });
  return { controller, platform, service, states };
}

test.each([
  new AppError({
    kind: 'http',
    status: 404,
    code: 'RESOURCE_NOT_FOUND',
    route: '/api/v1/notification-delivery/capabilities',
    message: 'Missing',
  }),
  new AppError({ kind: 'network', message: 'Offline' }),
])('failed readiness invalidates old admission before permission/token/write (%j)', async error => {
  const f = fixture();
  await f.controller.refresh();
  f.service.capabilities.mockRejectedValue(error);
  await f.controller.refresh();
  const blocked = f.states.at(-1);
  await f.controller.enable();
  await f.controller.selfTest();
  expect(f.platform.requestPermission).not.toHaveBeenCalled();
  expect(f.platform.token).not.toHaveBeenCalled();
  expect(f.service.register).not.toHaveBeenCalled();
  expect(f.service.test).not.toHaveBeenCalled();
  expect(blocked.phase).toBe('unavailable');
  if (error.status === 404) expect(blocked.message).toContain('404');
  f.controller.dispose();
});

test('fresh verified capabilities recover registration after a failed preflight', async () => {
  const f = fixture();
  f.service.capabilities.mockRejectedValueOnce(
    new AppError({ kind: 'http', status: 404, message: 'Missing' }),
  );
  await f.controller.refresh();
  await f.controller.refresh();
  await f.controller.enable();
  expect(f.service.register).toHaveBeenCalledTimes(1);
  f.controller.dispose();
});
