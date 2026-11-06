import {NativeModules} from 'react-native';
import {useCameraPermissionBase,type CameraPermissionView} from './useCameraPermissionBase';
import type {PermissionBackend} from './cameraPermission';
type Status='authorized'|'notDetermined'|'denied'|'restricted';
const native=()=>{const p=NativeModules.WmsCameraPermission as {getStatus():Promise<Status>;request():Promise<Status>}|undefined;if(!p)throw Error('Bản cài chưa có mô-đun quyền camera iPhone.');return p;};
export const iosCameraPermissionBackend:PermissionBackend={
 check:async()=> (await native().getStatus())==='authorized',
 request:async()=>{const status=await native().request();if(status==='authorized')return 'granted';if(status==='denied'||status==='restricted')return 'never_ask_again';return 'denied';},
};
export function useCameraPermission(backend:PermissionBackend=iosCameraPermissionBackend):CameraPermissionView{return useCameraPermissionBase(backend);}
export type {CameraPermissionView};
export type {CameraPermissionState} from './cameraPermission';
