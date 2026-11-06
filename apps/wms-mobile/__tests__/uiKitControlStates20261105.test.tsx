import React from 'react';
import Renderer,{act} from 'react-test-renderer';
import {StyleSheet,View,TextInput,Pressable,ActivityIndicator} from 'react-native';
import {AppProviders} from '../src/app/App';
import {Input} from '../src/ui/Input';
import {Button} from '../src/ui/Button';
import {AppIcon} from '../src/ui/AppIcon';
import {Text} from '../src/ui/Text';
import {Checkbox} from '../src/ui/Checkbox';
import {P15Action} from '../src/features/system/P15Presentation';
import {UI_KIT_COLORS as c} from '../src/theme/uiKitV3';
jest.mock('react-native/Libraries/Components/Pressable/Pressable',()=>{const React=require('react');return {__esModule:true,default:(props:Record<string,unknown>)=>React.createElement('KitStatePressable',props,props.children)};});
let tree:Renderer.ReactTestRenderer|undefined;
test.each([{}, {secondary:true}, {help:true}])('P15 disabled action uses disabled rather than selected paint: %j',variant=>{
 const t=render(<P15Action label="TEST UI" disabled {...variant} onPress={()=>{}}/>),b=t.root.findByType(Pressable),s=StyleSheet.flatten(b.props.style({pressed:false}));
 expect(s.backgroundColor).toBe(c['action.disabled.bg']);expect(s.borderColor).toBe(c['action.disabled.border']);expect(t.root.findByType(Text).props.style.color).toBe(c['action.disabled.fg']);
});
test('P15 busy interlock keeps enabled loading colors',()=>{const t=render(<P15Action label="TEST UI" disabled busy onPress={()=>{}}/>),b=t.root.findByType(Pressable);expect(b.props.disabled).toBe(true);expect(StyleSheet.flatten(b.props.style({pressed:false})).backgroundColor).toBe(c['action.primary.bg']);expect(t.root.findByType(ActivityIndicator).props.color).toBe(c['action.primary.fg']);});
test.each([false,true])('disabled checkbox checked=%s uses explicit colors instead of fading the row',checked=>{const t=render(<Checkbox label="Lựa chọn thử" checked={checked} disabled onToggle={()=>{}}/>),row=t.root.findByType(Pressable),box=t.root.findAllByType(View).find(n=>StyleSheet.flatten(n.props.style)?.borderWidth===1)!;expect(StyleSheet.flatten(row.props.style({pressed:false})).opacity).toBe(1);expect(StyleSheet.flatten(box.props.style).backgroundColor).toBe(c['action.disabled.bg']);expect(StyleSheet.flatten(box.props.style).borderColor).toBe(c['action.disabled.border']);});
afterEach(()=>{act(()=>tree?.unmount());tree=undefined;});
function render(node:React.ReactNode){act(()=>{tree=Renderer.create(<AppProviders>{node}</AppProviders>);});return tree!;}
const frame=(t:Renderer.ReactTestRenderer)=>t.root.findAllByType(View).find(n=>StyleSheet.flatten(n.props.style)?.borderWidth===1)!;
test.each([
 ['default',{},'input.bg','text.primary','input.border'],
 ['readonly',{readOnly:true},'input.readonlyBg','text.primary','input.border'],
 ['disabled',{editable:false},'action.disabled.bg','action.disabled.fg','action.disabled.border'],
 ['invalid',{errorText:'Dữ liệu chưa hợp lệ'},'input.bg','text.primary','input.invalidBorder'],
] as const)('kit %s input uses one rounded surface and state colors',(name,props,bg,fg,border)=>{
 const t=render(<Input label="Trường thử" value="Dữ liệu thử" {...props}/>),s=StyleSheet.flatten(frame(t).props.style),input=t.root.findByType(TextInput);
 expect(s.backgroundColor).toBe(c[bg]);expect(s.borderColor).toBe(c[border]);expect(s.borderRadius).toBe(8);expect(s.overflow).toBe('hidden');expect(StyleSheet.flatten(input.props.style).color).toBe(c[fg]);
 if(name==='readonly'){expect(input.props.readOnly).toBe(true);expect(input.props.editable).toBe(true);}
});
test.each(['primary','secondary','danger'] as const)('loading %s keeps enabled palette and spinner while handler remains blocked',variant=>{
 const onPress=jest.fn(),t=render(<Button label="Đang xử lý" variant={variant} loading onPress={onPress}/>),button=t.root.findByType(Pressable),style=StyleSheet.flatten(button.props.style({pressed:false}));
 expect(style.backgroundColor).toBe(c[`action.${variant}.bg`]);expect(t.root.findByType(ActivityIndicator).props.color).toBe(c[`action.${variant}.fg`]);expect(button.props.disabled).toBe(true);expect(button.props.accessibilityState.busy).toBe(true);expect(onPress).not.toHaveBeenCalled();
});
test('action glyph follows action foreground and disabled idle has its own palette',()=>{
 const t=render(<Button label="Lưu" leading={<AppIcon name="document"/>} onPress={()=>{}}/>);expect(t.root.findByType(AppIcon).props.color).toBe(c['action.primary.fg']);
 act(()=>t.update(<AppProviders><Button label="Lưu" disabled onPress={()=>{}}/></AppProviders>));const b=t.root.findByType(Pressable);expect(StyleSheet.flatten(b.props.style({pressed:false})).backgroundColor).toBe(c['action.disabled.bg']);
});
test('loading with a disabled interaction interlock still paints the enabled variant',()=>{const t=render(<Button label="Đang lưu" disabled loading onPress={()=>{}}/>),b=t.root.findByType(Pressable);expect(b.props.disabled).toBe(true);expect(StyleSheet.flatten(b.props.style({pressed:false})).backgroundColor).toBe(c['action.primary.bg']);expect(t.root.findByType(ActivityIndicator).props.color).toBe(c['action.primary.fg']);});
