import React, {forwardRef} from 'react';
import {Platform,StyleSheet,Text as NativeText,type TextProps,type TextStyle} from 'react-native';
import {SCANNER_ARIAL_FAMILY} from '../theme/scannerTypography';
import {useTheme} from '../theme/ThemeProvider';

/** Native Text port for the code-native Scanner board presenters. No extra
 * native view is introduced; event props and the real text ref are forwarded. */
export const ScannerNativeText=forwardRef<React.ComponentRef<typeof NativeText>,TextProps>(function ScannerNativeText({style,...props},ref){
  const flat=StyleSheet.flatten(style);
  const theme=useTheme();
  const family=(!flat?.fontFamily||flat.fontFamily==='Arial'||flat.fontFamily==='Arimo'||flat.fontFamily==='Public Sans')
    ? SCANNER_ARIAL_FAMILY : flat?.fontFamily??(Platform.OS==='web'?theme.typography.fontFamily:SCANNER_ARIAL_FAMILY);
  const weight=flat?.fontWeight;
  const compatibleWeight=Platform.OS==='android'&&family==='Arimo'&&(weight==='600'||weight===600)
    ? '700' : weight;
  return <NativeText ref={ref} {...props} style={[style,family?{fontFamily:family}:undefined,compatibleWeight?{fontWeight:compatibleWeight as TextStyle['fontWeight']}:undefined]}/>;
});
