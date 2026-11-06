import {HN_UI} from '../../theme/uiKitV3';
import { ScannerNativeText as Text } from '../../ui/ScannerNativeText';
// Latest Sheet Note S04: green check + six source rows. Receipt/current remain separate.
// Both P05 owners retain their own receipt/current/UNKNOWN policies.
import React, { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { P04Icon } from '../inbound/P04Icon';
import { formatP04DateTime } from '../inbound/p04Date';
import type { CurrentDocument } from './linked/types';
import { ThemeProvider } from '../../theme/ThemeProvider';
import {SCANNER_COLORS} from '../../ui/ScannerPalette';
import {SCANNER_ARIAL_FAMILY} from '../../theme/scannerTypography';

// A second tap on the S03 send position must not activate the S04 Home button
// that replaces it. This short presentation guard never sends/retries a request.
export function useP05ResultActions(step: number, documentId?: string | null) {
  const [readyId, setReadyId] = useState<string | null>(null);
  useEffect(() => {
    setReadyId(null);
    if (step !== 4 || !documentId) return;
    const timer = setTimeout(() => setReadyId(documentId), 350);
    return () => clearTimeout(timer);
  }, [step, documentId]);
  return step === 4 && !!documentId && readyId === documentId;
}

const styles = StyleSheet.create({
  body: { gap: 16, paddingHorizontal: 0 },
  hero: { alignItems: 'center', gap: 14, paddingTop: 4, paddingBottom: 4 },
  operationIcon: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: HN_UI.successSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successCenter: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: HN_UI.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  explanationTitle: {
    fontSize: 16,
    lineHeight: 23,
    fontWeight: '700',
    color: HN_UI.warning,
  },
  heading: {
    fontSize: 22,
    lineHeight: 30,
    fontWeight: '600',
    color: HN_UI.textPrimary,
    textAlign: 'center',
    marginTop: 8,
  },
  noteText: {
    color: HN_UI.textMuted,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
  },
  summary: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderRadius: 12,
    borderColor: HN_UI.border,
    backgroundColor: HN_UI.surface,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight:54,
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: HN_UI.border,
  },
  lastRow: { borderBottomWidth: 0 },
  label: {
    width: '33%',
    flexShrink: 1,
    fontSize: 14,
    lineHeight: 20,
    color: HN_UI.textMuted,
  },
  valueArea: { flex: 1, minWidth: 0 },
  rowIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: HN_UI.canvas,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusBadge: {
    alignSelf: 'flex-end',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
    backgroundColor: HN_UI.warningSoft,
  },
  value: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
    color: HN_UI.textLink,
    textAlign: 'right',
  },
  measure: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 0,
    overflow: 'hidden',
  },
  read: { minHeight: 44, alignSelf: 'flex-end', justifyContent: 'center' },
  readText: {
    color: HN_UI.textLink,
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '600',
  },
  explanation: {
    marginTop: 0,
    padding: 16,
    borderRadius: 12,
    backgroundColor: HN_UI.warningSoft,
    flexDirection:'row',
    alignItems:'flex-start',
    gap:10,
  },
  explanationText: { color: HN_UI.textSecondary, fontSize: 14, lineHeight: 23 },
  current: {
    marginTop: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: HN_UI.border,
    borderRadius: 10,
    gap: 4,
  },
  currentText: { fontSize: 14, lineHeight: 22, color: HN_UI.textPrimary },
  error: { fontSize: 13, lineHeight: 20, color: HN_UI.danger },
});
function SummaryRow({
  label,
  value,
  last,
  onRead,
}: {
  label: string;
  value: string;
  last?: boolean;
  onRead: (label: string, value: string) => void;
}) {
  const [truncated, setTruncated] = useState(false);
  return (
    <View
      testID={`p05-result-row-${label}`}
      style={[styles.summaryRow, last && styles.lastRow]}
    >
      <View style={styles.rowIcon}>
        <P04Icon
          name={
            {
              'Mã phiếu': 'document',
              'Kho xuất': 'house',
              'Người nhận': 'user',
              'Số lượng đã soạn': 'box',
              'Thời gian gửi': 'clock',
              'Trạng thái': 'clock',
            }[label] || 'document'
          }
          assetPack
          size={20}
          color={label === 'Trạng thái' ? HN_UI.success : SCANNER_COLORS.metadata}
        />
      </View>
      <Text style={styles.label}>{label}</Text>
      <View
        style={styles.valueArea}
      >
        <Text selectable numberOfLines={2} style={[styles.value,label==='Trạng thái'&&styles.statusBadge,label==='Trạng thái'&&value==='Chờ xử lý trên Web'&&{color:HN_UI.warning}]}>
          {value}
        </Text>
        <View
          accessible={false}
          aria-hidden
          importantForAccessibility="no-hide-descendants"
          pointerEvents="none"
          style={styles.measure}
        >
          <Text
            accessible={false}
            aria-hidden
            style={styles.value}
            onTextLayout={event =>
              setTruncated(event.nativeEvent.lines.length > 2)
            }
            // RN Web does not emit onTextLayout. Measure its rendered height
            // at the same width; Android retains the native line-count event.
            onLayout={
              Platform.OS === 'web'
                ? event =>
                    setTruncated(
                      event.nativeEvent.layout.height >
                        styles.value.lineHeight * 2 + 1,
                    )
                : undefined
            }
          >
            {value}
          </Text>
        </View>
        {truncated && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Xem đầy đủ ${label}`}
            onPress={() => onRead(label, value)}
            style={styles.read}
          >
            <Text style={styles.readText}>Xem đầy đủ</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}
export function P05ResultContent(
  props: React.ComponentProps<typeof P05ResultContentBody>,
) {
  return (
    <ThemeProvider
      fontFamily={SCANNER_ARIAL_FAMILY}
    >
      <P05ResultContentBody {...props} />
    </ThemeProvider>
  );
}
function P05ResultContentBody({
  documentNo,
  warehouseName,
  recipient,
  count,
  planned,
  sentAt,
  current,
  currentError,
  onRead,
}: {
  documentNo: string | null | undefined;
  warehouseName: string | null | undefined;
  recipient?: string | null;
  count: number;
  planned?: number;
  sentAt: string | null | undefined;
  current: CurrentDocument | null;
  currentError?: string;
  onRead: (label: string, value: string) => void;
}) {
  const laterStatus =
    current && current.status !== 'SCANNING'
      ? {
          POSTED: 'Đã ghi sổ trên Web',
          CANCELLED: 'Phiếu đã hủy',
          REVERSED: 'Phiếu đã đảo',
          DRAFT: 'Nháp trên Web',
        }[current.status]
      : null;
  const validCount = Number.isSafeInteger(count) && count >= 0;
  const validPlan =
    planned !== undefined && Number.isSafeInteger(planned) && planned > 0;
  const rows: readonly (readonly [string, string])[] = [
    ['Mã phiếu', documentNo || 'Chưa xác minh'],
    ['Kho xuất', warehouseName || 'Chưa xác minh'],
    ['Người nhận', recipient || 'Chưa xác minh'],
    [
      'Số lượng đã soạn',
      validCount
        ? validPlan
          ? `${count} / ${planned}`
          : `${count} mã · Kế hoạch chưa xác minh`
        : 'Chưa xác minh',
    ],
    [
      'Thời gian gửi',
      formatP04DateTime(sentAt ?? undefined) || 'Chưa xác minh thời gian',
    ],
    ['Trạng thái', laterStatus || 'Chờ xử lý trên Web'],
  ];
  return (
    <View testID="p05-result-content" style={styles.body}>
      <View style={styles.hero}>
        <View testID="p05-result-operation-icon" style={styles.operationIcon}>
          <View style={styles.successCenter}>
            <P04Icon name="check" size={36} color={HN_UI.onBrand} />
          </View>
        </View>
        <Text accessibilityRole="header" style={styles.heading}>
          Đã gửi duyệt phiếu xuất
        </Text>
        <Text style={styles.noteText}>
          {laterStatus
            ? 'Phiếu xuất kho đã được tạo và gửi duyệt thành công. Trạng thái hiện tại xem bên dưới.'
            : 'Phiếu xuất kho đã được tạo và gửi duyệt thành công. Phiếu đang chờ xử lý trên Web.'}
        </Text>
      </View>
      <View testID="p05-result-summary" style={styles.summary}>
        {rows.map(([label, value], index) => (
          <SummaryRow
            key={label}
            label={label}
            value={value}
            last={index === rows.length - 1}
            onRead={onRead}
          />
        ))}
      </View>
      <View style={styles.explanation}>
        <P04Icon name="alert-solid" color={HN_UI.warning} size={26}/>
        <View style={{flex:1,minWidth:0}}>
        <Text style={styles.explanationTitle}>
          {laterStatus
            ? 'Tại thời điểm gửi: Chưa ghi sổ xuất kho'
            : 'Chưa ghi sổ xuất kho'}
        </Text>
        <Text style={styles.explanationText}>
          Phiếu chỉ được gửi để xử lý trên Web. Hàng chưa được ghi sổ xuất kho
          tại thời điểm gửi.
        </Text>
        </View>
      </View>
      {laterStatus && (
        <View style={styles.current}>
          <Text style={styles.currentText}>
            Trạng thái hiện tại: {laterStatus}
          </Text>
          <Text style={styles.currentText}>
            Đã đọc trạng thái mới nhất từ Web.
          </Text>
        </View>
      )}
      {currentError ? (
        <View style={styles.current}>
          <Text style={styles.error}>{currentError}</Text>
        </View>
      ) : null}
    </View>
  );
}
