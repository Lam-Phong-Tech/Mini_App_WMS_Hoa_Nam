import {HN_UI} from '../../theme/uiKitV3';
import React, { useEffect, useRef, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type TextStyle,
  useWindowDimensions,
} from 'react-native';
import { Text } from '../../ui/Text';
import { Button } from '../../ui/Button';
import { P09Dialog } from './P09Presentation';

const styles = StyleSheet.create({
  root: { minWidth: 0, flexShrink: 1 },
  text: { color: HN_UI.textPrimary, fontSize: 16, lineHeight: 24, flexShrink: 1 },
  reader: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
  link: { color: HN_UI.textLink, fontSize: 14, lineHeight: 20, fontWeight: '600' },
});

/** P18 read-only adapter of the existing in-app dialog. No source/input writes. */
export function P18ReadableText({
  value,
  label,
  lines = 2,
  style,
}: {
  value: string;
  label: string;
  lines?: 2 | 3;
  style?: StyleProp<TextStyle>;
}) {
  const [measured, setMeasured] = useState(false);
  const [openedValue, setOpenedValue] = useState<string>();
  const trigger = useRef<React.ComponentRef<typeof Pressable>>(null);
  const focusFrame = useRef<number | undefined>(undefined);
  const original = useRef(value);
  useEffect(() => {
    original.current = value;
    setMeasured(false);
    setOpenedValue(undefined);
    return () => {
      if (focusFrame.current !== undefined)
        cancelAnimationFrame(focusFrame.current);
    };
  }, [value]);
  // RNWeb does not consistently emit onTextLayout; expose a conservative reader.
  const reader =
    measured || value.length > lines * 16 || value.split('\n').length > lines;
  const close = () => {
    setOpenedValue(undefined);
    focusFrame.current = requestAnimationFrame(() => {
      const node = trigger.current as unknown as { focus?: () => void } | null;
      node?.focus?.();
    });
  };
  return (
    <View style={styles.root}>
      <Text
        style={[styles.text, style]}
        numberOfLines={lines}
        onTextLayout={event => {
          if (event.nativeEvent.lines.length > lines) setMeasured(true);
        }}
      >
        {value}
      </Text>
      {reader ? (
        <Pressable
          ref={trigger}
          style={styles.reader}
          accessibilityRole="button"
          accessibilityLabel={'Xem đầy đủ ' + label.toLocaleLowerCase('vi')}
          onPress={() => setOpenedValue(value)}
        >
          <Text style={styles.link}>Xem đầy đủ</Text>
        </Pressable>
      ) : null}
      {openedValue !== undefined &&
      openedValue === value &&
      original.current === value ? (
        <P09Dialog
          visible
          title={label}
          message={openedValue}
          onDismiss={close}
          dismissOnBackdrop={false}
          footer={<Button label="Đóng" onPress={close} />}
        />
      ) : null}
    </View>
  );
}

export function P18Value({
  label,
  value,
  lines = 2,
  inline = false,
}: {
  label: string;
  value?: string | null;
  lines?: 2 | 3;
  inline?: boolean;
}) {
  const { width } = useWindowDimensions();
  const paired = inline && width >= 430;
  return (
    <View
      style={{
        gap: paired ? 12 : 4,
        minWidth: 0,
        flexDirection: paired ? 'row' : 'column',
      }}
    >
      <Text
        style={{
          color: HN_UI.textMuted,
          fontSize: 14,
          lineHeight: 21,
          width: paired ? 145 : undefined,
          flexShrink: 0,
        }}
      >
        {label}
      </Text>
      <View style={{ flex: paired ? 1 : undefined, minWidth: 0 }}>
        <P18ReadableText
          label={label}
          value={value?.trim() ? value : 'Chưa xác minh'}
          lines={lines}
        />
      </View>
    </View>
  );
}
