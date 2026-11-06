import {HN_UI} from '../../theme/uiKitV3';
import React, { useEffect, useRef, useState } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { Dialog } from '../../ui/Dialog';
import { P04Action } from './P04Frame';
import { P04Text as Text } from './P04Text';

const styles = StyleSheet.create({
  root: { minWidth: 0, position: 'relative' },
  measurement: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    opacity: 0,
  },
  trigger: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  right: { alignSelf: 'flex-end' },
  link: { color: HN_UI.textLink, fontSize: 13, lineHeight: 20 },
});

/** P04 adapter for HN-readable-content-v1; never changes the owner's string. */
export function P04ReadableText({
  value,
  label,
  textStyle,
  style,
  lines = 2,
  align = 'left',
}: {
  value: string;
  label: string;
  textStyle: StyleProp<TextStyle>;
  style?: StyleProp<ViewStyle>;
  lines?: 2 | 3;
  align?: 'left' | 'right';
}): React.ReactElement {
  const [measurement, setMeasurement] = useState({ value: '', overflow: false });
  const [reading, setReading] = useState<string>();
  const currentValue = useRef(value);
  currentValue.current = value;
  const trigger = useRef<React.ComponentRef<typeof Pressable>>(null);
  useEffect(() => setReading(undefined), [value]);
  const overflow = measurement.value === value && measurement.overflow;
  const lineHeight = StyleSheet.flatten(textStyle)?.lineHeight ?? 22;
  const dismiss = () => {
    setReading(undefined);
    requestAnimationFrame(() => trigger.current?.focus?.());
  };

  return (
    <View style={[styles.root, style]}>
      <Text selectable numberOfLines={lines} style={textStyle}>
        {value}
      </Text>
      <Text
        testID={`p04-measure-${label}`}
        accessible={false}
        aria-hidden
        importantForAccessibility="no-hide-descendants"
        pointerEvents="none"
        style={[textStyle, styles.measurement]}
        onTextLayout={event => {
          if (Platform.OS !== 'web' && currentValue.current === value) {
            const truncated = event.nativeEvent.lines.length > lines;
            setMeasurement(current =>
              current.value === value && current.overflow === truncated
                ? current
                : { value, overflow: truncated },
            );
          }
        }}
        onLayout={event => {
          // RNWeb Text does not emit onTextLayout. Measure the unbounded text
          // with the same width/font instead of guessing from character count.
          if (Platform.OS === 'web' && currentValue.current === value) {
            const truncated =
              event.nativeEvent.layout.height > lineHeight * lines + 0.5;
            setMeasurement(current =>
              current.value === value && current.overflow === truncated
                ? current
                : { value, overflow: truncated },
            );
          }
        }}
      >
        {value}
      </Text>
      {overflow && (
        <Pressable
          ref={trigger}
          accessibilityRole="button"
          accessibilityLabel={`Xem đầy đủ ${label}`}
          onPress={() => setReading(value)}
          style={[styles.trigger, align === 'right' && styles.right]}
        >
          <Text style={styles.link}>Xem đầy đủ</Text>
        </Pressable>
      )}
      {reading === value && (
        <Dialog
          visible
          title={label}
          message={value}
          onDismiss={dismiss}
          dismissOnBackdrop={false}
          footer={<P04Action label="Đóng" onPress={dismiss} secondary />}
        />
      )}
    </View>
  );
}
