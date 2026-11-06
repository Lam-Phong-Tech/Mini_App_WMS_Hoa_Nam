export {};
let policy: any = {};
try {
  policy = require('../src/features/notifications/delivery/pushPolicy');
} catch (e) {
  if (!String((e as any)?.message ?? e).includes('delivery/pushPolicy'))
    throw e;
}
const id = '50505050-5050-4505-8505-000000000001';
test('push click targets fixed App route, excludes review and rejects foreign origins', () => {
  expect(typeof policy.pushClientEligible).toBe('function');
  expect(
    policy.pushClientEligible(
      'https://appqr.lptech.info.vn/?hn-frame=1',
      'https://appqr.lptech.info.vn',
    ),
  ).toBe(true);
  for (const url of [
    'https://other.test/',
    'https://appqr.lptech.info.vn/',
    'https://appqr.lptech.info.vn/ui-review/',
    'https://appqr.lptech.info.vn/review/?view=review',
  ])
    expect(policy.pushClientEligible(url, 'https://appqr.lptech.info.vn')).toBe(
      false,
    );
  expect(policy.pushClickUrl(id, 'https://appqr.lptech.info.vn')).toBe(
    'https://appqr.lptech.info.vn/?hn-frame=1&notificationRecipientId=' + id,
  );
  expect(() =>
    policy.pushClickUrl('https://evil.test', 'https://appqr.lptech.info.vn'),
  ).toThrow();
});
test('binding marker contains no credentials and only exact version accepts a signal', () => {
  expect(typeof policy.bindingMatches).toBe('function');
  const b = { registrationId: id, bindingVersion: 2 };
  expect(policy.bindingMatches(b, b)).toBe(true);
  expect(policy.bindingMatches({ ...b, bindingVersion: 3 }, b)).toBe(false);
  expect(policy.bindingMatches(null, b)).toBe(false);
});
