import 'fake-indexeddb/auto';
import { webcrypto } from 'node:crypto';
import {
  clearPushBinding,
  claimPush,
  installationIdentity,
  readPushBinding,
  storePushBinding,
} from '../src/web/notificationPushStore';
Object.defineProperty(globalThis, 'crypto', {
  value: webcrypto,
  configurable: true,
});
const id = (n: number) =>
  `50505050-5050-4505-8505-${String(n).padStart(12, '0')}`;
const b = { registrationId: id(2), bindingVersion: 2 };
test('installation identity is shared atomically across tabs; one delivery claim wins', async () => {
  const [a, c] = await Promise.all([
    installationIdentity(),
    installationIdentity(),
  ]);
  expect(a).toEqual(c);
  expect(a.proof).toMatch(/^[\w-]{43}$/);
  await storePushBinding(b);
  const p = {
    ...b,
    deliveryId: id(1),
    recipientId: id(3),
    expiresAt: new Date(Date.now() + 60000).toISOString(),
  };
  expect(
    (await Promise.all([claimPush(p), claimPush(p)])).filter(Boolean),
  ).toHaveLength(1);
  expect(await claimPush({ ...p, deliveryId: id(4), bindingVersion: 1 })).toBe(
    false,
  );
});
test('a cleared newer marker fences delayed writes and old-tab clears', async () => {
  const newer = { registrationId: id(5), bindingVersion: 5 };
  await storePushBinding(newer);
  expect(await clearPushBinding(b)).toBe(false);
  expect(await clearPushBinding(newer)).toBe(true);
  await storePushBinding(b);
  expect(await readPushBinding()).toBeNull();
});
