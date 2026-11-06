import {ScannerIcon} from '../../ui/ScannerIcon';
import {HN_UI} from '../../theme/uiKitV3';
/** P01 geometry reused verbatim from ScannerHNApp/docs/flows/auth-session/
 * sourced-icons.mjs (Lucide ISC/MIT) and its existing warehouse compound path.
 * See src/ui/HN-ICONS-LICENSE.txt. This is not raster tracing of B01. */
import React from 'react';
import Svg, { Path } from 'react-native-svg';

export function P01Icon({
  name,
  color = HN_UI.textLink,
  size = 24,
  strokeWidth = 2.25,
}: {
  name:
    | 'info'
    | 'auth-scan'
    | 'warehouse'
    | 'play'
    | 'logout'
    | 'chevron'
    | 'user'
    | 'eye'
    | 'lock'
    | 'shield'
    | 'arrow';
  color?: string;
  size?: number;
  strokeWidth?: number;
}): React.ReactElement {
  if(name!=='auth-scan'){
    const aliases={info:'info',warehouse:'warehouse',play:'play-circle',logout:'log-out',chevron:'chevron-right',user:'user',eye:'eye',lock:'lock-keyhole',shield:'shield-check',arrow:'arrow-right'} as const;
    return <ScannerIcon name={aliases[name]} color={color} size={size}/>;
  }
  return (
    <Svg testID="hn-brand-mark"
      accessible={false}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <Path d="M8 3H4a1 1 0 0 0-1 1v4m13-5h4a1 1 0 0 1 1 1v4M3 16v4a1 1 0 0 0 1 1h4m8 0h4a1 1 0 0 0 1-1v-4M3 12h18M8 7v3m3-3v3m3-3v3m3-3v3m-9 5v2m3-2v2m3-2v2m3-2v2"/>
    </Svg>
  );
}
