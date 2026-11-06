import React from 'react';
import {SvgXml} from 'react-native-svg';
/** Generic carton illustration, never a fetched product photograph or stock proof. */
export function ProductPlaceholder({size=30}:{size?:number}) {
  return <SvgXml accessible={false} width={size} height={size} xml={'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><path d="M3 8 15 3 29 9 17 15Z" fill="#c3b198"/><path d="M3 8 17 15 17 30 3 23Z" fill="#b4a18b"/><path d="M17 15 29 9 29 23 17 30Z" fill="#887764"/><path d="M9 5.5 22.6 12.2 22.6 19 19.1 20.8 19.1 13.5 5.8 6.8Z" fill="#e6d8be"/><path d="M4 9 16 15.1" stroke="#cfbda5" stroke-width=".7"/><path d="M4 21 9 23.4" stroke="#98846f" stroke-width="1"/></svg>'}/>;
}
