import {
  ownerUuid,
  type OwnerDocumentTarget,
} from '../../../app/ownerNavigation';
import {
  readAssert,
  readObject,
} from '../../../services/wms/explicitReadFields';
import { parseDocumentTimestamp } from '../../../services/wms/documentTimestamps';
export const P12_PARTNER_CONTRACT = 'p12-partner-snapshot-v1';
export const P12_PARTNER_REVISION = 'p12-partner-snapshot-r1-20261104';
type SupplierStatus =
  | 'SNAPSHOT_RECORDED'
  | 'NOT_SELECTED'
  | 'NOT_RECORDED'
  | 'SOURCE_UNAVAILABLE';
export interface SupplierSnapshot {
  status: SupplierStatus;
  id: string | null;
  name: string | null;
  name_status: SupplierStatus;
  version: number | null;
  recorded_at: string | null;
  source: 'mini_app_inbound_record_metadata' | null;
}
export interface PartnerSnapshot {
  role: 'SUPPLIER' | 'RECIPIENT' | 'WITHHELD';
  displayName: string | null;
  availability: string;
  supplier?: SupplierSnapshot;
  documentVersion?: number | null;
}
const check = (value: unknown) =>
  readAssert(value, 'P12_PARTNER_SNAPSHOT_INVALID');
const text = (v: unknown) =>
  typeof v === 'string' && v.trim().length > 0 && v.length <= 1000;
const version = (v: unknown) => Number.isSafeInteger(v) && Number(v) >= 1;
export function validSupplierRecordedAt(v: unknown): v is string {
  return (
    typeof v === 'string' &&
    /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(v) &&
    parseDocumentTimestamp(v).status === 'RECORDED'
  );
}
/** Only persisted snapshot data is read; no directory/title/number substitution or timestamp repair. */
export function parsePartnerSnapshot(
  value: unknown,
  target: OwnerDocumentTarget,
  options: {
    mode?: 'aggregate' | 'owner';
    contract?: unknown;
    revision?: unknown;
    expectedVersion?: number | null;
  } = {},
): PartnerSnapshot | undefined {
  const mode = options.mode ?? 'aggregate';
  const advertised =
    options.contract !== undefined ||
    (!!value &&
      typeof value === 'object' &&
      ['provenance', 'supplier_snapshot', 'role'].some(k =>
        Object.hasOwn(value, k),
      ));
  if (!advertised) return;
  if (options.contract !== undefined)
    check(
      options.contract === P12_PARTNER_CONTRACT &&
        options.revision === P12_PARTNER_REVISION,
    );
  const p = readObject(value);
  if (target.kind === 'warranty') {
    check(
      p.display_name === null &&
        p.redacted === true &&
        p.availability === 'WITHHELD_IN_AGGREGATE' &&
        !Object.hasOwn(p, 'supplier_snapshot'),
    );
    return {
      role: 'WITHHELD',
      displayName: null,
      availability: 'WITHHELD_IN_AGGREGATE',
    };
  }
  check(
    p.redacted === false &&
      (p.display_name === null || text(p.display_name)) &&
      ownerUuid(target.id) &&
      ownerUuid(target.warehouseId),
  );
  // Current outbound recipients are parent-bound fields; deployed wire has no supplier provenance.
  if (target.kind === 'outbound') {
    check(
      p.role === 'RECIPIENT' &&
        p.source === 'stock_documents.recipient_name' &&
        p.availability ===
          (p.display_name === null ? 'NOT_RECORDED' : 'RECORDED') &&
        !Object.hasOwn(p, 'supplier_snapshot'),
    );
    if (p.provenance === undefined)
      return {
        role: 'RECIPIENT',
        displayName: p.display_name as string | null,
        availability: String(p.availability),
      };
  }
  const proof = readObject(p.provenance);
  check(
    proof.contract === P12_PARTNER_CONTRACT &&
      proof.revision === P12_PARTNER_REVISION &&
      proof.document_id === target.id &&
      proof.warehouse_id === target.warehouseId &&
      ownerUuid(target.id) &&
      ownerUuid(target.warehouseId) &&
      (proof.document_version === null || version(proof.document_version)) &&
      proof.semantics ===
        'RECORD_SNAPSHOT_NOT_DOCUMENT_TITLE_OR_CURRENT_DIRECTORY',
  );
  if (
    options.expectedVersion !== undefined &&
    options.expectedVersion !== null &&
    proof.document_version !== null
  )
    check(proof.document_version === options.expectedVersion);
  check(
    p.redacted === false && (p.display_name === null || text(p.display_name)),
  );
  if (target.kind === 'outbound') {
    check(
      p.role === 'RECIPIENT' &&
        p.source === 'stock_documents.recipient_name' &&
        p.availability ===
          (p.display_name === null ? 'NOT_RECORDED' : 'RECORDED') &&
        !Object.hasOwn(p, 'supplier_snapshot'),
    );
    return {
      role: 'RECIPIENT',
      displayName: p.display_name as string | null,
      availability: String(p.availability),
      documentVersion: proof.document_version as number | null,
    };
  }
  const s = readObject(p.supplier_snapshot),
    statuses = [
      'SNAPSHOT_RECORDED',
      'NOT_SELECTED',
      'NOT_RECORDED',
      'SOURCE_UNAVAILABLE',
    ];
  check(
    p.role === 'SUPPLIER' &&
      p.source === s.source &&
      statuses.includes(String(s.status)) &&
      statuses.includes(String(s.name_status)) &&
      (s.id === null || ownerUuid(s.id)) &&
      (s.name === null || text(s.name)) &&
      (s.version === null || version(s.version)) &&
      (s.recorded_at === null || validSupplierRecordedAt(s.recorded_at)) &&
      (s.source === null || s.source === 'mini_app_inbound_record_metadata'),
  );
  if (s.status === 'SNAPSHOT_RECORDED')
    check(
      s.source === 'mini_app_inbound_record_metadata' &&
        (s.id !== null || s.name !== null) &&
        s.name_status ===
          (s.name === null ? 'NOT_RECORDED' : 'SNAPSHOT_RECORDED'),
    );
  else if (s.status === 'NOT_SELECTED')
    check(s.id === null && s.name === null && s.name_status === 'NOT_SELECTED');
  else
    check(
      [s.id, s.name, s.version, s.recorded_at].every(v => v === null) &&
        s.name_status === s.status,
    );
  check(
    p.display_name === (s.name_status === 'SNAPSHOT_RECORDED' ? s.name : null),
  );
  if (s.status === 'SOURCE_UNAVAILABLE')
    check(
      mode === 'owner' &&
        ['SOURCE_UNAVAILABLE', 'NOT_RECORDED'].includes(String(p.availability)),
    );
  else
    check(
      p.availability ===
        (p.display_name === null ? 'NOT_RECORDED' : 'RECORDED'),
    );
  const supplier = Object.fromEntries(
    [
      'status',
      'id',
      'name',
      'name_status',
      'version',
      'recorded_at',
      'source',
    ].map(k => [k, s[k]]),
  ) as unknown as SupplierSnapshot;
  return {
    role: 'SUPPLIER',
    displayName: p.display_name as string | null,
    availability: String(p.availability),
    supplier,
    documentVersion: proof.document_version as number | null,
  };
}
