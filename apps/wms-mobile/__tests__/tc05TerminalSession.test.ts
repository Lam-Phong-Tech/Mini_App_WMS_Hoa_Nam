import {createApiClient} from '../src/api/client';
import {setSession,getSession,clearSession,getSessionGeneration,getAuthSessionNotice,observeAccountSessionPolicy} from '../src/auth/session';
import {createMemoryBackend,createStorage,setAppStorageForTesting,getAppStorage} from '../src/storage/storage';
import {resetRefreshState,refreshSession} from '../src/auth/tokenRefresh';
import {AppError,messageForUser} from '../src/errors/AppError';
const env={name:'dev-test',label:'Test',apiBaseUrl:'https://example.invalid',requestTimeoutMs:1000,expectedTier:'dev-test',environmentClassVerified:true,wmsGateApproved:true,behindEdgeProxy:false} as const;
const response=(status:number,data:unknown)=>({ok:status<400,status,text:async()=>JSON.stringify(data)}) as Response;
const initial=()=>setSession({accessToken:'A',refreshToken:'RA',userId:'actor-a',authSessionId:'family-a',activeWarehouseId:'warehouse-a'});
beforeEach(()=>{setAppStorageForTesting(createStorage(createMemoryBackend()));clearSession();resetRefreshState();initial();});
afterEach(()=>clearSession());
test.each(['AUTH_SESSION_REPLACED','AUTH_SESSION_REQUIRED','AUTH_SESSION_EXPIRED'])('TC05 terminal %s never refreshes or retries and preserves business journals',async code=>{
 getAppStorage().setObject('owner.UNKNOWN',{key:'original',body:{same:true},version:7});
 const fetcher=jest.fn(async()=>response(401,{success:false,error_code:code}));const client=createApiClient({environment:env,fetchImpl:fetcher});
 await expect(client.get('/read')).rejects.toMatchObject({code});expect(fetcher).toHaveBeenCalledTimes(1);expect(getSession()).toBeUndefined();expect(getAuthSessionNotice()?.code).toBe(code);expect(getAppStorage().getObject('owner.UNKNOWN')).toEqual({key:'original',body:{same:true},version:7});
});
test.each([403,503])('TC05 HTTP%s does not manufacture session replacement or delete auth',async status=>{
 const client=createApiClient({environment:env,fetchImpl:async()=>response(status,{error_code:'OTHER'})});await expect(client.get('/read')).rejects.toMatchObject({status});expect(getSession()?.accessToken).toBe('A');
});
test('403 PASSWORD_CHANGE_REQUIRED promotes current session without logout or retry',async()=>{
 const fetcher=jest.fn(async()=>response(403,{success:false,error_code:'PASSWORD_CHANGE_REQUIRED',message:'Đổi mật khẩu.'}));
 const client=createApiClient({environment:env,fetchImpl:fetcher});
 await expect(client.get('/api/v1/auth/me')).rejects.toMatchObject({status:403,code:'PASSWORD_CHANGE_REQUIRED'});
 expect(fetcher).toHaveBeenCalledTimes(1);
 expect(getSession()).toMatchObject({accessToken:'A',mustChangePassword:true});
});
test('TC05 late old success is discarded after replacement invalidates the auth generation',async()=>{
 let done!:(r:Response)=>void;const late=new Promise<Response>(resolve=>{done=resolve;});const client=createApiClient({environment:env,fetchImpl:jest.fn().mockImplementationOnce(()=>late).mockResolvedValueOnce(response(401,{error_code:'AUTH_SESSION_REPLACED'}))});
 const pending=client.get('/old');const oldGeneration=getSessionGeneration();await expect(client.get('/detect')).rejects.toMatchObject({code:'AUTH_SESSION_REPLACED'});expect(getSessionGeneration()).toBeGreaterThan(oldGeneration);done(response(200,{ok:true}));await expect(pending).rejects.toMatchObject({code:'STALE_AUTH_RESPONSE'});
});
test('TC05 old terminal response cannot clear a newer login',async()=>{
 let done!:(r:Response)=>void;const client=createApiClient({environment:env,fetchImpl:()=>new Promise<Response>(r=>{done=r;})});const pending=client.get('/old');setSession({accessToken:'B',refreshToken:'RB',userId:'actor-b',authSessionId:'family-b'});done(response(401,{error_code:'AUTH_SESSION_REPLACED'}));await expect(pending).rejects.toMatchObject({code:'AUTH_SESSION_REPLACED'});expect(getSession()?.accessToken).toBe('B');expect(getAuthSessionNotice()).toBeUndefined();
});
test('TC05 replacement is explained distinctly from ordinary expiry',()=>{
 expect(messageForUser(new AppError({kind:'auth',status:401,code:'AUTH_SESSION_REPLACED',message:'server'}))).toContain('đăng nhập khác');
});
test('TC05 terminal refresh publishes replacement notice instead of generic forced expiry',async()=>{
 await expect(refreshSession({send:async()=>{throw new AppError({kind:'auth',status:401,code:'AUTH_SESSION_REPLACED',message:'server'});}})).rejects.toMatchObject({code:'AUTH_SESSION_REPLACED'});expect(getAuthSessionNotice()?.code).toBe('AUTH_SESSION_REPLACED');
});
test('TC05 discovered policy checks /auth/me before a command and sends no write when replaced',async()=>{
 observeAccountSessionPolicy({id:'actor-a',auth_session_id:'family-a',account_session_policy:{version:'auth-session-replacement-v1',enabled:true,scope:'ACCOUNT_ALL_CLIENTS',replacement_error:'AUTH_SESSION_REPLACED'}},getSessionGeneration());
 const fetcher=jest.fn(async(_input:RequestInfo|URL)=>response(401,{error_code:'AUTH_SESSION_REPLACED'}));const client=createApiClient({environment:env,fetchImpl:fetcher});
 await expect(client.request({method:'POST',path:'/api/v1/mini-app/inbound/resolve-code',body:{code:'UNCHANGED'}})).rejects.toMatchObject({code:'AUTH_SESSION_REPLACED'});
 expect(fetcher).toHaveBeenCalledTimes(1);expect(String(fetcher.mock.calls[0][0])).toContain('/api/v1/auth/me');
});
test('TC05 auth refresh terminal response also invalidates the family when called directly through client',async()=>{
 const client=createApiClient({environment:env,fetchImpl:async()=>response(401,{error_code:'AUTH_SESSION_REPLACED'})});
 await expect(client.request({method:'POST',path:'/api/v1/auth/refresh',body:{refresh_token:'RA'}})).rejects.toMatchObject({code:'AUTH_SESSION_REPLACED'});
 expect(getSession()).toBeUndefined();
});
test('TC05 current-family preflight preserves the exact owner command after verified read',async()=>{
 setSession({...getSession()!,accountSessionPolicy:'auth-session-replacement-v1'});
 const fetcher=jest.fn(async(url:RequestInfo|URL,_init?:RequestInit)=>String(url).endsWith('/auth/me')?response(200,{data:{user_id:'actor-a',auth_session_id:'family-a',active_warehouse_id:'warehouse-a'}}):response(200,{ok:true}));
 const body={raw_code:'Exact Case',quantity:1};const client=createApiClient({environment:env,fetchImpl:fetcher});
 await client.request({method:'POST',path:'/api/v1/mini-app/inbound/resolve-code',body});
 expect(fetcher).toHaveBeenCalledTimes(2);expect((fetcher.mock.calls[1] as unknown[])[0]).toContain('/inbound/resolve-code');
 expect(fetcher.mock.calls[1][1]?.body).toBe(JSON.stringify(body));
});
test('TC05 public login rejection cannot end an unrelated current family',async()=>{
 const client=createApiClient({environment:env,fetchImpl:async()=>response(401,{error_code:'AUTH_SESSION_REPLACED'})});await expect(client.request({method:'POST',path:'/api/v1/auth/login',body:{email:'fixture@example.test',password:'fixture-only'}})).rejects.toMatchObject({code:'AUTH_SESSION_REPLACED'});expect(getSession()?.authSessionId).toBe('family-a');
});
test('TC05 mismatched successful auth/me blocks a command without manufacturing logout',async()=>{
 setSession({...getSession()!,accountSessionPolicy:'auth-session-replacement-v1'});
 const fetcher=jest.fn(async()=>response(200,{data:{user_id:'other',auth_session_id:'other',active_warehouse_id:'other'}}));const client=createApiClient({environment:env,fetchImpl:fetcher});
 await expect(client.request({method:'POST',path:'/api/v1/mini-app/inbound/resolve-code',body:{code:'same'}})).rejects.toMatchObject({code:'AUTH_COMMAND_CONTEXT_UNVERIFIED'});
 expect(fetcher).toHaveBeenCalledTimes(1);expect(getSession()?.authSessionId).toBe('family-a');
});

test('terminal diagnostics retain Request-ID without credentials, private body or owner key and still never replay', async () => {
 const log={debug:jest.fn(),info:jest.fn(),warn:jest.fn(),error:jest.fn()};
 const fetcher=jest.fn(async()=>({
  ...response(401,{error_code:'AUTH_SESSION_REPLACED',message:'PRIVATE_ACTOR_NAME',debug_secret:'PRIVATE_RESPONSE'}),
  headers:{get:(name:string)=>name.toLowerCase()==='x-request-id'?'b44d7130-a8e4-45b9-a2b6-0431685d64de':null},
 }) as Response);
 getAppStorage().setObject('owner.UNKNOWN',{key:'PRIVATE_OPERATION_KEY',version:7});
 const client=createApiClient({environment:env,fetchImpl:fetcher,log});
 await expect(client.get('/api/v1/mini-app/drafts/private/requests/PRIVATE_OPERATION_KEY')).rejects.toMatchObject({code:'AUTH_SESSION_REPLACED',requestId:'b44d7130-a8e4-45b9-a2b6-0431685d64de'});
 expect(fetcher).toHaveBeenCalledTimes(1);
 expect(log.warn).toHaveBeenCalledWith('AUTH_TERMINAL_RESPONSE',{
  code:'AUTH_SESSION_REPLACED',status:401,requestId:'b44d7130-a8e4-45b9-a2b6-0431685d64de',routeFamily:'PROTECTED_OWNER_REQUEST',appliesToCurrentGeneration:true,
 });
 expect(JSON.stringify(log.warn.mock.calls)).not.toMatch(/PRIVATE_|accessToken|refreshToken|Bearer/);
 expect(getAppStorage().getObject('owner.UNKNOWN')).toEqual({key:'PRIVATE_OPERATION_KEY',version:7});
});
