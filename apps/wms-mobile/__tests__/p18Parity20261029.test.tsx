jest.mock('../src/native/p18Preview', () => ({
  openP18Preview: jest.fn(),
  renderP18Page: jest.fn(),
  closeP18Preview: jest.fn(),
}));
import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { Image, Platform, StyleSheet } from 'react-native';
import {UI_KIT_COLORS as kit} from '../src/theme/uiKitV3';
import { AppProviders } from '../src/app/App';
import {
  P18ReadableText,
  P18Value,
} from '../src/features/warranty/P18ReadableText';
import { P18HandoverScreen } from '../src/features/warranty/P18HandoverScreen';
import { P18ViewerScreen } from '../src/features/warranty/P18ViewerScreen';
import { P18BoxesScreen } from '../src/features/warehouse/P18BoxesScreen';
import { P09Action, P09Dialog } from '../src/features/warranty/P09Presentation';
import { Input } from '../src/ui/Input';
import { Checkbox } from '../src/ui/Checkbox';
import { Button } from '../src/ui/Button';
import { Page } from '../src/ui/Page';
import { caseRow } from './fixtures/p09Mock';
import { setSession, clearSession } from '../src/auth/session';
import {
  createMemoryBackend,
  createStorage,
  setAppStorageForTesting,
} from '../src/storage/storage';
import { resetHardwareBackForTest } from '../src/app/useHardwareBack';
import {
  parseBoxes,
  boxQuery,
  type BoxQuery,
} from '../src/services/wms/p18Boxes';
import type { BeReleasedReads } from '../src/services/wms/beReleasedReads';
import {
  boxBody,
  scope,
  actor,
  session,
  warehouse,
} from './fixtures/beReleasedReads20261024';
import { openP18Preview, renderP18Page } from '../src/native/p18Preview';

const mounted: Renderer.ReactTestRenderer[] = [];
test('Web PDF controls retain kit geometry and explicit disabled paints while read is pending',async()=>{
  const previous=Platform.OS;
  try {
    Object.defineProperty(Platform,'OS',{value:'web',configurable:true});
    const tree=await mount(<P18ViewerScreen name="UI-only.pdf" ownerKey="ui-only-pending" load={()=>new Promise(()=>{})} isCurrent={()=>true} onBack={()=>{}}/>);
    const select=tree.root.findByType('select' as any);
    expect(select.props.disabled).toBe(true);
    expect(select.props.style).toMatchObject({borderRadius:8,background:kit['action.disabled.bg'],color:kit['action.disabled.fg'],border:`1px solid ${kit['action.disabled.border']}`});
    const zoom=tree.root.findAll(n=>n.props.accessibilityLabel==='Phóng to'&&typeof n.props.onPress==='function')[0];
    expect(StyleSheet.flatten(zoom.props.style)).toMatchObject({borderRadius:8,backgroundColor:kit['action.disabled.bg'],borderColor:kit['action.disabled.border']});
    const download=tree.root.findAllByType(Button).find(n=>n.props.label==='Tải xuống')!;
    expect(download.props.disabled).toBe(true);
    expect(download.props.leading.props.xml).toContain(`stroke="${kit['action.disabled.fg']}"`);
  } finally {Object.defineProperty(Platform,'OS',{value:previous,configurable:true});}
});
jest.setTimeout(20000);
beforeEach(() => {
  jest.clearAllMocks();
  setAppStorageForTesting(createStorage(createMemoryBackend()));
  setSession({
    accessToken: 'offline-ui-only',
    userId: actor,
    authSessionId: session,
    activeWarehouseId: warehouse,
  });
  resetHardwareBackForTest();
});
afterEach(async () => {
  await act(async () => mounted.splice(0).forEach(tree => tree.unmount()));
  clearSession();
  resetHardwareBackForTest();
});
async function mount(node: React.ReactElement) {
  let tree!: Renderer.ReactTestRenderer;
  await act(async () => {
    tree = Renderer.create(<AppProviders>{node}</AppProviders>);
  });
  mounted.push(tree);
  return tree;
}
const json = (tree: Renderer.ReactTestRenderer) =>
  JSON.stringify(tree.toJSON());
const press = async (tree: Renderer.ReactTestRenderer, label: string) =>
  act(async () => {
    tree.root
      .findAll(
        node =>
          node.props.accessibilityLabel === label &&
          typeof node.props.onPress === 'function',
      )[0]
      .props.onPress();
  });
const formDraft = {
  receiver: 'TEST receiver',
  handover_date: '2026-10-20',
  handover_checked: true,
  note: 'TEST handover',
};

test('read-only long Unicode source uses a single dialog and changing identity removes its old payload', async () => {
  const value = ('Đã kiểm tra 🌸\n' + 'X'.repeat(240) + '\n').repeat(8);
  const tree = await mount(
    <P18ReadableText label="Kỹ thuật xử lý" value={value} lines={3} />,
  );
  await press(tree, 'Xem đầy đủ kỹ thuật xử lý');
  expect(tree.root.findAllByType(P09Dialog)).toHaveLength(1);
  expect(tree.root.findByType(P09Dialog).props.message).toBe(value);
  expect(tree.root.findByType(P09Dialog).props.dismissOnBackdrop).toBe(false);
  await act(async () =>
    tree.update(
      <AppProviders>
        <P18ReadableText label="Kỹ thuật xử lý" value="Hồ sơ khác" lines={3} />
      </AppProviders>,
    ),
  );
  expect(tree.root.findAllByType(P09Dialog)).toHaveLength(0);
  expect(json(tree)).not.toContain(value);
});

test('handover card keeps the active case/serial/status and readonly missing date distinct from zero', async () => {
  const current = {
    ...caseRow(),
    warranty_case_code: 'BH-TEST-005',
    status: 'COMPLETED' as const,
    sku_name: 'Máy TEST',
    serial_number: 'SERIAL-TEST-05',
    received_at: null,
    confirmed_defect: 'Nội dung được che',
    free_text_redacted: true,
  };
  const tree = await mount(
    <P18HandoverScreen
      current={current}
      draft={formDraft}
      onChange={jest.fn()}
      onBack={jest.fn()}
      onConfirm={jest.fn()}
      blocked={false}
      busy={false}
      recovery={null}
    />,
  );
  // The form-first layout retains these source fields behind its explicit
  // expansion; opening it must preserve null/redaction rather than seed data.
  const details=tree.root.findAllByProps({accessibilityLabel:'Thông tin bảo hành và kỹ thuật'}).find(n=>typeof n.props.onPress==='function')!;
  expect(tree.root.findAllByType(P18Value)).toHaveLength(0);
  await act(async()=>details.props.onPress());
  const values = tree.root.findAllByType(P18Value);
  expect(values.find(row => row.props.label === 'Số phiếu')?.props.value).toBe(
    'BH-TEST-005',
  );
  expect(values.find(row => row.props.label === 'Số serial')?.props.value).toBe(
    'SERIAL-TEST-05',
  );
  expect(
    values.find(row => row.props.label === 'Ngày tiếp nhận')?.props.value,
  ).toBeNull();
  expect(
    values.find(row => row.props.label === 'Kỹ thuật xử lý')?.props.value,
  ).toBe('Nội dung được ẩn theo quyền');
  expect(json(tree)).toContain('Thông tin bảo hành');
  expect(json(tree)).toContain('Thông tin bàn giao');
  expect(json(tree)).not.toContain('BH-001');
});

test('busy handover blocks fields/Back/confirm at handler level without changing the source draft', async () => {
  const change = jest.fn(),
    back = jest.fn(),
    confirm = jest.fn();
  const draft = { ...formDraft };
  const tree = await mount(
    <P18HandoverScreen
      current={{ ...caseRow(), status: 'COMPLETED' }}
      draft={draft}
      onChange={change}
      onBack={back}
      onConfirm={confirm}
      blocked={false}
      busy
      recovery={null}
    />,
  );
  await act(async () => {
    tree.root.findByType(Checkbox).props.onToggle();
    tree.root
      .findAllByType(Input)
      .forEach(field => field.props.onChangeText('different'));
    tree.root
      .findAllByType(P09Action)
      .forEach(button => button.props.onPress());
  });
  expect(change).not.toHaveBeenCalled();
  expect(back).not.toHaveBeenCalled();
  expect(confirm).not.toHaveBeenCalled();
  expect(draft).toEqual(formDraft);
  expect(
    tree.root
      .findAllByType(Input)
      .every(field => field.props.editable === false),
  ).toBe(true);
});

test('invalid form keeps field validation and the existing note limit, never confirms', async () => {
  const confirm = jest.fn();
  const tree = await mount(
    <P18HandoverScreen
      current={{ ...caseRow(), status: 'COMPLETED' }}
      draft={{
        receiver: '',
        handover_date: '',
        handover_checked: false,
        note: '',
      }}
      onChange={jest.fn()}
      onBack={jest.fn()}
      onConfirm={confirm}
      blocked={false}
      busy={false}
      recovery={null}
    />,
  );
  await act(async () =>
    tree.root
      .findAllByType(P09Action)
      .find(button => button.props.label === 'Xác nhận bàn giao')!
      .props.onPress(),
  );
  expect(confirm).not.toHaveBeenCalled();
  expect(
    tree.root.findAllByType(Input).every(field => !!field.props.errorText),
  ).toBe(true);
  expect(
    tree.root
      .findAllByType(Input)
      .find(field => field.props.label === 'Ghi chú bàn giao*')!.props
      .maxLength,
  ).toBe(2000);
});

test('viewer unavailable remains an error, disables fit/pager/download and retry keeps the original read owner', async () => {
  const load = jest.fn().mockRejectedValue(new Error('Bộ xem chưa sẵn sàng'));
  const tree = await mount(
    <P18ViewerScreen
      name="TEST.pdf"
      ownerKey="owner-one"
      load={load}
      isCurrent={() => true}
      onBack={jest.fn()}
    />,
  );
  expect(json(tree)).toContain('Xem tài liệu');
  expect(json(tree)).toContain('Không xem được tài liệu');
  expect(tree.root.findAllByType(Image)).toHaveLength(0);
  expect(openP18Preview).not.toHaveBeenCalled();
  expect(renderP18Page).not.toHaveBeenCalled();
  for (const label of [
    'Vừa trang',
    'Vừa chiều rộng',
    'Trang trước',
    'Trang sau',
  ]) {
    const node = tree.root.findAll(
      n =>
        n.props.accessibilityLabel === label &&
        typeof n.props.onPress === 'function',
    )[0];
    expect(node.props.disabled).toBe(true);
  }
  expect(
    tree.root
      .findAllByType(Button)
      .find(button => button.props.label === 'Tải xuống')!.props.disabled,
  ).toBe(true);
  await act(async () =>
    tree.root
      .findAllByType(Button)
      .find(button => button.props.label === 'Đọc lại tài liệu')!
      .props.onPress(),
  );
  expect(load).toHaveBeenCalledTimes(2);
});

test('BOX empty copy is filter-specific and clearing filters reads only the current warehouse owner', async () => {
  const boxes = jest.fn(async (_query: Partial<BoxQuery> = {}) => ({
    items: [],
    total: 0,
    page: 1,
    lastPage: 1,
    perPage: 20,
  }));
  const service = {
    scopeKey: () => 'ui-scope',
    boxes,
    box: jest.fn(),
  } as unknown as BeReleasedReads;
  const tree = await mount(
    <P18BoxesScreen
      context={{}}
      initialKeyword="DCA-BITSET"
      service={service}
      onBack={jest.fn()}
    />,
  );
  expect(json(tree)).toContain('Không có BOX trong bộ lọc này.');
  expect(json(tree)).toContain('Từ khóa: DCA-BITSET');
  await act(async () =>
    tree.root
      .findAllByType(Button)
      .find(button => button.props.label === 'Xóa bộ lọc')!
      .props.onPress(),
  );
  expect(boxes.mock.calls.at(-1)?.[0]).toMatchObject({
    keyword: '',
    skuType: 'ALL',
    page: 1,
  });
  expect(service.box).not.toHaveBeenCalled();
});

test('BOX detail preserves exact ID and absent capacity; Back retains list without a second read', async () => {
  const page = parseBoxes(boxBody(), scope(), boxQuery());
  const boxes = jest.fn(async (_query: Partial<BoxQuery> = {}) => page),
    detail = jest.fn(async (_id: string) => page.items[0]);
  const service = {
    scopeKey: () => 'ui-scope',
    boxes,
    box: detail,
  } as unknown as BeReleasedReads;
  const tree = await mount(
    <P18BoxesScreen context={{}} service={service} onBack={jest.fn()} />,
  );
  await press(tree, 'Chi tiết BOX ' + page.items[0].code);
  expect(detail.mock.calls[0][0]).toBe(page.items[0].id);
  expect(json(tree)).toContain('Thông tin BOX');
  expect(json(tree)).toContain('Thông tin lưu trữ');
  expect(json(tree)).not.toContain('A1');
  expect(page.items[0].capacity.supplied).toBe(false);
  await act(async () => tree.root.findByType(Page).props.onBack());
  expect(boxes).toHaveBeenCalledTimes(1);
  expect(json(tree)).toContain(page.items[0].code);
});
