export {};
let receiver: any;
let clickHandler: any;
try {
  receiver =
    require('../src/web/notificationWorkerHandler').receiveBackgroundPush;
  clickHandler =
    require('../src/web/notificationWorkerHandler').handlePushClick;
} catch (e) {
  if (!String((e as any)?.message ?? e).includes('notificationWorkerHandler'))
    throw e;
}
const id = (n: number) =>
  `50505050-5050-4505-8505-${String(n).padStart(12, '0')}`;
test('click persists intent before waking an inner app, bypasses wrapper/review and survives login', async () => {
  expect(typeof clickHandler).toBe('function');
  const events: string[] = [];
  const raw = payload().data;
  const origin = 'https://appqr.lptech.info.vn';
  const client = (url: string) => ({
    url,
    postMessage: () => events.push('post:' + url),
    focus: async () => events.push('focus'),
  });
  await clickHandler(raw, {
    origin,
    readBinding: async () => ({ registrationId: id(3), bindingVersion: 2 }),
    storeClick: async () => {
      events.push('persist');
    },
    clients: async () => [
      client(origin + '/'),
      client(origin + '/ui-review/'),
      client(origin + '/?hn-frame=1'),
    ],
    openWindow: async () => {
      events.push('new');
    },
  });
  expect(events).toEqual([
    'persist',
    'post:' + origin + '/?hn-frame=1',
    'focus',
  ]);
});
const payload = () => ({
  data: {
    contract: 'notification-delivery-v1',
    delivery_id: id(1),
    recipient_id: id(2),
    registration_id: id(3),
    binding_version: '2',
    expires_at: new Date(Date.now() + 60000).toISOString(),
  },
});
test('data-only background signal shows one generic banner with safe route metadata', async () => {
  expect(typeof receiver).toBe('function');
  const displayed: any[] = [];
  let claimed = false;
  const deps = {
    claim: async () => {
      if (claimed) return false;
      claimed = true;
      return true;
    },
    show: async (t: any, o: any) => {
      displayed.push([t, o]);
    },
  };
  await receiver(payload(), deps);
  await receiver(payload(), deps);
  expect(displayed).toHaveLength(1);
  expect(displayed[0][0]).toBe('Hoa Nam Scanner');
  expect(displayed[0][1]).toMatchObject({
    body: 'Bạn có thông báo nghiệp vụ mới.',
    tag: 'hn:' + id(2),
  });
  expect(JSON.stringify(displayed)).not.toContain('access_token');
});
test('legacy notification object, malformed or expired payload never displays', async () => {
  expect(typeof receiver).toBe('function');
  let count = 0;
  const d = {
    claim: async () => true,
    show: async () => {
      count++;
    },
  };
  await receiver({ ...payload(), notification: { title: 'Business PII' } }, d);
  await receiver(
    { data: { ...payload().data, expires_at: '2020-01-01T00:00:00Z' } },
    d,
  );
  await receiver({ data: { notification_id: id(1) } }, d);
  expect(count).toBe(0);
});
