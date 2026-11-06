/** Navigation accepts owner-projected GET identities, never arbitrary URLs. */
export type DocumentOwner = 'inbound' | 'outbound' | 'warranty';
export interface OwnerDocumentTarget {
  kind: DocumentOwner;
  id: string;
  warehouseId: string;
}
export const ownerUuid = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value);
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

export function notificationDocumentTarget(
  subject: unknown,
  warehouseId: string | undefined,
): OwnerDocumentTarget | undefined {
  const s = record(subject),
    target = record(s.read_target),
    query = record(target.query);
  if (
    !ownerUuid(warehouseId) ||
    s.mapping_revision !== 'p13-notifications-r2' ||
    s.mapping_status !== 'MAPPED' ||
    s.identity_source !== 'PERSISTED_NOTIFICATION_EVENT_AND_PAYLOAD' ||
    s.requires_subject_revalidation !== true ||
    s.navigation_status !== 'OWNER_REVALIDATION_REQUIRED' ||
    s.warehouse_id !== warehouseId ||
    !ownerUuid(s.business_id) ||
    target.method !== 'GET' ||
    Object.keys(query).length !== 1 ||
    query.warehouse_id !== warehouseId
  )
    return;
  const mapping = {
    INBOUND: ['inbound', 'inbound-documents'],
    OUTBOUND: ['outbound', 'outbound-documents'],
    WARRANTY: ['warranty', 'warranty-cases'],
  } as const;
  if (
    typeof s.business_type !== 'string' ||
    !Object.hasOwn(mapping, s.business_type)
  )
    return;
  const m = mapping[s.business_type as keyof typeof mapping];
  if (!m || target.path !== '/api/v1/mini-app/' + m[1] + '/' + s.business_id)
    return;
  return { kind: m[0], id: s.business_id, warehouseId };
}

export type ReadOwnerRoute =
  | { owner: 'P13'; recipientId?: string }
  | { owner: 'P13_QUEUE' }
  | { owner: 'P18_BOXES'; keyword?: string }
  | { owner: 'P18_LOCATION'; kind: 'ITEM' | 'BOX'; id: string }
  | { owner: 'P20'; caseId: string; documentId?: string }
  | { owner: 'P21'; caseId?: string }
  | { owner: 'P22'; recordId?: string; activityId?: string; eventId?: string }
  | {
      owner: 'P23';
      kind: 'warranty' | 'sessions';
      caseId?: string;
      sessionId?: string;
    }
  | {
      owner: 'P08';
      mode: 'records' | 'summary';
      source?: 'DOCUMENT';
      business?: 'INBOUND' | 'OUTBOUND';
      documentId?: string;
    };
