import {HN_UI} from '../../theme/uiKitV3';
import {ScannerNativeText as Text} from '../../ui/ScannerNativeText';
// Native presentation of the upgraded inbound.mjs/style.css, without API writes.
import React, { type ReactNode } from 'react';
import {Image, Pressable, StyleSheet, View, useWindowDimensions} from 'react-native';
import { P04Frame,p04 } from './P04Frame';
import { P04Icon } from './P04Icon';
import { P04Text } from './P04Text';
import { HN_OPERATIONS } from '../../ui/hnHomeTokens';
import { formatP04ScanTime } from './p04Date';
import type { P04ViewState } from './p04View';
import { scannerAssets } from '../../theme/scannerAssets';
import {P04_ASSET,p04Asset} from './P04AssetTheme';

type Filter = 'all' | 'valid' | 'duplicate' | 'invalid';
const groups = [
  { id: 'valid', label: 'Hợp lệ', ink: HN_UI.success },
  { id: 'duplicate', label: 'Trùng', ink: HN_UI.warning },
  { id: 'invalid', label: 'Lỗi', ink: HN_UI.danger },
] as const;
const s = StyleSheet.create({
  intro: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  tile: {
    width: 57,
    height: 57,
    borderRadius: 11,
    backgroundColor: HN_UI.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  outboundTile: { backgroundColor: HN_OPERATIONS.outbound.soft },
  body: { flex: 1, minWidth: 0, gap: 3 },
  title: { fontSize: 17, lineHeight: 24, fontWeight: '700', color: HN_UI.textPrimary },
  small: { fontSize: 13, lineHeight: 19, color: HN_UI.textSecondary },
  value: { fontSize: 14, lineHeight: 21, fontWeight: '600', color: HN_UI.textPrimary },
  context: {
    borderWidth: 1,
    borderColor: HN_UI.successBorder,
    backgroundColor: HN_UI.successSoft,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  green: { color: HN_UI.success },
  outboundInk: { color: HN_UI.textLink },
  outboundContext: { borderColor: HN_UI.border, backgroundColor: HN_UI.canvas },
  link: {
    minHeight: 44,
    paddingHorizontal: 5,
    justifyContent: 'center',
    flexShrink: 0,
  },
  camera: {
    height: 160,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: HN_UI.shell,
  },
  outboundCamera:{height:'auto',aspectRatio:319/201},
  outboundIntro:{padding:8,borderRadius:10,backgroundColor:HN_UI.canvas},
  duplicateWarning:{flexDirection:'row',alignItems:'center',gap:10,padding:10,borderRadius:10,backgroundColor:HN_UI.warningSoft},
  manualCamera: { height: 40 },
  image: { width: '100%', height: '100%' },
  shade: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: HN_UI.scanScrim,
    opacity:0.25,
  },
  reticle: {
    position: 'absolute',
    top: 25,
    bottom: 21,
    left: '18%',
    right: '18%',
    borderWidth: 3,
    borderColor: HN_UI.border,
    borderRadius: 12,
  },
  cameraLabel: {
    position: 'absolute',
    bottom: 5,
    left: 8,
    paddingHorizontal: 7,
    paddingVertical: 3,
    backgroundColor: HN_UI.scanScrim,
    borderRadius: 4,
  },
  white: { color: HN_UI.onBrand, fontSize: 12, lineHeight: 18 },
  counter: {
    flexDirection: 'row',
    gap: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: HN_UI.border,
    borderRadius: 10,
    backgroundColor: HN_UI.surface,
  },
  total: {
    flex: 0.44,
    minWidth: 0,
    padding: 7,
    borderRadius: 8,
    gap: 2,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  number: { fontSize: 30, lineHeight: 36, fontWeight: '700', color: HN_UI.success },
  countColumn: {
    flex: 0.56,
    minWidth: 0,
    borderLeftWidth: 1,
    borderLeftColor: HN_UI.border,
    paddingLeft: 8,
  },
  filter: {
    minHeight: 40,
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  selected: { backgroundColor: HN_UI.successSoft, borderColor: HN_UI.successBorder },
  listHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  listTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '700',
    color: HN_UI.textPrimary,
  },
  listCount: { fontWeight: '400', fontSize: 12, color: HN_UI.textSecondary },
  attempts: {
    borderWidth: 1,
    borderColor: HN_UI.border,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: HN_UI.surface,
  },
  attempt: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    minHeight: 54,
  },
  separator: { borderTopWidth: 1, borderTopColor: HN_UI.border },
  dot: {
    width: 19,
    height: 19,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  validDot: { backgroundColor: HN_UI.success },
  errorDot: { backgroundColor: HN_UI.danger },
  dotText: { color: HN_UI.onBrand, fontSize: 13, fontWeight: '700' },
  code: { fontSize: 14, lineHeight: 21, fontWeight: '600', color: HN_UI.textPrimary },
  reason: { fontSize: 12, lineHeight: 18, color: HN_UI.warning },
  latest: { fontSize: 11, lineHeight: 17, color: HN_UI.textMuted },
  result: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  resultNarrow: { flexDirection: 'column', alignItems: 'flex-end', gap: 5 },
  time: { fontSize: 12, lineHeight: 18, color: HN_UI.textSecondary },
  badge: { paddingHorizontal: 7, paddingVertical: 4, borderRadius: 20 },
  validBadge: { backgroundColor: HN_UI.successSoft },
  duplicateBadge: { backgroundColor: HN_UI.warningSoft },
  invalidBadge: { backgroundColor: HN_UI.dangerSoft },
  badgeText: { fontSize: 12, lineHeight: 18 },
  empty: {
    alignItems: 'center',
    paddingVertical: 18,
    paddingHorizontal: 12,
    gap: 7,
  },
});

export function P04ScanPresentation({
  operation = 'inbound',
  planned,
  documentRef,
  typeLabel,
  supplierName,
  attempts,
  quantity,
  manual,
  filter,
  all,
  camera,
  cameraLabel,
  tools,
  manualForm,
  footer,
  notices,
  viewState,
  onViewChange,
  onBack,
  onFilter,
  onAll,
  onContext,
  busy,
  showContext = true,
}: {
  documentRef?: string;
  typeLabel?: string;
  supplierName?: string;
  attempts: readonly {
    raw: string;
    at: number;
    kind: 'valid' | 'duplicate' | 'invalid';
    reason?: string;
    timeLabel?: string;
  }[];
  operation?: 'inbound' | 'outbound';
  planned?: number;
  codeCount: number;
  quantity: number;
  manual: boolean;
  filter: Filter;
  all: boolean;
  camera?: ReactNode;
  cameraLabel?: string;
  tools: ReactNode;
  manualForm?: ReactNode;
  footer: ReactNode;
  notices?: ReactNode;
  viewState?: P04ViewState;
  onViewChange?: (patch: P04ViewState) => void;
  onBack: () => void;
  onFilter: (filter: Filter) => void;
  onAll: () => void;
  onContext: () => void;
  busy: boolean;
  showContext?: boolean;
}) {
  // Keep the outbound owner untouched; inbound follows the locked Arial source.
  const InboundText = P04Text;
  const NativeText = Text;
  const ScreenText = operation === 'inbound' ? InboundText : NativeText;
  const { width } = useWindowDimensions();
  const counts = {
    all: attempts.length,
    valid: attempts.filter(row => row.kind === 'valid').length,
    duplicate: attempts.filter(row => row.kind === 'duplicate').length,
    invalid: attempts.filter(row => row.kind === 'invalid').length,
  };
  const rows = [...attempts]
    .reverse()
    .filter(row => filter === 'all' || row.kind === filter);
  const label =
    filter === 'all'
      ? 'Tất cả'
      : groups.find(item => item.id === filter)!.label;
  return (
    <P04Frame
      assetPack
      title={operation === 'outbound' ? 'Xuất kho' : 'Nhập kho'}
      step={operation==='inbound'?2:undefined}
      headerRight={operation==='outbound'?<ScreenText style={p04.step}>Bước 2/3</ScreenText>:undefined}
      stepLabels={
        operation === 'outbound'
          ? ['Thông tin', 'Thêm sản phẩm', 'Kiểm tra']
          : undefined
      }
      onBack={onBack}
      footer={footer}
      contentStyle={operation==='outbound'?{gap:8}:undefined}
      initialScrollY={viewState?.scroll?.[2]}
      onScrollPositionChange={y => onViewChange?.({ scroll: { 2: y } })}
    >
      <View style={[s.intro,operation==='outbound'&&s.outboundIntro]}>
        <View style={[s.tile,p04Asset.sectionTile]}>
          <P04Icon
            name="scan"
            size={26}
            assetPack
            color={P04_ASSET.scanInk}
          />
        </View>
        <View style={s.body}>
          <ScreenText style={s.title}>
            {operation === 'outbound'
              ? 'Quét hàng xuất kho'
              : 'Quét hàng nhập vào'}
          </ScreenText>
          <ScreenText style={[s.small, operation === 'inbound' && { lineHeight: 21 }]}>
            {manual
              ? 'Nhập mã để thêm sản phẩm vào phiếu'
              : 'Hướng camera vào mã QR/Serial/SKU'}
          </ScreenText>
        </View>
      </View>
      {showContext && <View style={[s.context, operation==='outbound'&&s.outboundContext]}>
        <P04Icon
          name="document"
          size={20}
          color={
            operation === 'outbound' ? HN_OPERATIONS.outbound.ink : HN_UI.success
          }
        />
        <View style={s.body}>
          <ScreenText
            selectable
            style={[
              s.value,
              s.green,
              operation === 'outbound' && s.outboundInk,
            ]}
          >
            {documentRef ?? 'Đang xác nhận số phiếu…'}
          </ScreenText>
          <ScreenText
            style={[
              s.small,
              s.green,
              operation === 'outbound' && s.outboundInk,
            ]}
          >
            {typeLabel ??
              (operation === 'outbound'
                ? 'Xuất kho'
                : 'Chưa xác minh loại nhập')}
          </ScreenText>
          <ScreenText
            style={[
              s.small,
              s.green,
              operation === 'outbound' && s.outboundInk,
            ]}
          >
            {supplierName ??
              (operation === 'outbound'
                ? 'Chưa có người nhận'
                : 'Không chọn nhà cung cấp')}
          </ScreenText>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            operation === 'outbound'
              ? 'Chi tiết phiếu đang xuất'
              : 'Chi tiết phiếu đang nhập'
          }
          onPress={onContext}
          disabled={busy}
          style={s.link}
        >
          <ScreenText
            style={[
              s.small,
              s.green,
              operation === 'outbound' && s.outboundInk,
            ]}
          >
            Chi tiết
          </ScreenText>
        </Pressable>
      </View>}
      <View
        testID="p04-camera-frame"
        style={[s.camera,operation==='outbound'&&s.outboundCamera, manual && s.manualCamera]}
      >
        {camera ?? (
          <>
            <Image
              source={operation==='outbound'?scannerAssets.outboundScanSample:scannerAssets.warehouseMain}
              resizeMode="cover"
              style={s.image}
              accessible={false}
            />
            <View style={s.shade} />
          </>
        )}
        {!manual && (operation==='inbound'||Boolean(camera)) && <View pointerEvents="none" style={s.reticle} />}
        {!!cameraLabel && (
          <View pointerEvents="none" style={s.cameraLabel}>
            <ScreenText style={s.white}>{cameraLabel}</ScreenText>
          </View>
        )}
      </View>
      {!manual && tools}
      {manual && manualForm}
      <View style={[s.counter,operation==='outbound'&&{padding:10}]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Tất cả ${counts.all} lượt quét`}
          accessibilityState={{ selected: filter === 'all' }}
          onPress={() => onFilter('all')}
          style={[s.total, operation === 'inbound' && { justifyContent: 'center', paddingVertical: 5, paddingHorizontal: 7, gap: 0 }, operation==='inbound'&&filter === 'all' && s.selected]}
        >
          <ScreenText style={[s.small, operation === 'inbound' && { fontSize: 14, lineHeight: 19.6 }]}>
            {planned !== undefined ? 'Đã soạn' : 'Tổng đã quét'}
          </ScreenText>
          <ScreenText style={[s.number, operation==='outbound'&&{fontSize:26,lineHeight:32,color:HN_UI.textPrimary}]}>
            {planned !== undefined ? `${quantity} / ${planned}` : counts.all}
          </ScreenText>
          <ScreenText style={[s.small, operation === 'inbound' && { fontSize: 14, lineHeight: 19.6 }]}>
            {planned !== undefined ? 'sản phẩm' : operation === 'inbound' ? 'lượt quét' : 'lượt quét · Tất cả'}
          </ScreenText>
        </Pressable>
        <View style={s.countColumn}>
          {groups.map(item => (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              accessibilityLabel={`${operation === 'inbound' && item.id === 'duplicate' ? 'Mã trùng' : item.label} ${counts[item.id]} lượt quét`}
              accessibilityState={{ selected: filter === item.id }}
              onPress={() => onFilter(item.id)}
              style={[s.filter,operation==='outbound'&&{minHeight:28,paddingVertical:4,paddingHorizontal:6}, filter === item.id && s.selected]}
            >
              <ScreenText style={[s.small, operation === 'inbound' && { fontSize: 14, lineHeight: 19.6 }]}>{operation==='outbound'?({valid:'Mã hợp lệ',duplicate:'Mã trùng',invalid:'Mã không hợp lệ'}[item.id]):item.id==='duplicate'?'Mã trùng':item.label}</ScreenText>
              <ScreenText style={[s.value, { color: item.id==='duplicate'?HN_UI.danger:operation==='outbound'&&item.id==='invalid'&&counts.invalid===0?HN_UI.textMuted:item.ink }, operation === 'inbound' && { fontSize: 17, fontWeight: '400' }]}>
                {counts[item.id]}
              </ScreenText>
            </Pressable>
          ))}
        </View>
      </View>
      {operation==='outbound'&&counts.duplicate>0?<View style={s.duplicateWarning}>
        <P04Icon name="alert-solid" color={HN_UI.warning} size={26}/><View style={s.body}>
          <ScreenText style={{color:HN_UI.warning,fontSize:14,lineHeight:20,fontWeight:'700'}}>{counts.duplicate} mã trùng · không tính</ScreenText>
          <ScreenText style={[s.small,{fontSize:12,lineHeight:18}]}>Sản phẩm đã quét trước đó sẽ không được tính vào số lượng.</ScreenText>
        </View>
      </View>:null}
      <View style={s.listHead}>
        <ScreenText style={s.listTitle}>
          Danh sách mã đã quét{' '}
          {(filter !== 'all') && <ScreenText style={s.listCount}>
            ({rows.length}/{counts.all} lượt · {label})
          </ScreenText>}
        </ScreenText>
        {rows.length > 4 && (
          <Pressable accessibilityRole="button" onPress={onAll} style={s.link}>
            <ScreenText style={s.small}>{all ? 'Thu gọn' : 'Xem tất cả →'}</ScreenText>
          </Pressable>
        )}
      </View>
      {operation === 'inbound' && <View style={{flexDirection:'row',alignItems:'center',gap:6}}>
        <P04Icon name="info" size={17} color={HN_UI.textLink} />
        <ScreenText style={s.small}>Mã trùng không tính vào phiếu</ScreenText>
      </View>}
      <View style={s.attempts}>
        {(all ? rows : rows.slice(0, 4)).map((row, index) => (
          <View
            key={`${row.at}:${index}`}
            style={[s.attempt,operation==='outbound'&&{minHeight:45,paddingVertical:7}, index > 0 && s.separator]}
          >
            <View
              style={[s.dot, row.kind === 'valid' ? s.validDot : s.errorDot]}
            >
              <ScreenText style={s.dotText}>{row.kind === 'valid' ? '✓' : '×'}</ScreenText>
            </View>
            <View style={s.body}>
              <ScreenText selectable style={s.code}>
                {row.raw}
              </ScreenText>
              {operation === 'outbound' && row === attempts.at(-1) && (
                <ScreenText style={s.latest}>Gần nhất</ScreenText>
              )}
              {!!row.reason && (
                <ScreenText selectable style={s.reason}>
                  {row.reason}
                </ScreenText>
              )}
            </View>
            <View style={[s.result, width < (operation === 'inbound' ? 360 : 430) && s.resultNarrow]}>
              <ScreenText style={s.time}>
                {row.timeLabel ?? formatP04ScanTime(row.at)}
              </ScreenText>
              <View
                style={[
                  s.badge,
                  row.kind === 'valid'
                    ? s.validBadge
                    : row.kind === 'duplicate'
                    ? operation === 'inbound' ? s.invalidBadge : s.duplicateBadge
                    : s.invalidBadge,
                ]}
              >
                <ScreenText
                  style={[
                    s.badgeText,
                    { color: operation === 'inbound' && row.kind === 'duplicate' ? HN_UI.danger : groups.find(item => item.id === row.kind)!.ink },
                  ]}
                >
                  {row.kind === 'valid'
                    ? 'Hợp lệ'
                    : row.kind === 'duplicate'
                    ? operation === 'inbound' ? 'Mã trùng' : 'Trùng mã'
                    : 'Mã lỗi'}
                </ScreenText>
              </View>
            </View>
          </View>
        ))}
        {!rows.length && (
          <View style={s.empty}>
            <P04Icon name="scan" color={HN_UI.textSecondary} size={24} />
            <ScreenText style={s.value}>
              {attempts.length
                ? 'Không có lượt quét thuộc nhóm này'
                : 'Chưa có mã được quét'}
            </ScreenText>
            {attempts.length ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => onFilter('all')}
                style={s.link}
              >
                <ScreenText style={s.small}>Xem tất cả lượt quét</ScreenText>
              </Pressable>
            ) : (
              <ScreenText style={s.small}>
                Chọn Nhập tay hoặc Bật camera để thêm sản phẩm đầu tiên.
              </ScreenText>
            )}
          </View>
        )}
      </View>
      {notices}
    </P04Frame>
  );
}

