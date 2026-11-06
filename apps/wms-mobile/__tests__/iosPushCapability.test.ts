import {NotificationDeliveryController} from '../src/features/notifications/delivery/controller';
let port:any;
try{port=require('../src/native/notificationPush.ios').notificationPush;}catch(e){if(!String(e).includes('notificationPush.ios'))throw e;}

test('iOS identifies its platform honestly and cannot obtain an Android push token',async()=>{
 expect(port).toBeDefined();expect(port.platform).toBe('IOS');
 expect(await port.support()).toBe('not-configured');
 await expect(port.token({enabled:true})).rejects.toThrow();
});
test('unsupported iOS push never asks permission or calls Android delivery APIs',async()=>{
 expect(port).toBeDefined();const calls:string[]=[],states:any[]=[];
 const service:any={capabilities:async()=>{calls.push('CAPABILITIES');return{enabled:true,platforms:['ANDROID']};},register:async()=>{calls.push('REGISTER');}};
 const controller=new NotificationDeliveryController(port,service,{isCurrent:()=>true,onState:s=>states.push(s),onSignal:async()=>{},onOpen:async()=>{}});
 await controller.refresh();await controller.enable();expect(calls).toEqual([]);expect(states.at(-1).phase).toBe('unavailable');controller.dispose();
});
