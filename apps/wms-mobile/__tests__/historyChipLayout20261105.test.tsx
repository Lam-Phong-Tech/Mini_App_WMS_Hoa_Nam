import React from 'react';
import Renderer,{act} from 'react-test-renderer';
import {StyleSheet} from 'react-native';
import {FilterChipRow} from '../src/ui/FilterChipRow';
import {Text} from '../src/ui/Text';
import {ThemeProvider} from '../src/theme/ThemeProvider';

let tree:Renderer.ReactTestRenderer|undefined;
afterEach(async()=>{await act(async()=>tree?.unmount());tree=undefined;});

test.each(['Tất cả (7692)','Tất cả (1234567)'])('history retains the full %s on one line and scrolls instead of squeezing its label',async(all)=>{
  const select=jest.fn();
  const chips=[{key:'ALL',label:all},{key:'INBOUND',label:'Nhập kho'},{key:'OUTBOUND',label:'Xuất kho'},{key:'WARRANTY',label:'Bảo hành'},{key:'NFC',label:'NFC'}];
  await act(()=>{tree=Renderer.create(<ThemeProvider><FilterChipRow variant="history" chips={chips} activeKey="ALL" onSelect={select}/></ThemeProvider>);});
  const scroll=tree!.root.findAll(n=>n.props.horizontal===true&&n.props.contentContainerStyle)[0];
  expect(scroll).toBeDefined();
  expect(scroll!.props.keyboardShouldPersistTaps).toBe('handled');
  expect(StyleSheet.flatten(scroll!.props.contentContainerStyle).flexGrow).toBe(1);
  for(const chip of chips){
    const button=tree!.root.findAll(n=>n.props.accessibilityLabel===chip.label&&typeof n.props.onPress==='function')[0];
    expect(button).toBeDefined();
    const label=button.findAllByType(Text).find(n=>n.props.children===chip.label)!;
    expect(label.props.numberOfLines).toBe(1);
    const style=StyleSheet.flatten(button.props.style);
    expect(style.flexShrink).toBe(0);
    expect(style.flexBasis).toBe('auto');
  }
  expect(select).not.toHaveBeenCalled();
  await act(()=>tree!.root.findAll(n=>n.props.accessibilityLabel==='NFC'&&typeof n.props.onPress==='function')[0].props.onPress());
  expect(select).toHaveBeenCalledWith('NFC');
  expect(JSON.stringify(tree!.toJSON())).toContain(all);
});

test.each(['history-tabs','history-wrap'] as const)('%s keeps its own wrapping policy when history navigation gains intrinsic widths',async variant=>{
  const select=jest.fn();
  await act(()=>{tree=Renderer.create(<ThemeProvider><FilterChipRow variant={variant} chips={[{key:'ALL',label:'Tất cả'},{key:'info',label:'Thông tin'}]} activeKey="ALL" onSelect={select}/></ThemeProvider>);});
  expect(tree!.root.findAll(n=>n.props.horizontal===true&&n.props.contentContainerStyle)).toHaveLength(0);
  const info=tree!.root.findAll(n=>n.props.accessibilityLabel==='Thông tin'&&typeof n.props.onPress==='function')[0];
  expect(info).toBeDefined();
  await act(()=>info.props.onPress());
  expect(select).toHaveBeenCalledWith('info');
});
