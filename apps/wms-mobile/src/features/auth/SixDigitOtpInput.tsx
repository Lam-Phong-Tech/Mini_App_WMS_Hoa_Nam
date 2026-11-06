import React, {useContext, useEffect, useRef, useState} from 'react';
import {View} from 'react-native';
import {ScannerTextInput as TextInput} from '../../ui/ScannerTextInput';
import {Text} from '../../ui/Text';
import {KeyboardViewportContext} from '../../ui/Page';
import {HN_UI} from '../../theme/uiKitV3';

const cellsFrom = (value:string) => {
  const digits=value.replace(/\D/g,'').slice(0,6);
  return Array.from({length:6},(_,index)=>digits[index]??'');
};

/** Six visible cells; OTP stays in the current flow's memory only. */
export function SixDigitOtpInput({value,onChangeText,editable=true,scale=1,onSubmit}:{
  value:string;
  onChangeText:(value:string)=>void;
  editable?:boolean;
  scale?:number;
  onSubmit?:()=>void;
}):React.ReactElement {
  const [digits,setDigits]=useState(()=>cellsFrom(value));
  const [active,setActive]=useState<number>();
  const parts=useRef(digits);
  const inputs=useRef<Array<React.ComponentRef<typeof TextInput>|null>>([]);
  const reveal=useContext(KeyboardViewportContext);
  useEffect(()=>{
    const normalized=value.replace(/\D/g,'').slice(0,6);
    if(normalized!==parts.current.join('')) {
      parts.current=cellsFrom(normalized);
      setDigits(parts.current);
    }
  },[value]);
  const commit=(next:string[])=>{
    parts.current=next;
    setDigits(next);
    onChangeText(next.join(''));
  };
  const edit=(index:number,raw:string)=>{
    if(!editable)return;
    const clean=raw.replace(/\D/g,'').slice(0,6);
    if(raw&&!clean)return;
    const next=[...parts.current];
    if(clean.length===6) {
      commit(cellsFrom(clean));
      inputs.current[5]?.focus();
      return;
    }
    if(clean.length>1) {
      for(let i=index;i<6;i++)next[i]=clean[i-index]??'';
    } else next[index]=clean;
    commit(next);
    if(clean)inputs.current[Math.min(5,index+clean.length)]?.focus();
  };
  return <View style={{gap:8*scale}}>
    <Text style={{fontSize:18*scale,lineHeight:27*scale,fontWeight:'700',color:HN_UI.textPrimary}}>Mã OTP*</Text>
    <View testID="otp-six-cells" style={{flexDirection:'row',gap:8*scale}}>
      {digits.map((digit,index)=><TextInput
        key={index}
        ref={ref=>{inputs.current[index]=ref;}}
        testID={`otp-cell-${index+1}`}
        accessibilityLabel={`Chữ số OTP ${index+1} trên 6`}
        value={digit}
        editable={editable}
        keyboardType="number-pad"
        inputMode="numeric"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete={index===0?'one-time-code':'off'}
        textContentType={index===0?'oneTimeCode':'none'}
        maxLength={32}
        selectTextOnFocus
        onChangeText={raw=>edit(index,raw)}
        onFocus={()=>{setActive(index);reveal?.(inputs.current[index]);}}
        onBlur={()=>setActive(current=>current===index?undefined:current)}
        onKeyPress={event=>{
          if(editable&&event.nativeEvent.key==='Backspace'&&!parts.current[index]&&index>0) {
            const next=[...parts.current];next[index-1]='';commit(next);
            inputs.current[index-1]?.focus();
          }
        }}
        onSubmitEditing={onSubmit}
        style={{flex:1,minWidth:0,minHeight:58*scale,paddingHorizontal:0,paddingVertical:8*scale,
          fontSize:24*scale,lineHeight:32*scale,textAlign:'center',color:HN_UI.textPrimary,outlineWidth:0,
          borderWidth:1,borderRadius:10*scale,borderColor:active===index?HN_UI.textLink:HN_UI.border,
          backgroundColor:editable?HN_UI.surface:HN_UI.canvas}}
      />)}
    </View>
  </View>;
}
