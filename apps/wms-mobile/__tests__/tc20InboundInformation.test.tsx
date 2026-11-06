/** TC20 Note criteria. Local component fixtures only, no live SAVE/auth. */
import React from 'react';
import Renderer, {act} from 'react-test-renderer';
import { AppProviders } from '../src/app/App';
import { InboundCreateScreen } from '../src/features/inbound/InboundCreateScreen';
import { P04Frame, P04Action } from '../src/features/inbound/P04Frame';
import { P04Icon } from '../src/features/inbound/P04Icon';
import { P04TypeSelect } from '../src/features/inbound/P04TypeSelect';
import { initialInboundDraft } from '../src/features/inbound/inboundDraft';

let tree: Renderer.ReactTestRenderer;
const draft = {...initialInboundDraft, name:'TC20 local only', warehouseId:'w-test',warehouseName:'Kho fixture',inboundCategory:'PRODUCT' as const};
const warehouses = {phase:'ready',warehouses:[{id:'w-test',name:'Kho fixture',status:'ACTIVE'}]} as unknown as NonNullable<React.ComponentProps<typeof InboundCreateScreen>['warehouses']>;
const supplierLoader = jest.fn(async()=>({items:[],total:0}));
const props = {draft,warehouses,supplierLoader,typeLabel:'Nhập kho',onChange:jest.fn(),onContinue:jest.fn(),onBack:jest.fn()};
afterEach(async()=>{if(tree)await act(async()=>tree.unmount());jest.clearAllMocks();});
async function mount(){await act(async()=>{tree=Renderer.create(<AppProviders><InboundCreateScreen {...props}/></AppProviders>);});}
function text(children:React.ReactNode):string {
  return React.Children.toArray(children).map(c=>typeof c==='string'||typeof c==='number'?String(c):React.isValidElement<{children?:React.ReactNode}>(c)?text(c.props.children):'').join('');
}

test('information stage uses the approved three-step strip plus compact header step and complete back arrow',async()=>{
  await mount();
  expect(tree.root.findAll(n=>typeof n.props.accessibilityLabel==='string'&&n.props.accessibilityLabel.startsWith('Tiến độ nhập kho')).length).toBeGreaterThan(0);
  expect(tree.root.findByType(P04Frame).findAllByType(P04Icon).some(i=>i.props.name==='arrow-left')).toBe(true);
  expect(JSON.stringify(tree.toJSON())).toContain('Bước ');
});

test('TC20 distinguishes verified receipt label from the unchanged category choice',async()=>{
  await mount();
  const select=tree.root.findByType(P04TypeSelect);
  expect(select.props.operationLabel).toBe('Nhập hàng');
  expect(select.props.value).toBe('PRODUCT');
  const trigger=select.findAll(n=>n.props.accessibilityLabel==='Loại nhập: Nhập hàng'&&typeof n.props.onPress==='function')[0];
  expect(trigger).toBeDefined();
  expect(trigger.findAllByType(P04Icon).some(i=>i.props.name==='chevron-right')).toBe(true);
  expect(JSON.stringify(tree.toJSON())).toContain('Nhập sản phẩm');
});

test('TC20 required supplier is honest: missing supplier prevents UI progression; owner ID is retained',async()=>{
  await mount();
  const label=tree.root.findAll(n=>n.props.testID==='p04-supplier-label')[0];
  expect(text(label.props.children)).toBe('Nhà cung cấp *');
  const action=()=>tree.root.findAllByType(P04Action).find(x=>x.props.label==='Tiếp tục quét mã')!;
  expect(action().props.disabled).toBe(true);
  await act(async()=>{tree.update(<AppProviders><InboundCreateScreen {...props} draft={{...draft,supplierId:'supplier-test',supplierName:'Supplier fixture'}}/></AppProviders>);});
  expect(action().props.disabled).toBe(false);
  const supplier=tree.root.findAll(n=>n.props.accessibilityLabel==='Nhà cung cấp: Supplier fixture'&&typeof n.props.onPress==='function')[0];
  expect(supplier.findAllByType(P04Icon).some(i=>i.props.name==='chevron-right')).toBe(true);
  expect(tree.root.findByType(InboundCreateScreen).props.draft.supplierId).toBe('supplier-test');
  expect(supplierLoader).not.toHaveBeenCalled();
});
