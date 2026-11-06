import { ownerUuid, type OwnerDocumentTarget } from '../../app/ownerNavigation';
import { parseDocumentTimestamp } from './documentTimestamps';
import {
  readAssert,
  readObject,
  readInstant,
  readInteger,
  type ReadField,
} from './explicitReadFields';
export const WEB_HANDOFF_CONTRACT = 'p13-web-post-queue-v1';
export const WEB_HANDOFF_REVISION = 'p13-web-post-queue-r2-20261104';
/** Original document instant/legacy semantics; no normalization or manual offset. */
export const readHandoffPostedAt = (v: unknown): v is string =>
  typeof v === 'string' && parseDocumentTimestamp(v).status === 'RECORDED';
export interface PersistedWebHandoff {
  state: 'WAITING_WEB_POST' | 'POSTED' | 'CANCELLED' | 'UNKNOWN';
  documentId: string;
  warehouseId: string;
  canonical: string | null;
  currentVersion: number | null;
  submittedVersion: number;
  versionMatch: boolean | null;
  submittedAt: string;
  postedAt: string | null;
  label: string;
  semantics: 'PERSISTED_SUBMISSION_INTENT_NOT_WEB_DELIVERY_ACK';
}
type FieldReader = <T>(
  path: string,
  valid: (v: unknown) => v is T,
) => ReadField<T>;
const text = (v: unknown): v is string =>
  typeof v === 'string' && !!v.trim() && v.length <= 500;
const positive = (v: unknown): v is number => readInteger(v) && v >= 1;
function check(v: unknown): asserts v {
  readAssert(v, 'P12_HANDOFF_IDENTITY_OR_VERSION_INVALID');
}
/** r2 is an independent persisted-intent axis, never scan readiness, ACK or current-version submission proof. */
export function parsePersistedWebHandoff(
  value: unknown,
  target: OwnerDocumentTarget,
  options: {
    expectedVersion?: number | null;
    expectedCanonical?: string | null;
    field?: FieldReader;
  } = {},
): PersistedWebHandoff | undefined {
  if (value === null || value === undefined) return;
  const h = readObject(value);
  const advertised =
    Object.hasOwn(h, 'revision') ||
    [
      'document_id',
      'current_document_version',
      'document_version_match',
      'display_status',
    ].some(k => Object.hasOwn(h, k));
  if (!advertised) return;
  check(
    h.contract === WEB_HANDOFF_CONTRACT &&
      h.revision === WEB_HANDOFF_REVISION &&
      target.kind !== 'warranty' &&
      h.document_id === target.id &&
      h.warehouse_id === target.warehouseId &&
      ownerUuid(target.id) &&
      ownerUuid(target.warehouseId) &&
      h.source === 'mini_app_web_post_handoffs+stock_documents.status' &&
      h.stock_effect === 'READ_ONLY_PROJECTION' &&
      h.semantics === 'PERSISTED_SUBMISSION_INTENT_NOT_WEB_DELIVERY_ACK' &&
      positive(h.document_version_at_record) &&
      readInstant(h.submitted_at) &&
      h.reviewed_status === 'NOT_RECORDED',
  );
  const nullable = <T>(
    key: string,
    valid: (v: unknown) => v is T,
  ): T | null => {
    if (options.field) {
      const f = options.field('/' + key, valid);
      return f.supplied ? f.value : null;
    }
    check(Object.hasOwn(h, key));
    if (h[key] === null) return null;
    check(valid(h[key]));
    return h[key] as T;
  };
  const canonical = nullable('canonical_status', text),
    currentVersion = nullable('current_document_version', positive),
    matches = nullable(
      'document_version_match',
      (v): v is boolean => typeof v === 'boolean',
    ),
    waiting = nullable(
      'current_waiting_for_web',
      (v): v is boolean => typeof v === 'boolean',
    ),
    postedAt = nullable('posted_at', readHandoffPostedAt);
  check(nullable('reviewed_at', readInstant) === null);
  const expectedState =
    canonical === 'DRAFT' || canonical === 'SCANNING'
      ? 'WAITING_WEB_POST'
      : canonical === 'POSTED'
      ? 'POSTED'
      : canonical === 'CANCELLED'
      ? 'CANCELLED'
      : 'UNKNOWN';
  check(
    h.state === expectedState &&
      matches ===
        (currentVersion === null
          ? null
          : currentVersion === h.document_version_at_record) &&
      waiting ===
        (expectedState === 'UNKNOWN'
          ? null
          : expectedState === 'WAITING_WEB_POST') &&
      (currentVersion !== null || expectedState === 'UNKNOWN'),
  );
  if (options.expectedVersion !== undefined)
    check(currentVersion === options.expectedVersion);
  if (options.expectedCanonical !== undefined)
    check(canonical === options.expectedCanonical);
  const display = readObject(h.display_status);
  check(
    display.mapping_contract === WEB_HANDOFF_CONTRACT &&
      display.mapping_revision === WEB_HANDOFF_REVISION &&
      display.value === h.state &&
      text(display.label),
  );
  return {
    state: h.state as PersistedWebHandoff['state'],
    documentId: target.id,
    warehouseId: target.warehouseId,
    canonical,
    currentVersion,
    submittedVersion: h.document_version_at_record as number,
    versionMatch: matches,
    submittedAt: h.submitted_at as string,
    postedAt,
    label: display.label,
    semantics: 'PERSISTED_SUBMISSION_INTENT_NOT_WEB_DELIVERY_ACK',
  };
}
