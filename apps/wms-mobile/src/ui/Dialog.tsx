import {UI_KIT_COLORS} from '../theme/uiKitV3';
/**
 * Dialog giữa màn cho các trạng thái quyết định của board 03.
 *
 * `Sheet` vẫn giữ cho ô nhập/chọn hiện hữu. Dialog này dùng khi người dùng
 * phải chọn tiếp tục/lưu nháp/hủy và nền không được tự đóng trong lúc đang
 * ghi. Không có nghiệp vụ nào bị nhúng vào component dùng chung.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Dimensions,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type TextStyle,
} from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { Text } from './Text';
import { KeyboardViewportContext, type KeyboardViewportTarget } from './Page';
import { sheetKeyboardSpace } from './sheetKeyboard';

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    backgroundColor: UI_KIT_COLORS['overlay.scrim'],
  },
  /** See Sheet: on Web the dismissal target must not wrap panel buttons. */
  dismissHitArea: {
    ...StyleSheet.absoluteFill,
  },
  panel: {
    width: '100%',
    maxWidth: 360,
    maxHeight: '92%',
  },
  fixedScroll:{minHeight:0,flexShrink:1},
  fixedFooter:{flexShrink:0},
  keyboardContainer: {
    flexShrink: 1,
  },
  grabber: {
    alignSelf: 'center',
    width: 42,
    height: 4,
    borderRadius: 2,
  },
  body: {
    flex: 1,
  },
});

export interface DialogProps {
  visible: boolean;
  title: string;
  message?: string;
  onDismiss: () => void;
  children?: React.ReactNode;
  /** Chặn backdrop/Back khi request đang bay hoặc cần quyết định bắt buộc. */
  dismissible?: boolean;
  /** Picker keeps Back dismissal but requires an explicit Cancel on backdrop. */
  dismissOnBackdrop?: boolean;
  /** Opt-in fixed regions for P12 readers and Apply-only pickers. */
  footer?: React.ReactNode;
  headerAccessory?: React.ReactNode;
  /** Optional owner viewport. Keeps P09 review dialogs inside the app frame. */
  bounds?: {left:number;top:number;width:number;height:number};
  panelMaxWidth?: number;
  /** Native pickers may disable the fade to avoid a transient frame while the IME resizes. */
  animationType?: 'none' | 'fade' | 'slide';
  /** Override the native IME layout mode for compact pickers. */
  keyboardBehavior?: 'height' | 'padding' | 'position' | undefined;
  /** Opt-in product sheet geometry. Center-dialog defaults stay unchanged. */
  placement?: 'center' | 'bottom';
  titleStyle?: StyleProp<TextStyle>;
  showHeader?: boolean;
  /** Optional measured product sheet height; capped by the viewport/IME. */
  panelHeight?: number;
}

export function Dialog({
  visible,
  title,
  message,
  onDismiss,
  children,
  dismissible = true,
  dismissOnBackdrop = true,
  footer,
  headerAccessory,
  bounds,
  panelMaxWidth,
  animationType = 'fade',
  keyboardBehavior,
  placement = 'center',
  titleStyle,
  showHeader = true,
  panelHeight,
}: DialogProps): React.ReactElement {
  const theme = useTheme();
  const dismiss = dismissible ? onDismiss : () => undefined;
  const scrollRef = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const scrollY = useRef(0);
  const keyboardTop = useRef(Dimensions.get('window').height);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const backdropRef = useRef<React.ComponentRef<typeof View>>(null);
  const [backdropGeometry, setBackdropGeometry] = useState({top:0,height:Dimensions.get('window').height});
  const measureBackdrop = useCallback(() => {
    if (placement !== 'bottom') return;
    backdropRef.current?.measureInWindow((_x,top,_width,height) => {
      setBackdropGeometry(current => current.top===top&&current.height===height ? current : {top,height});
    });
  }, [placement]);
  const bottomSpace = sheetKeyboardSpace(backdropGeometry.top,backdropGeometry.height,keyboardHeight>0?keyboardTop.current:undefined);

  useEffect(() => {
    const shown = Keyboard.addListener('keyboardDidShow', event => {
      keyboardTop.current = event.endCoordinates.screenY;
      setKeyboardHeight(event.endCoordinates.height);
      if (placement === 'bottom') requestAnimationFrame(measureBackdrop);
    });
    const hidden = Keyboard.addListener('keyboardDidHide', () => {
      keyboardTop.current = Dimensions.get('window').height;
      setKeyboardHeight(0);
    });
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, [placement, measureBackdrop]);

  const revealFocusedInput = useCallback(
    (input: KeyboardViewportTarget | null) => {
      if (input === null) return;
      const reveal = () => {
        input.measureInWindow((_x, y, _width, height) => {
          const safeBottom = keyboardTop.current - 20;
          const coveredByKeyboard = y + height - safeBottom;
          if (coveredByKeyboard > 0) {
            scrollRef.current?.scrollTo({
              y: Math.max(0, scrollY.current + coveredByKeyboard),
              animated: true,
            });
          }
        });
      };
      requestAnimationFrame(reveal);
      setTimeout(reveal, 280);
    },
    [],
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType={animationType}
      onRequestClose={dismiss}
      accessibilityViewIsModal
    >
      <View ref={backdropRef} onLayout={placement==='bottom'?measureBackdrop:undefined} style={[styles.backdrop, placement === 'bottom' && {justifyContent:'flex-end',padding:0,paddingBottom:bottomSpace.bottomInset}, bounds && Platform.OS==='web' ? {position:'absolute',...bounds,flex:undefined}:undefined]}>
        {dismissible && dismissOnBackdrop ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Đóng hộp thoại"
            onPress={dismiss}
            style={styles.dismissHitArea}
          />
        ) : null}
        <View
          style={[
            styles.panel,
            placement === 'bottom' && {maxWidth:'100%',maxHeight:'88%'},
            panelHeight!==undefined&&{height:Math.min(panelHeight,(bounds?.height??Dimensions.get('window').height)*0.88)},
            panelMaxWidth ? {maxWidth:panelMaxWidth}:undefined,
            // Android Modal does not always apply adjustResize to the child
            // window. When the IME is visible, cap the panel to the actual
            // visible portion so fixed Apply/Cancel footers remain reachable
            // instead of being covered or jumping below the keyboard.
            keyboardHeight > 0
              ? {
                  maxHeight: Math.max(
                    180,
                    Math.min(
                      placement === 'bottom' ? bottomSpace.availableHeight * 0.88 : Dimensions.get('window').height * 0.92,
                      placement === 'bottom' ? bottomSpace.availableHeight - 16 : keyboardTop.current - 16,
                    ),
                  ),
                }
              : undefined,
            {
              padding: theme.spacing.xl,
              gap: theme.spacing.md,
              borderRadius: theme.radius.sheet,
              backgroundColor: theme.colors.surface,
            },
            placement === 'bottom' && {borderTopLeftRadius:26,borderTopRightRadius:26,borderBottomLeftRadius:0,borderBottomRightRadius:0},
          ]}
        >
          <KeyboardViewportContext.Provider value={revealFocusedInput}>
            <KeyboardAvoidingView
              behavior={
                keyboardBehavior ?? (placement === 'bottom' ? undefined : Platform.OS === 'ios' ? 'padding' : 'height')
              }
              style={[styles.keyboardContainer,panelHeight!==undefined&&{flex:1,minHeight:0}]}
            >
              {footer && showHeader ? (
                <View
                  style={{
                    gap: theme.spacing.md,
                    paddingBottom: theme.spacing.md,
                  }}
                >
                  {placement === 'bottom' ? <View style={[styles.grabber,{backgroundColor:theme.colors.divider}]} /> : null}
                  <Text variant="cardTitle" tone="strong" style={titleStyle}>
                    {title}
                  </Text>
                  {message ? (
                    <Text variant="caption" tone="muted">
                      {message}
                    </Text>
                  ) : null}
                  {headerAccessory}
                </View>
              ) : null}
              <ScrollView
                style={[footer ? styles.fixedScroll : undefined,panelHeight!==undefined&&{flex:1,minHeight:0}]}
                ref={scrollRef}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                contentContainerStyle={[
                  { gap: theme.spacing.md },
                  keyboardHeight > 0
                    ? { paddingBottom: keyboardHeight + 20 }
                    : null,
                ]}
                onScroll={event => {
                  scrollY.current = event.nativeEvent.contentOffset.y;
                }}
                scrollEventThrottle={16}
              >
                {!footer && showHeader ? (
                  <>
                    <View
                      style={[
                        styles.grabber,
                        { backgroundColor: theme.colors.divider },
                      ]}
                    />
                    <Text variant="cardTitle" tone="strong" style={titleStyle}>
                      {title}
                    </Text>
                    {message === undefined ? null : (
                      <Text variant="caption" tone="muted">
                        {message}
                      </Text>
                    )}
                  </>
                ) : null}
                <View style={styles.body}>{children}</View>
              </ScrollView>
              {footer ? (
                <View style={[styles.fixedFooter,{ paddingTop: theme.spacing.md }]}>
                  {footer}
                </View>
              ) : null}
            </KeyboardAvoidingView>
          </KeyboardViewportContext.Provider>
        </View>
      </View>
    </Modal>
  );
}
