import type {
  PushPlatform,
  DeliveryService,
} from '../src/features/notifications/delivery/types';
let Controller: any;
try {
  Controller =
    require('../src/features/notifications/delivery/controller').NotificationDeliveryController;
} catch (e) {
  if (!String((e as any)?.message ?? e).includes('delivery/controller'))
    throw e;
}
const id = (n: number) =>
  `50505050-5050-4505-8505-${String(n).padStart(12, '0')}`;
const binding = { registrationId: id(2), bindingVersion: 2 };
const own = {
  exists: true,
  registrationId: id(2),
  bindingVersion: 2,
  active: true,
  ownership: 'OWN',
  state: 'ACTIVE',
};
const caps = {
  enabled: true,
  configurationStatus: 'CONFIGURED',
  selfTestEnabled: true,
  platforms: ['WEB'],
};
function fixture() {
  let active = true,
    marker: any = null,
    message: any,
    click: any;
  const effects: string[] = [];
  const states:any[]=[];
  const p: PushPlatform = {
    platform: 'WEB',
    support: async () => 'default',
    requestPermission: async () => 'granted',
    identity: async () => ({ installationId: id(1), proof: 'A'.repeat(43) }),
    token: async () => 'FAKE-LONG-TOKEN-FOR-TEST',
    getBinding: async () => marker,
    storeBinding: async b => {
      marker = b;
    },
    clearBinding: async b => {
      if (
        marker?.registrationId !== b.registrationId ||
        marker.bindingVersion !== b.bindingVersion
      )
        return false;
      marker = null;
      return true;
    },
    onMessage: f => {
      message = f;
      return () => {};
    },
    onClick: f => {
      click = f;
      return () => {};
    },
    newRequestKey: async () => id(8),
  };
  const service: DeliveryService = {
    capabilities: async () => caps as any,
    read: async () =>
      marker
        ? (own as any)
        : {
            exists: false,
            registrationId: null,
            bindingVersion: 0,
            active: false,
            ownership: 'UNBOUND',
            state: 'UNBOUND',
          },
    register: async () => own as any,
    unregister: async () =>
      ({ ...own, active: false, bindingVersion: 3 } as any),
    test: async () => ({} as any),
    readTest: async () => ({} as any),
  };
  expect(typeof Controller).toBe('function');
  const c = new Controller(p, service, {
    isCurrent: () => active,
    onState: (s:any) => {states.push(s);},
    onSignal: async () => {
      effects.push('signal');
    },
    onOpen: async (r: string) => {
      effects.push(r);
    },
  });
  return {
    c,
    p,
    service,
    effects,
    states,
    setActive: (v: boolean) => (active = v),
    setMarker: (b: any) => (marker = b),
    marker: () => marker,
    send: (d: any) => message(d),
    click: (d: any) => click(d),
  };
}
const payload = () => ({
  contract: 'notification-delivery-v1',
  delivery_id: id(3),
  recipient_id: id(4),
  registration_id: id(2),
  binding_version: '2',
  expires_at: new Date(Date.now() + 60000).toISOString(),
});
test('receipt from a different binding cannot be reported as accepted for this device',async()=>{const f=fixture();await f.c.enable();f.service.test=async()=>({requestKey:id(8),registrationId:id(9),bindingVersion:99,recipientId:id(4),deliveryId:id(3),state:'PROVIDER_ACCEPTED',providerAcceptedAt:new Date().toISOString()});await f.c.selfTest();expect(f.states.at(-1)?.phase).toBe('error');expect(f.states.at(-1)?.receipt).toBeUndefined();});
test('an old uninitialized tab cannot clear a marker read from a different owner', async () => {
  const f = fixture();
  f.setMarker({ registrationId: id(9), bindingVersion: 4 });
  f.service.read = async () =>
    ({
      ...own,
      registrationId: id(9),
      bindingVersion: 4,
      ownership: 'OTHER_SESSION',
    } as any);
  await f.c.disable();
  expect(f.marker()).toEqual({ registrationId: id(9), bindingVersion: 4 });
});
test('explicit re-enable after local clear obtains a fresh version instead of resurrecting an old binding', async () => {
  const f = fixture();
  f.service.read = async () => own as any;
  f.service.unregister = async () =>
    ({ ...own, active: false, bindingVersion: 3 } as any);
  f.service.register = async (_i, _t, v) =>
    v === 3
      ? ({ ...own, registrationId: id(9), bindingVersion: 4 } as any)
      : (own as any);
  await f.c.enable();
  expect(f.marker()).toEqual({ registrationId: id(9), bindingVersion: 4 });
});
test('denied permission never obtains token or registers', async () => {
  const f = fixture();
  f.p.requestPermission = async () => 'denied';
  f.service.register = jest.fn();
  await f.c.enable();
  expect(f.marker()).toBeNull();
  expect(f.service.register).not.toHaveBeenCalled();
});
test('another enabled tab respects durable cross-tab opt-out on foreground refresh', async () => {
  const f = fixture();
  f.p.support = async () => 'granted';
  await f.c.enable();
  const second = new Controller(f.p, f.service, {
    isCurrent: () => true,
    onState: () => {},
    onSignal: async () => {},
    onOpen: async () => {},
  });
  await second.enable();
  await f.c.disable();
  f.service.register = jest.fn(async () => own as any);
  await second.refresh();
  expect(f.service.register).not.toHaveBeenCalled();
  expect(f.marker()).toBeNull();
  second.dispose();
});
test('platform configuration is verified before a permission prompt', async () => {
  const f = fixture();
  f.p.requestPermission = jest.fn(async () => 'granted');
  (f.p as any).configurationReady = () => false;
  await f.c.enable();
  expect(f.p.requestPermission).not.toHaveBeenCalled();
  expect(f.marker()).toBeNull();
});
test('late registration cannot install a marker into a new scope', async () => {
  const f = fixture();
  let resolve: any;
  f.service.register = () => new Promise(r => (resolve = r));
  const pending = f.c.enable();
  for (let i = 0; i < 12; i++) await Promise.resolve();
  f.setActive(false);
  resolve(own);
  await pending;
  expect(f.marker()).toBeNull();
});
test('unknown write reconciles by GET without a second PUT', async () => {
  const f = fixture();
  f.service.register = jest.fn(async () => {
    f.setMarker(binding);
    throw Error('lost response');
  });
  await f.c.enable();
  expect(f.service.register).toHaveBeenCalledTimes(1);
  expect(f.marker()).toEqual(binding);
});
test('duplicate foreground message coalesces feedback; click revalidates and never marks read', async () => {
  const f = fixture();
  await f.c.enable();
  await f.send(payload());
  await f.send(payload());
  expect(f.effects).toEqual(['signal']);
  await f.click(payload());
  expect(f.effects).toEqual(['signal', id(4)]);
  f.setMarker({ registrationId: id(9), bindingVersion: 4 });
  await f.click(payload());
  expect(f.effects).toHaveLength(2);
});
test('late disable does not erase the next binding', async () => {
  const f = fixture();
  await f.c.enable();
  let resolve: any;
  f.service.unregister = () => new Promise(r => (resolve = r));
  const p = f.c.disable();
  for (let i = 0; i < 8; i++) await Promise.resolve();
  f.setMarker({ registrationId: id(9), bindingVersion: 4 });
  resolve({ ...own, active: false });
  await p;
  expect(f.marker()).toEqual({ registrationId: id(9), bindingVersion: 4 });
});
test('restart with pending self test only reads the same receipt, never resends POST', async () => {
  const f = fixture();
  f.p.readTestIntent = async () => ({ requestKey: id(8), binding });
  f.service.test = jest.fn(async () => {
    throw Error('must not POST');
  });
  f.service.readTest = jest.fn(async () => ({
    requestKey: id(8),
    ...binding,
    recipientId: id(4),
    state: 'PENDING',
    deliveryId: null,
    providerAcceptedAt: null,
  }));
  await f.c.enable();
  await f.c.selfTest();
  expect(f.service.test).not.toHaveBeenCalled();
  expect(f.service.readTest).toHaveBeenCalledWith(expect.anything(), id(8));
});
