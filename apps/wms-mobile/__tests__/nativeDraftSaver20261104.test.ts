import { createNativeDraftSaver } from '../src/shift/nativeDraftSavers';
import { setSession, clearSession } from '../src/auth/session';
import {
  registerShiftLocalOwner,
  REQUIRED_SHIFT_OWNERS,
} from '../src/shift/localOwners';
import {
  createMemoryBackend,
  createStorage,
  setAppStorageForTesting,
} from '../src/storage/storage';
import { getCurrentEnvironment } from '../src/config/env';
import { apiClient } from '../src/api/client';
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
test('preflight of a first-SAVE P19 refuses before any earlier P05 job or HTTP request; closing fence stays intact', async () => {
  const store = createStorage(createMemoryBackend()),
    scope = { actorId: id(1), authSessionId: id(2), warehouseId: id(3) };
  setAppStorageForTesting(store);
  setSession({
    userId: scope.actorId,
    authSessionId: scope.authSessionId,
    activeWarehouseId: scope.warehouseId,
    accessToken: 'TEST-ONLY',
  });
  const releases = REQUIRED_SHIFT_OWNERS.map(owner =>
    registerShiftLocalOwner(owner, () => ({
      state: owner === 'P05' || owner === 'P19' ? 'DIRTY' : 'CLEAN',
      revision: owner,
      coverageComplete: true,
      busy: false,
      pendingRequestIds: [],
    })),
  );
  const request = jest.spyOn(apiClient, 'request');
  try {
    const key =
      'hn-p05-create-v1:' +
      JSON.stringify([
        getCurrentEnvironment().apiBaseUrl,
        scope.actorId,
        scope.authSessionId,
        scope.warehouseId,
      ]);
    store.setObject(key, {
      scope,
      state: { version: 1, draftId: id(4), scanSessionId: id(5) },
    });
    store.setObject('p19-linked-private/v1/test', {
      scope,
      caseId: id(6),
      draftId: id(7),
      scanSessionId: id(8),
      draftVersion: 0,
      dirty: true,
    });
    const saver = createNativeDraftSaver();
    await expect(saver.save(saver.plan())).rejects.toThrow('SAVE đầu tiên');
    expect(request).not.toHaveBeenCalled();
    expect(store.getObject<any>(key)?.state.version).toBe(1);
  } finally {
    request.mockRestore();
    releases.forEach(f => f());
    clearSession();
  }
});
