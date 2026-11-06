import { captureSessionScope } from '../../auth/session';
import { getAppStorage } from '../../storage/storage';
export type PendingUpload = {
  uri: string;
  name: string;
  key: string;
  sha256: string;
};
const uuid = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
export function uploadJournalKey(
  caseId: string,
  scope = captureSessionScope(),
) {
  if (
    ![caseId, scope.userId, scope.authSessionId, scope.warehouseId].every(
      x => typeof x === 'string' && uuid.test(x),
    )
  )
    return undefined;
  return (
    'p18-upload-pending/v1/' +
    [scope.userId, scope.authSessionId, scope.warehouseId, caseId].join('/')
  );
}
export function readUploadJournal(key: string | undefined): PendingUpload[] {
  if (!key) return [];
  const raw = getAppStorage().getString(key);
  if (raw === undefined) return [];
  const data: unknown = JSON.parse(raw);
  if (
    !Array.isArray(data) ||
    data.some(
      row => !row || !uuid.test(row.key) || !/^[a-f0-9]{64}$/.test(row.sha256),
    )
  )
    throw Error('P18_UPLOAD_JOURNAL_INVALID');
  return data.map(row => ({
    ...row,
    uri: 'pending-upload:' + row.key,
    name: 'Tệp chờ đối chiếu ' + row.key,
  }));
}
export function writeUploadJournal(
  key: string | undefined,
  rows: readonly PendingUpload[],
) {
  if (!key) throw Error('P18_UPLOAD_JOURNAL_SCOPE_REQUIRED');
  // Bytes, file paths, credentials, names and form PII never enter this journal.
  const value = JSON.stringify(
    rows.map(row => ({ key: row.key, sha256: row.sha256 })),
  );
  getAppStorage().setString(key, value);
  if (getAppStorage().getString(key) !== value)
    throw Error('P18_UPLOAD_JOURNAL_FAILED');
}
