const mockP05ModuleLoad = jest.fn();
const mockP05Render = jest.fn((_props: unknown) => null);
const mockCurrentUser = {
  id: '10000000-0000-4000-8000-000000000001',
  auth_session_id: '10000000-0000-4000-8000-000000000002',
  active_warehouse_id: '10000000-0000-4000-8000-000000000003',
  warehouse_context: { status: 'READY' },
  available_warehouses: [
    {
      warehouse_id: '10000000-0000-4000-8000-000000000003',
      status: 'ACTIVE',
    },
  ],
  permissions: ['outbound.view'],
};

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
jest.mock('../src/features/home/HomeScreen', () => ({
  HomeScreen: () => null,
}));
jest.mock('../src/features/auth/SessionConfirmationScreen', () => ({
  SessionConfirmationScreen: () => null,
}));
jest.mock('../src/features/documents/p12/P12Screen', () => ({
  P12Screen: () => null,
}));
jest.mock('../src/services/wms/queries', () => ({
  ...jest.requireActual('../src/services/wms/queries'),
  fetchCurrentUser: jest.fn(async () => mockCurrentUser),
}));
jest.mock('../src/features/outbound/P05NativeFlow', () => {
  mockP05ModuleLoad();
  return { P05NativeFlow: (props: unknown) => mockP05Render(props) };
});

import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { AppProviders } from '../src/app/App';
import { AppShell } from '../src/app/AppShell';
import { HomeScreen } from '../src/features/home/HomeScreen';
import { SessionConfirmationScreen } from '../src/features/auth/SessionConfirmationScreen';
import { setSession, clearSession } from '../src/auth/session';
import {
  createStorage,
  createMemoryBackend,
  setAppStorageForTesting,
} from '../src/storage/storage';
import { resetShiftState } from '../src/shift/shiftState';
import { setTierCheckForTesting } from '../src/services/wms/tierCheck';
import { context, id } from './fixtures/p08Mock';

async function flush() {
  await act(async () => {
    await new Promise<void>(resolve => setTimeout(resolve, 20));
  });
}

test('TC10 preloads the outbound chunk on Home so the first outbound tap does not wait for its module', async () => {
  setAppStorageForTesting(createStorage(createMemoryBackend()));
  clearSession();
  resetShiftState();
  setSession(context().session!);
  setTierCheckForTesting({
    status: 'matched',
    expected: 'dev-test',
    reported: 'dev-test',
  });

  let tree!: Renderer.ReactTestRenderer;
  await act(async () => {
    tree = Renderer.create(
      <AppProviders>
        <AppShell />
      </AppProviders>,
    );
  });
  expect(mockP05ModuleLoad).not.toHaveBeenCalled();

  await act(async () => {
    const confirmation = tree.root.findByType(SessionConfirmationScreen).props;
    confirmation.onIdentityResolved(context().user);
    confirmation.onContinue({
      shift_id: id(8),
      actor_id: id(1),
      auth_session_id: id(2),
      warehouse_id: id(3),
      status: 'ACTIVE',
      version: 1,
      started_at: '2026-10-29T01:00:00+07:00',
      ended_at: null,
      preview_ready: true,
    });
  });
  await flush();
  expect(tree.root.findAllByType(HomeScreen)).toHaveLength(1);
  expect(mockP05ModuleLoad).toHaveBeenCalledTimes(1);
  expect(mockP05Render).not.toHaveBeenCalled();

  await act(async () => {
    tree.root.findByType(HomeScreen).props.onSelectTask('outbound');
  });
  await flush();
  expect(mockP05ModuleLoad).toHaveBeenCalledTimes(1);
  expect(mockP05Render).toHaveBeenCalledTimes(1);

  await act(async () => tree.unmount());
  clearSession();
  setAppStorageForTesting(undefined);
});
