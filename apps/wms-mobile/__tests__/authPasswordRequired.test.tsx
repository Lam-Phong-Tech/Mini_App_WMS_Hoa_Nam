jest.mock('../src/auth/session', () => {
  const real = jest.requireActual('../src/auth/session');
  return { ...real, hydrateSession: jest.fn(async () => real.getSession()) };
});
jest.mock('../src/auth/tokenRefresh', () => ({
  ...jest.requireActual('../src/auth/tokenRefresh'),
  recoverAfterRestart: () => ({ outcome: 'clean' }),
}));
jest.mock('../src/auth/useForegroundSessionCheck', () => ({
  useForegroundSessionCheck: () => {},
}));
jest.mock('../src/features/profile/P11SecurityScreens', () => ({
  P11PasswordScreen: () => null,
  P11PasswordResultScreen: () => null,
}));
jest.mock('../src/features/auth/SessionConfirmationScreen', () => ({
  SessionConfirmationScreen: () => null,
}));

import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { AppProviders } from '../src/app/App';
import { AppShell } from '../src/app/AppShell';
import {
  clearSession,
  getSession,
  getSessionGeneration,
  markPasswordChangeRequired,
  setSession,
} from '../src/auth/session';
import { P11PasswordScreen } from '../src/features/profile/P11SecurityScreens';
import { SessionConfirmationScreen } from '../src/features/auth/SessionConfirmationScreen';
import { LoginScreen } from '../src/features/auth/LoginScreen';
import {
  createMemoryBackend,
  createStorage,
  setAppStorageForTesting,
} from '../src/storage/storage';
import { setTierCheckForTesting } from '../src/services/wms/tierCheck';
import { forcedPasswordBootstrapContext } from '../src/services/wms/security';

const actor = '11111111-1111-4111-8111-111111111111';
const family = '22222222-2222-4222-8222-222222222222';
const warehouse = '33333333-3333-4333-8333-333333333333';

beforeEach(() => {
  setAppStorageForTesting(createStorage(createMemoryBackend()));
  clearSession();
  setTierCheckForTesting({
    status: 'matched',
    expected: 'dev-test',
    reported: 'dev-test',
  });
});
afterEach(() => clearSession());

test('PASSWORD_CHANGE_REQUIRED promotes only the current session generation', () => {
  setSession({
    accessToken: 'required-access',
    userId: actor,
    authSessionId: family,
    activeWarehouseId: warehouse,
  });
  const generation = getSessionGeneration();
  markPasswordChangeRequired(generation - 1);
  expect(getSession()?.mustChangePassword).not.toBe(true);
  markPasswordChangeRequired(generation);
  expect(getSession()?.mustChangePassword).toBe(true);
});

test('AppShell gates a required-password session before session confirmation', async () => {
  setSession({
    accessToken: 'required-access',
    userId: actor,
    authSessionId: family,
    activeWarehouseId: warehouse,
    mustChangePassword: true,
  });
  let tree!: Renderer.ReactTestRenderer;
  await act(async () => {
    tree = Renderer.create(
      <AppProviders>
        <AppShell />
      </AppProviders>,
    );
    await Promise.resolve();
    await Promise.resolve();
  });
  expect(tree.root.findAllByType(P11PasswordScreen)).toHaveLength(1);
  expect(tree.root.findAllByType(SessionConfirmationScreen)).toHaveLength(0);
  await act(async () => tree.unmount());
});

test('forced password context is server-authoritative and tied to current owner', () => {
  setSession({
    accessToken: 'required-access',
    userId: actor,
    authSessionId: family,
    activeWarehouseId: warehouse,
    mustChangePassword: true,
  });
  const context = forcedPasswordBootstrapContext();
  expect(context.owner).toMatchObject({ userId: actor, authSessionId: family });
  expect(context.policy).toMatchObject({
    version: 'p11-password-bootstrap-server-authoritative',
    minLength: 1,
    maxLength: 255,
  });
});

test('legacy required-password session without stable identity is cleared to Login', async () => {
  setSession({ accessToken: 'legacy-access', mustChangePassword: true });
  let tree!: Renderer.ReactTestRenderer;
  await act(async () => {
    tree = Renderer.create(
      <AppProviders>
        <AppShell />
      </AppProviders>,
    );
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    await new Promise<void>(resolve => setTimeout(resolve, 0));
  });
  expect(getSession()).toBeUndefined();
  expect(tree.root.findAllByType(LoginScreen)).toHaveLength(1);
  await act(async () => tree.unmount());
});
