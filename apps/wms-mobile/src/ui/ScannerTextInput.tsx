import React,{forwardRef} from 'react';
import {Platform,StyleSheet,TextInput as NativeTextInput,type TextInputProps} from 'react-native';
import {useTheme} from '../theme/ThemeProvider';

/** Native input/refs/events remain unchanged; one kit face for Web and Android. */
type NativeInputRef=React.ComponentRef<typeof NativeTextInput>;
export interface ScannerTextInputProps extends TextInputProps {
  /** Presentation metadata only; never forwarded to native input/HTTP. */
  invalid?: boolean;
  focusFrame?: 'inner' | 'self';
}
const Input=forwardRef<NativeInputRef,ScannerTextInputProps>(function ScannerTextInput({style,invalid=false,focusFrame,...props},ref){
  const theme=useTheme();
  const disabled=props.editable===false||props.accessibilityState?.disabled===true;
  const readonly=!disabled&&props.readOnly===true;
  const flat=StyleSheet.flatten(style),
    ownsFrame=!!flat && ((flat.borderWidth??0)>0 ||
      [flat.borderTopWidth,flat.borderRightWidth,flat.borderBottomWidth,flat.borderLeftWidth].every(width=>(width??0)>0)),
    webProps=Platform.OS==='web'?{disabled,...(disabled?{tabIndex:-1}:{}),dataSet:{
      hnInput:focusFrame??(ownsFrame?'self':'inner'),
      hnEditable:String(props.editable!==false&&!props.readOnly&&!props.accessibilityState?.disabled),
      hnInvalid:String(invalid),
      hnDisabled:String(disabled),hnReadonly:String(readonly),
    }}:{};
  return <NativeTextInput {...props} {...webProps} ref={ref} style={[style,{fontFamily:theme.typography.fontFamily??'Inter'},ownsFrame?{borderRadius:theme.radius.control,backgroundColor:disabled?theme.field.disabledBackground:readonly?theme.field.readonlyBackground:flat?.backgroundColor??theme.field.background}:undefined,disabled?{color:theme.field.disabledText,borderColor:theme.field.disabledBorder}:undefined]}/>;
});
export const ScannerTextInput=Object.assign(Input,{State:NativeTextInput.State});
export type ScannerTextInput=NativeInputRef;
