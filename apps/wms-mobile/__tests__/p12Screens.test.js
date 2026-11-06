import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import {
  TextInput,
  Modal,
  ScrollView,
  Platform,
  Dimensions,
  StyleSheet,
} from 'react-native';
import { AppProviders } from '../src/app/App';
import { Dialog } from '../src/ui/Dialog';
import { P18ViewerScreen } from '../src/features/warranty/P18ViewerScreen';
import * as p12Files from '../src/native/p12Files';
import { DocumentSearchCamera } from '../src/features/documents/p12/DocumentSearchCamera';
import { P16DataState } from '../src/features/system/P16DataState';
import { p08QuickDate } from '../src/features/history/p08Dates';
jest.mock('react-native-camera-kit', () => ({
  Camera: 'DocumentNativeCameraBridge',
  CameraType: { Back: 'back' },
}));
import { p12Layout } from '../src/features/documents/p12/styles';
import {
  P12Screen,
  documentTime,
} from '../src/features/documents/p12/P12Screen';
import { createP12Service } from '../src/features/documents/p12/service';
import { setSession, clearSession } from '../src/auth/session';
import {
  setAppStorageForTesting,
  createStorage,
  createMemoryBackend,
} from '../src/storage/storage';
import * as m from './fixtures/p12Protocol';
import * as mix from './fixtures/p12Mixed';
import { resetHardwareBackForTest } from '../src/app/useHardwareBack';
const user = () => ({
  id: m.actor,
  auth_session_id: m.session,
  active_warehouse_id: m.warehouse,
  warehouse_context: { status: 'READY' },
  available_warehouses: [
    { warehouse_id: m.warehouse, status: 'ACTIVE', name: 'Kho Hoa Nam' },
  ],
  permissions: [
    ...m.context().rights,
    'inbound.scan',
    'outbound.request.manual_create',
    'outbound.scan',
    'warranty.manage',
  ],
});
beforeEach(() => {
  setAppStorageForTesting(createStorage(createMemoryBackend()));
  clearSession();
  setSession({
    accessToken: 'test',
    userId: m.actor,
    authSessionId: m.session,
    activeWarehouseId: m.warehouse,
  });
  resetHardwareBackForTest();
});
afterEach(() => clearSession());
test.each(['inbound','outbound'])('typed %s status filter offers Web waiting and sends the supported owner query',async source=>{
 const {tree,transport}=await fixture({},t=>{
  t.control.replace['/api/v1/mini-app/'+source+'-documents']=q=>m.response(m.list(source,q,[m.record({...m.stock(source,source==='inbound'?10:11),mini_app_status:'WAITING_APPROVAL'},source)]));
 });
 await press(tree,source==='inbound'?'Nhập kho':'Xuất kho');await press(tree,'Lọc theo trạng thái');
 const option=tree.root.findAllByProps({accessibilityLabel:'Trạng thái WAITING_WEB_PROCESSING'}).find(n=>typeof n.props.onPress==='function');expect(option).toBeDefined();
 await press(tree,'Trạng thái WAITING_WEB_PROCESSING');await press(tree,'Áp dụng');
 const call=transport.calls.filter(c=>c.path.endsWith('/'+source+'-documents')).at(-1);
 expect(call.query).toMatchObject(source==='inbound'?{status:'WAITING_APPROVAL'}:{ready_for_issue:'true'});
 if(source==='outbound')expect(call.query.status).toBeUndefined();
 expect(JSON.stringify(tree.toJSON())).toContain('Chờ xử lý trên Web');expect(JSON.stringify(tree.toJSON())).not.toContain('Chưa xác minh trạng thái');await act(async()=>tree.unmount());
});
async function fixture(props = {}, configureTransport, currentUser = user(), serviceOptions = {}) {
  const transport = m.mockTransport();
  configureTransport?.(transport);
  const client = {
      async get(path, options) {
        const r = await transport.request(
          'https://p12.invalid' +
            path +
            '?' +
            new URLSearchParams(Object.entries(options.query ?? {})),
          {
            method: 'GET',
            headers: { Authorization: 'Bearer test', ...options.headers },
            signal: options.signal,
          },
        );
        return {
          status: r.status,
          data: await r.json(),
          header: k => r.headers.get(k),
        };
      },
    },
    service = createP12Service(() => ({ user: currentUser }), {
      client,
      origin: 'https://p12.invalid',
      ...serviceOptions,
    });
  let tree;
  await act(async () => {
    tree = Renderer.create(
      <AppProviders>
        <P12Screen
          service={service}
          user={currentUser}
          onBack={() => {}}
          onOwnerIntent={() => {}}
          {...props}
        />
      </AppProviders>,
    );
  });
  return { tree, transport, service };
}
async function press(tree, label) {
  await act(async () => {
    tree.root
      .findAllByProps({ accessibilityLabel: label })
      .find(v => typeof v.props.onPress === 'function')
      .props.onPress();
  });
}
async function edit(tree, label, value) {
  await act(async () => {
    tree.root
      .findAllByType(TextInput)
      .find(v => v.props.accessibilityLabel === label)
      .props.onChangeText(value);
  });
}
const contents = tree => JSON.stringify(tree.toJSON());

test('Parity29 S03 retains all four tabs and switches directly to the same parent files', async () => {
  const f = await fixture();
  try {
    await press(f.tree, 'Nhập kho');
    await press(f.tree, 'Mở chứng từ PN-MOCK-10');
    await press(f.tree, 'Sản phẩm');
    for (const label of ['Thông tin', 'Sản phẩm', 'Tài liệu', 'Lịch sử'])
      expect(f.tree.root.findAll(node => node.props.accessibilityRole === 'tab' && node.props.accessibilityLabel === label).length).toBeGreaterThan(0);
    await press(f.tree, 'Tài liệu');
    expect(contents(f.tree)).toContain('PN-MOCK-10');
    expect(f.transport.calls.filter(c => c.path.endsWith('/attachments')).every(c => c.path.includes(m.business))).toBe(true);
    expect(f.transport.calls.every(c => c.method === 'GET')).toBe(true);
  } finally { await act(async () => f.tree.unmount()); }
});

test('Parity29 list exposes server sort and separate result/loaded counts without changing aggregate ownership', async () => {
  const f = await fixture();
  try {
    expect(contents(f.tree)).toContain('kết quả');
    await press(f.tree, 'Mới nhất');
    expect(f.transport.calls.at(-1)).toMatchObject({path:'/api/v1/mini-app/documents',query:expect.objectContaining({cursor:'start',sort:'created_at_asc'})});
    expect(f.tree.root.findAllByProps({accessibilityLabel:'Cũ nhất'}).length).toBeGreaterThan(0);
    expect(f.transport.calls.every(c => c.method === 'GET')).toBe(true);
  } finally { await act(async () => f.tree.unmount()); }
});

test('Parity29 creation shows the three-step context without replacing the owner business date or note contract', async () => {
  const f = await fixture();
  try {
    await press(f.tree, 'Tạo chứng từ');
    expect(contents(f.tree)).toContain('Thêm sản phẩm');
    expect(contents(f.tree)).toContain('Kiểm tra');
    expect(contents(f.tree)).toContain('Thông tin phiếu');
    expect(f.tree.root.findAllByProps({accessibilityLabel:'Chọn ngày chứng từ'}).length).toBeGreaterThan(0);
    await edit(f.tree, 'Ghi chú chứng từ', '😀'.repeat(1001));
    expect(contents(f.tree)).toContain('Ghi chú nhập kho tối đa 1000 ký tự.');
    expect(f.tree.root.findAllByType(TextInput).find(node=>node.props.accessibilityLabel==='Ghi chú chứng từ').props.value).toBe('😀'.repeat(1001));
    expect(f.transport.calls.every(c => c.method === 'GET')).toBe(true);
  } finally { await act(async () => f.tree.unmount()); }
});

test('P18 full attachment list opens from the preview and Back restores the same document info tab', async () => {
  const parentBack=jest.fn();
  const f=await fixture({onBack:parentBack});
  try {
    await press(f.tree,'Nhập kho');await press(f.tree,'Mở chứng từ PN-MOCK-10');
    await press(f.tree,'Xem tất cả tài liệu →');
    expect(f.tree.root.findAllByProps({testID:'P18.attachments.full'}).length).toBeGreaterThan(0);
    expect(contents(f.tree)).toContain('Tệp đính kèm PN-MOCK-10');
    expect(contents(f.tree)).toContain('Danh sách tệp đính kèm');
    expect(contents(f.tree)).toContain('Mock-protocol.pdf');
    expect(f.tree.root.findAll(n=>n.props.accessibilityRole==='tab')).toHaveLength(0);
    expect(f.transport.calls.filter(c=>c.path.endsWith('/attachments')).every(c=>c.path.includes(m.business))).toBe(true);
    await press(f.tree,'Quay lại');
    expect(f.tree.root.findAllByProps({testID:'P18.attachments.full'})).toHaveLength(0);
    expect(f.tree.root.findAll(n=>n.props.accessibilityRole==='tab'&&n.props.accessibilityLabel==='Thông tin'&&n.props.accessibilityState?.selected).length).toBeGreaterThan(0);
    expect(parentBack).not.toHaveBeenCalled();
    expect(f.transport.calls.every(c=>c.method==='GET')).toBe(true);
  } finally {await done(f.tree);}
});

test('full attachment list opened from files returns to files and retains the four detail tabs', async()=>{
  const f=await fixture();
  try {
    await press(f.tree,'Nhập kho');await press(f.tree,'Mở chứng từ PN-MOCK-10');await press(f.tree,'Tài liệu');
    await press(f.tree,'Mở danh sách tệp');await press(f.tree,'Quay lại');
    expect(f.tree.root.findAll(n=>n.props.accessibilityRole==='tab'&&n.props.accessibilityLabel==='Tài liệu'&&n.props.accessibilityState?.selected).length).toBeGreaterThan(0);
    for(const label of ['Thông tin','Sản phẩm','Tài liệu','Lịch sử'])expect(f.tree.root.findAll(n=>n.props.accessibilityRole==='tab'&&n.props.accessibilityLabel===label).length).toBeGreaterThan(0);
  } finally {await done(f.tree);}
});

test('attachment full list keeps a denied child distinct from empty and Back still restores the parent',async()=>{
  const f=await fixture({},transport=>{transport.control.fail['/api/v1/mini-app/inbound-documents/'+m.business+'/attachments']=403;});
  try{
    await press(f.tree,'Nhập kho');await press(f.tree,'Mở chứng từ PN-MOCK-10');await press(f.tree,'Xem tất cả tài liệu →');
    expect(contents(f.tree)).toContain('Tệp đính kèm PN-MOCK-10');
    expect(contents(f.tree)).not.toContain('Nguồn trả về không có tài liệu.');
    expect(f.tree.root.findAllByProps({accessibilityLabel:'Thử đọc lại'}).length).toBeGreaterThan(0);
    await press(f.tree,'Quay lại');expect(contents(f.tree)).toContain('Thông tin chung');
    expect(f.transport.calls.every(c=>c.method==='GET')).toBe(true);
  }finally{await done(f.tree);}
});

test('root navigation closes the attachment subview without losing or replaying its owner',async()=>{
  const handled=jest.fn(),f=await fixture({onRootRequestHandled:handled});
  try{
    await press(f.tree,'Nhập kho');await press(f.tree,'Mở chứng từ PN-MOCK-10');await press(f.tree,'Xem tất cả tài liệu →');
    const props=f.tree.root.findByType(P12Screen).props;
    await act(async()=>f.tree.update(<AppProviders><P12Screen {...props} rootRequest={91}/></AppProviders>));
    expect(f.tree.root.findAllByProps({testID:'P18.attachments.full'})).toHaveLength(0);
    expect(f.tree.root.findAllByProps({testID:'P12.S01'}).length).toBeGreaterThan(0);
    expect(handled).toHaveBeenCalledWith(91);expect(f.transport.calls.every(c=>c.method==='GET')).toBe(true);
  }finally{await done(f.tree);}
});

test.each(['back','root','session','rights'])('old document reader cannot reopen attachment metadata after %s',async change=>{
  const current=user(),f=await fixture({},undefined,current);
  try{
    await press(f.tree,'Nhập kho');await press(f.tree,'Mở chứng từ PN-MOCK-10');await press(f.tree,'Tài liệu');await press(f.tree,'Mở danh sách tệp');
    const oldRead=f.tree.root.findAllByProps({accessibilityLabel:'Đọc mã chứng từ'}).find(n=>typeof n.props.onPress==='function').props.onPress;
    await act(async()=>{
      if(change==='back')await press(f.tree,'Quay lại');
      else if(change==='root'){const props=f.tree.root.findByType(P12Screen).props;f.tree.update(<AppProviders><P12Screen {...props} rootRequest={92}/></AppProviders>);}
      else if(change==='session')setSession({accessToken:'replacement-test',userId:m.actor,authSessionId:m.id(997),activeWarehouseId:m.warehouse});
      else current.permissions=current.permissions.filter(p=>p!=='inbound.view');
    });
    await act(async()=>oldRead());
    expect(f.tree.root.findAllByType(Dialog).filter(n=>n.props.visible)).toHaveLength(0);
    expect(f.transport.calls.every(c=>c.method==='GET')).toBe(true);
  }finally{await done(f.tree);}
});

test('attachment header bounds a long document number while the source reader keeps its complete value',async()=>{
  const name='PN-'+ 'LONG-'.repeat(35),path='/api/v1/mini-app/inbound-documents/'+m.business;
  const f=await fixture({},transport=>{transport.control.replace[path]=()=>m.response(m.detail({...m.stock('inbound',10),doc_no:name},'inbound'));});
  try{
    await press(f.tree,'Nhập kho');await press(f.tree,'Mở chứng từ PN-MOCK-10');await press(f.tree,'Xem tất cả tài liệu →');
    const heading=f.tree.root.findAll(n=>n.props.children==='Tệp đính kèm '+name&&StyleSheet.flatten(n.props.style)?.fontSize).at(0);
    expect(heading.props.numberOfLines).toBe(2);
    await press(f.tree,'Đọc mã chứng từ');
    expect(f.tree.root.findAllByType(Dialog).filter(n=>n.props.visible)).toHaveLength(1);
    expect(contents(f.tree)).toContain(name);
  }finally{await done(f.tree);}
});

test.each(['android','web'])('%s file entry opens the exact P12 parent/file in P18 and Back restores its caller', async platform => {
  const os = jest.replaceProperty(Platform, 'OS', platform);
  const mode = jest.fn();
  let f;
  try {
    f = await fixture({ onScannerModeChange: mode });
    const download = jest
      .spyOn(f.service, 'download')
      .mockResolvedValue({
        blob: { size: 11, type: 'application/pdf' },
        mime: 'application/pdf',
        name: 'Mock-protocol.pdf',
      });
    await press(f.tree, 'Nhập kho');
    await press(f.tree, 'Mở chứng từ PN-MOCK-10');
    await press(f.tree, 'Tải Mock-protocol.pdf');
    await press(f.tree, 'Xem trong ứng dụng');
    expect(f.tree.root.findByType(P18ViewerScreen)).toBeDefined();
    expect(download.mock.calls[0][0]).toMatchObject({
      id: m.business,
      type: 'inbound',
    });
    expect(download.mock.calls[0][1]).toMatchObject({
      id: m.fileId,
      document_id: m.business,
    });
    expect(mode).toHaveBeenLastCalledWith(true);
    await press(f.tree, 'Về tài liệu');
    expect(f.tree.root.findAllByType(P18ViewerScreen)).toHaveLength(0);
    expect(contents(f.tree)).toContain('PN-MOCK-10');
    expect(mode).toHaveBeenLastCalledWith(false);
  } finally {
    if (f) await act(async () => f.tree.unmount());
    os.restore();
  }
});

async function viewerFixture(currentUser=user()) {
  const os=jest.replaceProperty(Platform,'OS','android');
  let f;
  try {
    f=await fixture({},undefined,currentUser);
    const result={blob:{size:11,type:'application/pdf'},mime:'application/pdf',name:'Mock-protocol.pdf'};
    const binary=jest.spyOn(f.service,'download').mockResolvedValue(result);
    const original=f.service.files.bind(f.service);
    let filePage;
    jest.spyOn(f.service,'files').mockImplementation(async (...args)=>{filePage=await original(...args);return filePage;});
    await press(f.tree,'Nhập kho');
    await press(f.tree,'Mở chứng từ PN-MOCK-10');
    await press(f.tree,'Xem Mock-protocol.pdf');
    return {...f,binary,result,filePage:()=>filePage,async dispose(){await done(f.tree);os.restore();}};
  } catch(error) {if(f)await done(f.tree);os.restore();throw error;}
}

test('P18 integration binds source size and exact owner download, latches same-render taps and shows one saved dialog over the same viewer', async()=>{
  const f=await viewerFixture();
  const save=jest.spyOn(p12Files,'saveP12Binary').mockResolvedValue({uri:'content://offline-test/saved',bytes:11});
  const open=jest.spyOn(p12Files,'openP12File').mockResolvedValue(true);
  let release;
  try {
    const props=f.tree.root.findByType(P18ViewerScreen).props;
    expect(props.fileSize).toBe(f.filePage().items[0].file_size_bytes);
    const before=f.binary.mock.calls.length;
    f.binary.mockImplementationOnce(()=>new Promise(resolve=>{release=resolve;}));
    await act(async()=>{props.onDownload();props.onDownload();});
    expect(f.binary).toHaveBeenCalledTimes(before+1);
    expect(f.binary.mock.calls.at(-1)[0]).toMatchObject({id:m.business,type:'inbound'});
    expect(f.binary.mock.calls.at(-1)[1]).toMatchObject({id:m.fileId,document_id:m.business});
    await act(async()=>release(f.result));
    expect(save).toHaveBeenCalledTimes(1);
    expect(f.tree.root.findByType(P18ViewerScreen).props.name).toBe('Mock-protocol.pdf');
    expect(f.tree.root.findAllByType(Dialog).filter(node=>node.props.visible)).toHaveLength(1);
    expect(contents(f.tree)).toContain(p12Files.p12SaveMessage);
    const oldOpen=f.tree.root.findAllByProps({accessibilityLabel:'Mở tệp'}).find(node=>typeof node.props.onPress==='function').props.onPress;
    await press(f.tree,'Mở tệp');
    expect(open).toHaveBeenCalledTimes(1);
    await press(f.tree,'Đã hiểu');
    await press(f.tree,'Về tài liệu');
    await act(async()=>oldOpen());
    expect(open).toHaveBeenCalledTimes(1);
    expect(contents(f.tree)).toContain('PN-MOCK-10');
    expect(f.transport.calls.every(call=>call.method==='GET')).toBe(true);
  } finally {save.mockRestore();open.mockRestore();await f.dispose();}
});

test.each([
  {version:2}, {checksum_sha256:'new-checksum'}, {id:m.id(999)}, {document_id:m.outbound}, {can_download:false}, {status:'QUARANTINED'},
])('P18 integration rejects a replaced/revoked exact file at action time: %j',async patch=>{
  const f=await viewerFixture();
  try {
    const props=f.tree.root.findByType(P18ViewerScreen).props,before=f.binary.mock.calls.length;
    f.filePage().items[0]={...f.filePage().items[0],...patch};
    await act(async()=>props.onDownload());
    await expect(props.load(new AbortController().signal)).rejects.toThrow('đã thay đổi');
    expect(f.binary).toHaveBeenCalledTimes(before);
  } finally {await f.dispose();}
});

test.each(['back','session','rights'])('P18 integration suppresses a stale viewer download after %s',async change=>{
  const current=user(), f=await viewerFixture(current);
  try {
    const props=f.tree.root.findByType(P18ViewerScreen).props,before=f.binary.mock.calls.length;
    await act(async()=>{
      if(change==='back')props.onBack();
      else if(change==='session')setSession({accessToken:'new-test-session',userId:m.actor,authSessionId:m.id(998),activeWarehouseId:m.warehouse});
      else current.permissions=current.permissions.filter(right=>right!=='inbound.view');
      props.onDownload();
    });
    expect(f.binary).toHaveBeenCalledTimes(before);
  } finally {await f.dispose();}
});

test('P18 integration discards a late binary after leaving the viewer before saving',async()=>{
  const f=await viewerFixture();
  const save=jest.spyOn(p12Files,'saveP12Binary').mockResolvedValue({uri:'content://offline-test/unexpected',bytes:11});
  let release;
  try {
    const props=f.tree.root.findByType(P18ViewerScreen).props;
    f.binary.mockImplementationOnce(()=>new Promise(resolve=>{release=resolve;}));
    await act(async()=>props.onDownload());
    await act(async()=>f.tree.root.findByType(P18ViewerScreen).props.onBack());
    await act(async()=>release(f.result));
    expect(save).not.toHaveBeenCalled();
    expect(contents(f.tree)).not.toContain(p12Files.p12SaveMessage);
    expect(f.tree.root.findAllByType(P18ViewerScreen)).toHaveLength(0);
  } finally {save.mockRestore();await f.dispose();}
});

test.each([250,2200])('P18 integration bounds the filename and reads the original Unicode/newline text (%i)',async length=>{
  const name=('Ảnh😀\n'.repeat(length)).slice(0,length)+'.pdf';
  const path='/api/v1/mini-app/inbound-documents/'+m.business+'/attachments';
  const f=await fixture({},transport=>{transport.control.replace[path]=q=>m.response(m.files('inbound',m.business,q,[{...m.attachment(),file_name:name}]));});
  try {
    await press(f.tree,'Nhập kho');await press(f.tree,'Mở chứng từ PN-MOCK-10');
    expect(f.tree.root.findAll(node=>node.props.children===name&&node.props.numberOfLines===2).length).toBeGreaterThan(0);
    const before=f.transport.calls.length;
    await press(f.tree,'Tài liệu '+name);
    expect(f.tree.root.findAllByType(Dialog).filter(node=>node.props.visible)).toHaveLength(1);
    expect(f.tree.root.findAll(node=>node.props.children===name&&node.props.numberOfLines===undefined).length).toBeGreaterThan(0);
    await press(f.tree,'Đóng');
    expect(f.transport.calls).toHaveLength(before);
  } finally {await done(f.tree);}
});

test('P18 integration restores filename focus after closing its one owner reader',async()=>{
  jest.useFakeTimers();
  let f,focus;
  try {
    f=await fixture();
    await press(f.tree,'Nhập kho');await press(f.tree,'Mở chứng từ PN-MOCK-10');
    const trigger=f.tree.root.findAllByProps({accessibilityLabel:'Tài liệu Mock-protocol.pdf'}).find(node=>node.instance&&typeof node.instance.focus==='function');
    expect(trigger).toBeDefined();
    focus=jest.spyOn(trigger.instance,'focus');
    focus.mockClear(); // RN's shared MockNativeMethods retains earlier focus calls.
    await press(f.tree,'Tài liệu Mock-protocol.pdf');
    expect(focus).not.toHaveBeenCalled();
    await press(f.tree,'Đóng');
    await act(async()=>jest.advanceTimersByTime(50));
    expect(focus).toHaveBeenCalledTimes(1);
    expect(f.tree.root.findAllByType(Dialog).filter(node=>node.props.visible)).toHaveLength(0);
  } finally {focus?.mockRestore();if(f)await done(f.tree);jest.useRealTimers();}
});

test.each([0,2,7])('P18 integration uses the source file count and semantic rows, not four sample files (%i)',async count=>{
  const path='/api/v1/mini-app/inbound-documents/'+m.business+'/attachments';
  const rows=Array.from({length:count},(_,i)=>({...m.attachment(),id:m.id(300+i),file_name:'Tệp-'+i+(i%2?'.png':'.pdf'),content_type:i%2?'image/png':'application/pdf',file_size_bytes:(i+1)*1024}));
  const f=await fixture({},transport=>{transport.control.replace[path]=q=>m.response(m.files('inbound',m.business,q,rows));});
  try {
    await press(f.tree,'Nhập kho');await press(f.tree,'Mở chứng từ PN-MOCK-10');await press(f.tree,'Tài liệu');
    expect(f.tree.root.findByProps({testID:'P18.S01'})).toBeDefined();
    const ids=new Set(f.tree.root.findAll(node=>typeof node.props.testID==='string'&&node.props.testID.startsWith('P12.file.')).map(node=>node.props.testID));
    expect(ids.size).toBe(count);
    for(const row of rows)expect(ids.has('P12.file.'+row.id)).toBe(true);
    if(count) {
      expect(contents(f.tree)).toContain('1.0 KB');
      expect(f.tree.root.findAllByProps({accessibilityLabel:'Tải '+rows[0].file_name}).length).toBeGreaterThan(0);
    } else expect(contents(f.tree)).toContain('Nguồn trả về không có tài liệu.');
    expect(f.transport.calls.every(call=>call.method==='GET')).toBe(true);
  } finally {await done(f.tree);}
});

test('P18 integration keeps a redacted warranty file with missing metadata distinct from an empty source',async()=>{
  const path='/api/v1/mini-app/warranty-cases/'+m.caseId+'/attachments';
  const f=await fixture({},transport=>{transport.control.replace[path]=q=>m.response(m.warranty('attachments',[{id:m.fileId,attachment_id:m.fileId,warranty_case_id:m.caseId,file_name:null,content_type:null,file_size_bytes:null,status:'ACTIVE',can_download:false,download_url:null}],q));});
  try {
    await press(f.tree,'Bảo hành');await press(f.tree,'Mở chứng từ BH-MOCK');await press(f.tree,'Tài liệu');
    expect(f.tree.root.findByProps({testID:'P12.file.'+m.fileId})).toBeDefined();
    expect(contents(f.tree)).toContain('Chưa rõ định dạng · Chưa rõ dung lượng');
    expect(contents(f.tree)).not.toContain('Nguồn trả về không có tài liệu.');
    expect(f.tree.root.findAllByProps({accessibilityLabel:'Tải Chưa xác minh'}).some(node=>node.props.disabled)).toBe(true);
    expect(f.transport.calls.every(call=>call.method==='GET')).toBe(true);
  } finally {await done(f.tree);}
});

test('TC12 detail consumes only discovered snapshot; a redacted creator name is not filled from caller', async () => {
  const f = await fixture({}, t => {
    t.control.replace['/api/v1/mini-app/inbound-documents/' + m.business] =
      () => {
        const b = m.detail();
        b.data.created_by = m.id(101);
        b.meta.p12.owner_projection_contract = 'p12-owner-projection-v1';
        b.data.p12.owner_projection = {
          contract: 'p12-owner-projection-v1',
          revision: 'p12-owner-projection-r1',
          document_id: m.business,
          warehouse_id: m.warehouse,
          source: 'INBOUND',
          supplier: {
            status: 'SNAPSHOT_RECORDED',
            id: m.supplierId,
            name: 'Supplier saved at RECORD',
            name_status: 'SNAPSHOT_RECORDED',
            version: 2,
            recorded_at: '2026-10-18T14:40:07.000000Z',
            source: 'mini_app_inbound_record_metadata',
          },
          creator: {
            actor_id: m.id(101),
            source: 'stock_documents.created_by',
            display_name: null,
            display_name_status: 'HISTORICAL_SNAPSHOT_NOT_RECORDED',
            role: null,
            role_status: 'HISTORICAL_SNAPSHOT_NOT_RECORDED',
            current_display_name: null,
            current_display_name_status: 'REDACTED_PII_PERMISSION',
            current_display_name_source: null,
          },
        };
        return m.response(b);
      };
  });
  try {
    await press(f.tree, 'Nhập kho');
    await press(f.tree, 'Mở chứng từ PN-MOCK-10');
    expect(contents(f.tree)).toContain('Supplier saved at RECORD');
    expect(contents(f.tree)).not.toContain(
      'Tên người tạo được bảo vệ theo quyền.',
    );
    expect(contents(f.tree)).not.toContain('Tên hiện tại từ danh bạ');
    await press(f.tree, 'Đọc đầy đủ Người tạo');
    expect(contents(f.tree)).toContain('Tên người tạo được bảo vệ theo quyền.');
    expect(contents(f.tree)).not.toContain('Creator current label');
  } finally {
    await act(async () => f.tree.unmount());
  }
});

function creatorProjectionDetail(type = 'inbound', redacted = false) {
  const document = type === 'inbound' ? m.business : m.outbound;
  const b = m.detail(m.stock(type, type === 'inbound' ? 10 : 11), type);
  b.data.created_by = m.id(101);
  b.data.free_text_redacted = redacted;
  b.meta.p12.owner_projection_contract = 'p12-owner-projection-v1';
  b.data.p12.owner_projection = {
    contract: 'p12-owner-projection-v1',
    revision: 'p12-owner-projection-r1',
    document_id: document,
    warehouse_id: m.warehouse,
    source: type.toUpperCase(),
    supplier: {
      status: 'NOT_RECORDED',
      id: null,
      name: null,
      name_status: 'NOT_RECORDED',
      version: null,
      recorded_at: null,
      source: null,
    },
    creator: {
      actor_id: m.id(101),
      source: 'stock_documents.created_by',
      display_name: null,
      display_name_status: 'HISTORICAL_SNAPSHOT_NOT_RECORDED',
      role: null,
      role_status: 'HISTORICAL_SNAPSHOT_NOT_RECORDED',
      current_display_name: 'Creator current label',
      current_display_name_status:
        'CURRENT_DIRECTORY_LABEL_NOT_HISTORICAL_SNAPSHOT',
      current_display_name_source: 'app_user.display_name',
    },
  };
  if (type === 'outbound') {
    b.data.p12.owner_projection.supplier.status = 'NOT_APPLICABLE';
    b.data.p12.owner_projection.supplier.name_status = 'NOT_APPLICABLE';
  }
  return b;
}

test.each(['inbound', 'outbound'])(
  'TC12 %s keeps the locked creator row compact; provenance opens only in its read-only reader',
  async type => {
    const currentUser = {
      ...user(),
      permissions: [...m.context().rights, 'iam.user.view'],
    };
    const id = type === 'inbound' ? m.business : m.outbound;
    const ownerIntent = jest.fn();
    const f = await fixture(
      { onOwnerIntent: ownerIntent },
      t => {
        t.control.replace['/api/v1/mini-app/' + type + '-documents/' + id] =
          () => m.response(creatorProjectionDetail(type));
      },
      currentUser,
    );
    try {
      await press(f.tree, type === 'inbound' ? 'Nhập kho' : 'Xuất kho');
      await press(
        f.tree,
        type === 'inbound'
          ? 'Mở chứng từ PN-MOCK-10'
          : 'Mở chứng từ PX-MOCK-11',
      );
      expect(contents(f.tree)).toContain('Creator current label');
      expect(contents(f.tree)).not.toContain('Tên hiện tại từ danh bạ');
      expect(contents(f.tree)).not.toContain('app_user.display_name');
      const reads = f.transport.calls.length;
      await press(f.tree, 'Đọc đầy đủ Người tạo');
      const dialog = f.tree.root.findByType(Dialog);
      expect(dialog.props.visible).toBe(true);
      expect(dialog.props.title).toBe('Người tạo');
      expect(contents(f.tree)).toContain('Creator current label');
      expect(contents(f.tree)).toContain('Tên hiện tại từ danh bạ');
      expect(contents(f.tree)).toContain('app_user.display_name');
      expect(contents(f.tree)).toContain(
        'không phải tên/vai trò tại thời điểm tạo',
      );
      expect(f.transport.calls.length).toBe(reads);
      expect(ownerIntent).not.toHaveBeenCalled();
      await press(f.tree, 'Đóng');
      expect(contents(f.tree)).not.toContain('app_user.display_name');
      expect(contents(f.tree)).toContain('Creator current label');
    } finally {
      await act(async () => f.tree.unmount());
    }
  },
);

test('TC12 free-text redaction cannot reveal the current name or provenance through the compact creator reader', async () => {
  const f = await fixture(
    {},
    t => {
      t.control.replace['/api/v1/mini-app/inbound-documents/' + m.business] =
        () => m.response(creatorProjectionDetail('inbound', true));
    },
    { ...user(), permissions: [...m.context().rights, 'iam.user.view'] },
  );
  try {
    await press(f.tree, 'Nhập kho');
    await press(f.tree, 'Mở chứng từ PN-MOCK-10');
    await press(f.tree, 'Đọc đầy đủ Người tạo');
    expect(contents(f.tree)).toContain('Thông tin được bảo vệ theo quyền');
    expect(contents(f.tree)).not.toContain('Creator current label');
    expect(contents(f.tree)).not.toContain('app_user.display_name');
  } finally {
    await act(async () => f.tree.unmount());
  }
});

test('TC18 append keeps rows/count stable and puts busy feedback in the reserved footer, not above rows', async () => {
  const path = '/api/v1/mini-app/documents',
    rows = Array.from({ length: 25 }, (_, i) =>
      mix.row('INBOUND', 100 + i, '2026-10-10T00:00:00.000000Z'),
    );
  const f = await fixture({}, transport => {
    transport.control.replace[path] = q =>
      m.response(mix.response(q, rows), 200, {
        'X-Content-Type-Options': 'nosniff',
        Vary: 'Authorization',
      });
  });
  try {
    expect(
      f.tree.root
        .findAll(
          n =>
            typeof n.props.accessibilityLabel === 'string' &&
            n.props.accessibilityLabel.startsWith('Mã lỗi P12'),
        )
        .map(n => n.props.accessibilityLabel),
    ).toEqual([]);
    expect(contents(f.tree)).toContain('Đã tải 20');
    f.transport.control.hold[path] = true;
    await press(f.tree, 'Tải thêm chứng từ');
    expect(contents(f.tree).includes('25 kết quả')).toBe(true);
    expect(contents(f.tree)).toContain('Đã tải 20');
    expect(contents(f.tree).includes('Đang đọc dữ liệu…')).toBe(false);
    expect(f.tree.root.findByType(P16DataState).props).toMatchObject({kind:'loading',pending:true,retained:true});
    expect(f.tree.root.findByProps({testID:'P16.refreshing'})).toBeDefined();
    expect(contents(f.tree).includes('Đang tải thêm…')).toBe(true);
    expect(
      f.tree.root
        .findAllByProps({ accessibilityLabel: 'Tải thêm chứng từ' })
        .some(n => n.props.disabled),
    ).toBe(true);
    const count = f.transport.calls.length;
    await press(f.tree, 'Tải thêm chứng từ');
    expect(f.transport.calls).toHaveLength(count);
    await act(async () => {
      f.transport.control.hold[path]();
    });
    expect(contents(f.tree)).toContain('Đã tải 25');
    expect(contents(f.tree)).toContain('PN-MOCK-124');
    expect(
      f.tree.root.findAllByProps({ accessibilityLabel: 'Tải thêm chứng từ' }),
    ).toHaveLength(0);
    expect(f.transport.calls.every(c => c.method === 'GET')).toBe(true);
  } finally {
    if (typeof f.transport.control.hold[path] === 'function')
      f.transport.control.hold[path]();
    await done(f.tree);
  }
});
test('P16 integrated loading uses six real presenter skeleton rows without a second scroller', async () => {
  const path='/api/v1/mini-app/documents';
  const f=await fixture({},transport=>{transport.control.hold[path]=true;});
  try {
    expect(f.tree.root.findByType(P16DataState).props).toMatchObject({kind:'loading',pending:true,retained:false});
    for(let i=0;i<6;i++) expect(f.tree.root.findByProps({testID:'P16.skeleton.'+i})).toBeDefined();
    expect(f.tree.root.findAllByType(ScrollView)).toHaveLength(1);
    expect(StyleSheet.flatten(f.tree.root.findByType(ScrollView).props.contentContainerStyle).flexGrow).toBe(1);
    await act(async()=>{f.transport.control.hold[path]();});
    expect(f.tree.root.findAllByType(P16DataState)).toHaveLength(0);
  } finally { if(typeof f.transport.control.hold[path]==='function')f.transport.control.hold[path](); await done(f.tree); }
});

test('P16 integrated empty All CTA enters the existing create-selection owner', async () => {
  const path='/api/v1/mini-app/documents', intent=jest.fn();
  const f=await fixture({onOwnerIntent:intent},transport=>{transport.control.replace[path]=q=>m.response(mix.response(q,[]),200,{'X-Content-Type-Options':'nosniff',Vary:'Authorization'});});
  try {
    const props=f.tree.root.findByType(P16DataState).props;
    expect(props).toMatchObject({kind:'empty',canCreate:true,sourceLabel:'Tất cả'});
    await act(async()=>props.onCreate());
    expect(f.tree.root.findByProps({testID:'P12.S04'})).toBeDefined();
    expect(intent).not.toHaveBeenCalled();
    expect(f.transport.calls.every(c=>c.method==='GET')).toBe(true);
  } finally {await done(f.tree);}
});

test('P16 typed empty fails closed for create permission', async () => {
  const path='/api/v1/mini-app/inbound-documents';
  const f=await fixture({},transport=>{transport.control.replace[path]=q=>m.response(m.list('inbound',q,[]));},{...user(),permissions:['inbound.view']});
  try {
    await press(f.tree,'Nhập kho');
    const props=f.tree.root.findByType(P16DataState).props;
    expect(props).toMatchObject({kind:'empty',canCreate:false});
    expect(f.tree.root.findAllByProps({accessibilityLabel:'Tạo Nhập kho'})).toHaveLength(0);
    await act(async()=>props.onCreate());
    expect(f.tree.root.findAllByProps({testID:'P12.S04'})).toHaveLength(0);
    expect(f.transport.calls.every(c=>c.method==='GET')).toBe(true);
  } finally {await done(f.tree);}
});

test('P16 queue zero is no-results and removing the queue does not claim the full source was empty', async () => {
  const path='/api/v1/mini-app/inbound-documents';
  const f=await fixture({initialQueue:{source:'inbound',key:'p16-offline-queue'}},transport=>{transport.control.replace[path]=q=>m.response(m.list('inbound',q,[]));});
  try {
    const props=f.tree.root.findByType(P16DataState).props;
    expect(props).toMatchObject({kind:'no-results'});
    expect(props.conditions.map(c=>c.key)).toEqual(['queue']);
    expect(f.transport.calls.at(-1).query.status).toBe('WAITING_APPROVAL');
    await act(async()=>props.conditions[0].onRemove());
    expect(f.transport.calls.at(-1).query.status).toBeUndefined();
    expect(f.tree.root.findByType(P16DataState).props.kind).toBe('empty');
    expect(f.transport.calls.every(c=>c.method==='GET')).toBe(true);
  } finally {await done(f.tree);}
});

test('P16 does not claim empty/no-results for a ready view DTO with unverified total', async () => {
  const f=await fixture();
  const read=f.service.list.bind(f.service);
  jest.spyOn(f.service,'list').mockImplementation(async (...args)=>{
    const page=await read(...args);
    // Test-only owner view DTO: null remains unknown rather than a synthetic0.
    return {...page,items:[],paging:{...page.paging,total:null}};
  });
  try {
    await press(f.tree,'Nhập kho');
    expect(f.tree.root.findAllByType(P16DataState)).toHaveLength(0);
    expect(f.tree.root.findByProps({testID:'P12.list.totalUnknown'})).toBeDefined();
    expect(contents(f.tree)).toContain('Chưa có tổng nguồn');
    expect(contents(f.tree)).not.toContain('0 kết quả');
    expect(f.transport.calls.every(c=>c.method==='GET')).toBe(true);
  } finally {await done(f.tree);}
});

test('P16 no-results removes only the date pair, keeps query/source and uses the existing draft picker', async () => {
  const path='/api/v1/mini-app/documents';
  const f=await fixture({},transport=>{transport.control.replace[path]=q=>m.response(mix.response(q,[]),200,{'X-Content-Type-Options':'nosniff',Vary:'Authorization'});});
  try {
    await edit(f.tree,'Tìm chứng từ','không có');
    await act(async()=>f.tree.root.findAllByType(TextInput).find(n=>n.props.accessibilityLabel==='Tìm chứng từ').props.onSubmitEditing());
    await press(f.tree,'Lọc theo thời gian');
    const date=p08QuickDate(1,'Asia/Ho_Chi_Minh').date;
    await edit(f.tree,'Từ ngày YYYY-MM-DD',date);
    await edit(f.tree,'Đến ngày YYYY-MM-DD',date);
    await press(f.tree,'Áp dụng');
    let props=f.tree.root.findByType(P16DataState).props;
    expect(props.query).toBe('không có');
    expect(props.conditions.map(c=>c.key)).toEqual(['q','date']);
    await act(async()=>props.conditions.find(c=>c.key==='date').onRemove());
    expect(f.transport.calls.at(-1).query).toMatchObject({q:'không có',source:'ALL',cursor:'start'});
    expect(f.transport.calls.at(-1).query.date_from).toBeUndefined();
    expect(f.transport.calls.at(-1).query.date_to).toBeUndefined();
    props=f.tree.root.findByType(P16DataState).props;
    const count=f.transport.calls.length;
    await act(async()=>props.onAdjustFilters());
    expect(f.transport.calls).toHaveLength(count);
    expect(f.tree.root.findAllByProps({accessibilityLabel:'Trạng thái INBOUND:SCANNING'}).length).toBeGreaterThan(0);
    await press(f.tree,'Hủy');
  } finally {await done(f.tree);}
});

test('P16 root error retains safe original code/newlines in the one existing reader and retries GET', async () => {
  const path='/api/v1/mini-app/documents', message='Nguồn tạm ngừng\nThử đọc lại sau.';
  const f=await fixture({},transport=>{transport.control.replace[path]=()=>{const e=new Error(message);e.code='SOURCE_UNAVAILABLE';e.status=503;throw e;};});
  try {
    const props=f.tree.root.findByType(P16DataState).props;
    expect(props).toMatchObject({kind:'error',retained:false,errorCode:'SOURCE_UNAVAILABLE',errorMessage:message});
    await press(f.tree,'Xem chi tiết lỗi SOURCE_UNAVAILABLE');
    expect(contents(f.tree)).toContain('Thử đọc lại sau.');
    expect(f.tree.root.findAllByType(Dialog).filter(n=>n.props.visible)).toHaveLength(1);
    await press(f.tree,'Đóng');
    delete f.transport.control.replace[path];
    await press(f.tree,'Thử đọc lại');
    expect(f.tree.root.findAllByType(P16DataState)).toHaveLength(0);
    expect(f.transport.calls.at(-1)).toMatchObject({method:'GET',query:{cursor:'start'}});
  } finally {await done(f.tree);}
});

test('P16 distinguishes verified empty source from filtered no-match and preserves source on clear', async () => {
  const path = '/api/v1/mini-app/documents';
  const f = await fixture({}, transport => {
    transport.control.replace[path] = q =>
      m.response(mix.response(q, []), 200, {
        'X-Content-Type-Options': 'nosniff',
        Vary: 'Authorization',
      });
  });
  try {
    expect(f.tree.root.findByProps({ testID: 'P16.S02' })).toBeDefined();
    await edit(f.tree, 'Tìm chứng từ', 'không có');
    await act(async () =>
      f.tree.root
        .findByType(TextInput)
        .find(v => v.props.accessibilityLabel === 'Tìm chứng từ')
        .props.onSubmitEditing(),
    );
    expect(f.tree.root.findByProps({ testID: 'P16.S03' })).toBeDefined();
    await press(f.tree, 'Xóa bộ lọc');
    expect(f.tree.root.findByProps({ testID: 'P16.S02' })).toBeDefined();
  } finally {
    await act(async () => f.tree.unmount());
  }
});
test('view-only document user cannot enter any create owner', async () => {
  const readonly = { ...user(), permissions: ['inbound.view'] };
  const f = await fixture({}, undefined, readonly);
  try {
    expect(
      f.tree.root.findAllByProps({ accessibilityLabel: 'Tạo chứng từ' }),
    ).toHaveLength(0);
  } finally {
    await act(async () => f.tree.unmount());
  }
});

test('TC18 append failure keeps prior rows/count, reports the error and offers an explicit first-page GET', async () => {
  const path = '/api/v1/mini-app/documents',
    rows = Array.from({ length: 25 }, (_, i) =>
      mix.row('INBOUND', 100 + i, '2026-10-10T00:00:00.000000Z'),
    );
  let unavailable = false;
  const f = await fixture({}, transport => {
    transport.control.replace[path] = q => {
      if (unavailable) {
        const e = new Error('Nguồn tạm thời không khả dụng');
        e.status = 503;
        e.code = 'SOURCE_UNAVAILABLE';
        throw e;
      }
      return m.response(mix.response(q, rows), 200, {
        'X-Content-Type-Options': 'nosniff',
        Vary: 'Authorization',
      });
    };
  });
  try {
    unavailable = true;
    await press(f.tree, 'Tải thêm chứng từ');
    expect(contents(f.tree)).toContain('PN-MOCK-100');
    expect(contents(f.tree)).toContain('Đã tải 20');
    expect(f.tree.root.findByType(P16DataState).props).toMatchObject({kind:'error',retained:true,retryLabel:'Đọc lại từ trang đầu'});
    expect(f.tree.root.findByProps({testID:'P16.stale'})).toBeDefined();
    expect(
      f.tree.root.findAllByProps({ accessibilityLabel: 'Đọc lại từ trang đầu' })
        .length,
    ).toBeGreaterThan(0);
    expect(
      f.tree.root.findAllByProps({ accessibilityLabel: 'Tải thêm chứng từ' }),
    ).toHaveLength(0);
    unavailable = false;
    await press(f.tree, 'Đọc lại từ trang đầu');
    expect(f.transport.calls.at(-1)).toMatchObject({
      method: 'GET',
      query: { cursor: 'start' },
    });
  } finally {
    await done(f.tree);
  }
});
test('TC13 CTA retains a 44dp touch target at narrow mobile widths', () => {
  expect(p12Layout(320 / 494).createPrimary.minHeight).toBeGreaterThanOrEqual(
    44,
  );
});
async function done(tree) {
  await act(async () => tree.unmount());
}
test('S01 All reads one mixed list, typed source reads canonical rows', async () => {
  const f = await fixture();
  expect(f.transport.calls).toHaveLength(1);
  expect(contents(f.tree)).toContain('BH-MOCK');
  expect(contents(f.tree)).toContain('PN-MOCK-10');
  expect(contents(f.tree)).toContain('PX-MOCK-11');
  expect(contents(f.tree)).not.toContain('Mỗi nhóm');
  await press(f.tree, 'Xuất kho');
  await press(f.tree, 'Mở chứng từ PX-MOCK-11');
  expect(
    f.tree.root.findAllByProps({ testID: 'P12.S02' }).length,
  ).toBeGreaterThan(0);
  await done(f.tree);
});

test('TC11 separates search/scan and date/status controls; sorting stays on the server', async () => {
  const f = await fixture();
  const labels = f.tree.root
    .findAll(v => typeof v.props.onPress === 'function')
    .map(v => v.props.accessibilityLabel);
  expect(labels).toContain('Quét mã để tìm chứng từ');
  expect(labels).toContain('Lọc theo thời gian');
  expect(labels).toContain('Lọc theo trạng thái');
  expect(labels).not.toContain('Bộ lọc');
  expect(labels).toContain('Mới nhất');
  await press(f.tree, 'Lọc theo thời gian');
  expect(contents(f.tree)).toContain('Từ ngày YYYY-MM-DD');
  expect(contents(f.tree)).not.toContain('Trạng thái INBOUND:SCANNING');
  await press(f.tree, 'Hủy');
  await press(f.tree, 'Lọc theo trạng thái');
  expect(contents(f.tree)).toContain('Trạng thái INBOUND:SCANNING');
  expect(contents(f.tree)).not.toContain('Từ ngày YYYY-MM-DD');
  await done(f.tree);
});

test('Document reader entry submits only a server GET search; cancelling never emits owner intent', async () => {
  const intent = jest.fn();
  const f = await fixture({ onOwnerIntent: intent });
  await press(f.tree, 'Quét mã để tìm chứng từ');
  await press(f.tree, 'Dùng đầu đọc / nhập tay');
  const before = f.transport.calls.length;
  await edit(f.tree, 'Mã chứng từ từ đầu đọc', 'PN-MOCK-10');
  expect(f.transport.calls).toHaveLength(before);
  await press(f.tree, 'Tìm chứng từ');
  expect(f.transport.calls.at(-1)).toMatchObject({
    method: 'GET',
    path: '/api/v1/mini-app/documents',
    query: { q: 'PN-MOCK-10' },
  });
  expect(intent).not.toHaveBeenCalled();
  await press(f.tree, 'Quét mã để tìm chứng từ');
  await press(f.tree, 'Dùng đầu đọc / nhập tay');
  const afterSearch = f.transport.calls.length;
  await press(f.tree, 'Hủy');
  expect(f.transport.calls).toHaveLength(afterSearch);
  expect(f.tree.root.findByType(Dialog).props.title).toBe('');
  expect(intent).not.toHaveBeenCalled();
  await done(f.tree);
});

test('TC17 camera result dispatches one scoped GET, keeps filters, and never emits owner intent', async () => {
  const intent = jest.fn(),
    fullscreen = jest.fn(),
    f = await fixture({
      onOwnerIntent: intent,
      onScannerModeChange: fullscreen,
    });
  await press(f.tree, 'Nhập kho');
  expect(f.service.scopeKey()).not.toBe('');
  const cameraScope = f.service.scopeKey();
  await press(f.tree, 'Quét mã để tìm chứng từ');
  expect(f.service.scopeKey()).not.toBe('');
  expect(f.service.scopeKey()).toBe(cameraScope);
  expect({
    camera: f.tree.root.findAllByType(DocumentSearchCamera).length,
    screen: f.tree.root.findAllByType(P12Screen).length,
  }).toEqual({ camera: 1, screen: 1 });
  expect(fullscreen).toHaveBeenLastCalledWith(true);
  const callback = f.tree.root.findByType(DocumentSearchCamera).props.onRead;
  const reads = f.transport.calls.length;
  await act(async () => {
    callback(' PN-MOCK-10 ');
    callback('PN-MOCK-10');
  });
  expect(f.transport.calls).toHaveLength(reads + 1);
  expect(f.transport.calls.at(-1)).toMatchObject({
    method: 'GET',
    path: '/api/v1/mini-app/inbound-documents',
    query: { keyword: 'PN-MOCK-10' },
  });
  expect(f.transport.calls.at(-1).body).toBeUndefined();
  expect(fullscreen).toHaveBeenLastCalledWith(false);
  expect(intent).not.toHaveBeenCalled();
  await done(f.tree);
});

test('TC17 Cancel and a late callback after leaving never search or mutate', async () => {
  const f = await fixture();
  await press(f.tree, 'Quét mã để tìm chứng từ');
  const props = f.tree.root.findByType(DocumentSearchCamera).props,
    before = f.transport.calls.length;
  await press(f.tree, 'Quay lại chứng từ');
  await act(async () => {
    props.onRead('PN-MOCK-10');
  });
  expect(f.transport.calls).toHaveLength(before);
  expect(
    f.tree.root.findAllByProps({ testID: 'P12.S01' }).length,
  ).toBeGreaterThan(0);
  await done(f.tree);
});

test('TC17 old scope and unsupported URL callbacks cannot apply a search to a new caller', async () => {
  const f = await fixture();
  await press(f.tree, 'Quét mã để tìm chứng từ');
  const callback = f.tree.root.findByType(DocumentSearchCamera).props.onRead,
    before = f.transport.calls.length;
  await act(async () => {
    callback('https://external.invalid/document/1?token=x');
  });
  expect(f.transport.calls).toHaveLength(before);
  setSession({
    accessToken: 'other-local-test-only',
    userId: m.actor,
    authSessionId: m.id(999),
    activeWarehouseId: m.warehouse,
  });
  await act(async () => {
    callback('PN-MOCK-10');
  });
  expect(f.transport.calls).toHaveLength(before);
  await done(f.tree);
});
test('Web logical494x950 keeps full header type even on a720px physical host screen', async () => {
  const originalGet=Dimensions.get.bind(Dimensions);
  jest.replaceProperty(Platform,'OS','web');
  jest.spyOn(Dimensions,'get').mockImplementation(kind=>kind==='screen'
    ? {...originalGet(kind),height:720}
    : {...originalGet(kind),width:494,height:950});
  const f=await fixture();
  try {
    const heading=f.tree.root.findAll(n=>n.props.children==='Chứng từ' && StyleSheet.flatten(n.props.style)?.fontSize).at(0);
    expect(StyleSheet.flatten(heading.props.style).fontSize).toBe(26);
  } finally {await done(f.tree);jest.restoreAllMocks();}
});

test('All four detail sections keep tabs; products Back returns detail then list', async () => {
  const f = await fixture();
  await press(f.tree, 'Nhập kho');
  await press(f.tree, 'Mở chứng từ PN-MOCK-10');
  for (const tab of ['Tài liệu', 'Lịch sử', 'Thông tin']) {
    await press(f.tree, tab);
    for (const label of ['Sản phẩm', 'Tài liệu', 'Lịch sử', 'Thông tin'])
      expect(
        f.tree.root.findAllByProps({ accessibilityLabel: label }).length,
      ).toBeGreaterThan(0);
  }
  await press(f.tree, 'Sản phẩm');
  expect(contents(f.tree)).toContain('Chi tiết chứng từ');
  expect(
    f.tree.root.findAllByProps({ accessibilityLabel: 'Thông tin' }).length,
  ).toBeGreaterThan(0);
  await press(f.tree, 'Quay lại');
  expect(
    f.tree.root.findAllByProps({ testID: 'P12.S02' }).length,
  ).toBeGreaterThan(0);
  await press(f.tree, 'Quay lại');
  expect(contents(f.tree)).toContain('PN-MOCK-10');
  expect(
    f.tree.root.findAllByProps({ testID: 'P12.S01' }).length,
  ).toBeGreaterThan(0);
  await done(f.tree);
});

test('TC14 manual product search stays local to loaded evidence; summary and parent/caller remain intact', async () => {
  const back = jest.fn(),
    f = await fixture({
      initialDocument: { type: 'inbound', id: m.business },
      onBack: back,
    });
  await press(f.tree, 'Sản phẩm');
  const reads = f.transport.calls.length;
  await press(f.tree, 'Nhập mã tìm trong phần đã tải');
  await edit(f.tree, 'Mã sản phẩm từ đầu đọc', 'SKU-B');
  await press(f.tree, 'Tìm trong phần đã tải');
  expect(f.transport.calls).toHaveLength(reads);
  expect(
    f.tree.root.findAllByProps({ accessibilityLabel: 'Bằng chứng SKU SKU-A' }),
  ).toHaveLength(0);
  expect(
    f.tree.root.findAllByProps({ accessibilityLabel: 'Bằng chứng SKU SKU-B' })
      .length,
  ).toBeGreaterThan(0);
  expect(contents(f.tree)).toContain('Số SKU nguồn');
  await press(f.tree, 'Quay lại');
  expect(back).not.toHaveBeenCalled();
  await press(f.tree, 'Quay lại');
  expect(back).toHaveBeenCalledTimes(1);
  await done(f.tree);
});

test('TC15 localizes source action and date order without inventing checked/sent milestones', async () => {
  const f = await fixture();
  await press(f.tree, 'Nhập kho');
  await press(f.tree, 'Mở chứng từ PN-MOCK-10');
  await press(f.tree, 'Lịch sử');
  expect(contents(f.tree)).toContain('Lịch sử chứng từ');
  expect(contents(f.tree)).not.toContain('Hoạt động đã ghi nhận');
  for (const milestone of [
    'Tạo chứng từ',
    'Kiểm tra sản phẩm',
    'Gửi phiếu lên Web',
    'Đã ghi sổ',
  ])
    expect(contents(f.tree)).toContain(milestone);
  await press(f.tree, 'Xem lịch sử chi tiết');
  expect(contents(f.tree)).toContain('Bắt đầu quét sản phẩm');
  expect(contents(f.tree)).not.toContain('SCAN_STARTED');
  expect(contents(f.tree)).toContain('11/10/2026 00:00');
  expect(contents(f.tree)).toContain('Chờ xác minh nguồn');
  expect(contents(f.tree)).not.toContain('Đã hoàn tất luồng');
  expect(f.transport.calls.every(c => c.method === 'GET')).toBe(true);
  await done(f.tree);
});

test('TC04 opt-in handoff shows Vietnam time as historical submission while CHECK and actor remain unknown', async () => {
  const b = m.detail();
  b.meta.p12.timeline_contract = 'p12-timeline-handoff-v1';
  b.data.p12.timeline.contract = 'p12-timeline-handoff-v1';
  b.data.p13 = {
    current_handoff_availability: 'RECORDED',
    current_handoff: {
      contract: 'p13-web-post-queue-v1', warehouse_id: m.warehouse,
      source: 'mini_app_web_post_handoffs+stock_documents.status',
      submitted_at: '2026-10-24T08:12:45.123456Z', document_version_at_record: 2,
    },
  };
  b.data.p12.timeline.milestones.sent_to_web = {
    availability: 'RECORDED', occurred_at: '2026-10-24T08:12:45.123456Z',
    timestamp_source: 'mini_app_web_post_handoffs.submitted_at', event_id: null,
    actor: null, actor_status: 'NOT_RECORDED_IN_HANDOFF_SOURCE',
    description: null, description_status: 'NOT_RECORDED_IN_HANDOFF_SOURCE',
    evidence_kind: 'PERSISTED_SUBMISSION_INTENT_NOT_CURRENT_WAITING_OR_DELIVERY_ACK',
    source_record: {table: 'mini_app_web_post_handoffs', document_id: m.business,
      warehouse_id: m.warehouse, document_version_at_record: 2},
  };
  const f = await fixture(
    {initialDocument: {type: 'inbound', id: m.business, tab: 'events'}},
    transport => {
      transport.control.replace['/api/v1/mini-app/inbound-documents/' + m.business] =
        () => m.response(b, 200, {Vary: 'Authorization, X-P12-Timeline-Contract'});
    },
    user(),
    {timelineContract: 'p12-timeline-handoff-v1'},
  );
  expect(contents(f.tree)).toContain('24/10/2026 15:12');
  expect(contents(f.tree)).toContain('chưa phải xác nhận tiếp nhận từ Web');
  expect(contents(f.tree)).toContain('Chờ xác minh nguồn');
  expect(contents(f.tree)).not.toContain('Hoạt động đã ghi nhận');
  expect(f.transport.calls.every(c => c.method === 'GET')).toBe(true);
  await done(f.tree);
});
test('direct document-history entry uses exact canonical document, GET only; no fabricated P08 record ID', async () => {
  const f = await fixture({
    initialDocument: { type: 'inbound', id: m.business, tab: 'events' },
  });
  await press(f.tree, 'Xem lịch sử chi tiết');
  expect(contents(f.tree)).toContain('Bắt đầu quét sản phẩm');
  expect(f.transport.calls.every(c => c.method === 'GET')).toBe(true);
  expect(JSON.stringify(f.transport.calls)).not.toContain('DOCUMENT:');
  await done(f.tree);
});

test('TC16 explicit root request closes read panels/dialogs and preserves local create metadata without owner writes', async () => {
  const ack = jest.fn(),
    intent = jest.fn(),
    f = await fixture({ onRootRequestHandled: ack, onOwnerIntent: intent });
  const rootRequest = async value => {
    const props = f.tree.root.findByType(P12Screen).props;
    await act(async () =>
      f.tree.update(
        <AppProviders>
          <P12Screen {...props} rootRequest={value} />
        </AppProviders>,
      ),
    );
  };
  await press(f.tree, 'Nhập kho');
  await press(f.tree, 'Mở chứng từ PN-MOCK-10');
  await press(f.tree, 'Lịch sử');
  await press(f.tree, 'Tác vụ chứng từ');
  await rootRequest(1);
  expect(
    f.tree.root.findAllByProps({ testID: 'P12.S01' }).length,
  ).toBeGreaterThan(0);
  expect(ack).toHaveBeenCalledWith(1);
  expect(f.tree.root.findByType(Dialog).props.title).toBe('');
  await rootRequest(undefined);
  await press(f.tree, 'Tạo chứng từ');
  await edit(f.tree, 'Ghi chú chứng từ', 'Giữ metadata Unicode 長😀');
  await rootRequest(2);
  expect(
    f.tree.root.findAllByProps({ testID: 'P12.S01' }).length,
  ).toBeGreaterThan(0);
  await rootRequest(undefined);
  await press(f.tree, 'Tạo chứng từ');
  expect(contents(f.tree)).toContain('Giữ metadata Unicode 長😀');
  expect(intent).not.toHaveBeenCalled();
  expect(f.transport.calls.every(c => c.method === 'GET')).toBe(true);
  expect(ack).toHaveBeenCalledTimes(2);
  await done(f.tree);
});

test('TC16 root reselect does not abort the currently loading root list', async () => {
  const f = await fixture();
  const path = '/api/v1/mini-app/inbound-documents';
  f.transport.control.hold[path] = true;
  await press(f.tree, 'Nhập kho');
  const pending = f.transport.calls.at(-1);
  expect(pending.path).toBe(path);
  const props = f.tree.root.findByType(P12Screen).props;
  await act(async () =>
    f.tree.update(
      <AppProviders>
        <P12Screen {...props} rootRequest={1} />
      </AppProviders>,
    ),
  );
  expect(pending.signal.aborted).toBe(false);
  await act(async () => {
    f.transport.control.hold[path]();
  });
  expect(contents(f.tree)).toContain('PN-MOCK-10');
  expect(
    f.tree.root.findAllByProps({ testID: 'P12.S01' }).length,
  ).toBeGreaterThan(0);
  await done(f.tree);
});

test('TC12 info uses owner fields, copy action, inline note/files and read-only menu', async () => {
  const copy = jest.fn(async () => undefined),
    intent = jest.fn();
  const f = await fixture({ copyText: copy, onOwnerIntent: intent });
  await press(f.tree, 'Nhập kho');
  await press(f.tree, 'Mở chứng từ PN-MOCK-10');
  expect(contents(f.tree)).toContain('Thông tin chung');
  expect(contents(f.tree)).toContain('Loại chứng từ');
  expect(contents(f.tree)).toContain('Nhà cung cấp');
  expect(contents(f.tree)).toContain('Tài liệu đính kèm');
  expect(contents(f.tree)).toContain('Mock-protocol.pdf');
  expect(contents(f.tree)).not.toContain('NCC protocol test');
  const copySlot = f.tree.root.findByProps({
    accessibilityLabel: 'Sao chép mã chứng từ',
  });
  const lockSlot = f.tree.root.findByProps({ testID: 'P12.warehouse.lock' });
  expect(StyleSheet.flatten(lockSlot.props.style)).toMatchObject(
    StyleSheet.flatten(copySlot.props.style),
  );
  await press(f.tree, 'Đọc đầy đủ Nhà cung cấp');
  expect(contents(f.tree)).toContain('Chưa xác minh');
  await press(f.tree, 'Đóng');
  await press(f.tree, 'Sao chép mã chứng từ');
  expect(copy).toHaveBeenCalledWith('PN-MOCK-10');
  expect(contents(f.tree)).toContain('Đã sao chép mã chứng từ.');
  await press(f.tree, 'Đóng');
  await press(f.tree, 'Tác vụ chứng từ');
  expect(contents(f.tree)).toContain('Tải lại thông tin');
  expect(contents(f.tree)).toContain('Đọc nguồn nhập');
  expect(contents(f.tree)).not.toContain('RECORD');
  const beforeRefresh = f.transport.calls.length;
  await press(f.tree, 'Tải lại thông tin');
  expect(f.transport.calls.slice(beforeRefresh).map(c => c.path)).toEqual([
    '/api/v1/mini-app/inbound-documents/' + m.business,
    '/api/v1/mini-app/inbound-documents/' + m.business + '/attachments',
  ]);
  await press(f.tree, 'Tác vụ chứng từ');
  await press(f.tree, 'Xem tài liệu');
  expect(contents(f.tree)).toContain('Mock-protocol.pdf');
  expect(
    f.tree.root
      .findAllByProps({ accessibilityLabel: 'Tài liệu' })
      .some(n => n.props.accessibilityState?.selected === true),
  ).toBe(true);
  expect(intent).not.toHaveBeenCalled();
  expect(f.transport.calls.every(c => c.method === 'GET')).toBe(true);
  await done(f.tree);
});

test('TC12 file denial stays a partial child error, not empty/missing parent', async () => {
  const f = await fixture();
  f.transport.control.fail[
    '/api/v1/mini-app/inbound-documents/' + m.business + '/attachments'
  ] = 403;
  await press(f.tree, 'Nhập kho');
  await press(f.tree, 'Mở chứng từ PN-MOCK-10');
  expect(contents(f.tree)).toContain('Thông tin chung');
  expect(contents(f.tree)).toContain('PN-MOCK-10');
  expect(contents(f.tree)).toContain('Tài liệu đính kèm');
  expect(contents(f.tree)).not.toContain('Nguồn trả về không có tài liệu.');
  expect(f.tree.root.findAllByType(P16DataState)).toHaveLength(0);
  expect(f.tree.root.findAll(node=>['P16.S01','P16.S02','P16.S03','P16.S04'].includes(node.props.testID))).toHaveLength(0);
  expect(
    f.tree.root.findAllByProps({ accessibilityLabel: 'Thử đọc lại' }).length,
  ).toBeGreaterThan(0);
  await done(f.tree);
});

test('TC12 direct owner detail uses same inline presentation; late copy does not replace caller after Back', async () => {
  let resolveCopy;
  const copy = jest.fn(
    () =>
      new Promise(resolve => {
        resolveCopy = resolve;
      }),
  );
  const back = jest.fn();
  const f = await fixture({
    initialDocument: { type: 'inbound', id: m.business },
    copyText: copy,
    onBack: back,
  });
  expect(contents(f.tree)).toContain('Mock-protocol.pdf');
  await press(f.tree, 'Sao chép mã chứng từ');
  await press(f.tree, 'Quay lại');
  await act(async () => {
    resolveCopy();
  });
  expect(contents(f.tree)).not.toContain('Đã sao chép mã chứng từ.');
  expect(back).toHaveBeenCalledTimes(1);
  await done(f.tree);
});
test('All filter uses canonical source-qualified status; Cancel is inert', async () => {
  const f = await fixture();
  await press(f.tree, 'Lọc theo trạng thái');
  expect(contents(f.tree)).toContain('Nhập kho · SCANNING');
  await press(f.tree, 'Trạng thái INBOUND:SCANNING');
  expect(f.transport.calls).toHaveLength(1);
  await press(f.tree, 'Hủy');
  expect(f.transport.calls).toHaveLength(1);
  await done(f.tree);
});
test('All applies qualified status and paired dates on the server; Back retains All', async () => {
  const f = await fixture();
  await press(f.tree, 'Lọc theo trạng thái');
  await press(f.tree, 'Trạng thái INBOUND:SCANNING');
  await press(f.tree, 'Áp dụng');
  expect(f.transport.calls.at(-1)).toMatchObject({
    path: '/api/v1/mini-app/documents',
    query: { source: 'ALL', status: 'INBOUND:SCANNING' },
  });
  const beforeOpen = f.transport.calls.length;
  await press(f.tree, 'Mở chứng từ PN-MOCK-10');
  expect(f.transport.calls.slice(beforeOpen).map(c => c.path)).toEqual([
    '/api/v1/mini-app/inbound-documents/' + m.business,
    '/api/v1/mini-app/inbound-documents/' + m.business + '/attachments',
  ]);
  await press(f.tree, 'Quay lại');
  expect(contents(f.tree)).toContain('PN-MOCK-10');
  expect(contents(f.tree)).not.toContain('PX-MOCK-11');
  await press(f.tree, 'Lọc theo thời gian');
  await edit(f.tree, 'Từ ngày YYYY-MM-DD', '2026-10-01');
  await press(f.tree, 'Áp dụng');
  expect(contents(f.tree)).toContain('Chọn đủ Từ ngày');
  await edit(f.tree, 'Đến ngày YYYY-MM-DD', '2026-10-12');
  await press(f.tree, 'Áp dụng');
  expect(f.transport.calls.at(-1).query).toMatchObject({
    status: 'INBOUND:SCANNING',
    date_from: '2026-10-01',
    date_to: '2026-10-12',
  });
  await done(f.tree);
});
test('Typed source retains final momentum offset rather than last throttled scroll sample', async () => {
  const retained = {},
    f = await fixture({ retained });
  await press(f.tree, 'Nhập kho');
  const content = f.tree.root
    .findAllByType(ScrollView)
    .find(v => typeof v.props.onScroll === 'function');
  await act(async () => {
    content.props.onScroll({ nativeEvent: { contentOffset: { y: 500 } } });
    content.props.onScrollEndDrag({
      nativeEvent: { contentOffset: { y: 510 } },
    });
    content.props.onMomentumScrollEnd({
      nativeEvent: { contentOffset: { y: 527 } },
    });
  });
  await press(f.tree, 'Mở chứng từ PN-MOCK-10');
  await press(f.tree, 'Quay lại');
  await done(f.tree);
  expect(retained.current.scroll.list).toBe(527);
});
test('Long note reader keeps full raw text and modal backdrop cannot close it', async () => {
  const f = await fixture();
  f.transport.control.replace[
    '/api/v1/mini-app/inbound-documents/' + m.business
  ] = () => m.response(m.detail({ ...m.stock(), note: '<>&😀\n'.repeat(800) }));
  await press(f.tree, 'Nhập kho');
  await press(f.tree, 'Mở chứng từ PN-MOCK-10');
  await press(f.tree, 'Xem đầy đủ ghi chú');
  expect(contents(f.tree)).toContain('<>&😀\\n');
  expect(f.tree.root.findByType(Modal).props.visible).toBe(true);
  await press(f.tree, 'Đóng');
  expect(f.tree.root.findByType(Modal).props.visible).toBe(false);
  await done(f.tree);
});
test('Filter Cancel leaves old query; Apply validates hand date order', async () => {
  const f = await fixture();
  await press(f.tree, 'Nhập kho');
  const before = f.transport.calls.length;
  await press(f.tree, 'Lọc theo thời gian');
  await edit(f.tree, 'Từ ngày YYYY-MM-DD', '2099-01-01');
  await press(f.tree, 'Áp dụng');
  expect(contents(f.tree)).toContain('90 ngày');
  expect(f.transport.calls.length).toBe(before);
  await press(f.tree, 'Hủy');
  expect(f.transport.calls.length).toBe(before);
  await done(f.tree);
});
test('S04 invalid Unicode length stays local; valid seed emits only owner intent', async () => {
  jest.useFakeTimers({ now: new Date('2026-10-18T10:00:00Z') });
  const intent = jest.fn(),
    f = await fixture({ onOwnerIntent: intent });
  await press(f.tree, 'Tạo chứng từ');
  await press(f.tree, 'Chọn nhà cung cấp');
  await act(async () => jest.advanceTimersByTime(300));
  await press(f.tree, 'Danh mục GLOBAL mock');
  await press(f.tree, 'Áp dụng');
  await press(f.tree, 'Chọn ngày chứng từ');
  await edit(f.tree, 'Ngày chứng từ YYYY-MM-DD', '2026-10-10');
  await press(f.tree, 'Chọn ngày');
  const readsBefore = f.transport.calls.length;
  await edit(f.tree, 'Ghi chú chứng từ', '😀'.repeat(1001));
  expect(contents(f.tree)).toContain('tối đa 1000');
  expect(intent).not.toHaveBeenCalled();
  await edit(f.tree, 'Ghi chú chứng từ', '😀'.repeat(1000));
  await press(f.tree, 'Tiếp tục thêm sản phẩm');
  expect(intent).toHaveBeenCalledTimes(1);
  expect(intent.mock.calls[0][0].seed.note).toBe('😀'.repeat(1000));
  expect(intent.mock.calls[0][0].seed).toMatchObject({
    supplierId: m.supplierId,
    docDate: '2026-10-10',
  });
  expect(f.transport.calls).toHaveLength(readsBefore);
  await done(f.tree);
  jest.useRealTimers();
});

test('TC13 create is local, hides parent footer through mode callback, retains metadata on Back, and rejects missing/future date', async () => {
  jest.useFakeTimers({ now: new Date('2026-10-18T10:00:00Z') });
  const intent = jest.fn(),
    mode = jest.fn(),
    f = await fixture({ onOwnerIntent: intent, onCreateModeChange: mode });
  try {
    const reads = f.transport.calls.length;
    await press(f.tree, 'Tạo chứng từ');
    expect(mode).toHaveBeenLastCalledWith(true);
    expect(contents(f.tree)).toContain('Thông tin phiếu');
    expect(contents(f.tree)).not.toContain('Ngày tạo');
    await press(f.tree, 'Tiếp tục thêm sản phẩm');
    expect(intent).not.toHaveBeenCalled();
    expect(f.transport.calls).toHaveLength(reads);
    await press(f.tree, 'Chọn ngày chứng từ');
    await edit(f.tree, 'Ngày chứng từ YYYY-MM-DD', '2099-01-01');
    await press(f.tree, 'Chọn ngày');
    expect(contents(f.tree)).toContain('đến hôm nay');
    await edit(f.tree, 'Ngày chứng từ YYYY-MM-DD', '2026-02-31');
    await press(f.tree, 'Chọn ngày');
    expect(contents(f.tree)).toContain('đến hôm nay');
    await edit(f.tree, 'Ngày chứng từ YYYY-MM-DD', '2026-10-10');
    await press(f.tree, 'Chọn ngày');
    expect(contents(f.tree)).toContain('10/10/2026');
    await edit(f.tree, 'Ghi chú chứng từ', 'Ghi chú giữ nguyên');
    await press(f.tree, 'Quay lại');
    expect(mode).toHaveBeenLastCalledWith(false);
    await press(f.tree, 'Tạo chứng từ');
    expect(contents(f.tree)).toContain('Ghi chú giữ nguyên');
    expect(contents(f.tree)).toContain('10/10/2026');
    await press(f.tree, 'Xóa ngày chứng từ');
    expect(contents(f.tree)).not.toContain('10/10/2026');
    expect(f.transport.calls.every(c => c.method === 'GET')).toBe(true);
    expect(intent).not.toHaveBeenCalled();
  } finally {
    await done(f.tree);
    jest.useRealTimers();
  }
});
test('RFC3339 explicit offsets display same verified VN time; SQL forms fail closed', () => {
  expect(documentTime('2026-10-09T05:52:34+07:00')).toBe(
    documentTime('2026-10-08T22:52:34.000000Z'),
  );
  expect(documentTime('2026-10-08 22:52:34+00')).toBe(
    'Chưa có thời điểm ghi nhận',
  );
  expect(documentTime('wrong')).toBe('Chưa có thời điểm ghi nhận');
});

test('Pending search cannot switch back to old source after source change', async () => {
  jest.useFakeTimers();
  const f = await fixture();
  await press(f.tree, 'Nhập kho');
  await edit(f.tree, 'Tìm chứng từ', 'PX');
  await press(f.tree, 'Xuất kho');
  const after = f.transport.calls.length;
  await act(async () => jest.advanceTimersByTime(400));
  expect(f.transport.calls.length).toBe(after);
  expect(f.transport.calls.at(-1)).toMatchObject({
    path: '/api/v1/mini-app/outbound-documents',
    query: { keyword: 'PX' },
  });
  await done(f.tree);
  jest.useRealTimers();
});
test('Pending search hides older rows and dispatches only the visible query after debounce', async () => {
  jest.useFakeTimers();
  const f = await fixture();
  await press(f.tree, 'Nhập kho');
  const stalePress = f.tree.root
    .findAllByProps({ accessibilityLabel: 'Mở chứng từ PN-MOCK-10' })
    .find(node => typeof node.props.onPress === 'function').props.onPress;
  await edit(f.tree, 'Tìm chứng từ', 'draft');
  expect(
    f.tree.root.findAllByProps({
      accessibilityLabel: 'Mở chứng từ PN-MOCK-10',
    }),
  ).toHaveLength(0);
  await act(async () => stalePress());
  await act(async () => jest.advanceTimersByTime(400));
  expect(f.transport.calls.at(-1).query.keyword).toBe('draft');
  expect(
    f.tree.root.findAllByProps({ testID: 'P12.S01' }).length,
  ).toBeGreaterThan(0);
  await done(f.tree);
  jest.useRealTimers();
});
test('P05 detail handoff retains authoritative contact snapshots and fallback TEXT address', async () => {
  const f = await fixture();
  f.transport.control.replace[
    '/api/v1/mini-app/outbound-documents/' + m.outbound
  ] = () =>
    m.response(
      m.detail(
        {
          ...m.stock('outbound', 11),
          recipient_name_snapshot: 'Snapshot name',
          recipient_phone_snapshot: '0901234567',
          recipient_contact_phone: 'old',
          recipient_address: 'TEXT street',
        },
        'outbound',
      ),
    );
  await press(f.tree, 'Xuất kho');
  await press(f.tree, 'Mở chứng từ PX-MOCK-11');
  expect(contents(f.tree)).toContain('0901234567');
  expect(contents(f.tree)).toContain('TEXT street');
  expect(contents(f.tree)).toContain('Snapshot name');
  await done(f.tree);
});
