/** Explicit local component audit only; never imported by AppShell/Android. */
import React from 'react';
import {createRoot} from 'react-dom/client';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {View} from 'react-native';
import {ThemeProvider} from '../theme/ThemeProvider';
import {P12Screen} from '../features/documents/p12/P12Screen';
import {BottomNav} from '../ui/BottomNav';
import {createP12Service} from '../features/documents/p12/service';
import {createP12Controller} from '../features/documents/p12/controller';
import {setSession} from '../auth/session';
import {createMemoryBackend,createStorage,setAppStorageForTesting} from '../storage/storage';
import * as m from '../../__tests__/fixtures/p12Protocol';
import * as mix from '../../__tests__/fixtures/p12Mixed';
import {makeR10Transport} from './p12ReviewData';
import {localHandoffTimeline} from './p12HandoffReviewFixture';
import {P12_TIMELINE_CONTRACT, P12_TIMELINE_HEADER} from '../features/documents/p12/timelineHandoff';

declare global {interface Window {p12Local:Record<string,any>}}
const params=new URLSearchParams(location.search),scene=params.get('scene')??'S01',scenario=params.get('state')??'ready';
const handoffPreview=params.get('timeline')==='handoff';
setAppStorageForTesting(createStorage(createMemoryBackend()));
setSession({accessToken:'LOCAL_ONLY_NOT_A_CREDENTIAL',userId:m.actor,authSessionId:m.session,activeWarehouseId:m.warehouse});
window.fetch=async()=>{throw Error('P12 offline review forbids network fetch');};
const user={id:m.actor,auth_session_id:m.session,active_warehouse_id:m.warehouse,warehouse_context:{status:'READY' as const},available_warehouses:[{warehouse_id:m.warehouse,status:'ACTIVE',name:'Kho Hoa Nam'}],permissions:m.context().rights};
const transport=makeR10Transport(scenario),calls:any[]=[],client={async get(path:string,options:any={}){calls.push({path,query:options.query,method:'GET',body:options.body,headers:options.headers});const r=await transport(path,options.query??{},options.signal);if(!r.ok){const e:any=Error('Chưa đọc được nguồn local.');e.status=r.status;e.code=(await r.clone().json()).code;throw e;}let data=options.responseType==='blob'?await r.blob():await r.json();if(options.headers?.[P12_TIMELINE_HEADER]===P12_TIMELINE_CONTRACT){data=localHandoffTimeline(data);r.headers.set('Vary','Authorization, '+P12_TIMELINE_HEADER);}return {status:r.status,data,header:(k:string)=>r.headers.get(k)};}};
const service=createP12Service(()=>({user}),{client,origin:'https://p12.invalid',...(handoffPreview?{timelineContract:P12_TIMELINE_CONTRACT}:{})});
const c=createP12Controller(service);await c.load();
const target=transport.seed.find(r=>r.doc_no===(params.get('doc')??'PX-0011'))??transport.seed[0];
if(scene!=='S01'&&scene!=='S04'){await c.open(target.type,target.id);if(scene==='S03')await c.tab('products');if(scene==='files'||scene==='events')await c.tab(scene);}
if(scene==='S04')c.create();
const retained={current:{...c.snapshot(),createDraft:{supplierId:m.supplierId,supplierName:'Công ty Minh Phát',note:''}}};c.dispose();
window.p12Local={calls,seed:transport.seed,service,transport,scope:service.scopeKey(),ownerIntents:[],mix,scenario};
function Review(){return <main id="p12-review-app" style={{width:494,maxWidth:'100%',height:'100dvh',maxHeight:950,display:'flex',flexDirection:'column',margin:'0 auto',position:'relative',overflow:'hidden',background:'#fff'}}><SafeAreaProvider initialMetrics={{frame:{x:0,y:0,width:494,height:950},insets:{top:0,bottom:0,left:0,right:0}}}><ThemeProvider><View style={{flex:1,minHeight:0}}><P12Screen service={service} user={user} retained={retained} onBack={()=>{window.p12Local.back=true;}} onOwnerIntent={intent=>window.p12Local.ownerIntents.push(intent)} /></View>{scene!=='S04'?<BottomNav items={[{key:'home',label:'Trang chủ',icon:'home'},{key:'documents',label:'Chứng từ',icon:'approvals'},{key:'scan',label:'Quét mã',icon:'scan'},{key:'history',label:'Lịch sử',icon:'history'},{key:'profile',label:'Cá nhân',icon:'user'}]} selectedKey="documents" onSelect={()=>{}}/>:null}</ThemeProvider></SafeAreaProvider></main>}
createRoot(document.getElementById('root')!).render(<Review/>);
