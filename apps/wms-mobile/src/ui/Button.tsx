import {HN_UI} from '../theme/uiKitV3';
/**
 * `Button` — `Pressable` đã chuẩn hoá (Prompt 2 §3).
 *
 * UI Kit v3: touch48, CTA chính56, trạng thái màu theo semantic token.
 */

import React, {useState} from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
  type TextStyle,
} from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { Text } from './Text';
import {UI_KIT_COLORS,UI_KIT_METRICS} from '../theme/uiKitV3';

const styles = StyleSheet.create({
  label: {
    fontWeight: '600',
    fontSize:14,
    lineHeight:20,
  },
});

export type ButtonVariant = 'primary' | 'secondary' | 'danger';

export interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  /** Nhãn cho trình đọc màn hình khi `label` chưa đủ nghĩa. */
  accessibilityLabel?: string;
  /** Gợi ý ngữ cảnh cho trình đọc màn hình, không hiển thị thành copy mới. */
  accessibilityHint?: string;
  /** Icon tùy chọn ở trước nhãn, dùng cho các CTA đã có trong board LOCKED. */
  leading?: React.ReactNode;
  /** Icon tùy chọn ở sau nhãn, dùng cho affordance điều hướng. */
  trailing?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  labelStyle?: StyleProp<TextStyle>;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  accessibilityLabel,
  accessibilityHint,
  leading,
  trailing,
  style,
  labelStyle,
}: ButtonProps): React.ReactElement {
  const theme = useTheme();
  const inactive = disabled || loading;
  const [hovered,setHovered]=useState(false);
  const suppliedMinimum=StyleSheet.flatten(style)?.minHeight;

  const background: Record<ButtonVariant, string> = {
    primary: theme.colors.primary,
    secondary: theme.colors.surface,
    danger: theme.colors.danger,
  };
  const labelColor: Record<ButtonVariant, string> = {
    primary: HN_UI.onBrand,
    secondary: UI_KIT_COLORS['action.secondary.fg'],
    danger: HN_UI.onBrand,
  };
  const visualDisabled=disabled&&!loading;
  const foreground=visualDisabled?UI_KIT_COLORS['action.disabled.fg']:labelColor[variant];
  const backgroundPaint=visualDisabled?UI_KIT_COLORS['action.disabled.bg']:loading?background[variant]:UI_KIT_COLORS[`action.${variant}.${hovered?'hover':'bg'}`];
  const actionIcon=(node:React.ReactNode)=>React.isValidElement<{color?:string}>(node)?React.cloneElement(node,{color:foreground}):node;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      onHoverIn={()=>setHovered(true)}
      onHoverOut={()=>setHovered(false)}
      style={({ pressed }) => [
        {
          minHeight: variant==='primary'?UI_KIT_METRICS.primaryCta:theme.touchTarget.min,
          paddingHorizontal: theme.spacing.lg,
          paddingVertical: theme.spacing.md,
          borderRadius: theme.radius.control,
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          gap: theme.spacing.sm,
          backgroundColor: background[variant],
          borderWidth: variant === 'secondary' ? 1 : 0,
          borderColor: UI_KIT_COLORS['action.secondary.border'],
        },
        style,
        {
          minHeight:Math.max(variant==='primary'?UI_KIT_METRICS.primaryCta:UI_KIT_METRICS.touch,typeof suppliedMinimum==='number'?suppliedMinimum:0),
          opacity:1,
          backgroundColor:!disabled&&!loading&&pressed?UI_KIT_COLORS[`action.${variant}.pressed`]:backgroundPaint,
          ...(visualDisabled?{borderColor:UI_KIT_COLORS['action.disabled.border']}:{}),
        },
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={foreground} />
      ) : (
        actionIcon(leading)
      )}
      <Text
        variant="body"
        style={[styles.label,labelStyle,{color:foreground}]}
      >
        {label}
      </Text>
      {loading ? null : actionIcon(trailing)}
    </Pressable>
  );
}
