import {NativeModules,Platform} from 'react-native';
import {readSecureRefreshToken,writeSecureRefreshToken,clearSecureRefreshToken} from '../src/auth/secureRefreshToken';
test.each(['android','ios'])('missing %s secure native storage fails closed instead of a volatile session',async os=>{
 const old=NativeModules.WmsSecureSession,platform=jest.replaceProperty(Platform,'OS',os as any);
 delete NativeModules.WmsSecureSession;
 try{await expect(writeSecureRefreshToken('SYNTHETIC-UNIT-TOKEN')).rejects.toMatchObject({code:'SECURE_SESSION_MODULE_UNAVAILABLE'});await expect(readSecureRefreshToken()).rejects.toMatchObject({code:'SECURE_SESSION_MODULE_UNAVAILABLE'});}
 finally{NativeModules.WmsSecureSession=old;platform.restore();}
});
test('native session boundary writes, reads and clears through the existing serialized owner API',async()=>{await writeSecureRefreshToken('SYNTHETIC-UNIT-TOKEN');expect(await readSecureRefreshToken()).toBe('SYNTHETIC-UNIT-TOKEN');await clearSecureRefreshToken();expect(await readSecureRefreshToken()).toBeUndefined();});
