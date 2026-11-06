import {ScannerNativeText as Text} from '../../ui/ScannerNativeText';
// Outbound-only measurement adapter. It never changes source text or input rules.
import React from 'react';
import {Platform, StyleSheet, View, type StyleProp, type TextStyle} from 'react-native';

const styles = StyleSheet.create({
  hidden: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 0,
    overflow: 'hidden',
  },
});

export function P05TextMeasure({
  value,
  style,
  lines = 2,
  lineHeight = 21,
  onTruncated,
}: {
  value: string;
  style?: StyleProp<TextStyle>;
  lines?: number;
  lineHeight?: number;
  onTruncated: (truncated: boolean) => void;
}) {
  return (
    <View
      style={styles.hidden}
      accessible={false}
      aria-hidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
    >
      <Text
        accessible={false}
        aria-hidden
        style={style}
        onTextLayout={event =>
          onTruncated(event.nativeEvent.lines.length > lines)
        }
        onLayout={
          Platform.OS === 'web'
            ? event =>
                onTruncated(
                  event.nativeEvent.layout.height > lineHeight * lines + 1,
                )
            : undefined
        }
      >
        {value}
      </Text>
    </View>
  );
}
