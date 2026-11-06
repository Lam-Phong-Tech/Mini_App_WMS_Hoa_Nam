import { login, MfaRequiredError } from '../src/services/wms/auth';
import { clearSession, getSession } from '../src/auth/session';
import {
  createStorage,
  createMemoryBackend,
  setAppStorageForTesting,
} from '../src/storage/storage';
import { decodeSecurityContract } from '../src/contracts/p11Security';
import { securityContract } from './fixtures/p11Policy';
import { BE_APP_READ_RELEASE } from '../src/config/beAppReadRelease';
import { P11_RELEASE } from '../src/config/p11Release';
beforeEach(() => {
  setAppStorageForTesting(createStorage(createMemoryBackend()));
  clearSession();
});
afterEach(() => clearSession());
test('optional global MFA enforcement never skips the confirmed account second factor', async () => {
  let failure: unknown;
  try {
    await login(
      { email: 'unit@example.invalid', password: 'mock-only' },
      {
        post: async () => ({
          success: true,
          data: {
            mfa_required: true,
            mfa_token: 'unit-only-challenge',
            expires_in: 300,
            mfa: { enforced: false, confirmed: true },
          },
        }),
      },
    );
  } catch (e) {
    failure = e;
  }
  expect(failure).toBeInstanceOf(MfaRequiredError);
  expect(JSON.stringify(failure)).not.toContain('unit-only-challenge');
  expect(getSession()).toBeUndefined();
});
test('invalid MFA challenge never creates an access session even when response has another token', async () => {
  await expect(
    login(
      { email: 'unit@example.invalid', password: 'mock-only' },
      {
        post: async () => ({
          success: true,
          data: {
            mfa_required: true,
            mfa_token: '',
            expires_in: 0,
            access_token: 'not-an-accepted-session',
          },
        }),
      },
    ),
  ).rejects.toMatchObject({ kind: 'parse' });
  expect(getSession()).toBeUndefined();
});
test('applied 223 migrations do not opt legacy P11 into receipts, reconciliation or production', () => {
  const metadata = {
    ...securityContract(),
    schema: { migration_count: 223, pending: [] },
    commands_enabled: false,
  };
  expect(decodeSecurityContract(metadata)).toBeDefined();
  expect(BE_APP_READ_RELEASE.p11CommandsEnabled).toBe(false);
  expect(BE_APP_READ_RELEASE.productionEnabled).toBe(false);
  expect(P11_RELEASE).not.toMatchObject({ commandsEnabled: true });
  const invalid = {
    ...metadata,
    operations: { ...metadata.operations, durable_receipt_supported: true },
  };
  expect(decodeSecurityContract(invalid)).toBeUndefined();
});
