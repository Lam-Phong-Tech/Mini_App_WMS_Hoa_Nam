import {createMemoryBackend,createStorage} from '../src/storage/storage';

const shared=createStorage(createMemoryBackend());
type SessionApi=typeof import('../src/auth/session');
function tab():SessionApi{
  let api!:SessionApi;
  jest.isolateModules(()=>{
    jest.doMock('../src/storage/storage',()=>({getAppStorage:()=>shared}));
    jest.doMock('../src/auth/secureRefreshToken',()=>({readSecureRefreshToken:jest.fn(async()=>undefined),writeSecureRefreshToken:jest.fn(async()=>{}),clearSecureRefreshToken:jest.fn(async()=>{})}));
    api=require('../src/auth/session');
  });
  return api;
}
const a={accessToken:'FAKE-A',userId:'TEST-actor',authSessionId:'TEST-family-A'};
const b={accessToken:'FAKE-B',userId:'TEST-actor',authSessionId:'TEST-family-B'};
beforeEach(()=>{for(const k of shared.keys())shared.remove(k);});
afterEach(()=>{jest.dontMock('../src/storage/storage');jest.dontMock('../src/auth/secureRefreshToken');});

test('terminal response in old tab clears only that tab, retaining a newer persisted family and its refresh marker',async()=>{
  const A=tab(),B=tab();A.setSession(a);B.setSession(b);B.markRefreshInFlight(42);
  await A.terminateAuthSession('AUTH_SESSION_REPLACED',A.getSessionGeneration());
  expect(shared.getObject<any>('auth.session')?.authSessionId).toBe(b.authSessionId);
  expect(shared.getObject('auth.refresh.inflight')).toEqual({startedAtMs:42});
  expect(A.getSession()).toBeUndefined();expect(A.getAuthSessionNotice()?.code).toBe('AUTH_SESSION_REPLACED');
  expect(B.getSession()?.authSessionId).toBe(b.authSessionId);
});
test('local stale-tab clear does not delete the newer tab persisted session',()=>{
  const A=tab(),B=tab();A.setSession(a);B.setSession(b);A.clearSession();
  expect(shared.getObject<any>('auth.session')?.authSessionId).toBe(b.authSessionId);
  expect(A.getSession()).toBeUndefined();
});
test('current family still clears credentials and marker on a real terminal response',async()=>{
  const A=tab();A.setSession(a);A.markRefreshInFlight(42);
  await A.terminateAuthSession('AUTH_SESSION_REPLACED',A.getSessionGeneration());
  expect(shared.getObject('auth.session')).toBeUndefined();expect(shared.getObject('auth.refresh.inflight')).toBeUndefined();
});
test('legacy sessions without family IDs compare exact access credential ownership',()=>{
  const A=tab(),B=tab();A.setSession({accessToken:'FAKE-LEGACY-A'});B.setSession({accessToken:'FAKE-LEGACY-B'});A.clearSession();
  expect(shared.getObject<any>('auth.session')?.accessToken).toBe('FAKE-LEGACY-B');
});
