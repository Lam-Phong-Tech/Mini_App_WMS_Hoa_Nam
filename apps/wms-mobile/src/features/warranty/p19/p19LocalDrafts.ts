/** Read-only discovery/navigation for dirty local P19 drafts without a command. */
import { AppError } from '../../../errors/AppError';
import { captureSessionScope, isSessionScopeCurrent } from '../../../auth/session';
import { getAppStorage, type KeyValueStorage } from '../../../storage/storage';
import { ownerUuid } from '../../../app/ownerNavigation';
import type { P09Service } from '../../../services/wms/p09Warranty';
import { p19DevEnabled } from '../../../config/p19Release';
import { canEnterP19 } from './p19Entry';
import { p19LinkedJournal } from './p19LinkedJournal';
import { retainedP19Owner } from './p19OwnerRegistry';
import type { P19Scope } from './p19Types';

export interface P19LocalDraftChoice {
  caseId: string;
  draftId: string;
  scanSessionId: string;
  version: number;
  codeCount: number;
  quantity: number;
  /** Equality token only. It is not authorization and is never sent to BE. */
  revision: string;
}
const failure = () => new AppError({
  kind: 'blocked_by_gate',
  message: 'Phiếu trên thiết bị đã thay đổi hoặc chưa xác minh đúng phiên. Đọc lại danh sách; dữ liệu vẫn được giữ.',
});
const scopeOf = (service: P09Service): P19Scope => {
  const s = service.componentScope();
  if (!p19DevEnabled() || !s.permissions.includes('warranty.component_issue') ||
      !s.permissions.includes('documents.read') ||
      !s.permissions.some(p => ['warranty.view', 'warranty.manage'].includes(p))) throw failure();
  return {actorId:s.actorId,authSessionId:s.authSessionId,warehouseId:s.warehouseId,
    actorStatus:s.actorStatus,warehouseStatus:s.warehouseStatus,
    warehouseConfirmed:s.warehouseConfirmed,permissions:s.permissions};
};
const prefixOf = (s: P19Scope) => 'p19-linked-private/v1/' +
  [s.actorId,s.authSessionId,s.warehouseId].join('/') + '/';

export function p19UnsubmittedLocalDrafts(
  service: P09Service,
  caseId?: string,
  store: KeyValueStorage = getAppStorage(),
): {items: P19LocalDraftChoice[]; unresolved: number} {
  if (!store.keys().some(k=>k.startsWith('p19-linked-private/v1/')))
    return {items:[],unresolved:0};
  const scope = scopeOf(service), prefix = prefixOf(scope);
  const items: P19LocalDraftChoice[] = [];
  let unresolved = 0;
  for (const key of store.keys().filter(k => k.startsWith(prefix))) {
    const id = key.slice(prefix.length);
    if (caseId && id !== caseId) continue;
    if (!ownerUuid(id)) { unresolved++; continue; }
    const loaded = p19LinkedJournal(scope,id,store).load();
    if (loaded.invalid || !loaded.checkpoint || typeof loaded.checkpoint !== 'object') {
      unresolved++; continue;
    }
    const row = loaded.checkpoint as Record<string, any>;
    if (row.pending) {
      const p=row.pending;
      if(!ownerUuid(p.key)||!['SAVE','RECORD'].includes(p.command)||
         p.caseId!==row.caseId||p.draftId!==row.draftId||p.scanSessionId!==row.scanSessionId||
         JSON.stringify(p.scope)!==JSON.stringify(scope)) unresolved++;
      continue; // Original SAVE/RECORD recovery has its own path.
    }
    if (row.unknown) { unresolved++; continue; }
    if (row.dirty !== true || row.result || row.phase === 'RECORDED' || row.phase === 'CANCELLED') continue;
    if (row.schema !== 'p19-linked-private-v1' || row.mode !== 'P03_LINKED_LOCAL_BATCH_ATOMIC_POST' ||
        row.caseId !== id || !ownerUuid(row.draftId) || !ownerUuid(row.scanSessionId) ||
        !Number.isSafeInteger(row.draftVersion) || row.draftVersion < 0 || row.phase !== 'DRAFT' ||
        row.recordRequest || row.recordEnvelope || !Array.isArray(row.rows) ||
        row.form?.p19?.contract !== 'p19-component-issue-linked-v1' ||
        row.form?.p19?.warranty_case_id !== id ||
        row.rows.some((r: any) => !r || typeof r.raw_code !== 'string' || !r.raw_code.trim() ||
          !Number.isSafeInteger(r.quantity) || r.quantity <= 0 ||
          !['CAMERA','SCANNER','HARDWARE','MANUAL'].includes(r.scan_source) ||
          !r.resolved || !['ITEM','BOX'].includes(r.resolved.item_type))) {
      unresolved++; continue;
    }
    const quantity = row.rows.reduce((n: number,r: any) => n+r.quantity,0);
    if (!Number.isSafeInteger(quantity)) { unresolved++; continue; }
    items.push({caseId:id,draftId:row.draftId,scanSessionId:row.scanSessionId,
      version:row.draftVersion,codeCount:row.rows.length,quantity,revision:JSON.stringify(row)});
  }
  return {items:items.sort((a,b)=>a.caseId.localeCompare(b.caseId)),unresolved};
}

export async function prepareP19LocalDraftResume(
  service: P09Service,
  target: P19LocalDraftChoice,
  store: KeyValueStorage = getAppStorage(),
) {
  const auth = captureSessionScope(), initial = scopeOf(service);
  if (auth.userId !== initial.actorId || auth.authSessionId !== initial.authSessionId ||
      auth.warehouseId !== initial.warehouseId) throw failure();
  const current = () => {
    if (!isSessionScopeCurrent(auth) || JSON.stringify(scopeOf(service)) !== JSON.stringify(initial)) throw failure();
    const row = p19UnsubmittedLocalDrafts(service,target.caseId,store).items.find(r =>
      r.caseId === target.caseId && r.draftId === target.draftId &&
      r.scanSessionId === target.scanSessionId && r.version === target.version && r.revision === target.revision);
    if (!row) throw failure();
    const retained = retainedP19Owner(service,target.caseId);
    if (retained) {
      const live=retained.snapshot();
      if(!retained.currentScope()||live.busy||live.unknown||live.request||
         JSON.stringify(retained.checkpoint()) !== row.revision) throw failure();
    }
  };
  current();
  const row = await service.detail(target.caseId); // GET only. No SAVE/RECORD.
  current();
  if (row.warranty_case_id !== target.caseId || !canEnterP19(service,row)) throw failure();
  return row;
}
