import {HN_UI} from '../../theme/uiKitV3';
import { P04Text as Text } from './P04Text';
// P04.S01 dropdown: ScannerHNApp inbound/style.css and the user's locked crop.
// A transparent native overlay keeps the popup out of the form's layout flow.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Keyboard,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { P04Icon } from './P04Icon';
import { p04 } from './P04Frame';
import { P04_INBOUND_CHOICES, type P04InboundChoice } from './p04Choices';
import { p04SelectPlacement, type P04SelectAnchor } from './p04SelectPlacement';

const styles = StyleSheet.create({
  expanded: { borderColor: HN_UI.border, backgroundColor: HN_UI.canvas },
  disabled: { backgroundColor: HN_UI.disabled },
  disabledText: { color: HN_UI.textMuted },
  overlay: { flex: 1 },
  dismiss: { ...StyleSheet.absoluteFill },
  popup: {
    position: 'absolute',
    padding: 5,
    borderWidth: 1,
    borderColor: HN_UI.border,
    borderRadius: 10,
    backgroundColor: HN_UI.surface,
    shadowColor: HN_UI.textPrimary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.19,
    shadowRadius: 12,
    elevation: 8,
  },
  options: { flexShrink: 1, borderRadius: 5 },
  option: {
    minHeight: 54,
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 7,
    backgroundColor: HN_UI.surface,
  },
  selected: { backgroundColor: HN_UI.canvas },
  optionText: {
    flex: 1,
    minWidth: 0,
    color: HN_UI.textPrimary,
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '400',
  },
  selectedText: { color: HN_UI.textLink, fontWeight: '600' },
  check: {
    width: 20,
    textAlign: 'center',
    color: HN_UI.textLink,
    fontSize: 14,
    fontWeight: '700',
  },
});

export function P04TypeSelect({
  value,
  disabled = false,
  operationLabel,
  onChange,
}: {
  value?: P04InboundChoice;
  disabled?: boolean;
  /** Verified receipt operation, not a replacement category/enum. */
  operationLabel?: string;
  onChange: (value: P04InboundChoice) => void;
}) {
  const trigger = useRef<React.ComponentRef<typeof View>>(null);
  const isOpen = useRef(false);
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<P04SelectAnchor>();
  const window = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [viewport, setViewport] = useState({
    width: window.width,
    height: window.height,
  });
  const close = useCallback(() => {
    isOpen.current = false;
    setOpen(false);
  }, []);
  const measure = useCallback(() => {
    trigger.current?.measureInWindow((x, y, width, height) => {
      if (isOpen.current && width > 0 && height > 0)
        setAnchor({ x, y, width, height });
    });
  }, []);
  useEffect(() => {
    if (disabled) close();
  }, [disabled, close]);
  useEffect(() => {
    // A resized/rotated window invalidates the old anchor. Selection survives.
    close();
  }, [window.width, window.height, close]);
  useEffect(() => {
    const hidden = Keyboard.addListener('keyboardDidHide', measure);
    return () => {
      isOpen.current = false;
      hidden.remove();
    };
  }, [measure]);
  const label =
    P04_INBOUND_CHOICES.find(choice => choice.id === value)?.label ??
    'Chọn loại nhập';
  const placement = anchor
    ? p04SelectPlacement(
        anchor,
        { ...viewport, top: insets.top, bottom: insets.bottom },
        P04_INBOUND_CHOICES.length * 54 + 12,
      )
    : undefined;
  return (
    <>
      <View ref={trigger} collapsable={false}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Loại nhập: ${operationLabel ?? label}`}
          accessibilityHint={operationLabel ? `Nhóm hàng: ${value ? label : 'Chưa chọn'}` : undefined}
          accessibilityState={{ expanded: open, disabled }}
          disabled={disabled}
          onPress={() => {
            if (disabled) return;
            Keyboard.dismiss();
            isOpen.current = true;
            setAnchor(undefined);
            setOpen(true);
            measure();
          }}
          style={[
            p04.control,
            open && styles.expanded,
            disabled && styles.disabled,
          ]}
        >
          <P04Icon name="box" color={HN_UI.textLink} size={23} />
          <View style={{flex:1,minWidth:0}}>
            <Text style={[p04.value, {flex:0}, disabled && styles.disabledText]}>{operationLabel ?? label}</Text>
            {operationLabel ? <Text style={p04.small}>{value ? label : 'Chọn nhóm hàng'}</Text> : null}
          </View>
          <View style={{ transform: [{ rotate: open ? '90deg' : '0deg' }] }}>
            <P04Icon name="chevron-right" color={HN_UI.textSecondary} size={18} />
          </View>
        </Pressable>
      </View>
      <Modal
        visible={open}
        transparent
        statusBarTranslucent
        animationType="none"
        onShow={measure}
        onRequestClose={close}
      >
        <View
          style={styles.overlay}
          onLayout={event => {
            const { width, height } = event.nativeEvent.layout;
            setViewport(current =>
              current.width === width && current.height === height
                ? current
                : { width, height },
            );
            measure();
          }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Đóng lựa chọn loại nhập"
            onPress={close}
            style={styles.dismiss}
          />
          {placement && (
            <View
              accessibilityRole="radiogroup"
              accessibilityLabel={operationLabel ? 'Chọn nhóm hàng nhập' : 'Chọn loại nhập'}
              style={[styles.popup, placement]}
            >
              <ScrollView
                style={styles.options}
                keyboardShouldPersistTaps="handled"
                bounces={false}
              >
                {P04_INBOUND_CHOICES.map(choice => {
                  const selected = value === choice.id;
                  return (
                    <Pressable
                      key={choice.id}
                      accessibilityRole="radio"
                      accessibilityLabel={choice.label}
                      accessibilityState={{ checked: selected }}
                      onPress={() => {
                        if (disabled) return;
                        onChange(choice.id);
                        close();
                      }}
                      style={[styles.option, selected && styles.selected]}
                    >
                      <Text
                        style={[
                          styles.optionText,
                          selected && styles.selectedText,
                        ]}
                      >
                        {choice.label}
                      </Text>
                      <Text style={styles.check}>{selected ? '✓' : ''}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          )}
        </View>
      </Modal>
    </>
  );
}

