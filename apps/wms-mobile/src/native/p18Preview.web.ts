import type {PDFWorker,PDFDocumentProxy,RenderTask} from 'pdfjs-dist';
// Use the package's matching compatibility API/worker pair; some supported
// Chromium clients do not yet provide Uint8Array byte-encoding methods.
import BrowserPDFWorker from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?worker';

export interface P18Preview {id:string;mime:string;pages:number;width:number;height:number;uri?:string;bytes:number;getText?:(page:number)=>Promise<string>}
export interface P18Page {uri:string;width:number;height:number}
type Entry={info:P18Preview;urls:Set<string>;pages:Map<string,P18Page>;tasks:Set<RenderTask>;pdf?:PDFDocumentProxy;loading?:ReturnType<typeof import('pdfjs-dist')['getDocument']>;worker?:PDFWorker;port?:Worker};
const entries=new Map<string,Entry>();
const allowed=new Set(['application/pdf','image/png','image/jpeg','image/webp']);
const positive=(n:number)=>Number.isSafeInteger(n)&&n>0;
const closed=()=>new Error('Đã đóng lượt xem.');
const current=(entry:Entry)=>entries.get(entry.info.id)===entry;
function release(entry:Entry){
  for(const task of entry.tasks)task.cancel();
  entry.tasks.clear();
  for(const uri of entry.urls)URL.revokeObjectURL(uri);
  entry.urls.clear();entry.pages.clear();
  // Neither document bytes nor rendered pages are persisted or sent elsewhere.
  const port=entry.port,worker=entry.worker;
  if(entry.loading){const timer=setTimeout(()=>port?.terminate(),1000);void entry.loading.destroy().catch(()=>{}).finally(()=>{clearTimeout(timer);worker?.destroy();port?.terminate();});}
  else {worker?.destroy();port?.terminate();}
}
export async function openP18Preview(blob:Blob,mime:string,signal?:AbortSignal):Promise<P18Preview>{
  if(!blob.size||blob.size>20*1024*1024||!allowed.has(mime)||(blob.type&&blob.type.split(';')[0]!==mime))throw new Error('Bộ xem hỗ trợ PDF/ảnh tối đa 20 MiB. Tệp gốc vẫn có thể tải xuống.');
  if(signal?.aborted)throw closed();
  const info:P18Preview={id:crypto.randomUUID(),mime,pages:1,width:0,height:0,bytes:blob.size};
  const entry:Entry={info,urls:new Set(),pages:new Map(),tasks:new Set()};
  try{
    if(mime!=='application/pdf'){
      const uri=URL.createObjectURL(blob);entry.urls.add(uri);
      const size=await new Promise<{width:number;height:number}>((resolve,reject)=>{
        const image=new Image();
        const clean=()=>signal?.removeEventListener('abort',abort);
        const abort=()=>{clean();image.onload=null;image.onerror=null;image.src='';reject(closed());};
        image.onload=()=>{clean();resolve({width:image.naturalWidth,height:image.naturalHeight});};
        image.onerror=()=>{clean();reject(new Error('Không đọc được ảnh từ tệp nguồn.'));};
        signal?.addEventListener('abort',abort,{once:true});image.src=uri;
      });
      if(!positive(size.width)||!positive(size.height)||size.width*size.height>40_000_000)throw new Error('Kích thước ảnh vượt giới hạn xem trong app. Tệp gốc vẫn có thể tải xuống.');
      Object.assign(info,size,{uri});
    }else{
      const data=new Uint8Array(await blob.arrayBuffer());
      if(signal?.aborted)throw closed();
      const {getDocument,PDFWorker}=await import('pdfjs-dist/legacy/build/pdf.mjs');
      if(signal?.aborted)throw closed();
      entry.port=new BrowserPDFWorker({name:'hn-p18-document'});
      entry.worker=PDFWorker.create({port:entry.port});
      const task=getDocument({data,worker:entry.worker,enableXfa:false,useSystemFonts:true,disableAutoFetch:true,disableStream:true,stopAtErrors:true});
      entry.loading=task;
      let abort:()=>void=()=>{};
      const aborted=new Promise<never>((_resolve,reject)=>{abort=()=>{void task.destroy().catch(()=>{});reject(closed());};signal?.addEventListener('abort',abort,{once:true});});
      try{
        entry.pdf=await Promise.race([task.promise,aborted]);
        if(signal?.aborted)throw closed();
        if(!positive(entry.pdf.numPages)||entry.pdf.numPages>10000)throw new Error('Số trang ngoài giới hạn xem tài liệu.');
        const first=await Promise.race([entry.pdf.getPage(1),aborted]),view=first.getViewport({scale:1});
        Object.assign(info,{pages:entry.pdf.numPages,width:Math.ceil(view.width),height:Math.ceil(view.height)});
        if(!positive(info.width)||!positive(info.height))throw new Error('Trang xem chưa có kích thước hợp lệ.');
        info.getText=async page=>{
          if(!current(entry))throw closed();
          if(!Number.isInteger(page)||page<1||page>info.pages)throw new Error('Trang ngoài phạm vi tài liệu.');
          const source=await entry.pdf!.getPage(page),text=await source.getTextContent({disableNormalization:true});
          if(!current(entry))throw closed();
          return text.items.map(item=>'str' in item?item.str+(item.hasEOL?'\n':' '):'').join('').trim();
        };
      }finally{signal?.removeEventListener('abort',abort);}
    }
    if(signal?.aborted)throw closed();
    entries.set(info.id,entry);return info;
  }catch(error){release(entry);throw error;}
}
export async function renderP18Page(preview:P18Preview,page:number,width:number):Promise<P18Page>{
  const entry=entries.get(preview.id);
  if(!entry||entry.info!==preview)throw closed();
  if(!Number.isInteger(page)||page<1||page>preview.pages)throw new Error('Trang ngoài phạm vi tài liệu.');
  if(!Number.isFinite(width))throw new Error('Kích thước trang chưa hợp lệ.');
  if(preview.uri)return {uri:preview.uri,width:preview.width,height:preview.height};
  const target=Math.max(200,Math.min(1800,Math.round(width))),key=page+':'+target;
  const cached=entry.pages.get(key);if(cached)return cached;
  const source=await entry.pdf!.getPage(page);if(!current(entry))throw closed();
  const base=source.getViewport({scale:1}),view=source.getViewport({scale:target/base.width});
  const canvas=document.createElement('canvas');canvas.width=Math.ceil(view.width);canvas.height=Math.ceil(view.height);
  if(!positive(canvas.width)||!positive(canvas.height)||canvas.width*canvas.height>16_000_000)throw new Error('Trang quá lớn để xem trong app. Tệp gốc vẫn có thể tải xuống.');
  const task=source.render({canvas,viewport:view,background:'#ffffff'});entry.tasks.add(task);
  try{
    await task.promise;if(!current(entry))throw closed();
    const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('Không dựng được trang tài liệu.')),'image/png'));
    if(!current(entry))throw closed();
    const result={uri:URL.createObjectURL(blob),width:canvas.width,height:canvas.height};entry.urls.add(result.uri);entry.pages.set(key,result);
    // Keep only three page/zoom rasters per exact document instance.
    while(entry.pages.size>3){const first=entry.pages.entries().next().value!;entry.pages.delete(first[0]);entry.urls.delete(first[1].uri);URL.revokeObjectURL(first[1].uri);}
    return result;
  }finally{entry.tasks.delete(task);canvas.width=0;canvas.height=0;}
}
export function closeP18Preview(id:string):void {const entry=entries.get(id);if(!entry)return;entries.delete(id);release(entry);}
if(import.meta.hot)import.meta.hot.dispose(()=>{for(const id of entries.keys())closeP18Preview(id);});
