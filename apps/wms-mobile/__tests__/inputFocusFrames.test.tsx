import React from 'react';
import Renderer, {act} from 'react-test-renderer';
import {Platform, TextInput} from 'react-native';
import {ScannerTextInput} from '../src/ui/ScannerTextInput';
import {AppProviders} from '../src/app/App';
test('web disabled is non-focusable while readonly keeps copy/select semantics',async()=>{const original=Platform.OS;Object.defineProperty(Platform,'OS',{configurable:true,value:'web'});let t!:Renderer.ReactTestRenderer;try{await act(async()=>{t=Renderer.create(<AppProviders><ScannerTextInput editable={false}/></AppProviders>);});expect(t.root.findByType(TextInput).props.disabled).toBe(true);expect(t.root.findByType(TextInput).props.tabIndex).toBe(-1);await act(async()=>t.update(<AppProviders><ScannerTextInput readOnly/></AppProviders>));expect(t.root.findByType(TextInput).props.disabled).toBe(false);expect(t.root.findByType(TextInput).props.readOnly).toBe(true);}finally{if(t)await act(async()=>t.unmount());Object.defineProperty(Platform,'OS',{configurable:true,value:original});}});

test.each([
  ['inner', [{flex: 1}, {borderWidth: 0}]],
  ['self', [{borderWidth: 1, borderRadius: 10}]],
  ['inner', [{borderLeftWidth: 1, borderRightWidth: 1}]],
] as const)('web focus frame %s keeps one native input and caller events', async (frame, style) => {
  const originalPlatform=Platform.OS;
  Object.defineProperty(Platform,'OS',{configurable:true,value:'web'});
  const change=jest.fn(), focus=jest.fn();
  let tree!:Renderer.ReactTestRenderer;
  try {
    await act(async()=>{tree=Renderer.create(<AppProviders><ScannerTextInput value="" style={[...style]} onChangeText={change} onFocus={focus}/></AppProviders>);});
    const input=tree.root.findByType(TextInput);
    expect(input.props.dataSet).toMatchObject({hnInput:frame,hnEditable:'true'});
    expect(tree.root.findAllByType(TextInput)).toHaveLength(1);
    expect(input.props.onChangeText).toBe(change);
    expect(input.props.onFocus).toBe(focus);
  } finally {
    if(tree)await act(async()=>tree.unmount());
    Object.defineProperty(Platform,'OS',{configurable:true,value:originalPlatform});
  }
});
