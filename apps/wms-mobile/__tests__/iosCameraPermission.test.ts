import {NativeModules} from 'react-native';
let ios:any;
try{ios=require('../src/scanner/useCameraPermission.ios');}catch(e){if(!String(e).includes('useCameraPermission.ios'))throw e;}
afterEach(()=>{delete NativeModules.WmsCameraPermission;});
test('iOS camera rechecks revocation and only authorizes a real granted state',async()=>{expect(ios).toBeDefined();let status='authorized';NativeModules.WmsCameraPermission={getStatus:async()=>status,request:async()=>status};expect(await ios.iosCameraPermissionBackend.check()).toBe(true);status='denied';expect(await ios.iosCameraPermissionBackend.check()).toBe(false);expect(await ios.iosCameraPermissionBackend.request()).toBe('never_ask_again');status='notDetermined';expect(await ios.iosCameraPermissionBackend.request()).toBe('denied');});
test('missing iOS camera bridge never invents a granted permission',async()=>{expect(ios).toBeDefined();await expect(ios.iosCameraPermissionBackend.check()).rejects.toThrow();await expect(ios.iosCameraPermissionBackend.request()).rejects.toThrow();});
