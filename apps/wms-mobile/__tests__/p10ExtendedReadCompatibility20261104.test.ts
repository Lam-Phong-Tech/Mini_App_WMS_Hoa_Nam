import {decodeProfile,updateCurrentProfile} from '../src/services/wms/profile';
import {profileResponse} from './fixtures/p10Contract';
const extended=()=>{const r=profileResponse();Object.assign(r.data.meta.profile_contract,{editable_fields:['display_name','phone','email'],etag_scope:'USER_VERSION_NOT_AUTHORIZATION_SNAPSHOT',avatar:{supported:true,max_bytes:2097152,mime_types:['image/png','image/jpeg','image/webp'],private_read:'GET /api/v1/auth/me/avatar',upload:'POST /api/v1/auth/me/avatar',atomic_profile_fields:true,if_match_scope:'USER_VERSION',request_receipt_supported:false}});return r;};
test('read-only profile remains compatible when the same v1 contract advertises additive avatar/email features',()=>{
 const r=extended(),u=decodeProfile(r);expect(u.id).toBe(r.data.data.user_id);expect(u.etag).toBe('"7"');expect(u.profile_meta?.profile_contract).toMatchObject({avatar:{supported:true}});
});
test('extra read capabilities do not enable unimplemented profile writers',async()=>{
 const r=extended(),u=decodeProfile(r),request=jest.fn();
 await expect(updateCurrentProfile({email:'test-only@example.invalid'} as never,u,{request})).rejects.toMatchObject({code:'PROFILE_FIELD_NOT_EDITABLE'});
 await expect(updateCurrentProfile({avatar:'fake-input'} as never,u,{request})).rejects.toMatchObject({code:'PROFILE_FIELD_NOT_EDITABLE'});expect(request).not.toHaveBeenCalled();
});
test('malformed optional-capability marker and weak/mismatched profile preconditions remain rejected',()=>{
 const malformed=extended() as any;malformed.data.meta.profile_contract.avatar.supported='true';expect(()=>decodeProfile(malformed)).toThrow();
 const r=extended();expect(()=>decodeProfile({...r,header:()=> 'W/"7"'})).toThrow();expect(()=>decodeProfile({...r,header:()=> '"8"'})).toThrow();
});
