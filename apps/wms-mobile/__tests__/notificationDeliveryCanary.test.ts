import { setSession, clearSession } from '../src/auth/session';
import {
  createMemoryBackend,
  createStorage,
  setAppStorageForTesting,
} from '../src/storage/storage';
import { createDeliveryService } from '../src/features/notifications/delivery/registrationService';
import { NotificationDeliveryController } from '../src/features/notifications/delivery/controller';

const id = (n: number) =>
  `50505050-5050-4505-8505-${String(n).padStart(12, '0')}`;
const identity = { installationId: id(1), proof: 'A'.repeat(43) };
const runtime = {
  sha: 'bfa775e6eec6bf99b14483438d74b6661b6ec8cf',
  tier: 'dev-test',
  origin: 'https://khohoanamdev.lptech.info.vn',
};
const meta = {
  contract: 'notification-delivery-v1',
  request_id: id(9),
  timestamp: '2026-11-06T10:34:17+07:00',
};
const diagnostic = () => ({
  contract: 'notification-delivery-android-canary-v1',
  actor_id: id(10),
  auth_session_id: id(11),
  installation_id: id(1),
  proof_fingerprint: 'd'.repeat(64),
  proof_status: 'UNBOUND_CLIENT_PROPOSED',
  hardware_attestation: 'NOT_PROVIDED',
  canary_active: false,
  diagnostic_only: true,
  max_window_seconds: 1200,
});
const unbound = () => ({
  exists: false,
  registration_id: null,
  binding_version: 0,
  active: false,
  ownership: 'UNBOUND',
  state: 'UNBOUND',
  canary_diagnostic: diagnostic(),
});
const capabilities = {
  enabled: false,
  configuration_status: 'DISABLED',
  project_id: 'hoa-nam-scanner-devtest',
  public_web_config: { projectId: 'hoa-nam-scanner-devtest' },
  vapid_public_key: null,
  allowed_web_origins: ['https://appqr.lptech.info.vn'],
  android_package: 'vn.info.lptech.wmshoanam',
  platforms: ['ANDROID'],
  self_test_enabled: false,
};
const response = (data: any, etag = '"0"') => ({
  status: 200,
  data: { success: true, data, meta: { ...meta } },
  header: (n: string) => (n.toLowerCase() === 'etag' ? etag : undefined),
});
beforeEach(() => {
  setAppStorageForTesting(createStorage(createMemoryBackend()));
  setSession({
    accessToken: 'SYNTHETIC-NOT-A-TOKEN',
    userId: id(10),
    authSessionId: id(11),
  });
});
afterEach(clearSession);
function service(data: any = unbound(), etag = '"0"') {
  const calls: any[] = [];
  const request = async (o: any) => {
    calls.push(o);
    return response(
      o.path.endsWith('/capabilities') ? capabilities : data,
      etag,
    );
  };
  const api: any = createDeliveryService({
    client: { request },
    verifyRuntime: async () => runtime,
    platform: 'ANDROID',
  } as any);
  return { api, calls };
}

test('Android capability preflight carries the actual installation context while Web stays legacy', async () => {
  const f = service();
  await f.api.capabilities(identity);
  expect(f.calls).toEqual([
    {
      path: '/api/v1/notification-delivery/capabilities',
      headers: {
        'X-Installation-Proof': 'A'.repeat(43),
        'X-Notification-Installation-ID': id(1),
        'X-Notification-App-Package': 'vn.info.lptech.wmshoanam',
      },
    },
  ]);
  const calls: any[] = [];
  const web = createDeliveryService({
    client: {
      request: (async (o: any) => {
        calls.push(o);
        return response(capabilities);
      }) as any,
    },
    verifyRuntime: async () => {},
  });
  await web.capabilities();
  expect(calls[0].headers).toBeUndefined();
});
test('native capability without a private identity fails before HTTP', async () => {
  const f = service();
  await expect(f.api.capabilities()).rejects.toThrow();
  expect(f.calls).toHaveLength(0);
});

test('OFF diagnostic is a single GET and exports only validated public provenance', async () => {
  const f = service({
    ...unbound(),
    fcm_token: 'DO-NOT-EXPORT',
    access_token: 'DO-NOT-EXPORT',
    proof: 'DO-NOT-EXPORT',
    canary_diagnostic: { ...diagnostic(), private_key: 'DO-NOT-EXPORT' },
  });
  expect(typeof f.api.diagnose).toBe('function');
  const report = await f.api.diagnose(identity);
  expect(f.calls).toEqual([
    {
      path: '/api/v1/notification-delivery/installations/' + id(1),
      headers: {
        'X-Installation-Proof': 'A'.repeat(43),
        'X-Notification-Installation-ID': id(1),
        'X-Notification-App-Package': 'vn.info.lptech.wmshoanam',
        'X-Notification-Canary-Diagnostic':
          'notification-delivery-android-canary-v1',
      },
    },
  ]);
  expect(report).toEqual({
    schema: 'hn-fcm-native-diagnostic-v1',
    contract: 'notification-delivery-v1',
    http_status: 200,
    request_id: id(9),
    timestamp: '2026-11-06T10:34:17+07:00',
    runtime,
    installation_id: id(1),
    registration_id: null,
    binding_version: 0,
    etag: '"0"',
    ownership: 'UNBOUND',
    active: false,
    canary_diagnostic: diagnostic(),
  });
  expect(JSON.stringify(report)).not.toContain('DO-NOT-EXPORT');
  expect(JSON.stringify(report)).not.toContain(identity.proof);
});
test.each([
  ['actor', { actor_id: id(20) }],
  ['family', { auth_session_id: id(21) }],
  ['installation', { installation_id: id(22) }],
  ['revision', { contract: 'other' }],
  ['fingerprint', { proof_fingerprint: 'INVALID' }],
  ['proof status', { proof_status: 'SERVER_PROOF_VERIFIED' }],
  ['read only', { diagnostic_only: false }],
  ['window', { max_window_seconds: 3600 }],
])(
  'diagnostic rejects mismatched %s before exporting a success',
  async (_name, patch) => {
    const f = service({
      ...unbound(),
      canary_diagnostic: { ...diagnostic(), ...(patch as object) },
    });
    expect(typeof f.api.diagnose).toBe('function');
    await expect(f.api.diagnose(identity)).rejects.toThrow();
  },
);
test.each(['W/"0"', '"1"'])(
  'diagnostic rejects nonmatching strong ETag %s',
  async etag => {
    const f = service(unbound(), etag);
    expect(typeof f.api.diagnose).toBe('function');
    await expect(f.api.diagnose(identity)).rejects.toThrow();
  },
);
test('diagnostic refuses an OTHER_SESSION binding even with valid installation proof', async () => {
  const f = service(
    {
      ...unbound(),
      exists: true,
      active: true,
      ownership: 'OTHER_SESSION',
      registration_id: id(3),
      binding_version: 2,
      canary_diagnostic: {
        ...diagnostic(),
        proof_status: 'SERVER_PROOF_VERIFIED',
      },
    },
    '"2"',
  );
  expect(typeof f.api.diagnose).toBe('function');
  await expect(f.api.diagnose(identity)).rejects.toThrow();
});
test('native TEST carries context while preserving exact original request key/body', async () => {
  const f = service({
    request_key: id(8),
    recipient_id: id(7),
    registration_id: id(3),
    binding_version: 2,
    state: 'UNKNOWN',
    delivery_id: id(6),
    provider_accepted_at: null,
  });
  await f.api.test(
    identity,
    { registrationId: id(3), bindingVersion: 2 },
    id(8),
  );
  expect(f.calls[0]).toMatchObject({
    method: 'POST',
    path: '/api/v1/notification-delivery/test-self',
    headers: {
      'X-Notification-Installation-ID': id(1),
      'X-Installation-Proof': identity.proof,
      'X-Notification-App-Package': 'vn.info.lptech.wmshoanam',
    },
    body: { request_key: id(8), registration_id: id(3), binding_version: 2 },
  });
});
test('a replaced owner rejects an in-flight diagnostic', async () => {
  let finish: any;
  const api: any = createDeliveryService({
    platform: 'ANDROID',
    verifyRuntime: async () => runtime,
    client: {
      request: () =>
        new Promise(r => {
          finish = r;
        }),
    },
  } as any);
  expect(typeof api.diagnose).toBe('function');
  const pending = api.diagnose(identity);
  await Promise.resolve();
  await Promise.resolve();
  setSession({
    accessToken: 'OTHER-SYNTHETIC',
    userId: id(20),
    authSessionId: id(21),
  });
  finish(response(unbound()));
  await expect(pending).rejects.toMatchObject({
    code: 'NOTIFICATION_DELIVERY_STALE_SCOPE',
  });
});
test('Android controller supplies identity to capability preflight before any token or permission side effect', async () => {
  const effects: string[] = [],
    seen: any[] = [];
  const p: any = {
    platform: 'ANDROID',
    support: async () => 'default',
    identity: async () => identity,
    getBinding: async () => null,
    requestPermission: async () => {
      effects.push('permission');
      return 'granted';
    },
    token: async () => {
      effects.push('token');
      return 'unused';
    },
    onMessage: () => () => {},
    onClick: () => () => {},
  };
  const api: any = {
    capabilities: async (i: any) => {
      seen.push(i);
      return { enabled: false, platforms: ['ANDROID'], selfTestEnabled: false };
    },
  };
  const c = new NotificationDeliveryController(p, api, {
    isCurrent: () => true,
    onState: () => {},
    onSignal: async () => {},
    onOpen: async () => {},
  });
  await c.refresh();
  expect(seen).toEqual([identity]);
  expect(effects).toEqual([]);
  c.dispose();
});

test('a durable original TEST can reconcile by GET after canary closes without creating another key or POST', async () => {
  const b = { registrationId: id(3), bindingVersion: 2 },
    calls: string[] = [],
    states: any[] = [];
  const p: any = {
    platform: 'ANDROID',
    support: async () => 'granted',
    identity: async () => identity,
    getBinding: async () => b,
    readTestIntent: async () => ({ requestKey: id(8), binding: b }),
    newRequestKey: async () => {
      calls.push('NEW_KEY');
      return id(20);
    },
    onMessage: () => () => {},
    onClick: () => () => {},
  };
  const api: any = {
    capabilities: async () => ({
      enabled: false,
      selfTestEnabled: false,
      platforms: ['ANDROID'],
    }),
    read: async () => ({
      exists: true,
      active: true,
      ownership: 'OWN',
      ...b,
      state: 'ACTIVE',
    }),
    test: async () => {
      calls.push('POST');
    },
    readTest: async (_i: any, key: string) => {
      calls.push('GET ' + key);
      return {
        requestKey: key,
        ...b,
        recipientId: id(7),
        state: 'UNKNOWN',
        deliveryId: id(6),
        providerAcceptedAt: null,
      };
    },
  };
  const c = new NotificationDeliveryController(p, api, {
    isCurrent: () => true,
    onState: s => states.push(s),
    onSignal: async () => {},
    onOpen: async () => {},
  });
  await c.refresh();
  expect(states.at(-1).canReconcile).toBe(true);
  await c.selfTest();
  expect(calls).toEqual(['GET ' + id(8)]);
  expect(states.at(-1).receipt.requestKey).toBe(id(8));
  expect(states.at(-1).selfTestEnabled).toBe(false);
  c.dispose();
});
test('diagnostic rejects a parseable timestamp carrying a hidden comment before public export', async () => {
  const api: any = createDeliveryService({
    platform: 'ANDROID',
    verifyRuntime: async () => runtime,
    client: {
      request: async () => {
        const r = response(unbound());
        r.data.meta.timestamp =
          'Fri, 06 Nov 2026 12:00:00 (TOKEN=DO-NOT-EXPORT) +07:00';
        return r;
      },
    },
  } as any);
  await expect(api.diagnose(identity)).rejects.toThrow();
});

test.each([false, true])(
  'a changed native binding never replaces the durable original TEST key (preloaded=%s)',
  async preloaded => {
    const old = { registrationId: id(3), bindingVersion: 2 },
      next = { registrationId: id(3), bindingVersion: 3 },
      effects: string[] = [],
      states: any[] = [];
    let current = preloaded ? old : next,
      enabled = !preloaded;
    const p: any = {
      platform: 'ANDROID',
      support: async () => 'granted',
      identity: async () => identity,
      getBinding: async () => current,
      readTestIntent: async () => ({ requestKey: id(8), binding: old }),
      newRequestKey: async () => {
        effects.push('NEW_KEY');
        return id(20);
      },
      token: async () => {
        effects.push('TOKEN');
        return 'SYNTHETIC-NEW-TOKEN';
      },
      storeBinding: async () => {},
      onMessage: () => () => {},
      onClick: () => () => {},
    };
    const own = () => ({
      exists: true,
      active: true,
      ownership: 'OWN',
      ...current,
      state: 'ACTIVE',
    });
    const api: any = {
      capabilities: async () => ({
        enabled,
        selfTestEnabled: enabled,
        platforms: ['ANDROID'],
      }),
      read: async () => own(),
      register: async () => {
        effects.push('PUT');
        return own();
      },
      test: async () => {
        effects.push('POST');
        return {};
      },
      readTest: async () => {
        effects.push('GET');
        return {};
      },
    };
    const c = new NotificationDeliveryController(p, api, {
      isCurrent: () => true,
      onState: s => states.push(s),
      onSignal: async () => {},
      onOpen: async () => {},
    });
    if (preloaded) {
      await c.refresh();
      current = next;
      enabled = true;
    }
    await c.refresh();
    await c.enable();
    await c.selfTest();
    expect(effects).toEqual([]);
    expect(states.at(-1).phase).toBe('unavailable');
    c.dispose();
  },
);

let collect: any;
try {
  collect =
    require('../src/features/notifications/delivery/diagnostic').collectNativeDiagnostic;
} catch (e) {
  if (!String(e).includes('delivery/diagnostic')) throw e;
}
test('explicit OFF collection only resolves identity and reads diagnostic, with no token/permission/write', async () => {
  expect(typeof collect).toBe('function');
  const effects: string[] = [];
  const f = service();
  const p: any = {
    platform: 'ANDROID',
    identity: async () => identity,
    requestPermission: async () => {
      effects.push('permission');
    },
    token: async () => {
      effects.push('token');
    },
  };
  const report = await collect(p, f.api, () => true);
  expect(report.installation_id).toBe(id(1));
  expect(f.calls.map(c => [c.method ?? 'GET', c.path])).toEqual([
    ['GET', '/api/v1/notification-delivery/installations/' + id(1)],
  ]);
  expect(effects).toEqual([]);
});
test('collection discards a late result when the owner changes', async () => {
  expect(typeof collect).toBe('function');
  let current = true;
  const f = service();
  const p: any = {
    platform: 'ANDROID',
    identity: async () => {
      current = false;
      return identity;
    },
  };
  expect(await collect(p, f.api, () => current)).toBeUndefined();
  expect(f.calls).toHaveLength(0);
});
test('Web cannot invoke the native diagnostic', async () => {
  expect(typeof collect).toBe('function');
  const f = service();
  await expect(
    collect({ platform: 'WEB' }, f.api, () => true),
  ).rejects.toThrow();
  expect(f.calls).toHaveLength(0);
});
