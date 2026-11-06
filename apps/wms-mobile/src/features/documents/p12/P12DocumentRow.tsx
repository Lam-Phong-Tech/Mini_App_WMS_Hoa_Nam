import React from 'react';
import { Pressable, View } from 'react-native';
import { ScannerNativeText as Text } from '../../../ui/ScannerNativeText';
import { HN_OPERATIONS } from '../../../ui/hnHomeTokens';
import { P04Icon } from '../../inbound/P04Icon';
import type { Document } from './contract';
import { documentStatusPresentation,documentPartnerLabel } from './presentation';
import { p12Layout } from './styles';

/** List-only presenter. The owner retains the exact GET, scope and navigation. */
export function P12DocumentRow({
  doc,
  number,
  date,
  scale,
  showPartner,
  onOpen,
  onReadNumber,
  layout,
}: {
  doc: Document;
  number: string;
  date: string;
  scale: number;
  showPartner: boolean;
  onOpen(): void;
  onReadNumber(): void;
  layout?: ReturnType<typeof p12Layout>;
}) {
  const s = React.useMemo(() => layout ?? p12Layout(scale), [layout, scale]),
    tone = HN_OPERATIONS[doc.type],
    status = documentStatusPresentation(doc);
  const partner = doc.source.partner as { display_name?: unknown } | undefined;
  return (
    <Pressable
      testID="P12.document-row"
      accessibilityRole="button"
      accessibilityLabel={'Mở chứng từ ' + number}
      accessibilityHint="Mở chi tiết; nhấn giữ để đọc đầy đủ mã chứng từ"
      style={[s.card, s.record]}
      onPress={onOpen}
      onLongPress={onReadNumber}
    >
      <View
        testID="P12.row.icon"
        style={[s.tile, { backgroundColor: tone.soft, flexShrink: 0 }]}
      >
        <P04Icon
          name={
            doc.type === 'inbound'
              ? 'down'
              : doc.type === 'outbound'
              ? 'up'
              : 'tool'
          }
          color={tone.ink}
          size={28 * scale}
        />
      </View>
      <View style={[s.fill, s.recordCopy]}>
        <Text numberOfLines={1} ellipsizeMode="tail" style={s.recordTitle}>
          {number}
        </Text>
        <Text numberOfLines={1} style={s.recordSubtitle}>
          {
            { inbound: 'Nhập kho', outbound: 'Xuất kho', warranty: 'Bảo hành' }[
              doc.type
            ]
          }
        </Text>
        {showPartner && (
          <Text numberOfLines={1} ellipsizeMode="tail" style={s.recordSubtitle}>
            {documentPartnerLabel(doc)}
          </Text>
        )}
      </View>
      <View style={s.recordMeta}>
        <Text numberOfLines={1} style={s.recordDate}>
          {date}
        </Text>
        <View
          style={[
            s.badge,
            s.recordBadge,
            { backgroundColor: status.background },
          ]}
        >
          <Text
            numberOfLines={2}
            style={[s.badgeText, s.recordBadgeText, { color: status.color }]}
          >
            {status.label}
          </Text>
        </View>
      </View>
      <P04Icon name="chevron" size={16 * scale} />
    </Pressable>
  );
}
