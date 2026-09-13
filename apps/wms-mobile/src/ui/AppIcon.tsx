/**
 * Bộ icon nét tối giản dùng xuyên suốt app WMS.
 *
 * Mini App gốc dùng SVG. Bản native không phụ thuộc một font icon (font đó có
 * thể thiếu glyph trên PDA Android, khiến icon biến thành ô vuông), cũng không
 * kéo thêm một thư viện vector chỉ để vẽ vài biểu tượng điều hướng. Các nét ở
 * đây được ghép từ `View`, vì vậy hiển thị nhất quán trên mọi máy Android.
 */

import React from 'react';
import { Platform, View, type ViewStyle } from 'react-native';

export type AppIconName =
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
  | 'shield-check'
  | 'nfc'
  | 'clock'
  | 'check-circle'
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
  | 'chevron-right';

export interface AppIconProps {
  name: AppIconName;
  /** Tím WMS mặc định; màn có ngữ nghĩa riêng truyền màu token của mình. */
  color?: string;
  size?: number;
}

type SegmentProps = {
  style: ViewStyle;
};

const absolute: ViewStyle = { position: 'absolute' };

/**
 * Các biểu tượng nghiệp vụ của Board 02 dùng nét SVG trên Web để giữ đúng
 * hình học của mẫu (cờ lê, sóng NFC, chuông và thùng hàng). Native vẫn dùng
 * bộ View bên dưới làm fallback, không thêm dependency icon mới.
 */
const SVG_ICON_PATHS: Partial<Record<AppIconName, string>> = {
  inbound: 'M3 7l9-4 9 4-9 4-9-4zm0 0v10l9 4V11L3 7zm18 0v10l-9 4V11l9-4z',
  outbound: 'M12 19V5m0 0L6 11m6-6 6 6',
  warranty: 'M22.7 19l-9.1-9.1c.9-2.2.4-4.8-1.3-6.5C10.6 1.7 7.8 1 5.3 2.3L9 6 6 9 2.3 5.3C1 7.8 1.7 10.6 3.4 12.3c1.7 1.7 4.3 2.2 6.5 1.3l9.1 9.1c.5.5 1.3.5 1.8 0l1.9-1.9c.5-.5.5-1.3 0-1.8z',
  nfc: 'M4.9 4.9a10 10 0 0 0 0 14.2M7.8 7.8a6 6 0 0 0 0 8.4M12 12h.01M16.2 7.8a6 6 0 0 1 0 8.4M19.1 4.9a10 10 0 0 1 0 14.2',
  notification: 'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 7h18s-3 0-3-7M13.73 21a2 2 0 0 1-3.46 0',
};

function SvgBusinessIcon({
  name,
  color,
  size,
}: {
  name: AppIconName;
  color: string;
  size: number;
}): React.ReactElement | undefined {
  const path = SVG_ICON_PATHS[name];
  if (Platform.OS !== 'web' || path === undefined) return undefined;
  const fill = name === 'inbound' ? color : 'none';
  return (
    <View accessible={false} pointerEvents="none" style={{ width: size, height: size }}>
      {React.createElement(
        'svg',
        {
          width: size,
          height: size,
          viewBox: '0 0 24 24',
          fill: 'none',
          xmlns: 'http://www.w3.org/2000/svg',
          'aria-hidden': true,
        },
        React.createElement('path', {
          d: path,
          fill,
          stroke: color,
          strokeWidth: name === 'inbound' ? 1.15 : 2,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
        }),
      )}
    </View>
  );
}

function Segment({ style }: SegmentProps): React.ReactElement {
  return <View pointerEvents="none" style={style} />;
}

/** Một icon chỉ mang tính trang trí; thành phần cha đã có nhãn TalkBack. */
export function AppIcon({
  name,
  color = '#7367f0',
  size = 20,
}: AppIconProps): React.ReactElement {
  const svgIcon = SvgBusinessIcon({ name, color, size });
  if (svgIcon !== undefined) return svgIcon;
  const stroke = Math.max(1.5, Math.round(size / 12));
  const root: ViewStyle = {
    width: size,
    height: size,
    position: 'relative',
  };
  const line = (style: ViewStyle): React.ReactElement => (
    <Segment style={{ ...absolute, backgroundColor: color, ...style }} />
  );
  const bordered = (style: ViewStyle): React.ReactElement => (
    <Segment
      style={{
        ...absolute,
        borderColor: color,
        borderWidth: stroke,
        ...style,
      }}
    />
  );
  const check = (left: number, top: number, checkSize: number): React.ReactElement =>
    line({
      left,
      top,
      width: checkSize,
      height: checkSize / 2,
      borderLeftColor: color,
      borderBottomColor: color,
      borderLeftWidth: stroke,
      borderBottomWidth: stroke,
      backgroundColor: 'transparent',
      transform: [{ rotate: '-45deg' }],
    });

  let parts: React.ReactNode;

  switch (name) {
    case 'search':
      parts = (
        <>
          {bordered({
            left: size * 0.08,
            top: size * 0.08,
            width: size * 0.58,
            height: size * 0.58,
            borderRadius: size,
          })}
          {line({
            width: size * 0.42,
            height: stroke,
            left: size * 0.55,
            top: size * 0.68,
            borderRadius: stroke,
            transform: [{ rotate: '45deg' }],
            transformOrigin: 'left center',
          })}
        </>
      );
      break;
    case 'inbound':
    case 'box':
      parts = (
        <>
          {bordered({
            left: size * 0.16,
            top: size * 0.28,
            width: size * 0.68,
            height: size * 0.58,
            borderRadius: size * 0.06,
          })}
          {line({
            left: size * 0.17,
            top: size * 0.49,
            width: size * 0.66,
            height: stroke,
            borderRadius: stroke,
          })}
          {line({
            left: size * 0.5 - stroke / 2,
            top: size * 0.29,
            width: stroke,
            height: size * 0.56,
            borderRadius: stroke,
          })}
          {line({
            left: size * 0.34,
            top: size * 0.17,
            width: size * 0.32,
            height: stroke,
            borderRadius: stroke,
          })}
        </>
      );
      break;
    case 'package-plus':
    case 'package-minus':
      parts = (
        <>
          {bordered({ left: size * 0.09, top: size * 0.2, width: size * 0.82, height: size * 0.66, borderRadius: size * 0.08 })}
          {line({ left: size * 0.1, top: size * 0.42, width: size * 0.8, height: stroke, borderRadius: stroke })}
          {line({ left: size * 0.5 - stroke / 2, top: size * 0.2, width: stroke, height: size * 0.65, borderRadius: stroke })}
          {line({ left: size * 0.34, top: size * 0.04, width: size * 0.32, height: stroke, borderRadius: stroke })}
          {name === 'package-plus' ? line({ left: size * 0.5 - stroke / 2, top: 0, width: stroke, height: size * 0.18, borderRadius: stroke }) : null}
        </>
      );
      break;
    case 'shield-check':
      parts = (
        <>
          {bordered({
            left: size * 0.2,
            top: size * 0.06,
            width: size * 0.6,
            height: size * 0.72,
            borderRadius: size * 0.28,
            transform: [{ rotate: '45deg' }],
          })}
          {check(size * 0.26, size * 0.43, size * 0.45)}
        </>
      );
      break;
    case 'nfc':
      parts = (
        <>
          {bordered({
            left: size * 0.44,
            top: size * 0.44,
            width: size * 0.12,
            height: size * 0.12,
            borderRadius: size,
          })}
          {[0.08, 0.24].map(offset => (
            <React.Fragment key={offset}>
              {bordered({ left: size * offset, top: size * (0.18 + offset * 0.34), width: size * (0.27 - offset * 0.2), height: size * (0.64 - offset * 0.3), borderRadius: size, borderRightWidth: 0 })}
              {bordered({ right: size * offset, top: size * (0.18 + offset * 0.34), width: size * (0.27 - offset * 0.2), height: size * (0.64 - offset * 0.3), borderRadius: size, borderLeftWidth: 0 })}
            </React.Fragment>
          ))}
        </>
      );
      break;
    case 'clock':
      parts = (
        <>
          {bordered({
            left: size * 0.08,
            top: size * 0.08,
            width: size * 0.84,
            height: size * 0.84,
            borderRadius: size,
          })}
          {line({
            left: size / 2 - stroke / 2,
            top: size * 0.24,
            width: stroke,
            height: size * 0.29,
            borderRadius: stroke,
          })}
          {line({
            left: size / 2,
            top: size * 0.5,
            width: size * 0.22,
            height: stroke,
            borderRadius: stroke,
            transform: [{ rotate: '35deg' }],
            transformOrigin: 'left center',
          })}
        </>
      );
      break;
    case 'history':
      parts = (
        <>
          {bordered({
            left: size * 0.15,
            top: size * 0.17,
            width: size * 0.7,
            height: size * 0.7,
            borderRadius: size,
          })}
          {line({
            left: size / 2 - stroke / 2,
            top: size * 0.34,
            width: stroke,
            height: size * 0.22,
            borderRadius: stroke,
          })}
          {line({
            left: size * 0.5,
            top: size * 0.54,
            width: size * 0.19,
            height: stroke,
            borderRadius: stroke,
            transform: [{ rotate: '35deg' }],
            transformOrigin: 'left center',
          })}
          {line({
            left: size * 0.04,
            top: size * 0.17,
            width: size * 0.24,
            height: stroke,
            borderRadius: stroke,
          })}
          {line({
            left: size * 0.05,
            top: size * 0.17,
            width: size * 0.16,
            height: stroke,
            borderRadius: stroke,
            transform: [{ rotate: '45deg' }],
            transformOrigin: 'left center',
          })}
        </>
      );
      break;
    case 'check-circle':
      parts = (
        <>
          {bordered({
            left: size * 0.07,
            top: size * 0.07,
            width: size * 0.86,
            height: size * 0.86,
            borderRadius: size,
          })}
          {check(size * 0.24, size * 0.4, size * 0.48)}
        </>
      );
      break;
    case 'alert':
      parts = (
        <>
          {bordered({
            left: size * 0.12,
            top: size * 0.12,
            width: size * 0.76,
            height: size * 0.76,
            borderRadius: size,
          })}
          {line({
            left: size / 2 - stroke / 2,
            top: size * 0.28,
            width: stroke,
            height: size * 0.27,
            borderRadius: stroke,
          })}
          {line({
            left: size / 2 - stroke / 2,
            top: size * 0.68,
            width: stroke,
            height: stroke,
            borderRadius: stroke,
          })}
        </>
      );
      break;
    case 'notification':
    case 'bell':
      parts = (
        <>
          {bordered({ left: size * 0.25, top: size * 0.17, width: size * 0.5, height: size * 0.58, borderRadius: size * 0.28 })}
          {line({ left: size * 0.17, top: size * 0.74, width: size * 0.66, height: stroke, borderRadius: stroke })}
          {line({ left: size * 0.45, top: size * 0.87, width: size * 0.1, height: size * 0.1, borderRadius: size * 0.05 })}
        </>
      );
      break;
    case 'warranty':
    case 'wrench':
      parts = (
        <>
          {bordered({ left: size * 0.04, top: size * 0.04, width: size * 0.42, height: size * 0.42, borderRadius: size, borderRightWidth: 0 })}
          {line({ left: size * 0.27, top: size * 0.64, width: size * 0.6, height: stroke + 0.5, borderRadius: stroke, transform: [{ rotate: '-45deg' }], transformOrigin: 'left center' })}
        </>
      );
      break;
    case 'outbound':
    case 'arrow-up':
      parts = (
        <>
          {line({ left: size * 0.46, top: size * 0.16, width: stroke, height: size * 0.68, borderRadius: stroke })}
          {line({ left: size * 0.25, top: size * 0.25, width: size * 0.31, height: stroke, borderRadius: stroke, transform: [{ rotate: '-45deg' }] })}
          {line({ left: size * 0.44, top: size * 0.25, width: size * 0.31, height: stroke, borderRadius: stroke, transform: [{ rotate: '45deg' }] })}
        </>
      );
      break;
    case 'arrow-down':
      parts = (
        <>
          {line({ left: size * 0.46, top: size * 0.16, width: stroke, height: size * 0.68, borderRadius: stroke })}
          {line({ left: size * 0.25, top: size * 0.63, width: size * 0.31, height: stroke, borderRadius: stroke, transform: [{ rotate: '45deg' }] })}
          {line({ left: size * 0.44, top: size * 0.63, width: size * 0.31, height: stroke, borderRadius: stroke, transform: [{ rotate: '-45deg' }] })}
        </>
      );
      break;
    case 'camera':
      parts = (
        <>
          {bordered({
            left: size * 0.08,
            top: size * 0.26,
            width: size * 0.84,
            height: size * 0.58,
            borderRadius: size * 0.1,
          })}
          {bordered({
            left: size * 0.28,
            top: size * 0.06,
            width: size * 0.28,
            height: size * 0.2,
            borderRadius: size * 0.04,
          })}
          {bordered({
            left: size * 0.36,
            top: size * 0.38,
            width: size * 0.28,
            height: size * 0.28,
            borderRadius: size,
          })}
        </>
      );
      break;
    case 'image':
      parts = (
        <>
          {bordered({
            left: size * 0.08,
            top: size * 0.14,
            width: size * 0.84,
            height: size * 0.72,
            borderRadius: size * 0.1,
          })}
          {bordered({
            left: size * 0.24,
            top: size * 0.3,
            width: size * 0.14,
            height: size * 0.14,
            borderRadius: size,
          })}
          {line({
            left: size * 0.18,
            top: size * 0.68,
            width: size * 0.38,
            height: stroke,
            borderRadius: stroke,
            transform: [{ rotate: '-35deg' }],
            transformOrigin: 'left center',
          })}
          {line({
            left: size * 0.49,
            top: size * 0.55,
            width: size * 0.34,
            height: stroke,
            borderRadius: stroke,
            transform: [{ rotate: '42deg' }],
            transformOrigin: 'left center',
          })}
        </>
      );
      break;
    case 'keyboard':
      parts = (
        <>
          {bordered({
            left: size * 0.06,
            top: size * 0.2,
            width: size * 0.88,
            height: size * 0.6,
            borderRadius: size * 0.1,
          })}
          {[0.22, 0.43, 0.64].map(top => (
            <React.Fragment key={top}>
              {[0.22, 0.43, 0.64].map(left => (
                <React.Fragment key={left}>
                  {line({
                    left: size * left,
                    top: size * top,
                    width: stroke,
                    height: stroke,
                    borderRadius: stroke,
                  })}
                </React.Fragment>
              ))}
            </React.Fragment>
          ))}
          {line({
            left: size * 0.58,
            top: size * 0.64,
            width: size * 0.2,
            height: stroke,
            borderRadius: stroke,
          })}
        </>
      );
      break;
    case 'flash':
      parts = (
        <>
          {line({
            left: size * 0.52,
            top: size * 0.04,
            width: size * 0.18,
            height: size * 0.5,
            borderRadius: stroke,
            transform: [{ rotate: '25deg' }],
          })}
          {line({
            left: size * 0.29,
            top: size * 0.46,
            width: size * 0.18,
            height: size * 0.5,
            borderRadius: stroke,
            transform: [{ rotate: '25deg' }],
          })}
        </>
      );
      break;
    case 'home':
      parts = (
        <>
          {/* eslint-disable-next-line react-native/no-inline-styles */}
          <Segment style={{ ...absolute, left: size * 0.1, top: size * 0.14, width: 0, height: 0, borderLeftWidth: size * 0.4, borderRightWidth: size * 0.4, borderBottomWidth: size * 0.38, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: color }} />
          {line({ left: size * 0.22, top: size * 0.43, width: size * 0.56, height: size * 0.43, borderRadius: size * 0.08 })}
          {line({
            left: size * 0.44,
            top: size * 0.65,
            width: size * 0.12,
            height: size * 0.21,
            borderRadius: size * 0.03,
            backgroundColor: '#f3f8fb',
          })}
        </>
      );
      break;
    case 'scan':
      parts = (
        <>
          {line({ left: 0, top: 0, width: size * 0.36, height: stroke })}
          {line({ left: 0, top: 0, width: stroke, height: size * 0.36 })}
          {line({ right: 0, top: 0, width: size * 0.36, height: stroke })}
          {line({ right: 0, top: 0, width: stroke, height: size * 0.36 })}
          {line({ left: 0, bottom: 0, width: size * 0.36, height: stroke })}
          {line({ left: 0, bottom: 0, width: stroke, height: size * 0.36 })}
          {line({ right: 0, bottom: 0, width: size * 0.36, height: stroke })}
          {line({ right: 0, bottom: 0, width: stroke, height: size * 0.36 })}
          {line({
            left: size * 0.22,
            top: size * 0.48,
            width: size * 0.56,
            height: stroke,
            borderRadius: stroke,
          })}
        </>
      );
      break;
    case 'document':
    case 'approvals':
      parts = (
        <>
          {bordered({ left: size * 0.22, top: size * 0.14, width: size * 0.56, height: size * 0.72, borderRadius: size * 0.08 })}
          {bordered({ left: size * 0.37, top: size * 0.06, width: size * 0.26, height: size * 0.18, borderRadius: size * 0.06 })}
          {[0.38, 0.57].map(top => (
            <React.Fragment key={top}>
              {line({
                left: size * 0.34,
                top: size * top,
                width: size * 0.32,
                height: stroke,
                borderRadius: stroke,
              })}
            </React.Fragment>
          ))}
        </>
      );
      break;
    case 'user':
    case 'profile':
      parts = (
        <>
          {bordered({
            left: size * 0.34,
            top: size * 0.08,
            width: size * 0.32,
            height: size * 0.32,
            borderRadius: size,
          })}
          {bordered({
            left: size * 0.16,
            top: size * 0.54,
            width: size * 0.68,
            height: size * 0.34,
            borderRadius: size,
            borderBottomWidth: 0,
          })}
        </>
      );
      break;
    case 'chevron-right':
      parts = bordered({
        left: size * 0.28,
        top: size * 0.28,
        width: size * 0.38,
        height: size * 0.38,
        borderLeftWidth: 0,
        borderBottomWidth: 0,
        transform: [{ rotate: '45deg' }],
      });
      break;
    case 'chevron-left':
      parts = bordered({
        left: size * 0.34,
        top: size * 0.28,
        width: size * 0.38,
        height: size * 0.38,
        borderRightWidth: 0,
        borderBottomWidth: 0,
        transform: [{ rotate: '-45deg' }],
      });
      break;
  }

  return (
    <View accessible={false} pointerEvents="none" style={root}>
      {parts}
    </View>
  );
}
