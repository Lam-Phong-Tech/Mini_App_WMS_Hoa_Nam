import { P05ApiError } from '../../features/outbound/linked/p05-contract';
export const P05_NUMBERING_CONTRACT = 'p05-save-numbering-v1' as const;
export const P05_NUMBERING_REVISION = 'p05-save-numbering-r1' as const;
export const P05_NUMBERING_HEADER = 'X-Outbound-Numbering-Contract';
export interface P05NumberingCapability {
  contract: typeof P05_NUMBERING_CONTRACT;
  revision: typeof P05_NUMBERING_REVISION;
  mode: 'MANUAL_CREATE_ONLY';
  schema_ready: boolean;
  allowed: boolean;
  format: 'PX-YYYYMMDD-SEQUENCE';
  cancel_policy: 'RETAIN_NEVER_REUSE';
  source_linked_policy: 'KEEP_SOURCE_DOCUMENT_NO';
  stock_effect: 'NONE';
}
const object = (v: unknown): Record<string, any> | undefined =>
  v && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, any>)
    : undefined;
const invalid = (): never => {
  throw new P05ApiError(
    'P05_NUMBERING_CONTRACT_INVALID',
    'Nguồn cấp mã PX chưa được xác minh.',
    { unknown: true },
  );
};
export function p05NumberingCapability(
  context: unknown,
): P05NumberingCapability | undefined {
  const c = object(context);
  if (!c || c.numbering === undefined) return undefined;
  const n = object(c.numbering),
    s = object(n?.save);
  if (
    !n ||
    n.contract !== P05_NUMBERING_CONTRACT ||
    n.revision !== P05_NUMBERING_REVISION ||
    n.mode !== 'MANUAL_CREATE_ONLY' ||
    typeof n.schema_ready !== 'boolean' ||
    typeof n.allowed !== 'boolean' ||
    n.format !== 'PX-YYYYMMDD-SEQUENCE' ||
    n.cancel_policy !== 'RETAIN_NEVER_REUSE' ||
    n.source_linked_policy !== 'KEEP_SOURCE_DOCUMENT_NO' ||
    n.stock_effect !== 'NONE' ||
    c.document_number_assignment !==
      (n.schema_ready ? 'WITH_DRAFT_SAVE' : 'UNAVAILABLE') ||
    !s ||
    s.method !== 'PUT' ||
    s.path !== '/api/v1/mini-app/drafts/{draft_id}' ||
    s.operation !== 'OUTBOUND' ||
    s.headers?.[P05_NUMBERING_HEADER] !== P05_NUMBERING_CONTRACT ||
    s.response_field !== 'data.document.document_no'
  )
    invalid();
  return n as P05NumberingCapability;
}
export const p05CanNumber = (context: unknown) => {
  const n = p05NumberingCapability(context);
  return !!n?.schema_ready && n.allowed;
};
export function p05OfficialDraftNumber(
  draft: unknown,
  requireAssigned = false,
): string | null {
  const d = object(draft) ?? invalid();
  if (
    d.document_no === null &&
    d.numbering_status === 'AWAITING_EXPLICIT_SAVE' &&
    !requireAssigned
  )
    return null;
  if (
    typeof d.document_no !== 'string' ||
    !/^PX-\d{8}-\d{4,}$/.test(d.document_no) ||
    d.numbering_status !== 'ASSIGNED'
  )
    invalid();
  return d.document_no;
}
export function p05NumberingMeta(body: unknown) {
  const m = object(object(body)?.meta);
  if (
    m?.numbering_contract !== P05_NUMBERING_CONTRACT ||
    m.numbering_revision !== P05_NUMBERING_REVISION
  )
    invalid();
}
