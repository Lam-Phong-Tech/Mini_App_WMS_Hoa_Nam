import React from 'react';
import {SvgXml} from 'react-native-svg';
import {KIT_ICON_XML,type KitIconName} from './kitIconXml';
import {KIT_ICON_EXTENSIONS} from './kitIconExtensions';
import {HN_UI} from '../theme/uiKitV3';
export type ScannerIconName=KitIconName|keyof typeof KIT_ICON_EXTENSIONS;
export function ScannerIcon({name,color=HN_UI.primary,size=24}:{name:ScannerIconName;color?:string;size?:number}):React.ReactElement{
  const xml=name in KIT_ICON_XML ? KIT_ICON_XML[name as KitIconName] : KIT_ICON_EXTENSIONS[name as keyof typeof KIT_ICON_EXTENSIONS];
  return <SvgXml accessible={false} pointerEvents="none" xml={xml.replaceAll('currentColor',color)} width={size} height={size}/>;
}
