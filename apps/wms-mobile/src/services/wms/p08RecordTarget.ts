import { ownerUuid, type OwnerDocumentTarget } from '../../app/ownerNavigation';
import { readAssert, readObject } from './explicitReadFields';
import type { P08Scope, P08Source } from './p08Types';
export interface P08RecordTarget {
  recordId: string;
  source: P08Source;
  ownerId: string;
  detail?: OwnerDocumentTarget;
  attachments: boolean;
  scanSession: boolean;
  nfcHistory: boolean;
}
/** Parent identity is explicit owner evidence, never the first activity or a document-number heuristic. */
export function parseP08RecordTarget(
  value: unknown,
  recordId: string,
  scope: P08Scope,
): P08RecordTarget {
  const r = readObject(value),
    identity = readObject(r.identity),
    [source, id] = recordId.split(':');
  const resources: Record<string, string> = {
    DOCUMENT: 'STOCK_DOCUMENT',
    WARRANTY: 'WARRANTY_CASE',
    NFC: 'PHYSICAL_CODE',
    SCAN: 'SCAN_BATCH',
  };
  readAssert(
    ownerUuid(id) &&
      Object.hasOwn(resources, source) &&
      r.contract === 'p08-record-target-v1' &&
      identity.record_id === recordId &&
      identity.source === source &&
      identity.owner_id === id &&
      identity.warehouse_id === scope.warehouseId &&
      identity.resource_type === resources[source] &&
      r.owner_permission_rechecked_on_open === true &&
      r.selection_policy ===
        'NO_ACTIVITY_SELECTED_WITHOUT_EXPLICIT_ACTIVITY_ID' &&
      r.is_confirmation_receipt === false &&
      Array.isArray(r.write_operations) &&
      r.write_operations.length === 0,
    'P08_RECORD_TARGET_INVALID',
  );
  const has = (p: string) => scope.permissions.includes(p);
  readAssert(
    has('history.read') &&
      (source === 'DOCUMENT'
        ? has('inbound.view') || has('outbound.view')
        : source === 'WARRANTY'
        ? has('warranty.view') || has('warranty.manage')
        : source === 'NFC'
        ? has('physical_code.assign_rfid') || has('inventory.trace')
        : has('inventory.view')),
    'P08_RECORD_TARGET_RIGHTS',
  );
  const target = (key: string) => {
    const capability = readObject(r[key]);
    readAssert(
      typeof capability.available === 'boolean',
      'P08_RECORD_CAPABILITY_INVALID',
    );
    if (!capability.available) {
      readAssert(
        capability.read_target === null,
        'P08_RECORD_CAPABILITY_INVALID',
      );
      return;
    }
    const t = readObject(capability.read_target),
      query = readObject(t.query);
    readAssert(
      t.method === 'GET' &&
        typeof t.path === 'string' &&
        Object.keys(query).length === 1 &&
        query.warehouse_id === scope.warehouseId &&
        Object.keys(t).every(k => ['method', 'path', 'query'].includes(k)),
      'P08_RECORD_CAPABILITY_INVALID',
    );
    return t.path;
  };
  const detailPath = target('detail'),
    files = target('attachments'),
    scan = target('scan_session'),
    nfc = target('nfc_history');
  let detail: OwnerDocumentTarget | undefined;
  const paths = {
    inbound: '/api/v1/mini-app/inbound-documents/',
    outbound: '/api/v1/mini-app/outbound-documents/',
    warranty: '/api/v1/mini-app/warranty-cases/',
  } as const;
  if (detailPath) {
    const kind = (Object.keys(paths) as (keyof typeof paths)[]).find(
      k => detailPath === paths[k] + id,
    );
    readAssert(
      kind &&
        (source === 'DOCUMENT'
          ? kind !== 'warranty' && has(kind + '.view') && has('documents.read')
          : source === 'WARRANTY' && kind === 'warranty'),
      'P08_RECORD_OWNER_INVALID',
    );
    detail = { kind, id, warehouseId: scope.warehouseId };
  }
  readAssert(
    !files ||
      (detail &&
        has('documents.read') &&
        files === detailPath + '/attachments'),
    'P08_RECORD_FILES_INVALID',
  );
  readAssert(
    source === 'SCAN'
      ? scan === '/api/v1/mini-app/history/scan-sessions/' + id
      : scan === undefined,
    'P08_RECORD_SCAN_INVALID',
  );
  readAssert(
    source === 'NFC'
      ? nfc === '/api/v1/mini-app/nfc-tags/' + id + '/events'
      : nfc === undefined,
    'P08_RECORD_NFC_INVALID',
  );
  return {
    recordId,
    source: source as P08Source,
    ownerId: id,
    detail,
    attachments: Boolean(files),
    scanSession: Boolean(scan),
    nfcHistory: Boolean(nfc),
  };
}
