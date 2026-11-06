import {HN_UI} from '../../theme/uiKitV3';
import {SCANNER_ARIAL_FAMILY} from '../../theme/scannerTypography';
/** P11-only presentation; never owns auth, policy, transport or command state. */
import React, { useContext, useEffect, useRef, useState } from 'react';
import {ScannerTextInput as TextInput} from '../../ui/ScannerTextInput';
import {Platform,Pressable,View,type TextInputSelectionChangeEvent} from 'react-native';
import { KeyboardViewportContext } from '../../ui/Page';
import {
  P11Icon,
  P11Text,
  P11Tile,
  P11Hint,
  P11Button,
  useP11Scale,
} from './P11Frame';

export function P11PasswordField({
  label,
  value,
  onChangeText,
  editable,
  secureTextEntry,
  onToggleVisible,
  inputRef,
  errorText,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  editable: boolean;
  secureTextEntry: boolean;
  onToggleVisible: () => void;
  inputRef: React.RefObject<React.ComponentRef<typeof TextInput> | null>;
  errorText?: string;
}): React.ReactElement {
  const s = useP11Scale(),
    reveal = useContext(KeyboardViewportContext);
  const [focused, setFocused] = useState(false);
  const selection = useRef<{ start: number; end: number } | undefined>(
    undefined,
  );
  const restoreFocus = useRef(false);
  useEffect(() => {
    if (!restoreFocus.current || !editable) return;
    restoreFocus.current = false;
    const frame = requestAnimationFrame(() => {
      inputRef.current?.focus();
      if (selection.current)
        inputRef.current?.setNativeProps({ selection: selection.current });
    });
    return () => cancelAnimationFrame(frame);
  }, [secureTextEntry, editable, inputRef]);
  const invalid = !!errorText;
  return (
    <View style={{ gap: 6 * s }}>
      <P11Text size={18} line={26 / 18}>
        {label}
        <P11Text size={18} color={HN_UI.danger}>
          {' '}
          *
        </P11Text>
      </P11Text>
      <View
        style={{
          minHeight: 64 * s,
          borderWidth: (focused ? 2 : 1) * s,
          borderColor: invalid ? HN_UI.danger : focused ? HN_UI.textLink : HN_UI.selected,
          borderRadius: 10 * s,
          backgroundColor: 'white',
          flexDirection: 'row',
          alignItems: 'center',
          gap: 16 * s,
          paddingLeft: (focused ? 15 : 16) * s,
          paddingRight: (focused ? 11 : 12) * s,
        }}
      >
        <P11Icon name="lock" size={28} />
        <TextInput
          ref={inputRef}
          accessibilityLabel={label}
          value={value}
          onChangeText={onChangeText}
          secureTextEntry={secureTextEntry}
          editable={editable}
          invalid={invalid}
          focusFrame="inner"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
          importantForAutofill="no"
          onSelectionChange={(event: TextInputSelectionChangeEvent) => {
            selection.current = event.nativeEvent.selection;
          }}
          onFocus={() => {
            setFocused(true);
            reveal?.(inputRef.current);
          }}
          onBlur={() => setFocused(false)}
          style={{
            flex: 1,
            minWidth: 0,
            minHeight: 60 * s,
            padding: 0,
            fontSize: 20 * s,
            color: HN_UI.textPrimary,
            fontFamily: SCANNER_ARIAL_FAMILY,
            includeFontPadding: false,
            outlineWidth: 0,
          }}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            (secureTextEntry ? 'Hiện ' : 'Ẩn ') + label.toLowerCase()
          }
          disabled={!editable}
          onPressIn={event => {
            if (Platform.OS === 'web') event.preventDefault();
          }}
          onPress={() => {
            restoreFocus.current = focused;
            onToggleVisible();
          }}
          style={{
            minWidth: 44 * s,
            minHeight: 48 * s,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <P11Icon name={secureTextEntry ? 'eye-off' : 'eye'} size={26} />
        </Pressable>
      </View>
      {invalid ? (
        <View
          accessibilityLiveRegion="polite"
          style={{ flexDirection: 'row', gap: 8 * s, marginTop: 4 * s }}
        >
          <View
            style={{
              width: 18 * s,
              height: 18 * s,
              borderRadius: 9 * s,
              backgroundColor: HN_UI.danger,
              alignItems: 'center',
              justifyContent: 'center',
              marginTop: 3 * s,
            }}
          >
            <P11Text size={14} line={1.2} weight="700" color="white">
              !
            </P11Text>
          </View>
          <P11Text
            size={17}
            line={1.4}
            color={HN_UI.danger}
            style={{ flex: 1, minWidth: 0 }}
          >
            {errorText}
          </P11Text>
        </View>
      ) : null}
    </View>
  );
}

export function P11FormContent({
  children,
  policy,
  saving,
  policyLoading,
  unknown,
  onReload,
}: {
  children: React.ReactNode;
  policy?: {
    minLength: number;
    maxLength: number;
    maxUtf8Bytes: number | null;
  };
  saving: boolean;
  policyLoading: boolean;
  unknown: boolean;
  onReload: () => void;
}): React.ReactElement {
  const s = useP11Scale();
  return (
    <>
      <P11Text size={24} line={1.35} weight="700">
        Đổi mật khẩu
      </P11Text>
      <P11Text
        size={19}
        line={1.5}
        color={HN_UI.textMuted}
        style={{ marginTop: 8 * s }}
      >
        Sử dụng mật khẩu theo chính sách bảo mật do hệ thống quy định.
      </P11Text>
      <View style={{ marginTop: 32 * s, gap: 32 * s }}>{children}</View>
      <P11Hint>
        {policy
          ? 'Mật khẩu cần tuân thủ chính sách bảo mật do hệ thống quy định.'
          : 'Chưa có chính sách mật khẩu hợp lệ từ WMS. Chưa thể gửi yêu cầu.'}
      </P11Hint>
      {policy ? <P11Text size={14} color={HN_UI.textMuted} style={{marginTop:8*s}}>
        Đổi thành công sẽ đăng xuất mọi phiên; bạn cần đăng nhập lại.
      </P11Text> : null}
      {!policy ? (
        <View style={{ marginTop: 18 * s }}>
          <P11Button
            label="Tải chính sách mật khẩu"
            variant="secondary"
            disabled={saving || unknown}
            busy={policyLoading}
            onPress={onReload}
          />
        </View>
      ) : null}
    </>
  );
}

export function P11SuccessContent({
  time,
  accountName,
  warehouseName,
}: {
  time: string;
  accountName?: string|null;
  warehouseName?: string|null;
}): React.ReactElement {
  const s = useP11Scale();
  return (
    <>
      <View
        testID="p11-success-mark"
        style={{
          alignSelf: 'center',
          width: 120 * s,
          height: 120 * s,
          borderRadius: 60 * s,
          borderWidth: 12 * s,
          borderColor: HN_UI.successBorder,
          backgroundColor: HN_UI.successSoft,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <View
          style={{
            width: 76 * s,
            height: 76 * s,
            borderRadius: 38 * s,
            backgroundColor: HN_UI.success,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <P11Icon name="check" size={46} stroke={3.5} color="white" />
        </View>
      </View>
      <P11Text
        size={26}
        line={1.35}
        weight="700"
        style={{ textAlign: 'center' }}
      >
        Mật khẩu đăng nhập đã{'\n'}được cập nhật
      </P11Text>
      <P11Text
        size={18}
        line={1.5}
        color={HN_UI.textMuted}
        style={{ textAlign: 'center' }}
      >
        Bạn có thể sử dụng mật khẩu mới để đăng nhập từ bây giờ.
      </P11Text>
      <View
        style={{
          borderWidth: 1 * s,
          borderColor: HN_UI.border,
          borderRadius: 12 * s,
          paddingHorizontal: 14 * s,
        }}
      >
        <P11SummaryRow
          icon="user"
          label="Tài khoản"
          value={accountName||'—'}
        />
        <View style={{ height: 1 * s, backgroundColor: HN_UI.selected }} />
        <P11SummaryRow
          icon="house"
          label="Kho"
          value={warehouseName||'—'}
        />
        <View style={{ height: 1 * s, backgroundColor: HN_UI.selected }} />
        <P11SummaryRow icon="calendar" label="Thời gian cập nhật" value={time}/>
      </View>
      <P11Hint marginTop={0} padding={16}>
        Mọi phiên đã bị thu hồi. Vui lòng đăng nhập lại.
      </P11Hint>
    </>
  );
}

function P11SummaryRow({
  icon,
  label,
  value,
}: {
  icon: 'calendar' | 'user' | 'house';
  label: string;
  value: string;
}): React.ReactElement {
  const s = useP11Scale();
  return (
    <View
      style={{
        minHeight: 76 * s,
        paddingVertical: 8 * s,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 18 * s,
      }}
    >
      <P11Tile icon={icon} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <P11Text size={17} color={HN_UI.textMuted}>
          {label}
        </P11Text>
        <P11Text size={20} weight="500">
          {value}
        </P11Text>
      </View>
    </View>
  );
}

export function P11SessionCard({
  heading,
  current,
  name,
  location,
  time,
  confirmed,
  onRevoke,
  disabled,
  onDetails,
}: {
  heading: string;
  current: boolean;
  name: string;
  location: string;
  time: string;
  confirmed: boolean;
  disabled: boolean;
  onRevoke: () => void;
  onDetails: () => void;
}): React.ReactElement {
  const s = useP11Scale();
  return (
    <View
      style={{
        padding: 18 * s,
        borderWidth: 1 * s,
        borderColor: HN_UI.border,
        borderRadius: 16 * s,
        backgroundColor: 'white',
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 8 * s,
          marginBottom: 22 * s,
        }}
      >
        <P11Text size={23} line={1.35} weight="700" style={{ flex: 1 }}>
          {heading}
        </P11Text>
        {current ? (
          <View
            style={{
              backgroundColor: HN_UI.successSoft,
              borderRadius: 8 * s,
              paddingVertical: 4 * s,
              paddingHorizontal: 8 * s,
            }}
          >
            <P11Text size={16} color={HN_UI.success}>
              Đang hoạt động
            </P11Text>
          </View>
        ) : null}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18 * s }}>
        <P11Tile icon={/iphone|android|phone|mobile/i.test(name)?'phone':/windows|mac|linux|desktop|pc/i.test(name)?'laptop':'shield'} />
        <P11Text size={21} weight="600" style={{ flex: 1, minWidth: 0 }}>
          {name}
        </P11Text>
      </View>
      <View style={{ marginTop: 16 * s, gap: 14 * s }}>
        <P11SessionMeta icon="pin" value={location} />
        <P11SessionMeta
          icon="clock"
          value={`Đăng nhập hoặc làm mới token: ${time}`}
        />
      </View>
      <View style={{ marginTop: 16 * s }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Thông tin phiên"
          onPress={onDetails}
          style={{
            minHeight: 44 * s,
            flexDirection: 'row',
            gap: 14 * s,
            alignItems: 'center',
          }}
        >
          <P11Icon name="info" size={26} color={HN_UI.textSecondary} />
          <P11Text size={18} color={HN_UI.textSecondary}>
            Thông tin phiên
          </P11Text>
        </Pressable>
      </View>
      {confirmed ? (
        <P11Text size={17} color={HN_UI.textMuted} style={{ marginTop: 12 * s }}>
          WMS đã xác nhận thu hồi · Chờ cập nhật danh sách
        </P11Text>
      ) : null}
      {!current ? (
        <View style={{ marginTop: 22 * s }}>
          <P11Button
            label="Đăng xuất từ xa"
            accessibilityLabel="Thu hồi phiên"
            variant="revoke"
            disabled={disabled}
            onPress={onRevoke}
          />
        </View>
      ) : null}
    </View>
  );
}
function P11SessionMeta({
  icon,
  value,
}: {
  icon: 'pin' | 'clock';
  value: string;
}) {
  const s = useP11Scale();
  return (
    <View
      style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 14 * s }}
    >
      <P11Icon name={icon} size={26} color={HN_UI.textSecondary} />
      <P11Text
        size={18}
        line={1.4}
        color={HN_UI.textMuted}
        style={{ flex: 1, minWidth: 0 }}
      >
        {value}
      </P11Text>
    </View>
  );
}
