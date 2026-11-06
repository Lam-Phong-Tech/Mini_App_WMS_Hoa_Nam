import { getAppStorage, type KeyValueStorage } from '../../storage/storage';
import {
  p09Ensure,
  type P09Command,
  type P09Receipt,
  type P09Service,
} from '../../services/wms/p09Warranty';

export const P09_RECOVERY_PREFIX = 'p09-command-recovery/v1/';
export interface P09RecoveryRecord {
  schema: 'p09-command-recovery-v1';
  scope: P09Command['scope'];
  command: P09Command;
  phase: string;
  receipt?: P09Receipt;
}
export interface P09RecoveryJournal {
  load(): P09RecoveryRecord | undefined;
  write(command: P09Command, phase: string, receipt?: P09Receipt): void;
  clear(): void;
}
/** Deliberately omits the original form. Restored identity permits GET only. */
export function p09RecoveryJournal(
  service: P09Service,
  store: KeyValueStorage = getAppStorage(),
): P09RecoveryJournal {
  const scope = service.scope();
  const key =
    P09_RECOVERY_PREFIX +
    [scope.actorId, scope.authSessionId, scope.warehouseId].join('/');
  return {
    load() {
      if (!store.has(key)) return undefined;
      const row = store.getObject<P09RecoveryRecord>(key);
      p09Ensure(
        row?.schema === 'p09-command-recovery-v1' &&
          JSON.stringify(row.scope) === JSON.stringify(scope),
        'P09_RECOVERY_UNREADABLE',
      );
      return row;
    },
    write(command, phase, receipt) {
      const minimal: P09Command = {
        scope: command.scope,
        operation: command.operation,
        target: command.target,
        method: command.method,
        path: command.path,
        query: command.query,
        body:
          typeof command.body.item_id === 'string'
            ? { item_id: command.body.item_id }
            : {},
        headers: command.headers,
        requestId: command.requestId,
        idempotencyKey: command.idempotencyKey,
      };
      const safeReceipt = receipt
        ? (Object.fromEntries(
            [
              'request_id',
              'state',
              'operation',
              'warranty_case_id',
              'version',
              'status',
              'error_code',
              'http_status',
              'completed_at',
              'may_create_new_request',
            ]
              .filter(field => receipt[field as keyof P09Receipt] !== undefined)
              .map(field => [field, receipt[field as keyof P09Receipt]]),
          ) as unknown as P09Receipt)
        : undefined;
      const row: P09RecoveryRecord = {
        schema: 'p09-command-recovery-v1',
        scope: command.scope,
        command: minimal,
        phase,
        receipt: safeReceipt,
      };
      const encoded = JSON.stringify(row);
      p09Ensure(
        !/"(?:password|accessToken|refreshToken|access_token|refresh_token|customer_name|customer_phone|description|note)"\s*:/i.test(
          encoded,
        ),
        'P09_RECOVERY_PRIVATE_DATA',
      );
      store.setString(key, encoded);
      p09Ensure(store.getString(key) === encoded, 'P09_RECOVERY_WRITE_FAILED');
    },
    clear() {
      store.remove(key);
      p09Ensure(!store.has(key), 'P09_RECOVERY_CLEAR_FAILED');
    },
  };
}
