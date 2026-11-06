let parser: any = {};
try {
  parser = require('../src/features/notifications/delivery/parse');
} catch (e) {
  if (
    !String((e as { message?: unknown })?.message ?? e).includes(
      'delivery/parse',
    )
  )
    throw e;
}
const { decodePushPayload, decodeRegistration, decodeCapabilities } = parser;
test('delivery TTL suppresses new display but not a protected later click', () => {
  const data = { ...payload(), expires_at: '2026-11-04T02:00:00Z' };
  expect(decodePushPayload(data, now)).toBeUndefined();
  expect(typeof parser.decodePushClick).toBe('function');
  expect(parser.decodePushClick(data)?.recipientId).toBe(id(2));
  expect(
    parser.decodePushClick({ ...data, contract: 'wrong' }),
  ).toBeUndefined();
});
beforeEach(() => expect(typeof decodePushPayload).toBe('function'));
import { redact, REDACTED } from '../src/logging/logger';
import { approvedWriteFor, allowsIfMatch } from '../src/api/writeGate';
const id = (n: number) =>
  `50505050-5050-4505-8505-${String(n).padStart(12, '0')}`;
const now = Date.parse('2026-11-05T01:00:00Z');
const payload = () => ({
  contract: 'notification-delivery-v1',
  delivery_id: id(1),
  recipient_id: id(2),
  registration_id: id(3),
  binding_version: '2',
  expires_at: '2026-11-05T02:00:00Z',
});
test('FCM route identity is exact recipient, registration and version, never notification id', () => {
  expect(decodePushPayload(payload(), now)).toMatchObject({
    recipientId: id(2),
    registrationId: id(3),
    bindingVersion: 2,
  });
  for (const patch of [
    { recipient_id: undefined, notification_id: id(2) },
    { contract: 'other' },
    { registration_id: 'NFC-1' },
    { binding_version: '02' },
    { binding_version: 2 },
    { expires_at: '2026-11-05 02:00:00' },
    { expires_at: '2026-11-05T00:59:59Z' },
  ])
    expect(decodePushPayload({ ...payload(), ...patch }, now)).toBeUndefined();
});
test('registration validates strong version and has an explicit unbound state', () => {
  expect(
    decodeRegistration(
      {
        exists: true,
        registration_id: id(3),
        binding_version: 2,
        active: true,
        ownership: 'OWN',
        state: 'ACTIVE',
      },
      '"2"',
    ),
  ).toMatchObject({ bindingVersion: 2, active: true });
  expect(() =>
    decodeRegistration(
      {
        exists: true,
        registration_id: id(3),
        binding_version: 2,
        active: true,
        ownership: 'OWN',
      },
      'W/"2"',
    ),
  ).toThrow();
  expect(() =>
    decodeRegistration(
      {
        exists: true,
        registration_id: id(3),
        binding_version: 2,
        active: true,
        ownership: 'OWN',
      },
      '"3"',
    ),
  ).toThrow();
  expect(
    decodeRegistration(
      {
        exists: false,
        registration_id: null,
        binding_version: 0,
        active: false,
        ownership: 'UNBOUND',
      },
      '"0"',
    ).registrationId,
  ).toBeNull();
  expect(() =>
    decodeRegistration(
      {
        exists: false,
        registration_id: id(3),
        binding_version: 0,
        active: true,
        ownership: 'UNBOUND',
      },
      '"0"',
    ),
  ).toThrow();
});
test('capabilities reject unexpected project and contradictions without inventing readiness', () => {
  const c = {
    enabled: true,
    configuration_status: 'CONFIGURED',
    project_id: 'hoa-nam-scanner-devtest',
    public_web_config: { projectId: 'hoa-nam-scanner-devtest' },
    vapid_public_key: 'TEST',
    allowed_web_origins: ['https://appqr.lptech.info.vn'],
    android_package: 'vn.info.lptech.wmshoanam',
    platforms: ['WEB', 'ANDROID'],
    self_test_enabled: true,
  };
  expect(decodeCapabilities(c).enabled).toBe(true);
  expect(() =>
    decodeCapabilities({ ...c, project_id: 'production' }),
  ).toThrow();
  expect(() =>
    decodeCapabilities({ ...c, configuration_status: 'MISSING' }),
  ).toThrow();
  expect(
    decodeCapabilities({
      ...c,
      enabled: false,
      configuration_status: 'MISSING',
    }).enabled,
  ).toBe(false);
});
test('only exact delivery writes/version header are allowed and installation proof is redacted', () => {
  expect(
    approvedWriteFor(
      'PUT',
      '/api/v1/notification-delivery/installations/' + id(9),
    ),
  ).toBe('notifications.deliveryRegister');
  expect(
    approvedWriteFor(
      'DELETE',
      '/api/v1/notification-delivery/installations/' + id(9),
    ),
  ).toBe('notifications.deliveryUnregister');
  expect(
    approvedWriteFor('POST', '/api/v1/notification-delivery/test-self'),
  ).toBe('notifications.deliverySelfTest');
  expect(
    approvedWriteFor('POST', '/api/v1/notification-delivery/broadcast'),
  ).toBeUndefined();
  expect(
    allowsIfMatch(
      'DELETE',
      '/api/v1/notification-delivery/installations/' + id(9),
    ),
  ).toBe(true);
  expect(
    redact({ 'X-Installation-Proof': 'FAKE-SECRET', fcm_token: 'FAKE-TOKEN' }),
  ).toEqual({ 'X-Installation-Proof': REDACTED, fcm_token: REDACTED });
});
