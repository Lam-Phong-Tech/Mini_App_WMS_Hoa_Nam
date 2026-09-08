/**
 * Bộ icon nét tối giản dùng xuyên suốt app WMS.
 *
 * Mini App gốc dùng SVG. Bản native không phụ thuộc một font icon (font đó có
 * thể thiếu glyph trên PDA Android, khiến icon biến thành ô vuông), cũng không
 * kéo thêm một thư viện vector chỉ để vẽ vài biểu tượng điều hướng. Các nét ở
 * đây được ghép từ `View`, vì vậy hiển thị nhất quán trên mọi máy Android.
 */

import React from 'react';
import { View, type ViewStyle } from 'react-native';

export type AppIconName =
  | 'home'
  | 'scan'
  | 'approvals'
  | 'history'
  | 'profile'
  | 'search'
  | 'package-plus'
  | 'package-minus'
  | 'shield-check'
  | 'clock'
  | 'check-circle'
  | 'alert'
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

function Segment({ style }: SegmentProps): React.ReactElement {
  return <View pointerEvents="none" style={style} />;
}

/** Một icon chỉ mang tính trang trí; thành phần cha đã có nhãn TalkBack. */
export function AppIcon({
  name,
  color = '#7367f0',
  size = 20,
}: AppIconProps): React.ReactElement {
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
    case 'package-plus':
    case 'package-minus':
      parts = (
        <>
          {bordered({
            left: size * 0.09,
            top: size * 0.2,
            width: size * 0.82,
            height: size * 0.66,
            borderRadius: size * 0.08,
          })}
          {line({
            left: size * 0.1,
            top: size * 0.42,
            width: size * 0.8,
            height: stroke,
            borderRadius: stroke,
          })}
          {line({
            left: size * 0.5 - stroke / 2,
            top: size * 0.2,
            width: stroke,
            height: size * 0.65,
            borderRadius: stroke,
          })}
          {line({
            left: size * 0.34,
            top: size * 0.04,
            width: size * 0.32,
            height: stroke,
            borderRadius: stroke,
          })}
          {name === 'package-plus'
            ? line({
                left: size * 0.5 - stroke / 2,
                top: 0,
                width: stroke,
                height: size * 0.18,
                borderRadius: stroke,
              })
            : null}
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
    case 'clock':
    case 'history':
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
          {bordered({
            left: size * 0.19,
            top: size * 0.31,
            width: size * 0.62,
            height: size * 0.56,
            borderRadius: size * 0.08,
          })}
          {line({
            left: size * 0.14,
            top: size * 0.28,
            width: size * 0.54,
            height: stroke,
            borderRadius: stroke,
            transform: [{ rotate: '45deg' }],
            transformOrigin: 'left center',
          })}
          {line({
            left: size * 0.48,
            top: size * 0.1,
            width: size * 0.54,
            height: stroke,
            borderRadius: stroke,
            transform: [{ rotate: '135deg' }],
            transformOrigin: 'left center',
          })}
          {line({
            left: size * 0.44,
            top: size * 0.6,
            width: size * 0.16,
            height: size * 0.27,
            borderRadius: size * 0.04,
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
    case 'approvals':
      parts = (
        <>
          {[0.14, 0.43, 0.72].map((top, index) => (
            <React.Fragment key={top}>
              {bordered({
                left: size * 0.08,
                top: size * top,
                width: size * 0.14,
                height: size * 0.14,
                borderRadius: 2,
              })}
              {line({
                left: size * 0.34,
                top: size * top + size * 0.06,
                width: size * (index === 1 ? 0.48 : 0.58),
                height: stroke,
                borderRadius: stroke,
              })}
            </React.Fragment>
          ))}
        </>
      );
      break;
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
