// Browser permission API fixtures; not optical/hardware acceptance.
import React from 'react';
import Renderer, {act} from 'react-test-renderer';
import {AppState, type AppStateStatus} from 'react-native';
const {useCameraPermission} = jest.requireActual('../src/scanner/useCameraPermission.web');
let view: {state:string;request():Promise<void>;recheck():Promise<void>}, tree: Renderer.ReactTestRenderer | undefined;
let originals: Record<string, PropertyDescriptor | undefined>;
const stop = jest.fn(), getUserMedia = jest.fn();
function Probe(){view=useCameraPermission();return null;}
beforeEach(()=>{
  originals=Object.fromEntries(['permissions','mediaDevices'].map(k=>[k,Object.getOwnPropertyDescriptor(navigator,k)]));
  getUserMedia.mockReset().mockResolvedValue({getTracks:()=>[{stop}]});stop.mockClear();
  Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia}});
});
afterEach(async()=>{
  if(tree)await act(()=>tree!.unmount());tree=undefined;jest.restoreAllMocks();
  for(const [key,value] of Object.entries(originals))if(value)Object.defineProperty(navigator,key,value);else Reflect.deleteProperty(navigator,key);
});
async function mount(){await act(async()=>{tree=Renderer.create(<Probe/>);});}
test('browsers without the Permissions API can explicitly grant camera and release the permission probe',async()=>{
  Object.defineProperty(navigator,'permissions',{configurable:true,value:undefined});
  await mount();expect(view.state).toBe('denied');
  await act(async()=>view.request());
  expect(view.state).toBe('granted');expect(getUserMedia).toHaveBeenCalledTimes(1);expect(stop).toHaveBeenCalledTimes(1);
});
test('late permission check cannot overwrite a newer explicit grant; concurrent requests share one probe',async()=>{
  let finish!: (value:any)=>void;
  Object.defineProperty(navigator,'permissions',{configurable:true,value:{query:()=>new Promise(resolve=>{finish=resolve;})}});
  await mount();
  await act(async()=>{await Promise.all([view.request(),view.request()]);});
  expect(getUserMedia).toHaveBeenCalledTimes(1);expect(view.state).toBe('granted');
  await act(async()=>finish({state:'denied'}));
  expect(view.state).toBe('granted');
});
test('foreground rechecks revoked permission without opening a stream',async()=>{
  let change!:(state:AppStateStatus)=>void;
  const remove=jest.fn(),query=jest.fn().mockResolvedValue({state:'granted'});
  jest.spyOn(AppState,'addEventListener').mockImplementation((_event,listener)=>{change=listener;return{remove};});
  Object.defineProperty(navigator,'permissions',{configurable:true,value:{query}});
  await mount();expect(view.state).toBe('granted');
  query.mockResolvedValue({state:'denied'});
  await act(async()=>change('active'));
  expect(view.state).toBe('denied');expect(getUserMedia).not.toHaveBeenCalled();
  await act(()=>tree!.unmount());tree=undefined;expect(remove).toHaveBeenCalledTimes(1);
});
