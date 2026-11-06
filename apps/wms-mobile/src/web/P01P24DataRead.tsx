/** DEV QA reader: only owner GETs. No token input/export, resolver or mutation. */
import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { hydrateSession, getSession, captureSessionScope, isSessionScopeCurrent, subscribeSession } from '../auth/session';
import { runP01P24ReadSmoke } from './p01p24ReadSmoke';
import { p06Catalog } from '../services/wms/p06Catalog';
import type { P06ListCard, P06Context } from '../services/wms/p06Types';

type SourcePage = { path: string; page: number; total: number; returned: number; request_id: string; at: string };
type SafeSku = Pick<P06ListCard, 'sku_id'|'sku_code'|'sku_name'|'sku_type'|'sku_status'|'unit'>;
type Candidate = SafeSku & { item_id: string; serial_number: string; item_status: string|null; payload: string; payload_source: 'P06_SERIAL_NUMBER'; write_approved: false };
type Result = { contract: string; tested_at: string; warehouse_id: string; snapshot_consistency: string; sku_total: number; skus: SafeSku[]; candidates: Candidate[]; pages: SourcePage[]; source_errors: { source: string; code: string; message: string }[]; writes_performed: 0; write_scope: 'AWAITING_APPROVED_TEST_SCOPE' };

const safeSku = (row: P06ListCard): SafeSku => ({ sku_id:row.sku_id,sku_code:row.sku_code,sku_name:row.sku_name,sku_type:row.sku_type,sku_status:row.sku_status,unit:row.unit });
const errorInfo = (source: string, error: unknown) => {
  const value = error as { code?: string; message?: string };
  return { source, code:value.code??'READ_UNVERIFIED', message:value.message??'Không đọc được nguồn.' };
};
function save(name: string, body: string, type='application/json') {
  const url=URL.createObjectURL(new Blob([body],{type}));
  const link=document.createElement('a'); link.href=url;link.download=name;link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function csv(rows: SafeSku[]) {
  const cell=(value: unknown)=>'"'+String(value??'').replace(/^[=+@-]/,"'$&").replaceAll('"','""')+'"';
  return '\ufeff'+[['sku_id','sku_code','sku_name','sku_type','sku_status','unit'],...rows.map(row=>[row.sku_id,row.sku_code,row.sku_name,row.sku_type,row.sku_status,row.unit])].map(row=>row.map(cell).join(',')).join('\r\n');
}
function App() {
  const [busy,setBusy]=useState(false),[status,setStatus]=useState('Chưa đọc dữ liệu.'),[result,setResult]=useState<Result>();
  const [smoke,setSmoke]=useState<Awaited<ReturnType<typeof runP01P24ReadSmoke>>>();
  const epoch=useRef(0);
  useEffect(()=>{
    const invalidate=()=>{epoch.current++;setResult(undefined);setSmoke(undefined);setStatus('Ngữ cảnh dữ liệu/phiên đã đổi. Đọc lại trước khi xuất.');};
    const unsubscribe=subscribeSession(invalidate);window.addEventListener('storage',invalidate);
    return ()=>{unsubscribe();window.removeEventListener('storage',invalidate);};
  },[]);
  async function read() {
    if(busy)return; setBusy(true);setResult(undefined);setSmoke(undefined);
    try {
      await hydrateSession();
      if(!getSession()?.userId||!getSession()?.authSessionId||!getSession()?.activeWarehouseId)
        throw Error('Cần đăng nhập và xác nhận kho trong app chính trước, rồi tải lại trang QA. Không dán token vào đây.');
      const scope=captureSessionScope(),ticket=epoch.current;
      const guard=()=>{if(ticket!==epoch.current||!isSessionScopeCurrent(scope))throw Error('Phiên/kho đã đổi. Không xuất dữ liệu cũ.');};
      const context=await p06Catalog.context(); guard();
      const c:P06Context=context.data;
      if(c.warehouse_context.status!=='READY'||!c.active_warehouse_id)throw Error('Kho chưa được xác nhận.');
      const pages:SourcePage[]=[],skus:SafeSku[]=[],seen=new Set<string>();
      let total:number|undefined,lastPage=1;
      for(let page=1;page<=lastPage;page++) {
        setStatus('Đang đọc SKU ACTIVE - trang '+page+'...');
        const data=await p06Catalog.list(c,'SKU',{status:'ACTIVE',sku_type:'ALL',page,per_page:100}); guard();
        if(total!==undefined&&total!==data.meta.total)throw Error('Tổng danh mục đổi giữa các trang. Đọc lại, không coi là snapshot đóng băng.');
        total=data.meta.total;lastPage=data.meta.last_page;
        if(lastPage>100)throw Error('Nguồn quá lớn cho lần xuất QA này.');
        pages.push({path:'/api/v1/mini-app/catalog/skus',page,total:data.meta.total,returned:data.data.length,request_id:data.meta.request_id,at:data.meta.timestamp});
        for(const row of data.data){if(row.sku_status!=='ACTIVE'||seen.has(row.sku_id))throw Error('Danh mục ACTIVE bị trùng/sai trạng thái.');seen.add(row.sku_id);skus.push(safeSku(row));}
      }
      if(total!==skus.length)throw Error('Chưa đọc đủ danh mục đã xác nhận. Không dùng độ dài trang thay tổng.');
      const errors:Result['source_errors']=[],items:P06ListCard[]=[];
      for(const itemStatus of ['NEW','ISSUED','IN_STOCK']) {
        setStatus('Đang đọc hiện vật '+itemStatus+'...');
        try {
          const data=await p06Catalog.list(c,'ITEM',{status:'ACTIVE',sku_type:'PRODUCT',item_status:itemStatus,page:1,per_page:100});guard();
          pages.push({path:'/api/v1/mini-app/catalog/items?item_status='+itemStatus,page:1,total:data.meta.total,returned:data.data.length,request_id:data.meta.request_id,at:data.meta.timestamp});
          for(const row of data.data)if(row.item_status===itemStatus&&row.serial_number&&row.item_id&&seen.has(row.sku_id))items.push(row);
        } catch(error) { guard();errors.push(errorInfo(itemStatus,error)); }
      }
      const selected:P06ListCard[]=[],selectedSkus=new Set<string>();
      // Mix states when available. Never claim one serial is valid for all owners.
      for(const state of ['NEW','ISSUED','IN_STOCK','ISSUED','IN_STOCK','NEW','IN_STOCK','ISSUED']) {
        const row=items.find(item=>item.item_status===state&&!selectedSkus.has(item.sku_id));
        if(row){selected.push(row);selectedSkus.add(row.sku_id);} if(selected.length===5)break;
      }
      const candidates:Candidate[]=selected.map(row=>({...safeSku(row),item_id:row.item_id!,serial_number:row.serial_number!,item_status:row.item_status,payload:row.serial_number!,payload_source:'P06_SERIAL_NUMBER',write_approved:false}));
      guard();
      setResult({contract:'mini-app-p06-v1',tested_at:new Date().toISOString(),warehouse_id:c.active_warehouse_id,snapshot_consistency:'SERVER_PAGED_NOT_FROZEN',sku_total:total??0,skus,candidates,pages,source_errors:errors,writes_performed:0,write_scope:'AWAITING_APPROVED_TEST_SCOPE'});
      setStatus('Đã đọc '+skus.length+' SKU ACTIVE; chọn '+candidates.length+'/5 serial hiện có. Chưa được duyệt ghi thử.');
    } catch(error) {setStatus(errorInfo('QA',error).message);} finally{setBusy(false);}
  }
  async function smokeReads(){
    if(busy||!result)return;setBusy(true);setSmoke(undefined);const ticket=epoch.current;
    try{const c=await p06Catalog.context();if(c.data.active_warehouse_id!==result.warehouse_id)throw Error('Kho đã đổi; đọc lại bộ mã.');const output=await runP01P24ReadSmoke(c.data,result.candidates,setStatus);if(ticket!==epoch.current)throw Error('Phiên/nguồn đã đổi; bỏ kết quả cũ.');setSmoke(output);setStatus('Xong smoke GET. HTTP 200 không thay nghiệm thu UI, ghi hoặc thiết bị.');}
    catch(error){setStatus(errorInfo('SMOKE',error).message);}finally{setBusy(false);}
  }
  return <main><h1>Dữ liệu QA P01-P24</h1><p><b>CHỈ ĐỌC DEV/TEST.</b> Không tạo/nhập/xuất, không ghi NFC, không thay mật khẩu hoặc kết thúc ca.</p><p>Đăng nhập tại <a href="/test-preview/p01-p24-20261014/" target="_blank" rel="noreferrer">app chính</a>. Trang này dùng auth owner sẵn có, không có ô nhập token.</p><button disabled={busy} onClick={()=>void read()}>{busy?'Đang đọc...':'Đọc danh mục ACTIVE và chọn 5 mã thật'}</button><p role="status">{status}</p>{result&&<><p>Kho: {result.warehouse_id}. Tổng server và số đã đọc: {result.sku_total}. Phân trang không phải snapshot đóng băng.</p><button onClick={()=>save('active-skus-dev-20261014.csv',csv(result.skus),'text/csv;charset=utf-8')}>Tải danh sách ACTIVE CSV</button><button onClick={()=>save('qr-source-dev-20261014.json',JSON.stringify(result,null,2))}>Tải nguồn 5 QR và bằng chứng GET</button><button disabled={busy} onClick={()=>void smokeReads()}>Chạy smoke API chỉ đọc P01-P24</button><table><thead><tr><th>SKU</th><th>Tên</th><th>Serial / payload QR</th><th>Trạng thái hiện vật</th></tr></thead><tbody>{result.candidates.map(row=><tr key={row.item_id}><td>{row.sku_code}</td><td>{row.sku_name}</td><td><code>{row.serial_number}</code></td><td>{row.item_status??'Chưa xác minh'}</td></tr>)}</tbody></table><p>ACTIVE là trạng thái SKU, không phải điều kiện đủ để nhập/xuất/bảo hành. Mọi ca ghi phải được owner kiểm lại với kho/tài khoản TEST đã duyệt. Không đổi trạng thái hoặc tự sinh serial để đủ bộ.</p><pre>{JSON.stringify(result.source_errors,null,2)}</pre></>}{smoke&&<><h2>Kết quả GET - không phải full UAT</h2><button onClick={()=>save('p01-p24-read-smoke-20261014.json',JSON.stringify(smoke,null,2))}>Tải báo cáo GET đã che dữ liệu</button><table><thead><tr><th>Nhóm</th><th>Đọc</th><th>HTTP</th><th>Kết quả / code</th></tr></thead><tbody>{smoke.rows.map((row,index)=><tr key={index}><td>{row.board}</td><td>{row.name}</td><td>{row.status??'Chưa chạy'}</td><td>{row.result} {row.code}</td></tr>)}</tbody></table></>}</main>;
}
createRoot(document.getElementById('root')!).render(<App/>);
