import {p14VerifiedP04Number} from '../src/shift/p14DraftOverview';
import {createMemoryBackend,createStorage} from '../src/storage/storage';
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const scope={actorId:id(1),authSessionId:id(2),warehouseId:id(3)};
function fixture(){
  const store=createStorage(createMemoryBackend());
  const item={document_id:id(4),scan_session_id:id(5),auth_session_id:id(2),warehouse_id:id(3),operation:'INBOUND',status:'DRAFT',version:1,title:null} as any;
  const run={scope,nameMode:'BE_DOCUMENT_NO',identity:{documentId:id(4),scanSessionId:id(5)},closed:false,server:{...item,actor_id:id(1),document_no:'PN-TEST-1'},saveReceipt:{...item,command:'SAVE',outcome:'SUCCEEDED'}};
  store.setObject('p04.runs.v1/test',run);return{store,item,run};
}
test('number display joins only an exact same-version verified SAVE; it never mutates DTO/storage',()=>{
  const h=fixture(),before=h.store.getString('p04.runs.v1/test');expect(p14VerifiedP04Number(h.item,scope,h.store)).toBe('PN-TEST-1');expect(h.item.title).toBeNull();expect(h.store.getString('p04.runs.v1/test')).toBe(before);
});
test.each(['version','scope','receipt','scan'])('stale/foreign %s cannot supply a number',kind=>{
  const h=fixture();if(kind==='version')h.run.server.version=2;if(kind==='scope')h.run.scope={...scope,actorId:id(9)};if(kind==='receipt')h.run.saveReceipt.outcome='UNKNOWN';if(kind==='scan')h.run.server.scan_session_id=id(8);
  h.store.setObject('p04.runs.v1/test',h.run);expect(p14VerifiedP04Number(h.item,scope,h.store)).toBeUndefined();
});
test('server title wins and conflicting local numbers are not guessed',()=>{
  const h=fixture();h.item.title='SERVER';expect(p14VerifiedP04Number(h.item,scope,h.store)).toBeUndefined();h.item.title=null;
  h.store.setObject('p04.runs.v1/other',{...h.run,server:{...h.run.server,document_no:'PN-OTHER'}});expect(p14VerifiedP04Number(h.item,scope,h.store)).toBeUndefined();
});
