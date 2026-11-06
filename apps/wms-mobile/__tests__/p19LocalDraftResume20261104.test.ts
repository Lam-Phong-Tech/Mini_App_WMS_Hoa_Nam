import {p19UnsubmittedLocalDrafts,prepareP19LocalDraftResume} from '../src/features/warranty/p19/p19LocalDrafts';
import {p19LinkedJournal} from '../src/features/warranty/p19/p19LinkedJournal';
import {createP19NativeController} from '../src/features/warranty/p19/p19NativeController';
import {retainP19Owner} from '../src/features/warranty/p19/p19OwnerRegistry';
import {p19LocalPendingTasks} from '../src/features/warranty/p19/p19OriginalRecovery';
import {createMemoryBackend,createStorage,setAppStorageForTesting} from '../src/storage/storage';
import {setSession,clearSession} from '../src/auth/session';
import {linkedServer,scope,id} from './fixtures/p19LinkedServer';
import type {P09Service} from '../src/services/wms/p09Warranty';
import type {P19Scope} from '../src/features/warranty/p19/p19Types';

async function setup(){
  const store=createStorage(createMemoryBackend());setAppStorageForTesting(store);clearSession();
  const trusted={...scope,permissions:[...scope.permissions,'documents.read']} as P19Scope;
  setSession({accessToken:'unit-only',userId:trusted.actorId,authSessionId:trusted.authSessionId,activeWarehouseId:trusted.warehouseId});
  const server=linkedServer(),journal=p19LinkedJournal(trusted,id(4),store);let seq=800;
  const controller=createP19NativeController({getScope:()=>trusted,caseId:id(4),presentation:{caseLabel:'TEST-CASE',status:'CHECKING'},offlineRequest:server.request,journal,uuid:()=>id(++seq)});
  const row={warranty_case_id:id(4),status:'CHECKING',version:1,ownerScope:{source:'P09_META',policy:'PERSISTED_WARRANTY_OWNER_BEFORE_TOTAL',warehouseId:trusted.warehouseId}};
  const detail=jest.fn(async()=>row),service={componentScope:()=>trusted,scope:()=>trusted,contextKey:()=>JSON.stringify(trusted),detail} as unknown as P09Service;
  expect(await controller.initialize()).toBe(true);
  expect((await controller.flow.scan('ITEM1','MANUAL')).kind).toBe('accepted');
  retainP19Owner(service,id(4),controller);
  return {store,trusted,server,journal,controller,row,service,detail};
}
afterEach(()=>{jest.restoreAllMocks();clearSession();});
test('dirty-only local draft is discoverable and resumes exact IDs without any SAVE/RECORD',async()=>{
  const h=await setup(),before=h.store.getString(h.store.keys().find(k=>k.startsWith('p19-linked-private/'))!)!;
  const found=p19UnsubmittedLocalDrafts(h.service,undefined,h.store);expect(found.unresolved).toBe(0);expect(found.items).toHaveLength(1);
  const target=found.items[0];expect(target.codeCount).toBe(1);expect(target.quantity).toBe(1);
  expect(await prepareP19LocalDraftResume(h.service,target,h.store)).toBe(h.row);
  expect(h.detail).toHaveBeenCalledWith(id(4));expect(h.server.writes).toBe(0);
  expect(h.store.getString(h.store.keys().find(k=>k.startsWith('p19-linked-private/'))!)).toBe(before);
  let seq=900;const restored=createP19NativeController({getScope:()=>h.trusted,caseId:id(4),presentation:{caseLabel:'TEST-CASE',status:'CHECKING'},offlineRequest:h.server.request,journal:h.journal,checkpoint:h.journal.load().checkpoint,uuid:()=>id(++seq)});
  expect(await restored.initialize()).toBe(true);
  expect((restored.checkpoint() as any).draftId).toBe(target.draftId);
  expect((restored.checkpoint() as any).scanSessionId).toBe(target.scanSessionId);
  expect((restored.checkpoint() as any).rows).toEqual((h.controller.checkpoint() as any).rows);
  expect(h.server.writes).toBe(0);
});
test('zero accepted codes still retains dirty local draft; it is not a successful empty list',async()=>{
  const h=await setup(),c=h.controller.checkpoint() as any;c.rows=[];h.journal.write(c);
  const found=p19UnsubmittedLocalDrafts(h.service,undefined,h.store);expect(found.items).toHaveLength(1);expect(found.items[0].codeCount).toBe(0);
});
test('pending original SAVE stays on existing recovery path and is never downgraded to local resume',async()=>{
  const h=await setup(),c=h.controller.checkpoint() as any;
  c.pending={key:id(99),command:'SAVE',caseId:c.caseId,draftId:c.draftId,scanSessionId:c.scanSessionId,scope:h.trusted};c.unknown=true;h.journal.write(c);
  expect(p19UnsubmittedLocalDrafts(h.service,undefined,h.store).items).toHaveLength(0);
  expect(p19LocalPendingTasks(h.service)).toHaveLength(1);
  expect((h.journal.load().checkpoint as any).pending.key).toBe(id(99));
});
test('foreign scope, UNKNOWN and malformed checkpoints cannot become resumable drafts',async()=>{
  const h=await setup(),c=h.controller.checkpoint() as any;
  c.unknown=true;h.journal.write(c);expect(p19UnsubmittedLocalDrafts(h.service,undefined,h.store)).toEqual({items:[],unresolved:1});
  c.unknown=false;c.mode='UNTRUSTED';h.journal.write(c);expect(p19UnsubmittedLocalDrafts(h.service,undefined,h.store).unresolved).toBe(1);
  c.mode='P03_LINKED_LOCAL_BATCH_ATOMIC_POST';c.scope={...c.scope,warehouseId:id(98)};
  h.store.setObject(h.store.keys().find(k=>k.startsWith('p19-linked-private/'))!,c);
  expect(p19UnsubmittedLocalDrafts(h.service,undefined,h.store).items).toHaveLength(0);
});
test('multiple case journals require explicit exact target; case filter does not choose another case',async()=>{
  const h=await setup(),c=h.controller.checkpoint() as any;
  const second={...c,caseId:id(5),draftId:id(850),scanSessionId:id(851),form:{p19:{contract:'p19-component-issue-linked-v1',warranty_case_id:id(5)}}};
  p19LinkedJournal(h.trusted,id(5),h.store).write(second);
  expect(p19UnsubmittedLocalDrafts(h.service,undefined,h.store).items).toHaveLength(2);
  expect(p19UnsubmittedLocalDrafts(h.service,id(5),h.store).items.map(x=>x.caseId)).toEqual([id(5)]);
});
test('journal revision or auth changes while GET is in flight blocks navigation and preserves data',async()=>{
  const h=await setup(),target=p19UnsubmittedLocalDrafts(h.service,undefined,h.store).items[0];let finish!:(x:any)=>void;
  h.detail.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
  const request=prepareP19LocalDraftResume(h.service,target,h.store);
  const c=h.controller.checkpoint() as any;c.form.p19.note='changed while reading';h.journal.write(c);finish(h.row);
  await expect(request).rejects.toThrow();expect((h.journal.load().checkpoint as any).form.p19.note).toBe('changed while reading');
  expect(h.server.writes).toBe(0);
});
test('revoked rights, busy retained owner and case no longer allowing issue cannot resume',async()=>{
  const h=await setup(),target=p19UnsubmittedLocalDrafts(h.service,undefined,h.store).items[0];
  const busy=jest.spyOn(h.controller,'snapshot').mockReturnValue({...h.controller.snapshot(),busy:true});
  await expect(prepareP19LocalDraftResume(h.service,target,h.store)).rejects.toThrow();busy.mockRestore();
  h.detail.mockResolvedValueOnce({...h.row,status:'RETURNED'});
  await expect(prepareP19LocalDraftResume(h.service,target,h.store)).rejects.toThrow();
  h.trusted.permissions=h.trusted.permissions.filter(p=>p!=='warranty.component_issue');
  await expect(prepareP19LocalDraftResume(h.service,target,h.store)).rejects.toThrow();expect(h.server.writes).toBe(0);
});
test('logout during fresh case GET does not navigate or create a replacement draft',async()=>{
  const h=await setup(),target=p19UnsubmittedLocalDrafts(h.service,undefined,h.store).items[0];let finish!:(x:any)=>void;
  h.detail.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));const request=prepareP19LocalDraftResume(h.service,target,h.store);
  clearSession();finish(h.row);await expect(request).rejects.toThrow();expect(h.server.writes).toBe(0);
  expect((h.journal.load().checkpoint as any).draftId).toBe(target.draftId);
});
