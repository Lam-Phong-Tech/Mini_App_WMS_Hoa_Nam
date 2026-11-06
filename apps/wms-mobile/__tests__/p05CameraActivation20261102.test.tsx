// Real P05 callers + scanner with mocked camera bridge; no physical scan/BE claim.
import React from 'react';
import Renderer,{act} from 'react-test-renderer';
import {AppState,PermissionsAndroid,Platform} from 'react-native';
import {Camera} from 'react-native-camera-kit';
import {AppProviders} from '../src/app/App';
import {P05CreateNativeFlow} from '../src/features/outbound/P05CreateNativeFlow';
import {P05LinkedNativeFlow} from '../src/features/outbound/P05NativeFlow';
import {createP05CreateOwner} from '../src/features/outbound/p05CreateOwner';
import {createP05NativeOwner} from '../src/features/outbound/p05NativeOwner';
import {createMemoryBackend,createStorage,setAppStorageForTesting} from '../src/storage/storage';
import {Button} from '../src/ui/Button';
import {setTierCheckForTesting,resetTierCheckForTesting} from '../src/services/wms/tierCheck';
jest.mock('react-native-camera-kit',()=>({Camera:'NativeCameraBridge',CameraType:{Back:'back'}}));
let tree:Renderer.ReactTestRenderer|undefined;
const id='05050505-0505-4505-8505-000000000005';
const originalState=AppState.currentState;
beforeEach(()=>{
  jest.replaceProperty(Platform,'OS','android');AppState.currentState='active';
  jest.spyOn(PermissionsAndroid,'check').mockResolvedValue(true);
  setTierCheckForTesting({status:'matched',expected:'dev-test'});
  setAppStorageForTesting(createStorage(createMemoryBackend()));
});
afterEach(async()=>{if(tree)await act(()=>tree!.unmount());tree=undefined;AppState.currentState=originalState;jest.restoreAllMocks();resetTierCheckForTesting();});
test.each(['manual','linked'] as const)('%s P05 idle caller allows explicit camera activation and never sends a transaction',async mode=>{
  const storage=createStorage(createMemoryBackend());
  const base=mode==='manual'?createP05CreateOwner({storage}):createP05NativeOwner({storage,onChange:()=>{}});
  const state:any={...base.snapshot(),step:2,busy:false,scanBusy:false,unknown:false,pending:null,error:'',accepted:[],attempts:[],dirty:false,
    context:{active_warehouse_id:id,available_warehouses:[{warehouse_id:id,name:'Kho TEST'}],permissions:{record:true}},
    document:{number:'PX-TEST',warehouseName:'Kho TEST',recipient:'Khách TEST',planned:1},source:{source_document_id:id},
  };
  if(mode==='manual')state.form={...state.form,plannedInput:'1'};
  const scan=jest.fn(),send=jest.fn(),save=jest.fn();
  const owner:any={...base,snapshot:()=>state,start:()=>{},initialize:async()=>true,leave:()=>{},isDirty:()=>false,errors:()=>({}),scan,send,save};
  await act(async()=>{tree=Renderer.create(<AppProviders>{mode==='manual'
    ? <P05CreateNativeFlow owner={owner} onExit={()=>{}}/>
    : <P05LinkedNativeFlow owner={owner} returnDocumentId={id} onExit={()=>{}}/>}</AppProviders>);});
  expect(tree!.root.findAllByType(Camera)).toHaveLength(0);
  const activate=tree!.root.findAllByType(Button).find(n=>n.props.label==='Bật camera')!;
  expect(activate.props.disabled).toBe(false);
  await act(async()=>activate.props.onPress());
  expect(tree!.root.findAllByType(Camera)).toHaveLength(1);
  expect(scan).not.toHaveBeenCalled();expect(save).not.toHaveBeenCalled();expect(send).not.toHaveBeenCalled();
});
