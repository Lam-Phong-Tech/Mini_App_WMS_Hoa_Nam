import {uiColorAlpha,HN_UI} from '../../theme/uiKitV3';
import React from 'react';
import staffWarehouseUrl from '../../../assets/scanner-approved/02_people_staff/staff_warehouse_4k_enhanced.jpg';

/** Same original JPG and CSS cover/60% crop as the supplied Web reference.
 * The native photo composition remains in P01ConfirmationBackdrop.tsx. */
export function P01ConfirmationBackdrop({width,height}:{width:number;height:number;heroHeight:number}){
  const background=`linear-gradient(90deg,${uiColorAlpha('nav.bg',0.9)} 5%,${uiColorAlpha('nav.bg',0.5)} 70%),url(`+JSON.stringify(staffWarehouseUrl)+')';
  return <div aria-hidden data-testid="P01.confirmation.artwork" style={{position:'absolute',left:0,top:0,width,height,overflow:'hidden',pointerEvents:'none'}}><div data-testid="P01.confirmation.staff" style={{position:'absolute',left:0,top:0,width,height:405*width/494,backgroundColor:HN_UI.shell,backgroundImage:background,backgroundSize:'cover',backgroundPosition:'center,60% center'}}/></div>;
}
