/**
 * `Text` — chữ theo token typography.
 * Mọi chữ trong app phải đi qua đây để không rơi vào font-size tuỳ tiện.
 */

import React from 'react';
import {
  Text as RNText,
  type StyleProp,
  type TextProps as RNTextProps,
  type TextStyle,
} from 'react-native';
import { useTheme } from '../theme/ThemeProvider';

export type TextVariant =
  | 'body'
  | 'caption'
  | 'cardTitle'
  | 'metric'
  | 'screenTitle';

export type TextTone =
  | 'default'
  | 'strong'
  | 'muted'
  | 'primary'
  | 'success'
  | 'danger'
  | 'warning';

export interface TextProps extends RNTextProps {
  variant?: TextVariant;
  tone?: TextTone;
  style?: StyleProp<TextStyle>;
}

export function Text({
  variant = 'body',
  tone = 'default',
  style,
  ...rest
}: TextProps): React.ReactElement {
  const theme = useTheme();
  const scale = theme.typography[variant];

  const toneColor: Record<TextTone, string> = {
    default: theme.colors.text,
    strong: theme.colors.textStrong,
    muted: theme.colors.textMuted,
    primary: theme.colors.primary,
    success: theme.colors.successText,
    danger: theme.colors.dangerText,
    warning: theme.colors.warningText,
  };

  return (
    <RNText
      {...rest}
      style={[
        {
          fontFamily: theme.typography.fontFamily,
          fontSize: scale.fontSize,
          lineHeight: scale.lineHeight,
          fontWeight: scale.fontWeight as TextStyle['fontWeight'],
          color: toneColor[tone],
        },
        style,
      ]}
    />
  );
}
