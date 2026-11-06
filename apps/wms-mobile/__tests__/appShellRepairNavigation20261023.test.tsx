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
jest.mock('../src/features/notifications/P13NotificationsScreen', () => ({
  P13NotificationsScreen: () => null,
}));
jest.mock('../src/features/documents/p12/P12Screen', () => ({
  P12Screen: () => null,
}));
jest.mock('../src/features/warranty/WarrantyListScreen', () => ({
  WarrantyListScreen: () => null,
}));
jest.mock('../src/features/warranty/WarrantyCaseDetail', () => ({
  WarrantyCaseDetail: () => null,
}));
jest.mock('../src/features/warranty/p19/P19EntryScreen', () => ({
  P19EntryScreen: () => null,
}));
jest.mock('../src/features/history/HistoryHubScreen', () => ({
  HistoryHubScreen: () => null,
}));
jest.mock('../src/features/warranty/P20HistoryScreen', () => ({
  P20HistoryScreen: () => null,
}));
jest.mock('../src/features/history/P23WarrantySessionsScreen', () => ({
  P23WarrantySessionsScreen: () => null,
}));
jest.mock('../src/features/nfc/NfcAssignmentScreen', () => ({
  NfcAssignmentScreen: () => null,
}));
jest.mock('../src/features/scan/BusinessScanScreen', () => ({
  BusinessScanScreen: () => null,
}));
jest.mock('../src/features/nfc/NfcTagListScreen', () => ({
  NfcTagListScreen: () => null,
}));
import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { AppProviders } from '../src/app/App';
import { AppShell } from '../src/app/AppShell';
import { HomeScreen } from '../src/features/home/HomeScreen';
import { SessionConfirmationScreen } from '../src/features/auth/SessionConfirmationScreen';
import { P13NotificationsScreen } from '../src/features/notifications/P13NotificationsScreen';
import { P12Screen } from '../src/features/documents/p12/P12Screen';
import { WarrantyListScreen } from '../src/features/warranty/WarrantyListScreen';
import { WarrantyCaseDetail } from '../src/features/warranty/WarrantyCaseDetail';
import { P19EntryScreen } from '../src/features/warranty/p19/P19EntryScreen';
import { BottomNav } from '../src/ui/BottomNav';
import { HistoryHubScreen } from '../src/features/history/HistoryHubScreen';
import { P20HistoryScreen } from '../src/features/warranty/P20HistoryScreen';
import { P23WarrantySessionsScreen } from '../src/features/history/P23WarrantySessionsScreen';
import { NfcAssignmentScreen } from '../src/features/nfc/NfcAssignmentScreen';
import { BusinessScanScreen } from '../src/features/scan/BusinessScanScreen';
import { NfcTagListScreen } from '../src/features/nfc/NfcTagListScreen';
import { setSession, clearSession } from '../src/auth/session';
import {
  createStorage,
  createMemoryBackend,
  setAppStorageForTesting,
} from '../src/storage/storage';
import { resetShiftState } from '../src/shift/shiftState';
import { setTierCheckForTesting } from '../src/services/wms/tierCheck';
import { context, id } from './fixtures/p08Mock';
let tree: Renderer.ReactTestRenderer;
async function flush() {
  await act(async () => {
    await new Promise<void>(resolve => setTimeout(resolve, 20));
  });
}
beforeEach(async () => {
  setAppStorageForTesting(createStorage(createMemoryBackend()));
  clearSession();
  resetShiftState();
  setSession(context().session!);
  setTierCheckForTesting({
    status: 'matched',
    expected: 'dev-test',
    reported: 'dev-test',
  });
  await act(async () => {
    tree = Renderer.create(
      <AppProviders>
        <AppShell />
      </AppProviders>,
    );
  });
  await act(async () => {
    const p = tree.root.findByType(SessionConfirmationScreen).props;
    p.onIdentityResolved(context().user);
    p.onContinue({
      shift_id: id(8),
      actor_id: id(1),
      auth_session_id: id(2),
      warehouse_id: id(3),
      status: 'ACTIVE',
      version: 1,
      started_at: '2026-10-23T01:00:00Z',
      ended_at: null,
      preview_ready: true,
    } as any);
  });
});
afterEach(async () => {
  await act(async () => tree.unmount());
  clearSession();
});
async function openDocument() {
  await act(async () =>
    tree.root.findByType(HomeScreen).props.onOpenNotifications(),
  );
  await flush();
  await act(async () =>
    tree.root.findByType(P13NotificationsScreen).props.onOpenDocument({
      kind: 'outbound',
      id: id(9),
      warehouseId: id(3),
    }),
  );
  expect(tree.root.findByType(P12Screen).props.initialDocument.id).toBe(id(9));
}
test('ordinary P12 Back preserves the exact mounted P13 caller', async () => {
  await openDocument();
  const caller = tree.root.findByType(P13NotificationsScreen);
  const documentFooter = tree.root.findAllByType(BottomNav).at(-1)!;
  expect(documentFooter.props.activeKey).toBe('documents');
  expect(documentFooter.props.highlightActive).toBe(false);
  await act(async () => tree.root.findByType(P12Screen).props.onBack());
  expect(tree.root.findByType(P13NotificationsScreen)).toBe(caller);
});

test.each(['inbound', 'outbound', 'warranty'])(
  'TC04 %s detail opened from Home selects Documents without changing its Back caller',
  async kind => {
    const caller = tree.root.findByType(HomeScreen);
    await act(async () => caller.props.onOpenDocument(kind, id(9)));
    const detail = tree.root.findByType(P12Screen);
    expect(detail.props.initialDocument).toMatchObject({type: kind, id: id(9)});
    const documentFooter = tree.root.findAllByType(BottomNav).at(-1)!;
    expect(documentFooter.props.activeKey).toBe('documents');
    expect(documentFooter.props.highlightActive).toBe(false);
    await act(async () => detail.props.onBack());
    expect(tree.root.findAllByType(P12Screen)).toHaveLength(0);
    expect(tree.root.findAllByType(BottomNav).at(-1)!.props.activeKey).toBe('home');
  },
);
test('P23 → P20 → P23 preserves exact mounted caller and hides it from accessibility while covered', async () => {
  await act(async () =>
    tree.root.findAllByType(BottomNav).at(-1)!.props.onSelect('history'),
  );
  await flush();
  await act(async () =>
    tree.root
      .findByType(HistoryHubScreen)
      .props.onOpen({ owner: 'P23', kind: 'warranty' }),
  );
  await flush();
  const caller = tree.root.findByType(P23WarrantySessionsScreen);
  await act(async () => caller.props.onComponents(id(12)));
  await flush();
  expect(tree.root.findByType(P23WarrantySessionsScreen)).toBe(caller);
  const hidden = tree.root.findAll(
    n =>
      n.props.testID === 'read-owner-stack-0' &&
      n.props.pointerEvents === 'none',
  );
  expect(hidden.length).toBeGreaterThan(0);
  expect(hidden[0].props.accessibilityElementsHidden).toBe(true);
  await act(async () => tree.root.findByType(P20HistoryScreen).props.onBack());
  expect(tree.root.findByType(P23WarrantySessionsScreen)).toBe(caller);
  expect(tree.root.findAllByType(P20HistoryScreen)).toHaveLength(0);
});
test.each(['scan', 'tags'])(
  'P07 %s child keeps exact mounted assignment owner and restores it on Back',
  async child => {
    await act(async () =>
      tree.root.findByType(HomeScreen).props.onSelectTask('nfc'),
    );
    await flush();
    const owner = tree.root.findByType(NfcAssignmentScreen);
    await act(async () =>
      child === 'scan' ? owner.props.onScanCode() : owner.props.onManageTags(),
    );
    await flush();
    expect(tree.root.findByType(NfcAssignmentScreen)).toBe(owner);
    expect(
      tree.root.findAll(
        n =>
          n.props.testID === 'retained-owner' &&
          n.props.pointerEvents === 'none',
      ).length,
    ).toBeGreaterThan(0);
    if (child === 'scan')
      await act(async () =>
        tree.root.findByType(BusinessScanScreen).props.onBack(),
      );
    else
      await act(async () =>
        tree.root.findByType(NfcTagListScreen).props.onBack(),
      );
    expect(tree.root.findByType(NfcAssignmentScreen)).toBe(owner);
  },
);
test.each(['home', 'documents'])(
  'P12 explicit footer %s consumes the read-owner route instead of reopening P13',
  async tab => {
    await openDocument();
    await act(async () =>
      tree.root.findAllByType(BottomNav).at(-1)!.props.onSelect(tab),
    );
    expect(tree.root.findAllByType(P13NotificationsScreen)).toHaveLength(0);
    if (tab === 'home')
      expect(tree.root.findAllByType(HomeScreen)).toHaveLength(1);
    else
      expect(
        tree.root.findByType(P12Screen).props.initialDocument,
      ).toBeUndefined();
  },
);
test('P09 hydrated case object does not pull P19 back to P09 after issue navigation', async () => {
  await act(async () =>
    tree.root.findByType(HomeScreen).props.onSelectTask('warranty'),
  );
  await flush();
  const row = { warranty_case_id: id(12), status: 'CHECKING', version: 1 };
  await act(async () =>
    tree.root.findByType(WarrantyListScreen).props.onOpenCase(row),
  );
  await flush();
  await act(async () =>
    tree.root
      .findByType(WarrantyCaseDetail)
      .props.onIssueComponents({ ...row, version: 2 }),
  );
  await flush();
  expect(tree.root.findAllByType(P19EntryScreen)).toHaveLength(1);
  expect(tree.root.findAllByType(WarrantyCaseDetail)).toHaveLength(0);
});
