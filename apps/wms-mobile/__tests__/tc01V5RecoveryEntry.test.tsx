jest.mock('../src/auth/session', () => {
  const real=jest.requireActual('../src/auth/session');
  return {...real,hydrateSession:jest.fn(async()=>real.getSession())};
});
jest.mock('../src/auth/tokenRefresh',()=>({...jest.requireActual('../src/auth/tokenRefresh'),recoverAfterRestart:()=>({outcome:'clean'})}));
jest.mock('../src/auth/useForegroundSessionCheck',()=>({useForegroundSessionCheck:()=>{}}));

import React from 'react';
import Renderer,{act} from 'react-test-renderer';
import {AppProviders} from '../src/app/App';
import {AppShell} from '../src/app/AppShell';
import {LoginScreen} from '../src/features/auth/LoginScreen';
import {ForgotPasswordFlow} from '../src/features/auth/ForgotPasswordFlow';
import {Button} from '../src/ui/Button';
import {clearSession} from '../src/auth/session';
import {resetShiftState} from '../src/shift/shiftState';
import {createMemoryBackend,createStorage,setAppStorageForTesting} from '../src/storage/storage';
import {setTierCheckForTesting} from '../src/services/wms/tierCheck';

test('TC01 v5 Login opens the existing email/OTP recovery owner, without a support mutation',async()=>{
  setAppStorageForTesting(createStorage(createMemoryBackend()));clearSession();resetShiftState();
  setTierCheckForTesting({status:'matched',expected:'dev-test',reported:'dev-test'});
  let tree!:Renderer.ReactTestRenderer;
  try {
    await act(async()=>{tree=Renderer.create(<AppProviders><AppShell/></AppProviders>);await new Promise(resolve=>setTimeout(resolve,20));});
    await act(async()=>{tree.root.findByType(LoginScreen).props.onForgotPassword();await new Promise(resolve=>setTimeout(resolve,20));});
    expect(tree.root.findAllByType(ForgotPasswordFlow)).toHaveLength(1);
    expect(tree.root.findAllByType(Button).some(b=>b.props.label==='Gửi mã OTP')).toBe(true);
    expect(JSON.stringify(tree.toJSON())).not.toContain('Gửi yêu cầu hỗ trợ');
    expect(JSON.stringify(tree.toJSON())).not.toContain('3 mật khẩu');
  } finally {
    if(tree)await act(async()=>tree.unmount());clearSession();resetShiftState();
  }
});
