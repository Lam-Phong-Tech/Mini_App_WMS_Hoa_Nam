import {HN_UI} from '../../theme/uiKitV3';
import {ScannerNativeText as Text} from '../../ui/ScannerNativeText';
import {SCANNER_ARIAL_FAMILY} from '../../theme/scannerTypography';
import {SCANNER_COLORS} from '../../ui/ScannerPalette';
import React, { type ReactNode } from 'react';
import {Pressable, ScrollView, StyleSheet, View} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SvgXml } from 'react-native-svg';
import { P04Icon } from '../inbound/P04Icon';

// Native layout of the locked P07 HTML frame. Header/footer stay outside native scroll.
export const p07 = StyleSheet.create({
  screen: { flex: 1, backgroundColor: HN_UI.primary },
  header: {
    minHeight: 86,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
    paddingHorizontal: 20,
    paddingBottom: 20,
    paddingTop: 16,
  },
  title: {
    flex: 1,
    color: HN_UI.onBrand,
    fontSize: 22,
    lineHeight:30,
    fontWeight: '600',
    fontFamily: SCANNER_ARIAL_FAMILY,
  },
  step: {
    color: HN_UI.onBrand,
    fontSize: 14,
    lineHeight:20,
    flexShrink: 0,
    fontFamily: SCANNER_ARIAL_FAMILY,
  },
  iconButton: {
    minWidth: 48,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
  },
  addIcon: {width:22,height:22,borderRadius:3,borderWidth:1.5,borderColor:HN_UI.onBrand,alignItems:'center',justifyContent:'center'},
  tagHeader: {flexDirection:'row',alignItems:'flex-start',gap:8,flexWrap:'nowrap',minWidth:0},
  tagCode: {flex:1,minWidth:0},
  tagBadge: {flexShrink:0,maxWidth:'50%',alignSelf:'flex-start'},
  body: {
    flex: 1,
    minHeight: 0,
    marginTop: -12,
    backgroundColor: HN_UI.canvas,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
  },
  scroll: { flex: 1, minHeight: 0 },
  content: { padding: 18, paddingTop: 16, gap: 14, paddingBottom: 24 },
  footer: {
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 24,
    gap: 10,
    backgroundColor: HN_UI.canvas,
  },
  card: {
    borderWidth: 1,
    borderColor: HN_UI.border,
    borderRadius: 12,
    backgroundColor: HN_UI.surface,
    overflow: 'hidden',
  },
  heading: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 7,
    color: HN_UI.textPrimary,
    fontSize: 20,
    fontWeight: '600',
    fontFamily: SCANNER_ARIAL_FAMILY,
  },
  hint: {
    color: HN_UI.textMuted,
    fontSize: 16,
    lineHeight: 22,
    flexShrink: 1,
    fontFamily: SCANNER_ARIAL_FAMILY,
  },
  text: {
    color: HN_UI.textPrimary,
    fontSize: 17,
    lineHeight: 24,
    fontFamily: SCANNER_ARIAL_FAMILY,
  },
  strong: {
    color: HN_UI.textPrimary,
    fontSize: 20,
    lineHeight: 27,
    fontWeight: '600',
    fontFamily: SCANNER_ARIAL_FAMILY,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, minWidth: 0 },
  rowBody: { flex: 1, minWidth: 0 },
  tile: {
    width: 60,
    height: 60,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: HN_UI.canvas,
  },
  inset: {
    padding: 10,
    margin: 8,
    marginTop: 0,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: HN_UI.border,
    backgroundColor: HN_UI.surface,
  },
  kv: {
    minHeight: 48,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderTopWidth: 1,
    borderColor: HN_UI.border,
  },
  label: {
    flex: 1,
    minWidth: 0,
    color: HN_UI.textMuted,
    fontSize: 18,
    lineHeight: 25,
    fontFamily: SCANNER_ARIAL_FAMILY,
  },
  value: {
    flex: 1.2,
    minWidth: 0,
    color: HN_UI.textPrimary,
    fontSize: 19,
    lineHeight: 26,
    fontWeight: '500',
    fontFamily: SCANNER_ARIAL_FAMILY,
  },
  action: {
    minHeight: 56,
    padding: 14,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: SCANNER_COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondary: {
    minHeight: 56,
    paddingVertical: 12,
    backgroundColor: HN_UI.secondary,
    borderWidth: 1,
    borderColor: HN_UI.primary,
  },
  actionText: {
    color: HN_UI.onBrand,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
    textAlign: 'center',
    fontFamily: SCANNER_ARIAL_FAMILY,
  },
  secondaryText: {
    color: HN_UI.textLink,
    fontSize: 14,
    lineHeight:20,
    fontWeight: '600',
    fontFamily: SCANNER_ARIAL_FAMILY,
  },
  disabledAction: { backgroundColor: HN_UI.disabled },
  disabled: { opacity: 1,backgroundColor:HN_UI.disabled },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    minWidth: 0,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: HN_UI.borderControl,
    backgroundColor: HN_UI.canvas,
    paddingLeft: 9,
  },
  input: {
    flex: 1,
    minWidth: 0,
    minHeight: 44,
    paddingVertical: 8,
    color: HN_UI.textLink,
    fontSize: 16,
  },
  tabs: { flexDirection: 'row', gap: 6 },
  tab: {
    flex: 1,
    minWidth: 0,
    minHeight: 44,
    padding: 5,
    borderRadius: 10,
    backgroundColor: HN_UI.canvas,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedTab: { backgroundColor: HN_UI.primary },
  tabText: {
    color: HN_UI.textPrimary,
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  badge: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 13,
    overflow: 'hidden',
    backgroundColor: HN_UI.canvas,
    color: HN_UI.textMuted,
    fontSize: 16,
  },
  successBadge: { backgroundColor: HN_UI.successSoft, color: HN_UI.success },
  warningBadge: { backgroundColor: HN_UI.warningSoft, color: HN_UI.warning },
  lockedBadge: { backgroundColor: HN_UI.dangerSoft, color: HN_UI.danger },
});

export function P07Action({
  label,
  onPress,
  disabled = false,
  secondary = false,
  testID,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
  testID?: string;
}) {
  const ink=disabled?HN_UI.disabledForeground:secondary?HN_UI.secondaryForeground:HN_UI.onBrand;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label.replace(/ →$/, '').replace(/^＋ /, '')}
      accessibilityState={{ disabled }}
      onPress={onPress}
      disabled={disabled}
      style={[
        p07.action,
        secondary && p07.secondary,
        disabled && p07.disabledAction,
      ]}
    >
      {!secondary && !disabled && (
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <SvgXml
            width="100%"
            height="100%"
            xml={`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 494 62" preserveAspectRatio="none"><rect width="494" height="62" fill="${SCANNER_COLORS.primary}"/></svg>`}
          />
        </View>
      )}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          width: '100%',
          justifyContent: 'center',
        }}
      >
        {label.startsWith('Xem thông tin thẻ') && (
          <P04Icon name="document" size={24} color={ink}/>
        )}
        {label === 'Về Trang chủ' && (
          <P04Icon name="home" size={24} color={ink}/>
        )}
        {label.startsWith('＋') && (
          <P04Icon name="plus" size={24} color={ink}/>
        )}
        <Text
          style={[
            p07.actionText,
            secondary && p07.secondaryText,
            disabled && {color:HN_UI.disabledForeground},
            { flexShrink: 1, minWidth: 0 },
            label.startsWith('Xem thông tin thẻ') && {
              flex: 1,
              textAlign: 'left',
            },
          ]}
        >
          {label.replace(/ →$/, '').replace(/^＋ /, '')}
        </Text>
        {label.endsWith(' →') && (
          <P04Icon name="arrow" size={24} color={ink}/>
        )}
      </View>
    </Pressable>
  );
}
export function P07Frame({
  title,
  step,
  onBack,
  children,
  footer,
  add,
  panel,
  onOptions,
  optionsDisabled=false,
}: {
  title: string;
  step?: string;
  onBack: () => void;
  children: ReactNode;
  footer: ReactNode;
  add?: () => void;
  panel: number;
  onOptions?:()=>void;
  optionsDisabled?:boolean;
}) {
  return (
    <SafeAreaView
      edges={panel === 1 ? ['top'] : ['top', 'bottom']}
      style={p07.screen}
      testID={`P07.S0${panel}`}
    >
      <View style={p07.header}>
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <SvgXml
            width="100%"
            height="100%"
            xml={`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 494 76" preserveAspectRatio="none"><rect width="494" height="76" fill="${HN_UI.shell}"/></svg>`}
          />
        </View>
        {panel === 1 ? (
          <View style={{ width: 46 }} />
        ) : (
          <Pressable
            accessibilityLabel="Quay lại"
            accessibilityRole="button"
            onPress={onBack}
            style={p07.iconButton}
          >
            <P04Icon name="arrow-left" size={24} color={HN_UI.onBrand}/>
          </Pressable>
        )}
        <Text accessibilityRole="header" style={p07.title}>
          {title}
        </Text>
        {step && <Text style={p07.step}>{step}</Text>}
        {onOptions?<Pressable accessibilityRole="button" accessibilityLabel="Tùy chọn liên kết" disabled={optionsDisabled} onPress={onOptions} style={p07.iconButton}><P04Icon name="ellipsis" color={HN_UI.onBrand} size={24}/></Pressable>:null}
        {add && (
          <Pressable
            accessibilityLabel="Thêm liên kết NFC"
            accessibilityRole="button"
            onPress={add}
            style={p07.iconButton}
          >
            <View testID="P07.add.icon" style={p07.addIcon} pointerEvents="none">
              <P04Icon name="plus" size={16} color={HN_UI.onBrand}/>
            </View>
          </Pressable>
        )}
      </View>
      <View style={p07.body}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          style={p07.scroll}
          contentContainerStyle={p07.content}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
        <View
          testID="P07.footer"
          style={[p07.footer, panel === 1 && { padding: 0, paddingTop: 0 }]}
        >
          {footer}
        </View>
      </View>
    </SafeAreaView>
  );
}
