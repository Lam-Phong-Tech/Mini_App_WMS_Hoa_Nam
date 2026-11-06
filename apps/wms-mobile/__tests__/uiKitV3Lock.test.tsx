import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import React from 'react';
import Renderer,{act} from 'react-test-renderer';
import {Pressable,StyleSheet} from 'react-native';
import {hnThemes,hnProfiles} from '../src/theme/kitV3/hn-tokens';
import {HN_UI,UI_KIT_COLORS,UI_KIT_ROLE_ALIASES,uiColorAlpha} from '../src/theme/uiKitV3';
import {KIT_ICON_XML} from '../src/ui/kitIconXml';
import {AppIcon} from '../src/ui/AppIcon';
import {ScannerIcon} from '../src/ui/ScannerIcon';
import {Button} from '../src/ui/Button';
import {Text} from '../src/ui/Text';
import {ThemeProvider} from '../src/theme/ThemeProvider';
jest.mock('react-native/Libraries/Components/Pressable/Pressable',()=>{
  const React=require('react');
  return {__esModule:true,default:(props:Record<string,unknown>)=>React.createElement('KitPressable',props,props.children)};
});

const kitRoot=path.resolve(__dirname,'../assets/ui-kit-v3');
const sourceBytes=fs.readFileSync(path.join(kitRoot,'tokens/source.json'));
const source=JSON.parse(sourceBytes.toString('utf8'));
let tree:Renderer.ReactTestRenderer|undefined;
afterEach(()=>{act(()=>tree?.unmount());tree=undefined;});

it('keeps all618 supplied token values and the approved source revision',()=>{
  expect(crypto.createHash('sha256').update(sourceBytes).digest('hex')).toBe('7ca18cee0ba04ee20f40f9bcbdf7c2142a16d4f327566ae009e67dde615448d2');
  expect(Object.keys(hnThemes)).toHaveLength(6);
  for(const [name,theme]of Object.entries(hnThemes)){expect(Object.keys(theme)).toHaveLength(103);expect(theme).toEqual(source.themes[name]);}
  expect(UI_KIT_COLORS).toEqual(source.themes['ocean-light']);
  expect(Object.isFrozen(UI_KIT_COLORS)).toBe(true);expect(Object.isFrozen(HN_UI)).toBe(true);
  for(const [alias,role]of Object.entries(UI_KIT_ROLE_ALIASES))expect(HN_UI[alias as keyof typeof HN_UI]).toBe(UI_KIT_COLORS[role]);
  expect(hnProfiles.appScanner.touchTargetMin).toBe(48);
  expect(hnProfiles.appScanner.controlLarge).toBe(56);
});

it('uses every supplied Lucide SVG verbatim on the shared native/Web port',()=>{
  expect(Object.keys(KIT_ICON_XML)).toHaveLength(99);
  for(const [name,xml]of Object.entries(KIT_ICON_XML)){
    expect(xml).toBe(fs.readFileSync(path.join(kitRoot,'icons',name+'.svg'),'utf8'));
    expect(xml).toContain('viewBox="0 0 24 24"');expect(xml).toContain('stroke-width="2"');
  }
});

it.each([['nfc','nfc'],['logout','log-out'],['outbound','arrow-up-from-line'],['inbound','package'],['document','file-text'],['zoom-in','zoom-in'],['fit-width','fit-width']] as const)('keeps the meaning of %s when rendered as SVG',(name,glyph)=>{
  act(()=>{tree=Renderer.create(<AppIcon name={name}/>);});
  expect(tree!.root.findByType(ScannerIcon).props.name).toBe(glyph);
});

it('uses explicit disabled colors and keeps label/size',()=>{
  act(()=>{tree=Renderer.create(<ThemeProvider><Button label="Gửi yêu cầu" disabled onPress={jest.fn()} leading={<AppIcon name="document"/>}/></ThemeProvider>);});
  const button=tree!.root.findByType(Pressable),style=StyleSheet.flatten(button.props.style({pressed:false}));
  expect(style.backgroundColor).toBe(UI_KIT_COLORS['action.disabled.bg']);expect(style.opacity).toBe(1);expect(style.minHeight).toBeGreaterThanOrEqual(56);
  expect(button.props.accessibilityState).toEqual({disabled:true,busy:false});
  const label=tree!.root.findAllByType(Text).find(n=>n.props.children==='Gửi yêu cầu')!;
  expect(StyleSheet.flatten(label.props.style).color).toBe(UI_KIT_COLORS['action.disabled.fg']);
});

it('uses pressed token without making the whole control translucent',()=>{
  act(()=>{tree=Renderer.create(<ThemeProvider><Button label="Tiếp tục" onPress={jest.fn()}/></ThemeProvider>);});
  const style=StyleSheet.flatten(tree!.root.findByType(Pressable).props.style({pressed:true}));
  expect(style.backgroundColor).toBe(UI_KIT_COLORS['action.primary.pressed']);expect(style.opacity).toBe(1);
});

it('derives photographic opacity from semantic RGB without alpha-byte reversal',()=>{
  expect(uiColorAlpha('nav.bg',0.5)).toBe('rgba(6,49,69,0.5)');
  expect(uiColorAlpha('nav.bg',2)).toBe('rgba(6,49,69,1)');
});
