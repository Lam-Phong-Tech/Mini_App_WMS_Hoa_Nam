import React from 'react';
import Svg, {Circle, Path} from 'react-native-svg';

/** One bounded vector for the recovery hero; no overlapping rotated Views. */
export function P14RecoveryIcon({kind,size,color}:{kind:'user'|'shield'|'success';size:number;color:string}) {
  return <Svg accessible={false} width={size} height={size} viewBox="0 0 24 24"
    fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    {kind==='user' ? <><Circle cx={12} cy={7} r={4}/><Path d="M5 21v-2a7 7 0 0 1 14 0v2"/></>
      : kind==='success' ? <><Circle cx={12} cy={12} r={9}/><Path d="m7.5 12 3 3 6-6"/></>
      : <><Path d="m12 3 8 3v6c0 5-5 8-8 9-3-1-8-4-8-9V6l8-3Z"/><Path d="m8.5 12 2.5 2.5 4.5-4.5"/></>}
  </Svg>;
}
