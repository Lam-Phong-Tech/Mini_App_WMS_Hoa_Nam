import {
  P03_OPERATIONS,
  p03Drafts,
  p03Scope,
  type P03Draft,
  type P03Operation,
  type P03Scope,
  sameP03Scope,
} from '../services/wms/p03Drafts';
import { getAppStorage, type KeyValueStorage } from '../storage/storage';
import {p03DraftNumberRead} from '../services/wms/p03DraftNumberRead';
import type { P04Run } from '../features/inbound/p04Flow';
import {
  p05StableJSON,
  p05FormSnapshot,
} from '../features/outbound/p05CreateForm';
import {
  P05_NUMBERING_CONTRACT,
  p05OfficialDraftNumber,
} from '../services/wms/p05Numbering';

export interface P14DraftOverview {
  readonly total: number;
  readonly items: readonly (P03Draft & {
    localState?: 'DIRTY' | 'CLEAN';
    displayTitle?: string;
    displayTitleSource?:
      | 'LOCAL_VERIFIED_P04_NUMBER'
      | 'LOCAL_VERIFIED_P05_NUMBER'
      | 'SERVER_PERSISTED_NUMBER_READ';
  })[];
  readonly complete: boolean;
}

/** Read-only, current auth-session draft projection for the P14 close screen. */
export async function loadP14DraftOverview(
  service: Pick<typeof p03Drafts, 'context' | 'list'> = p03Drafts,
  readScope = p03Scope,
  storage: KeyValueStorage = getAppStorage(),
): Promise<P14DraftOverview> {
  const scope = readScope(),
    context = await service.context(),
    operations = P03_OPERATIONS.filter(
      operation => context.permissions[operation]?.read === true,
    );
  const pages = await Promise.allSettled(
    operations.map(operation => service.list(scope, operation, 1)),
  );
  const successful = pages.filter(
    (
      page,
    ): page is PromiseFulfilledResult<
      Awaited<ReturnType<typeof p03Drafts.list>>
    > => page.status === 'fulfilled',
  );
  return {
    total: successful.reduce((sum, page) => sum + page.value.meta.total, 0),
    items: successful
      .flatMap(page => page.value.data)
      .map(item => {
        const number=p03DraftNumberRead(item);
        if(number){
          const local=item.operation==='OUTBOUND'?p14P05Projection(item,scope,storage):undefined;
          return {...item,...(local?.localState?{localState:local.localState}:{}),displayTitle:number.availability==='AVAILABLE'?number.number!:number.availability==='NOT_ASSIGNED'?'Chưa được cấp mã phiếu':'Chưa đọc được mã phiếu',displayTitleSource:'SERVER_PERSISTED_NUMBER_READ' as const};
        }
        if (item.operation === 'OUTBOUND') {
          const local = p14P05Projection(item, scope, storage);
          if (local) return { ...item, ...local };
        }
        const displayTitle = p14VerifiedP04Number(item, scope, storage);
        return displayTitle
          ? {
              ...item,
              displayTitle,
              displayTitleSource: 'LOCAL_VERIFIED_P04_NUMBER' as const,
            }
          : item;
      }),
    complete: successful.length === operations.length,
  };
}

/** Presentation join from an already verified exact SAVE; never grants resume. */
export function p14P05Projection(
  item: P03Draft,
  scope: P03Scope,
  storage: KeyValueStorage,
) {
  if (
    item.operation !== 'OUTBOUND' ||
    item.status !== 'DRAFT' ||
    item.auth_session_id !== scope.authSessionId ||
    item.warehouse_id !== scope.warehouseId
  )
    return;
  const matches = storage
    .keys()
    .filter(k => k.startsWith('hn-p05-create-v1:'))
    .map(k => storage.getObject<any>(k))
    .filter(
      row =>
        row?.scope &&
        sameP03Scope(row.scope, scope) &&
        row.state?.draftId === item.document_id &&
        row.state?.scanSessionId === item.scan_session_id,
    );
  if (matches.length !== 1) return;
  const s = matches[0].state,
    d = s.serverDraft;
  if (
    s.pending ||
    s.unknown ||
    s.outcome ||
    s.numberingContract !== P05_NUMBERING_CONTRACT ||
    !s.saveReceiptKey ||
    s.version !== item.version ||
    d?.version !== item.version ||
    d?.document_id !== item.document_id ||
    d?.scan_session_id !== item.scan_session_id ||
    d?.actor_id !== scope.actorId ||
    d?.auth_session_id !== scope.authSessionId ||
    d?.warehouse_id !== scope.warehouseId ||
    d?.status !== 'DRAFT'
  )
    return;
  try {
    const number = p05OfficialDraftNumber(d, true);
    if (
      !number ||
      number !== s.documentNo ||
      p05StableJSON({
        form: d.form,
        codes: d.codes.map((c: any) => ({
          raw_code: c.raw_code,
          scan_source: c.scan_source,
        })),
      }) !== s.savedSignature
    )
      return;
    const dirty =
      p05StableJSON({
        form: p05FormSnapshot(s.form),
        codes: s.accepted.map((c: any) => ({
          raw_code: c.raw,
          scan_source: c.source,
        })),
      }) !== s.savedSignature;
    return {
      displayTitle: number,
      displayTitleSource: 'LOCAL_VERIFIED_P05_NUMBER' as const,
      localState: dirty ? ('DIRTY' as const) : ('CLEAN' as const),
    };
  } catch {
    return;
  }
}

/** A display join only. Never replaces server title/status or confers ownership. */
export function p14VerifiedP04Number(
  item: P03Draft,
  scope: P03Scope,
  storage: KeyValueStorage,
): string | undefined {
  if (
    item.title?.trim() ||
    item.operation !== 'INBOUND' ||
    item.status !== 'DRAFT' ||
    item.auth_session_id !== scope.authSessionId ||
    item.warehouse_id !== scope.warehouseId
  )
    return undefined;
  const matches = new Set<string>();
  for (const key of storage.keys().filter(k => k.startsWith('p04.runs.v1/'))) {
    const run = storage.getObject<P04Run>(key),
      s = run?.server,
      r = run?.saveReceipt;
    if (
      !run ||
      !run.scope ||
      !sameP03Scope(run.scope, scope) ||
      run.nameMode !== 'BE_DOCUMENT_NO' ||
      run.closed ||
      run.result ||
      !s ||
      !r ||
      run.identity?.documentId !== item.document_id ||
      run.identity?.scanSessionId !== item.scan_session_id ||
      s.document_id !== item.document_id ||
      s.scan_session_id !== item.scan_session_id ||
      s.warehouse_id !== scope.warehouseId ||
      s.auth_session_id !== scope.authSessionId ||
      s.actor_id !== scope.actorId ||
      s.version !== item.version ||
      r.document_id !== item.document_id ||
      r.scan_session_id !== item.scan_session_id ||
      r.warehouse_id !== scope.warehouseId ||
      r.operation !== 'INBOUND' ||
      r.command !== 'SAVE' ||
      r.outcome !== 'SUCCEEDED' ||
      r.version !== item.version ||
      typeof s.document_no !== 'string' ||
      !s.document_no.trim() ||
      s.document_no.length > 200
    )
      continue;
    matches.add(s.document_no.trim());
  }
  return matches.size === 1 ? [...matches][0] : undefined;
}

export const p14OperationLabel = (operation: P03Operation) =>
  ({
    INBOUND: 'Nhập kho',
    OUTBOUND: 'Xuất kho',
    WARRANTY: 'Bảo hành',
    COMPONENT_ISSUE: 'Xuất linh kiện',
  }[operation]);
