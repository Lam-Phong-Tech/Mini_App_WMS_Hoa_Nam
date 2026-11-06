import {ScannerNativeText as NativeText} from '../../ui/ScannerNativeText';
import React from 'react';
import {type TextProps} from 'react-native';
import { SCANNER_ARIAL_FAMILY } from '../../theme/scannerTypography';
// Keep the locked Web metrics and the registered compatible Android family.
export function P04Text({ style, ...props }: TextProps) {
  return <NativeText {...props} style={[{ fontFamily: SCANNER_ARIAL_FAMILY }, style]} />;
}
