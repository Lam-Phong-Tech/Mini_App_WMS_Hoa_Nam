import React from 'react';
import Renderer,{act} from 'react-test-renderer';
import {AppState} from 'react-native';
import {useForegroundSessionCheck} from '../src/auth/useForegroundSessionCheck';
import {setSession,clearSession} from '../src/auth/session';
import {createMemoryBackend,createStorage,setAppStorageForTesting} from '../src/storage/storage';
import {SessionExpiredScreen} from '../src/features/auth/StatusScreen';
import {AppProviders} from '../src/app/App';
let tree:Renderer.ReactTestRenderer;
afterEach(async()=>{if(tree)await act(async()=>tree.unmount());jest.restoreAllMocks();clearSession();});
test('TC05 foreground check is one GET on return, single-flight and not background/60-second refresh polling',async()=>{
 setAppStorageForTesting(createStorage(createMemoryBackend()));setSession({accessToken:'fixture'});
 let changed!:(s:string)=>void,done!:()=>void;const remove=jest.fn();
 jest.spyOn(AppState,'addEventListener').mockImplementation((_event,callback)=>{changed=callback as (s:string)=>void;return{remove};});
 const check=jest.fn(()=>new Promise<void>(r=>{done=r;}));
 function Harness(){useForegroundSessionCheck(true,check);return null;}
 await act(async()=>{tree=Renderer.create(<Harness/>);});expect(check).not.toHaveBeenCalled();
 await act(async()=>{changed('background');changed('active');changed('background');changed('active');});expect(check).toHaveBeenCalledTimes(1);
 await act(async()=>done());await act(async()=>{changed('inactive');changed('active');});expect(check).toHaveBeenCalledTimes(2);
 await act(async()=>done());await act(async()=>tree.unmount());expect(remove).toHaveBeenCalled();
});
test('TC05 replacement screen tells user to log in explicitly and not replay retained data',async()=>{
 await act(async()=>{tree=Renderer.create(<AppProviders><SessionExpiredScreen reasonCode="AUTH_SESSION_REPLACED" onRelogin={()=>undefined}/></AppProviders>);});
 const body=JSON.stringify(tree.toJSON());expect(body).toContain('Phiên đăng nhập đã được thay thế');expect(body).toContain('không tự gửi lại');expect(body).not.toContain('Phiên đăng nhập đã hết hạn');
});
