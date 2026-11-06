import {HN_UI} from '../../theme/uiKitV3';
import { ScannerNativeText as Text } from '../../ui/ScannerNativeText';
// Geometry: shared/scan-entry.css and P09 style.css, as shown by the user.
import React, { useEffect, useRef, useState, type ReactNode } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { scannerAssets } from '../../theme/scannerAssets';
import { AppIcon } from '../../ui/AppIcon';
import { P04Icon } from '../inbound/P04Icon';
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import { Input } from '../../ui/Input';
import { P09Action, P09Tile, p09 } from './P09Presentation';
import { P09NativeCamera } from './P09NativeCamera';

const s = StyleSheet.create({
  card: { padding: 0, gap: 0 },
  heading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 10,
  },
  title: { color: HN_UI.textSecondary, fontSize: 16, lineHeight: 22, fontWeight: '600' },
  subtitle: { color: HN_UI.textMuted, fontSize: 12, lineHeight: 18 },
  camera: {
    height: 220,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: HN_UI.shell,
  },
  manualCamera: { height: 128 },
  fill: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 },
  image: { width: '100%', height: '100%' },
  shade: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: HN_UI.scanScrim,
    opacity:0.25,
  },
  reticle: {
    position: 'absolute',
    top: 26,
    bottom: 26,
    left: 85,
    right: 85,
    borderWidth: 3,
    borderColor: HN_UI.border,
    borderRadius: 12,
  },
  manualReticle: { top: 18, bottom: 18, left: 115, right: 115 },
  caption: {
    position: 'absolute',
    left: 8,
    bottom: 8,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 4,
    backgroundColor: HN_UI.scanScrim,
  },
  white: { color: HN_UI.onBrand, fontSize: 12, lineHeight: 18 },
  tools: { flexDirection: 'row', gap: 12, marginTop: 13, marginBottom: 11 },
  tool: {
    flex: 1,
    minWidth: 0,
    minHeight: 48,
    padding: 10,
    gap: 12,
    borderRadius: 10,
    backgroundColor: HN_UI.canvas,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  inactive: { backgroundColor: HN_UI.canvas },
  selected: {
    backgroundColor: HN_UI.selected,
    borderWidth: 1,
    borderColor: HN_UI.borderControl,
  },
  toolText: {
    color: HN_UI.textPrimary,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
    flexShrink: 1,
  },
  inactiveText: { color: HN_UI.textMuted, fontSize: 13 },
  manual: {
    padding: 14,
    borderWidth: 1,
    borderColor: HN_UI.border,
    borderRadius: 12,
    gap: 8,
    marginBottom: 14,
  },
});

export function P09CameraSurface({
  manual,
  disabled,
  onManual,
  camera,
  caption = 'Camera chưa kết nối',
  onActivate,
  activationLabel,
  torch = false,
  onTorch,
  scale = 1,
  cameraHeight = 220,
}: {
  manual: boolean;
  disabled: boolean;
  onManual(): void;
  camera?: ReactNode;
  caption?: string;
  onActivate?: () => void;
  activationLabel?: string;
  torch?: boolean;
  onTorch?: () => void;
  scale?: number;
  cameraHeight?: number;
}) {
  return (
    <>
      <Pressable
        accessibilityRole={onActivate ? 'button' : 'image'}
        accessibilityLabel={
          onActivate
            ? activationLabel || 'Bật camera để quét serial'
            : 'Ảnh kho minh họa; camera chưa bật'
        }
        disabled={!onActivate || disabled}
        onPress={onActivate}
        style={[s.camera, { height: (manual ? 128 : cameraHeight) * scale }]}
      >
        {camera ?? (
          <Image
            source={scannerAssets.warehouseMain}
            resizeMode="cover"
            style={s.image}
          />
        )}
        {/* Artwork keeps its approved shade; live preview stays untinted. */}
        {!camera && (
          <Svg pointerEvents="none" style={s.fill} width="100%" height="100%">
            <Defs>
              <LinearGradient id="p09CameraShade" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={HN_UI.shell} stopOpacity={0.1333} />
                <Stop offset="1" stopColor={HN_UI.shell} stopOpacity={0.2667} />
              </LinearGradient>
            </Defs>
            <Rect width="100%" height="100%" fill="url(#p09CameraShade)" />
          </Svg>
        )}
        <View
          pointerEvents="none"
          style={[
            s.reticle,
            {
              top: (manual ? 18 : 26) * scale,
              bottom: (manual ? 18 : 26) * scale,
              left: (manual ? 115 : 85) * scale,
              right: (manual ? 115 : 85) * scale,
            },
          ]}
        />
        <View pointerEvents="none" style={s.caption}>
          <Text style={s.white}>{caption}</Text>
        </View>
      </Pressable>
      <View style={s.tools}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            onTorch ? (torch ? 'Tắt đèn' : 'Bật đèn') : 'Đèn chưa sẵn sàng'
          }
          disabled={!onTorch || disabled}
          onPress={onTorch}
          style={[s.tool, !onTorch && s.inactive]}
        >
          <P04Icon
            name="torch"
            size={20}
            color={onTorch ? HN_UI.textPrimary : HN_UI.textMuted}
          />
          <Text style={[s.toolText, !onTorch && s.inactiveText]}>
            {onTorch ? (torch ? 'Tắt đèn' : 'Bật đèn') : 'Đèn chưa sẵn sàng'}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Nhập tay"
          accessibilityState={{ expanded: manual, disabled }}
          disabled={disabled}
          onPress={onManual}
          style={[s.tool, manual && s.selected]}
        >
          <AppIcon name="keyboard" size={20} color={HN_UI.textPrimary} />
          <Text style={s.toolText}>Nhập tay</Text>
        </Pressable>
      </View>
    </>
  );
}

export function P09ScanEntry({
  value,
  onChange,
  onCheck,
  onRead,
  locked,
  resolving,
  error,
  cameraAvailable,
  identified = false,
  onLookup,
}: {
  value: string;
  onChange(value: string): void;
  onCheck(): void;
  onRead(value: string): void;
  locked: boolean;
  resolving: boolean;
  error?: string;
  cameraAvailable: boolean;
  identified?: boolean;
  onLookup?: () => void;
}) {
  const [manual, setManual] = useState(Boolean(value));
  const wasIdentified = useRef(identified);
  useEffect(() => {
    if (wasIdentified.current && !identified) setManual(true);
    wasIdentified.current = identified;
  }, [identified]);
  const disabled = locked || resolving || identified;
  const showManual = manual && !identified;
  const onManual = () => setManual(v => !v);
  return (
    <View style={s.card} accessibilityLabel="Quét mã để tiếp nhận bảo hành">
      <View style={s.heading}>
        <P09Tile name="box" warranty />
        <View style={p09.fill}>
          <Text style={s.title}>1. Xác định sản phẩm</Text>
          <Text style={s.subtitle}>Quét hoặc nhập đúng serial thiết bị</Text>
        </View>
      </View>
      {cameraAvailable ? (
        <P09NativeCamera
          manual={showManual}
          disabled={disabled}
          onRead={raw => {
            setManual(true);
            onRead(raw);
          }}
          renderSurface={state => (
            <P09CameraSurface
              {...state}
              caption={
                identified
                  ? 'Đã xác định thiết bị · Chọn Đổi sản phẩm để quét lại'
                  : state.caption
              }
              manual={showManual}
              disabled={disabled}
              onManual={onManual}
            />
          )}
        />
      ) : (
        <P09CameraSurface
          caption={
            identified
              ? 'Đã xác định thiết bị · Chọn Đổi sản phẩm để quét lại'
              : undefined
          }
          manual={showManual}
          disabled={disabled}
          onManual={onManual}
        />
      )}
      {showManual && (
        <View style={s.manual}>
          <View style={p09.row}>
            <AppIcon name="keyboard" size={20} color={HN_UI.textLink} />
            <Text style={[s.title, p09.fill, { fontSize: 15 }]}>
              Nhập mã sản phẩm
            </Text>
            <P09Action
              label="Thu gọn"
              variant="secondary"
              disabled={disabled}
              onPress={() => setManual(false)}
              style={{ backgroundColor: 'transparent', paddingHorizontal: 8 }}
            />
          </View>
          <Input
            label="Serial sản phẩm*"
            accessibilityLabel="Mã sản phẩm / serial*"
            placeholder="Ví dụ: HN12345"
            value={value}
            editable={!disabled}
            maxLength={512}
            returnKeyType="search"
            onChangeText={onChange}
            onSubmitEditing={onCheck}
            fieldHeight={52}
            accessibilityHint={error}
            fieldStyle={error ? { borderColor: HN_UI.danger } : undefined}
          />
          <Text style={[s.subtitle, error && { color: HN_UI.danger }]}>
            {error ?? 'Nhập serial, rồi nhấn Enter để kiểm tra.'}
          </Text>
        </View>
      )}
      {onLookup && (
        <P09Action
          label="Tra cứu sản phẩm"
          variant="secondary"
          trailing={<P04Icon name="arrow" size={18} color={HN_UI.textLink} />}
          disabled={locked || resolving}
          onPress={onLookup}
          style={{ minHeight: 44 }}
          labelStyle={{ fontSize: 14, lineHeight: 20 }}
        />
      )}
    </View>
  );
}
