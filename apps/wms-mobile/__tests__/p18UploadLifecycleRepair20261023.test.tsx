jest.mock('../src/services/wms/warrantyWrite', () => ({
  ...jest.requireActual('../src/services/wms/warrantyWrite'),
  hashAttachmentFile: jest.fn().mockResolvedValue('a'.repeat(64)),
  uploadOwnerAttachment: jest.fn(),
  reconcileOwnerAttachment: jest.fn(),
}));
import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { useAttachments } from '../src/features/warranty/useAttachments';
import {
  uploadJournalKey,
  readUploadJournal,
} from '../src/features/warranty/p18UploadJournal';
import * as write from '../src/services/wms/warrantyWrite';
import { AppError } from '../src/errors/AppError';
import { setSession, clearSession } from '../src/auth/session';
import {
  getAppStorage,
  createStorage,
  createMemoryBackend,
  setAppStorageForTesting,
} from '../src/storage/storage';
const id = (n: number) =>
  '10000000-0000-4000-8000-' + String(n).padStart(12, '0');
let hook!: ReturnType<typeof useAttachments>, tree!: Renderer.ReactTestRenderer;
const load = jest.fn().mockResolvedValue({ items: [] });
const picked = {
  kind: 'picked',
  items: [
    {
      file: {
        uri: 'file://test.jpg',
        name: 'private-name.jpg',
        type: 'image/jpeg',
      },
      bytes: 3,
      isVideo: false,
    },
  ],
};
const pick = jest.fn().mockResolvedValue(picked);
function Harness({ caseId = id(5) }: { caseId?: string }) {
  hook = useAttachments(caseId, { load, pick });
  return null;
}
beforeEach(() => {
  jest.clearAllMocks();
  setAppStorageForTesting(createStorage(createMemoryBackend()));
  clearSession();
  setSession({
    accessToken: 'offline',
    userId: id(1),
    authSessionId: id(2),
    activeWarehouseId: id(3),
  });
});
afterEach(async () => {
  if (tree) await act(async () => tree.unmount());
  clearSession();
});
test('UNKNOWN cannot be removed/reuploaded and remount restores original key/hash for check only', async () => {
  (write.uploadOwnerAttachment as jest.Mock).mockImplementation(
    async (_o, _id, _f, options) => {
      options.beforeDispatch();
      throw new AppError({ kind: 'timeout', message: 'lost' });
    },
  );
  await act(async () => {
    tree = Renderer.create(<Harness />);
  });
  await act(async () => hook.addFromLibrary());
  await act(async () => hook.uploadAll('INTAKE'));
  const original = hook.unknown![0];
  expect(original.sha256).toBe('a'.repeat(64));
  await act(async () => {
    hook.removePending(original.uri);
    await hook.uploadAll('INTAKE');
  });
  expect(write.uploadOwnerAttachment).toHaveBeenCalledTimes(1);
  expect(hook.pending).toHaveLength(1);
  const bytes = getAppStorage().getString(uploadJournalKey(id(5))!)!;
  expect(bytes).not.toContain('private-name');
  expect(bytes).not.toContain('file://');
  expect(bytes).not.toContain('offline');
  await act(async () => tree.unmount());
  await act(async () => {
    tree = Renderer.create(<Harness />);
  });
  expect(hook.unknown![0].key).toBe(original.key);
  expect(readUploadJournal(uploadJournalKey(id(5)))[0].sha256).toBe(
    original.sha256,
  );
  await act(async () => hook.uploadAll('INTAKE'));
  expect(write.uploadOwnerAttachment).toHaveBeenCalledTimes(1);
  (write.reconcileOwnerAttachment as jest.Mock).mockResolvedValue({
    outcome: 'SUCCEEDED',
    retryPolicy: 'NONE',
  });
  await act(async () => {
    await hook.reconcile(hook.unknown![0].uri);
  });
  expect(hook.unknown).toHaveLength(0);
  expect(hook.pending).toHaveLength(0);
  expect(write.reconcileOwnerAttachment).toHaveBeenCalledWith(
    'warranty',
    id(5),
    original.key,
    id(3),
    original.sha256,
  );
});
test('late picker from case A cannot populate case B', async () => {
  let finish!: (v: typeof picked) => void;
  pick.mockImplementationOnce(() => new Promise(r => (finish = r)));
  await act(async () => {
    tree = Renderer.create(<Harness />);
  });
  act(() => hook.addFromLibrary());
  await act(async () => tree.update(<Harness caseId={id(6)} />));
  await act(async () => finish(picked));
  expect(hook.pending).toHaveLength(0);
});
