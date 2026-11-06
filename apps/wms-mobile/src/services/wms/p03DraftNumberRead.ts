import { AppError } from '../../errors/AppError';
import { ownerUuid } from '../../app/ownerNavigation';
export interface DraftNumberRead {
  availability: 'AVAILABLE' | 'NOT_ASSIGNED' | 'SOURCE_UNAVAILABLE';
  number: string | null;
  source: string | null;
  reason: string | null;
}
const fail = (): never => {
  throw new AppError({
    kind: 'parse',
    code: 'P03_NUMBER_READ_INVALID',
    message: 'Nguồn mã phiếu đọc lại chưa được xác minh.',
  });
};
/** Current read projection only. An old response/document_no alone is not this contract. */
export function p03DraftNumberRead(
  value: unknown,
): DraftNumberRead | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return;
  const d = value as Record<string, unknown>;
  if (
    ![
      'document_no_availability',
      'document_no_source',
      'document_no_reason',
    ].some(k => Object.hasOwn(d, k))
  )
    return;
  if (
    !['INBOUND', 'OUTBOUND'].includes(String(d.operation)) ||
    ![
      'document_no',
      'document_no_availability',
      'document_no_source',
      'document_no_reason',
    ].every(k => Object.hasOwn(d, k))
  )
    fail();
  if (
    !Object.hasOwn(d, 'business_document_id') ||
    (d.business_document_id !== null && !ownerUuid(d.business_document_id))
  )
    fail();
  const availability = d.document_no_availability,
    source = d.document_no_source,
    reason = d.document_no_reason;
  if (availability === 'AVAILABLE') {
    const linked =
      d.business_document_id !== null && d.business_document_id !== undefined;
    if (
      typeof d.document_no !== 'string' ||
      !d.document_no.trim() ||
      d.document_no.length > 200 ||
      /[\u0000-\u001f\u007f]/.test(d.document_no) ||
      reason !== null
    )
      fail();
    if (
      source !==
      (linked
        ? 'stock_documents.doc_no'
        : d.operation === 'INBOUND'
        ? 'inbound_draft_numbers.doc_no'
        : 'outbound_draft_numbers.doc_no')
    )
      fail();
    return {
      availability,
      number: d.document_no as string,
      source: source as string,
      reason: null,
    };
  }
  if (
    !['NOT_ASSIGNED', 'SOURCE_UNAVAILABLE'].includes(String(availability)) ||
    d.document_no !== null ||
    source !== null ||
    ![
      'NO_PERSISTED_DRAFT_NUMBER',
      'PERSISTED_NUMBER_SOURCE_UNAVAILABLE',
      'BUSINESS_DOCUMENT_NOT_IN_SCOPE',
      'PERSISTED_NUMBER_EMPTY',
    ].includes(String(reason))
  )
    fail();
  return {
    availability: availability as DraftNumberRead['availability'],
    number: null,
    source: null,
    reason: reason as string,
  };
}
