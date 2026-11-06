import {HN_UI} from '../../theme/uiKitV3';
import {ScannerNativeText as Text} from '../../ui/ScannerNativeText';
// Native adapter of P05's locked controls: center dialog for recipient/group,
// anchored fixed-height list for province/ward. No form reflow when opening.
import React, { useRef, useState, useEffect, useCallback } from 'react';
import { KeyboardViewportContext } from '../../ui/Page';
import {ScannerTextInput as TextInput} from '../../ui/ScannerTextInput';
import {Keyboard,Modal,Pressable,ScrollView,StyleSheet,View,useWindowDimensions} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Dialog } from '../../ui/Dialog';
import { P04Action, p04 } from '../inbound/P04Frame';
import { P04Icon } from '../inbound/P04Icon';
import { P05TextMeasure } from './P05TextMeasure';
import type { P04SelectAnchor } from '../inbound/p04SelectPlacement';
import {
  p05ChoicePlacement,
  type P05ChoiceViewport,
} from './p05ChoicePlacement';
const fold = (v: string) =>
  v
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toLocaleLowerCase('vi');
const styles = StyleSheet.create({
  field: { marginBottom: 14, marginHorizontal: 3 },
  valueArea: { flex: 1, minWidth: 0, justifyContent: 'center' },
  value: {
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '600',
    color: HN_UI.textPrimary,
    includeFontPadding: false,
  },
  muted: { color: HN_UI.textMuted, fontWeight: '400' },
  reader: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  readerText: {
    color: HN_UI.textLink,
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '600',
  },
  expanded: { borderColor: HN_UI.border, backgroundColor: HN_UI.canvas },
  disabled: { backgroundColor: HN_UI.disabled },

  overlay: { flex: 1 },
  backdrop: { ...StyleSheet.absoluteFill },
  popup: {
    position: 'absolute',
    backgroundColor: HN_UI.surface,
    borderWidth: 1,
    borderColor: HN_UI.border,
    borderRadius: 10,
    padding: 5,
    elevation: 8,
    shadowColor: HN_UI.textPrimary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.19,
    shadowRadius: 12,
  },
  search: {
    height: 44,
    borderWidth: 1,
    borderColor: HN_UI.borderControl,
    borderRadius: 7,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 14,
    color: HN_UI.textPrimary,
    backgroundColor: HN_UI.canvas,
    marginBottom: 5,
  },
  options: { flex: 1, minHeight: 0 },
  dialogOptions: { maxHeight: 300 },
  option: {
    minHeight: 48,
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    borderRadius: 7,
    backgroundColor: HN_UI.surface,
  },
  optionText: {
    flex: 1,
    minWidth: 0,
    color: HN_UI.textPrimary,
    fontSize: 14,
    lineHeight: 21,
    includeFontPadding: false,
  },
  selected: { backgroundColor: HN_UI.canvas },
  selectedText: { color: HN_UI.textLink, fontWeight: '600' },
  check: {
    width: 20,
    textAlign: 'center',
    color: HN_UI.textLink,
    fontSize: 14,
    fontWeight: '700',
  },
  empty: { color: HN_UI.textMuted, fontSize: 13, lineHeight: 19, padding: 12 },
  error: { color: HN_UI.danger, fontSize: 12, lineHeight: 18, marginTop: 4 },
  footer: { flexDirection: 'row', gap: 8, marginTop: 12 },
  half: { flex: 1, minWidth: 0 },
});
export function P05FormChoice({
  label,
  value,
  options,
  onChange,
  placeholder = 'Chọn',
  disabled = false,
  error,
  icon = 'document',
  focusRequest = 0,
  onRead,
  presentation = 'popup',
  contentViewport,
  multiple = false,
  values,
  onChangeMultiple,
}: {
  label: string;
  value: string;
  options: readonly { id: string; name: string }[];
  onChange: (id: string) => void;
  placeholder?: string;
  disabled?: boolean;
  error?: string;
  icon?: string;
  focusRequest?: number;
  onRead?: (label: string, value: string) => void;
  presentation?: 'dialog' | 'popup';
  contentViewport?: { x: number; y: number; width: number; height: number };
  /** Opt-in for the group dialog. Other choices remain single-select. */
  multiple?: boolean;
  values?: readonly string[];
  onChangeMultiple?: (ids: string[]) => void;
}) {
  const ref = useRef<React.ComponentRef<typeof View>>(null),
    alive = useRef(true),
    opened = useRef(false),
    side = useRef<'above' | 'below' | undefined>(undefined),
    desired = useRef(300);
  const [open, setOpen] = useState(false),
    [anchor, setAnchor] = useState<P04SelectAnchor>(),
    [query, setQuery] = useState(''),
    [draft, setDraft] = useState(value),
    [draftValues, setDraftValues] = useState<readonly string[]>(values ?? []),
    [truncated, setTruncated] = useState(false),
    [keyboardTop, setKeyboardTop] = useState<number>();
  const win = useWindowDimensions(),
    insets = useSafeAreaInsets(),
    reveal = React.useContext(KeyboardViewportContext);
  const close = useCallback(() => {
    opened.current = false;
    side.current = undefined;
    setOpen(false);
    setAnchor(undefined);
  }, []);
  const measure = useCallback(() => {
    ref.current?.measureInWindow((x, y, width, height) => {
      if (alive.current && opened.current && width > 0 && height > 0)
        setAnchor({ x, y, width, height });
    });
  }, []);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      opened.current = false;
    };
  }, []);
  useEffect(() => {
    if (disabled) close();
  }, [disabled, close]);
  // Android changes window.height when the IME opens/closes. Closing the
  // picker on that resize makes Recipient/Group jump, lose their query and
  // reopen at a different position on every keystroke. Width changes are the
  // actual orientation/layout boundary; keep the dialog open across keyboard
  // viewport changes and let p05ChoicePlacement recompute its safe height.
  useEffect(() => {
    close();
  }, [win.width, close]);
  useEffect(() => {
    if (focusRequest) reveal?.(ref.current);
  }, [focusRequest, reveal]);
  useEffect(() => {
    const shown = Keyboard.addListener('keyboardDidShow', e =>
        setKeyboardTop(e.endCoordinates.screenY),
      ),
      hidden = Keyboard.addListener('keyboardDidHide', () => {
        setKeyboardTop(undefined);
        measure();
      });
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, [measure]);
  const multi = multiple && presentation === 'dialog';
  const selectedValues = values ?? (value ? [value] : []);
  const selectedNames = selectedValues.map(id => options.find(v => v.id === id)?.name).filter((v): v is string => v !== undefined);
  const showSearch = options.length > (presentation === 'dialog' ? 6 : 10),
    selected = options.find(v => v.id === value),
    shown = options.filter(v => fold(v.name).includes(fold(query.trim())));
  const selectedLabel = multi ? selectedNames.join(', ') : selected?.name;
  const canApply = multi
    ? !!onChangeMultiple && draftValues.length > 0 &&
      new Set(draftValues).size === draftValues.length &&
      draftValues.every(id => options.some(v => v.id === id))
    : options.some(v => v.id === draft);
  const viewport: P05ChoiceViewport = {
    width: win.width,
    height: win.height,
    top: contentViewport?.y ?? insets.top,
    bottom: Math.max(
      insets.bottom,
      win.height -
        Math.min(
          contentViewport
            ? contentViewport.y + contentViewport.height
            : win.height - insets.bottom,
          keyboardTop ?? win.height,
        ),
    ),
  };
  const place =
    open && anchor && presentation === 'popup'
      ? p05ChoicePlacement(anchor, viewport, desired.current, side.current)
      : null;
  if (place && !side.current) side.current = place.side;
  const show = () => {
    if (disabled) return;
    Keyboard.dismiss();
    setQuery('');
    setDraft(value);
    setDraftValues([...selectedValues]);
    side.current = undefined;
    desired.current = Math.min(
      300,
      options.length * 48 + 12 + (showSearch ? 49 : 0),
    );
    opened.current = true;
    setOpen(true);
    measure();
  };
  const filter = showSearch ? (
    <TextInput
      accessibilityLabel={`Tìm ${label}`}
      placeholder="Tìm nhanh…"
      value={query}
      onChangeText={setQuery}
      autoCapitalize="none"
      autoCorrect={false}
      style={styles.search}
      underlineColorAndroid="transparent"
    />
  ) : null;
  const list = (dialog: boolean) => (
    <ScrollView
      testID="p05-choice-options"
      style={dialog ? styles.dialogOptions : styles.options}
      keyboardShouldPersistTaps="handled"
      bounces={false}
    >
      {shown.map(v => {
        const checked = multi ? draftValues.includes(v.id) : (dialog ? draft : value) === v.id;
        return (
          <Pressable
            key={v.id}
            accessibilityRole={multi ? 'checkbox' : 'radio'}
            accessibilityState={{ checked }}
            accessibilityLabel={v.name}
            disabled={disabled}
            onPress={() => {
              if (disabled) return;
              if (dialog) {
                // Keep the IME open while searching; once a result is chosen,
                // dismiss it deliberately so the fixed Apply footer becomes
                // reachable instead of sitting behind the keyboard.
                Keyboard.dismiss();
                if (multi) setDraftValues(current => current.includes(v.id)
                  ? current.filter(id => id !== v.id) : [...current, v.id]);
                else setDraft(v.id);
              } else {
                close();
                onChange(v.id);
              }
            }}
            style={[styles.option, checked && styles.selected]}
          >
            <Text style={[styles.optionText, checked && styles.selectedText]}>
              {v.name}
            </Text>
            <Text style={styles.check}>{checked ? '✓' : ''}</Text>
          </Pressable>
        );
      })}
      {!shown.length && (
        <Text style={styles.empty}>Không tìm thấy kết quả.</Text>
      )}
    </ScrollView>
  );
  const actions = (
    <View style={styles.footer}>
      <P04Action label="Hủy" secondary style={styles.half} onPress={close} />
      <P04Action
        label="Áp dụng"
        disabled={disabled || !canApply}
        style={styles.half}
        onPress={() => {
          if (disabled || !canApply) return;
          close();
          if (multi) onChangeMultiple?.([...draftValues]);
          else onChange(draft);
        }}
      />
    </View>
  );
  return (
    <View style={styles.field}>
      <Text style={p04.label}>
        {label.replace(' *', '')}
        {label.endsWith(' *') && <Text style={p04.required}> *</Text>}
      </Text>
      <View ref={ref} collapsable={false}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={label.replace(' *', '')}
          accessibilityState={{ disabled, expanded: open }}
          disabled={disabled}
          onPress={show}
          style={[
            p04.control,
            open && styles.expanded,
            disabled && styles.disabled,
          ]}
        >
          <P04Icon name={icon} size={24} color={HN_UI.textLink} />
          <View style={styles.valueArea}>
            <Text
              testID="p05-choice-value"
              numberOfLines={2}
              style={[styles.value, !selectedLabel && styles.muted]}
            >
              {selectedLabel || placeholder}
            </Text>
            <P05TextMeasure
              value={selectedLabel || placeholder}
              style={styles.value}
              onTruncated={setTruncated}
            />
          </View>
          <P04Icon name="chevron-right" size={18} color={HN_UI.textSecondary} />
        </Pressable>
      </View>
      {truncated && selectedLabel && onRead && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Xem đầy đủ ${label.replace(' *', '')}`}
          onPress={() => onRead(label.replace(' *', ''), multi ? selectedNames.join('\n') : selectedLabel)}
          style={styles.reader}
        >
          <Text style={styles.readerText}>Xem đầy đủ</Text>
        </Pressable>
      )}
      {!!error && <Text style={styles.error}>{error}</Text>}
      {presentation === 'dialog' ? (
        <Dialog
          visible={open}
          title={label.replace(' *', '')}
          onDismiss={close}
          dismissOnBackdrop={false}
          animationType="none"
          footer={actions}
        >
          {filter}
          {multi && <Text style={styles.empty}>Đã chọn {draftValues.length} nhóm</Text>}
          {list(true)}
        </Dialog>
      ) : (
        <Modal
          transparent
          statusBarTranslucent
          visible={open}
          animationType="none"
          onShow={measure}
          onRequestClose={close}
          accessibilityViewIsModal
        >
          <View style={styles.overlay} onLayout={measure}>
            <Pressable
              accessibilityLabel={`Đóng lựa chọn ${label}`}
              accessibilityRole="button"
              style={styles.backdrop}
              onPress={close}
            />
            {place && (
              <View
                testID="p05-anchored-popup"
                style={[
                  styles.popup,
                  {
                    left: place.left,
                    top: place.top,
                    width: place.width,
                    height: place.height,
                  },
                ]}
              >
                {filter}
                {list(false)}
              </View>
            )}
          </View>
        </Modal>
      )}
    </View>
  );
}
