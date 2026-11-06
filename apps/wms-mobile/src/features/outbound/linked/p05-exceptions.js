// Allowlisted, transient scan observations. Never a writer/receipt or a source plan.
import { UUID, obj } from './p05-contract';

const text = value =>
  typeof value === 'string' && value.trim() ? value : null;
const reasons = new Set([
  'ITEM_ALREADY_MATCHED',
  'ITEM_NOT_AVAILABLE',
  'INSUFFICIENT_STOCK',
  'SKU_INACTIVE',
  'PHYSICAL_CODE_NOT_FOUND',
]);

export function p05RejectedObservation(raw, eventId, resolved, readVerified) {
  const data = obj(resolved) ? resolved : {};
  const reservation = data.reservation;
  let relatedDocument = { kind: 'unavailable' };
  if (reservation === null) relatedDocument = null;
  else if (
    readVerified === true &&
    obj(reservation) &&
    reservation.redacted === false &&
    reservation.can_open === true &&
    UUID.test(reservation.document_id || '')
  )
    relatedDocument = {
      kind: 'visible',
      documentId: reservation.document_id,
      number: text(reservation.doc_no),
      status: text(reservation.status),
      canOpen: true,
    };
  else if (obj(reservation)) relatedDocument = { kind: 'redacted' };
  return {
    eventId,
    raw,
    reasonCode: reasons.has(data.eligibility_code)
      ? data.eligibility_code
      : null,
    product: {
      // item_unique is the product code. A serial is never its substitute.
      code: text(data.item_unique),
      name: text(data.sku_name),
      sku: text(data.sku_code),
    },
    relatedDocument,
  };
}

/** The version belongs to the frozen original request, never a later draft. */
export function p05PendingIdentity(request) {
  if (
    !request ||
    !['SAVE', 'RECORD', 'CANCEL'].includes(request.command) ||
    ![request.key, request.draftId, request.scanSessionId].every(v =>
      UUID.test(v || ''),
    )
  )
    return null;
  const value =
    request.command === 'RECORD'
      ? request.headers?.['X-Draft-Version']
      : /^"(\d+)"$/.exec(request.headers?.['If-Match'] || '')?.[1];
  if (typeof value !== 'string' || !/^(0|[1-9]\d*)$/.test(value)) return null;
  const version = Number(value);
  if (!Number.isSafeInteger(version) || version < 0) return null;
  return {
    operationKey: request.key,
    draftId: request.draftId,
    scanSessionId: request.scanSessionId,
    version,
    command: request.command,
  };
}
