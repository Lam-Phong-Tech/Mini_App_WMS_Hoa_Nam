import {SCANNER_ARIAL_FAMILY} from '../../theme/scannerTypography';
import {HN_UI} from '../../theme/uiKitV3';
import {HN_OPERATIONS} from '../../ui/hnHomeTokens';
import React from 'react';
import { Platform, View } from 'react-native';
import { Text, type TextProps } from '../../ui/Text';
import type { BadgeProps, BadgeTone } from '../../ui/Badge';
import { HnHomeIcon, type HnHomeIconName } from '../../ui/HnHomeIcon';
import Svg, { Path } from 'react-native-svg';
import { useTheme } from '../../theme/ThemeProvider';

/** Single SVG paths avoid the split circle/handle of the legacy View icon. */
export function P08ControlIcon({
  name,
  size = 22,
  color = HN_UI.textPrimary,
}: {
  name: 'search' | 'down' | 'sort' | 'chevron';
  size?: number;
  color?: string;
}) {
  const paths = {
    search: 'M21 21l-5.2-5.2M10.5 3a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15',
    down: 'm6 9 6 6 6-6',
    sort: 'M7 4v16m-3-3 3 3 3-3M14 6h6M14 12h4M14 18h2',
    chevron: 'm9 6 6 6-6 6',
  };
  return (
    <Svg
      accessible={false}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
    >
      <Path
        d={paths[name]}
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function P08Text({ variant = 'body', style, ...props }: TextProps) {
  const sizes = {
    body: { fontSize: 16, lineHeight: 24 },
    caption: { fontSize: 14, lineHeight: 20 },
    cardTitle: { fontSize: 18, lineHeight: 25 },
    metric: { fontSize: 28, lineHeight: 34 },
    screenTitle: { fontSize: 26, lineHeight: 32 },
  };
  return (
    <Text
      {...props}
      variant={variant}
      style={[
        Platform.OS === 'web' ? { fontFamily: SCANNER_ARIAL_FAMILY } : undefined,
        sizes[variant],
        style,
      ]}
    />
  );
}

export function P08Badge({ label, tone = 'primary', style,ink,soft }: BadgeProps&{ink?:string;soft?:string}) {
  const theme = useTheme();
  const colors: Record<BadgeTone, [string, string]> = {
    primary: [HN_UI.selected, HN_UI.textLink],
    neutral: [HN_UI.selected, HN_UI.textMuted],
    success: [theme.colors.successSoft, theme.colors.successText],
    warning: [theme.colors.warningSoft, theme.colors.warningText],
    danger: [theme.colors.dangerSoft, theme.colors.dangerText],
  };
  return (
    <View
      style={[
        {
          alignSelf: 'center',
          borderRadius: 8,
          paddingHorizontal: 8,
          paddingVertical: 3,
          backgroundColor: soft??colors[tone][0],
          maxWidth: '100%',
        },
        style,
      ]}
    >
      <P08Text variant="caption" style={{ color: ink??colors[tone][1] }}>
        {label}
      </P08Text>
    </View>
  );
}

export const P08_OPERATIONS = {
  INBOUND: { name: 'down', ink: HN_UI.success, soft: HN_UI.successSoft },
  OUTBOUND: { name: 'up', ink: HN_UI.textLink, soft: HN_UI.canvas },
  WARRANTY: { name: 'tool', ink: HN_UI.warning, soft: HN_UI.warningSoft },
  NFC: { name: 'nfc', ink: HN_OPERATIONS.nfc.ink, soft: HN_OPERATIONS.nfc.soft },
  SCAN: { name: 'scan', ink: HN_UI.textSecondary, soft: HN_UI.canvas },
  OTHER: { name: 'document', ink: HN_UI.textMuted, soft: HN_UI.canvas },
} as const;

export function P08OperationIcon({
  business,
  size = 30,
}: {
  business: string;
  size?: number;
}) {
  const op =
    P08_OPERATIONS[business as keyof typeof P08_OPERATIONS] ??
    P08_OPERATIONS.OTHER;
  return (
    <HnHomeIcon
      name={op.name as HnHomeIconName}
      size={size}
      color={op.ink}
      strokeWidth={2}
    />
  );
}
