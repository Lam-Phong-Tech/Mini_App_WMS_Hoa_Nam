/** One Lucide SVG source for Web and Android; kit stroke2. */
import React from 'react';
import {ScannerIcon} from './ScannerIcon';
import {HN_UI} from '../theme/uiKitV3';
const aliases={
  "scan": "scan-line",
  "bell": "bell",
  "house": "house",
  "up": "arrow-up-from-line",
  "down": "arrow-down-to-line",
  "document": "file-text",
  "box": "package",
  "tool": "wrench",
  "clock": "clock",
  "calendar": "calendar-days",
  "nfc": "nfc",
  "history": "rotate-ccw-clock",
  "arrow": "arrow-right",
  "user": "user",
  "chevron": "chevron-right"
} as const;
export type HnHomeIconName=keyof typeof aliases;
export function HnHomeIcon({name,size=24,color=HN_UI.primary,strokeWidth:_strokeWidth=2}:{name:HnHomeIconName;size?:number;color?:string;strokeWidth?:number}):React.ReactElement{return <ScannerIcon name={aliases[name]} size={size} color={color}/>;}
