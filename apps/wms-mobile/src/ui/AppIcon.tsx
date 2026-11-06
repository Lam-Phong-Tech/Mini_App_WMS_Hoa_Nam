import React from 'react';
import { ScannerIcon } from './ScannerIcon';
import { HN_UI } from '../theme/uiKitV3';
export type AppIconName =
  | 'calendar'
  | 'copy'
  | 'zoom-in'
  | 'zoom-out'
  | 'fit-width'
  | 'fit-page'
  | 'close'
  | 'filter'
  | 'printer'
  | 'home'
  | 'scan'
  | 'approvals'
  | 'history'
  | 'profile'
  | 'user'
  | 'search'
  | 'inbound'
  | 'outbound'
  | 'warranty'
  | 'document'
  | 'notification'
  | 'package-plus'
  | 'package-minus'
  | 'box'
  | 'warehouse'
  | 'shield-check'
  | 'nfc'
  | 'clock'
  | 'check-circle'
  | 'info'
  | 'play-circle'
  | 'logout'
  | 'power'
  | 'alert'
  | 'bell'
  | 'wrench'
  | 'arrow-up'
  | 'arrow-down'
  | 'camera'
  | 'image'
  | 'keyboard'
  | 'flash'
  | 'chevron-left'
  | 'arrow-left'
  | 'chevron-right';
export interface AppIconProps {
  name: AppIconName;
  color?: string;
  size?: number;
}
const aliases = {
  calendar: 'calendar-days',
  copy: 'copy',
  'zoom-in': 'zoom-in',
  'zoom-out': 'zoom-out',
  'fit-width': 'fit-width',
  'fit-page': 'fit-page',
  close: 'x',
  filter: 'list-filter',
  printer: 'printer',
  home: 'house',
  scan: 'scan-line',
  approvals: 'clipboard-check',
  history: 'rotate-ccw-clock',
  profile: 'user',
  user: 'user',
  search: 'search',
  inbound: 'package',
  outbound: 'arrow-up-from-line',
  warranty: 'wrench',
  document: 'file-text',
  notification: 'bell',
  'package-plus': 'package-plus',
  'package-minus': 'package-minus',
  box: 'package',
  warehouse: 'warehouse',
  'shield-check': 'shield-check',
  nfc: 'nfc',
  clock: 'clock',
  'check-circle': 'circle-check',
  info: 'info',
  'play-circle': 'play-circle',
  logout: 'log-out',
  power: 'power',
  alert: 'circle-alert',
  bell: 'bell',
  wrench: 'wrench',
  'arrow-up': 'arrow-up-from-line',
  'arrow-down': 'arrow-down-to-line',
  camera: 'camera',
  image: 'image',
  keyboard: 'keyboard',
  flash: 'flashlight',
  'chevron-left': 'chevron-left',
  'arrow-left': 'arrow-left',
  'chevron-right': 'chevron-right',
} as const;
export function AppIcon({
  name,
  color = HN_UI.primary,
  size = 24,
}: AppIconProps): React.ReactElement {
  return <ScannerIcon name={aliases[name]} color={color} size={size} />;
}
