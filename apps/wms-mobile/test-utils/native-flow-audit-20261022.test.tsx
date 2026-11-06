// Audit observations of the unchanged native runtime, not acceptance of these bugs.
jest.mock('../src/services/wms/notifications', () => ({
  ...jest.requireActual('../src/services/wms/notifications'),
  fetchNotifications: jest.fn(), fetchNotification: jest.fn(),
  fetchUnreadNotificationCount: jest.fn(), markNotificationRead: jest.fn(),
  reconcileNotificationRead: jest.fn(),
}));
jest.mock('../src/services/wms/linkedHistoryRead', () => ({createLinkedHistoryRead: jest.fn()}));
import React from 'react';
import Renderer, {act} from 'react-test-renderer';
import {AppProviders} from '../src/app/App';
import {P13NotificationsScreen} from '../src/features/notifications/P13NotificationsScreen';
import {P13NotificationFilters,P13NotificationRow} from '../src/features/notifications/P13NotificationPresentation';
import {P13NotificationFrame} from '../src/features/notifications/P13NotificationFrame';
import {P22NfcHistoryScreen} from '../src/features/history/P22NfcHistoryScreen';
import {useAttachments} from '../src/features/warranty/useAttachments';
import {createLinkedHistoryRead} from '../src/services/wms/linkedHistoryRead';
import * as notifications from '../src/services/wms/notifications';
import {Button} from '../src/ui/Button';
import {clearSession,setSession} from '../src/auth/session';
import {createStorage,createMemoryBackend,setAppStorageForTesting} from '../src/storage/storage';
import {AppError} from '../src/errors/AppError';
import {context,id} from '../__tests__/fixtures/p09Mock';
const note={id:id(70),title:'AUDIT-A',message:null,severity:null,read:false,readAt:null,createdAt:null,type:null,subject:null};
let tree:Renderer.ReactTestRenderer;
const render=async(node:React.ReactElement)=>act(async()=>{tree=Renderer.create(<AppProviders>{node}</AppProviders>);});
async function press(label:string){await act(async()=>{const b=tree.root.findAll(n=>typeof n.props.onPress==='function'&&(n.props.label===label||n.props.accessibilityLabel===label))[0];if(!b)throw Error('Missing '+label);return b.props.onPress();});}
beforeEach(()=>{jest.clearAllMocks();setAppStorageForTesting(createStorage(createMemoryBackend()));clearSession();setSession(context().session!);
 (notifications.fetchNotifications as jest.Mock).mockResolvedValue({items:[note],total:1,hasMore:false,nextCursor:null,perPage:10});
 (notifications.fetchNotification as jest.Mock).mockResolvedValue(note);(notifications.fetchUnreadNotificationCount as jest.Mock).mockResolvedValue(1);
});
afterEach(async()=>{if(tree)await act(async()=>tree.unmount());clearSession();});
test('OBS N13-03: verified read remains rendered in unread membership',async()=>{
 await render(<P13NotificationsScreen onBack={()=>{}} onOpenDocument={()=>{}}/>);
 await act(async()=>tree.root.findByType(P13NotificationFilters).props.onSelect(true));
 await press('AUDIT-A');
 (notifications.markNotificationRead as jest.Mock).mockResolvedValue({item:{...note,read:true,readAt:'2026-10-22T01:00:00Z'},changed:true,unreadCount:0});
 await press('Đánh dấu đã đọc');await press('Đóng');
 await act(async()=>tree.root.findByType(P13NotificationFrame).props.onBack());
 expect(tree.root.findByType(P13NotificationFilters).props.unread).toBe(true);
 const rows=tree.root.findAllByType(P13NotificationRow);expect(rows).toHaveLength(1);expect(rows[0].props.item.read).toBe(true);
});
test('OBS N13-02: cursor-invalid422 can be submitted repeatedly unchanged',async()=>{
 (notifications.fetchNotifications as jest.Mock).mockResolvedValueOnce({items:[note],total:3,hasMore:true,nextCursor:'bad-cursor',perPage:10});
 await render(<P13NotificationsScreen onBack={()=>{}} onOpenDocument={()=>{}}/>);
 (notifications.fetchNotifications as jest.Mock).mockRejectedValue(new AppError({kind:'http',status:422,code:'NOTIFICATION_CURSOR_INVALID',message:'cursor-invalid'}));
 await press('Hiển thị thêm 10 thông báo');await press('Hiển thị thêm 10 thông báo');
 expect((notifications.fetchNotifications as jest.Mock).mock.calls.slice(1).map(c=>c[0].cursor)).toEqual(['bad-cursor','bad-cursor']);
});
test('OBS N13-05: count failure discards an otherwise valid list response',async()=>{
 (notifications.fetchUnreadNotificationCount as jest.Mock).mockRejectedValue(new AppError({kind:'network',message:'count-offline'}));
 await render(<P13NotificationsScreen onBack={()=>{}} onOpenDocument={()=>{}}/>);
 expect(notifications.fetchNotifications).toHaveBeenCalledTimes(1);expect(tree.root.findAllByType(P13NotificationRow)).toHaveLength(0);
 expect(JSON.stringify(tree.toJSON())).toContain('count-offline');
});
test('OBS N22-01: failed load-more then retry drops the first-page events',async()=>{
 const event=(n:number)=>({recordId:'NFC:'+id(n),activityId:'NFC:'+id(n+1),type:'Gán',status:null,uid:'AUDIT-UID-'+n,serial:null,time:null});
 const nfcList=jest.fn().mockResolvedValueOnce({items:[event(10)],total:2,hasMore:true,nextCursor:'page2'})
  .mockRejectedValueOnce(new AppError({kind:'network',message:'page2-offline'}))
  .mockResolvedValueOnce({items:[event(20)],total:2,hasMore:false,nextCursor:null});
 (createLinkedHistoryRead as jest.Mock).mockReturnValue({scopeKey:()=> 'scope',nfcList,nfcSummary:jest.fn().mockResolvedValue({grandTotal:2})});
 const c=context();await render(<P22NfcHistoryScreen context={{session:c.session,user:c.user}} onBack={()=>{}}/>);
 expect(JSON.stringify(tree.toJSON())).toContain('AUDIT-UID-10');await press('Tải thêm sự kiện NFC');await press('Đọc lại');
 expect(nfcList.mock.calls[2][0]).toEqual({cursor:'page2'});
 expect(JSON.stringify(tree.toJSON())).toContain('AUDIT-UID-20');expect(JSON.stringify(tree.toJSON())).not.toContain('AUDIT-UID-10');
});
test('OBS N18-01: same-render rapid upload actions start two sends of the same queued file',async()=>{
 let hook:ReturnType<typeof useAttachments>;const send=jest.fn().mockResolvedValue({}),load=jest.fn().mockResolvedValue({items:[]});
 const pick=jest.fn().mockResolvedValue({kind:'selected',items:[{file:{uri:'offline://audit-one',name:'audit.jpg',type:'image/jpeg'},isVideo:false}]});
 function Harness(){hook=useAttachments(id(4),{load,upload:send,pick} as any);return null;}
 await render(<Harness/>);await act(async()=>hook!.addFromLibrary());expect(hook!.pending).toHaveLength(1);
 await act(async()=>{const first=hook!.uploadAll('OTHER'),second=hook!.uploadAll('OTHER');await Promise.all([first,second]);});
 expect(send).toHaveBeenCalledTimes(2);expect(send.mock.calls[0][0]).toBe(send.mock.calls[1][0]);
});
