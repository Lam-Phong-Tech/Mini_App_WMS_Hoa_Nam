import { getAppStorage, type KeyValueStorage } from '../../../storage/storage';
import type { P19Scope } from './p19Types';
const prefix = 'p19-linked-private/v1/';
const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/;
export function p19LinkedJournal(
  scope: P19Scope,
  caseId: string,
  storage: KeyValueStorage = getAppStorage(),
) {
  if (
    ![scope.actorId, scope.authSessionId, scope.warehouseId, caseId].every(id =>
      uuid.test(id),
    )
  )
    throw Error('P19_JOURNAL_SCOPE_INVALID');
  const key =
    prefix +
    [scope.actorId, scope.authSessionId, scope.warehouseId, caseId].join('/');
  return {
    load(): { checkpoint?: unknown; invalid: boolean } {
      const raw = storage.getString(key);
      if (raw === undefined) return { invalid: false };
      try {
        const value = JSON.parse(raw);
        if (
          value?.schema !== 'p19-linked-private-v1' ||
          value.caseId !== caseId ||
          JSON.stringify(value.scope) !== JSON.stringify(scope)
        )
          return { invalid: true };
        return { checkpoint: value, invalid: false };
      } catch {
        return { invalid: true };
      }
    },
    write(value: unknown) {
      const checkpoint = value as {
        schema?: string;
        scope?: unknown;
        caseId?: string;
        draftId?: string;
        scanSessionId?: string;
      } | null;
      if (!checkpoint?.draftId || !checkpoint.scanSessionId) return;
      if (
        checkpoint.schema !== 'p19-linked-private-v1' ||
        checkpoint.caseId !== caseId ||
        JSON.stringify(checkpoint.scope) !== JSON.stringify(scope)
      )
        throw Error('P19_JOURNAL_SCOPE_INVALID');
      const bytes = JSON.stringify(value);
      if (
        /"(?:Authorization|accessToken|refreshToken|access_token|refresh_token|password|customer_name|customer_phone)"\s*:/i.test(
          bytes,
        )
      )
        throw Error('P19_JOURNAL_PRIVATE_DATA_REJECTED');
      storage.setString(key, bytes);
    },
  };
}
