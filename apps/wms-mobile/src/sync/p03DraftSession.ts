import {AppError,toAppError} from '../errors/AppError';
import {getActiveSession} from '../auth/session';
import {p03DraftRepository,type P03DraftEntry} from './draftStore';
import {createP03Identity,createP03RequestId,p03Scope,sameP03Scope,p03Drafts,p03ErrorDisposition,loadP03Environment,requireP03Permission,type P03Body,type P03Draft,type P03Operation,type P03Scope} from '../services/wms/p03Drafts';

export function retainedP03Draft(operation:P03Operation):P03DraftEntry|undefined{
  let scope:P03Scope;try{scope=p03Scope();}catch{return;}
  return p03DraftRepository().list().find(d=>sameP03Scope(scope,d.scope)&&d.body.operation===operation&&(!d.server||d.server.status==='DRAFT'));
}
export function createP03DraftSession(operation:P03Operation,entry?:P03DraftEntry,service=p03Drafts,repo=p03DraftRepository(),authorize=async(action:'save'|'cancel'|'read',scope:P03Scope)=>requireP03Permission(await loadP03Environment(),scope,operation,action)){
  let current=entry,busy=false;
  const owned=()=>{if(!current||!sameP03Scope(current.scope,p03Scope(getActiveSession())))throw new AppError({kind:'auth',code:'P03_SESSION_CHANGED',message:'Nháp không thuộc phiên/kho hiện tại.'});return current;};
  const put=(d:P03DraftEntry)=>{repo.put(d);current=d;return d;};
  function snapshot(body:Omit<P03Body,'operation'|'warehouse_id'|'scan_session_id'>,viewState?:unknown){
    const scope=p03Scope();if(!current){const identity=createP03Identity();current={id:identity.documentId,identity,scope,body:{...body,warehouse_id:scope.warehouseId,operation,scan_session_id:identity.scanSessionId},viewState};}
    const d=owned();if(d.pending||d.server&&d.server.status!=='DRAFT')return d;
    return put({...d,body:{...body,warehouse_id:scope.warehouseId,operation,scan_session_id:d.identity.scanSessionId},viewState});
  }
  function error(cause:unknown){const d=current!,e=toAppError(cause),kind=p03ErrorDisposition(e);put({...d,pending:{...d.pending!,outcome:kind==='UNKNOWN'?'UNKNOWN':kind==='CONFLICT'?'CONFLICT':'FAILED',errorCode:e.code}});throw e;}
  async function run(command:'SAVE'|'CANCEL',retry=false){
    if(busy)throw new AppError({kind:'config',message:'Yêu cầu đang xử lý.'});const d=owned();busy=true;
    try{
      await authorize(command==='SAVE'?'save':'cancel',d.scope);
      if(!retry&&d.pending)throw new AppError({kind:'config',code:'DRAFT_OUTCOME_UNKNOWN',message:'Cần đối chiếu request đang có.'});
      if(retry&&(!d.pending?.retryAllowed||d.pending.command!==command))throw new AppError({kind:'config',message:'Chưa được phép retry cùng request.'});
      if(command==='CANCEL'&&(!d.server||d.server.status!=='DRAFT'||d.server.business_document_id||d.server.business_status==='POSTED'||!d.receipt||d.receipt.command!=='SAVE'||d.receipt.version!==d.server.version))throw new AppError({kind:'config',code:'DRAFT_STATE_CONFLICT',message:'Nháp chưa đủ điều kiện hủy.'});
      const p=retry?d.pending!:{command,requestId:createP03RequestId(),version:d.server?.version??0,body:command==='SAVE'?JSON.parse(JSON.stringify(d.body)):{confirmed:d.receipt!.request_id,reason:'Người dùng hủy bản nháp'},outcome:'IN_FLIGHT' as const};
      put({...d,pending:{...p,outcome:'IN_FLIGHT'}});
      try{
        const result=command==='SAVE'?await service.save(d.scope,d.identity,p.body as P03Body,p.requestId,p.version):await service.cancel(d.scope,d.identity,operation,p.version,p.requestId,(p.body as {confirmed:string}).confirmed,(p.body as {reason:string}).reason);
        owned();return put({...current!,server:result.document,receipt:result.receipt,pending:undefined});
      }catch(e){return error(e);}
    }finally{busy=false;}
  }
  return{
    get entry(){return current;},get busy(){return busy;},snapshot,
    save:()=>run('SAVE'),cancel:()=>run('CANCEL'),
    retry:()=>run(owned().pending!.command as 'SAVE'|'CANCEL',true),
    async reconcile(){if(busy)throw new AppError({kind:'config',message:'Đang đối chiếu.'});const d=owned(),p=d.pending;if(!p)return d;busy=true;
      try{await authorize('read',d.scope);const result=await service.reconcile(d.scope,d.identity,operation,p.requestId,p.command);owned();if(result.outcome==='SUCCEEDED'&&result.document&&result.receipt)return put({...d,server:result.document,receipt:result.receipt,pending:undefined});return put({...d,pending:{...p,outcome:'UNKNOWN',retryAllowed:result.retry==='SAME_REQUEST_ONLY'}});}finally{busy=false;}},
    async refresh(server:P03Draft){const d=owned();if(d.pending)throw new AppError({kind:'config',message:'Cần đối chiếu request trước.'});return put({...d,server,receipt:undefined});},
  };
}
