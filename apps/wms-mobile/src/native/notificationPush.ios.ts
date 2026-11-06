import {AppError} from '../errors/AppError';
import type {PushPlatform} from '../features/notifications/delivery/types';

const unavailable=async():Promise<never>=>{throw new AppError({kind:'config',code:'IOS_PUSH_NOT_CONFIGURED',message:'Thông báo iPhone chưa được cấu hình cho môi trường này.'});};
/** No iOS/APNs owner contract exists yet. Never present this client as Android. */
export const notificationPush:PushPlatform={
  platform:'IOS',support:async()=> 'not-configured',requestPermission:async()=> 'not-configured',
  identity:unavailable,token:unavailable,getBinding:async()=>null,storeBinding:unavailable,
  clearBinding:async()=>false,newRequestKey:unavailable,
  onMessage:()=>()=>{},onClick:()=>()=>{},readTestIntent:async()=>null,storeTestIntent:unavailable,
};
