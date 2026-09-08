/**
 * `Box` — `View` có sẵn khoảng cách/khối theo token.
 * Tương đương `Box` của ZaUI: thay cho việc rải style rời rạc khắp màn hình.
 */

import React from 'react';
import {
  StyleSheet,
  View,
  type StyleProp,
  type ViewProps,
  type ViewStyle,
} from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { spacing } from '../theme/tokens';

const styles = StyleSheet.create({
  column: { flexDirection: 'column' },
  row: { flexDirection: 'row' },
});

type SpacingKey = keyof typeof spacing;

export interface BoxProps extends ViewProps {
  padding?: SpacingKey;
  paddingX?: SpacingKey;
  paddingY?: SpacingKey;
  gap?: SpacingKey;
  row?: boolean;
  /** Nền card trắng + bo góc + đổ bóng theo token. */
  card?: boolean;
  align?: ViewStyle['alignItems'];
  justify?: ViewStyle['justifyContent'];
  flex?: number;
  style?: StyleProp<ViewStyle>;
}

export function Box({
  padding,
  paddingX,
  paddingY,
  gap,
  row = false,
  card = false,
  align,
  justify,
  flex,
  style,
  ...rest
}: BoxProps): React.ReactElement {
  const theme = useTheme();

  const cardStyle: ViewStyle = card
    ? {
        backgroundColor: theme.colors.surface,
        borderRadius: theme.radius.card,
        elevation: theme.elevation.card,
        borderWidth: 1,
        borderColor: theme.colors.divider,
      }
    : {};

  return (
    <View
      {...rest}
      style={[
        row ? styles.row : styles.column,
        {
          padding: padding === undefined ? undefined : spacing[padding],
          paddingHorizontal:
            paddingX === undefined ? undefined : spacing[paddingX],
          paddingVertical:
            paddingY === undefined ? undefined : spacing[paddingY],
          gap: gap === undefined ? undefined : spacing[gap],
          alignItems: align,
          justifyContent: justify,
          flex,
        },
        cardStyle,
        style,
      ]}
    />
  );
}
