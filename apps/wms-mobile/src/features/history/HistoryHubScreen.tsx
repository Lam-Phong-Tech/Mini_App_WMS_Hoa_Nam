import {HN_UI} from '../../theme/uiKitV3';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../../ui/Text';
import { HnHomeIcon, type HnHomeIconName } from '../../ui/HnHomeIcon';
import type { ReadOwnerRoute } from '../../app/ownerNavigation';
import { P22Frame } from './P22Frame';
import { P22IconTile } from './P22Presentation';

export function HistoryHubScreen({
  onOpen,
  onBack,
  warehouseName,
  footer,
}: {
  onOpen(route: ReadOwnerRoute): void;
  onBack(): void;
  warehouseName?: string;
  /** Parent owns the locked global navigation and may compose it here. */
  footer?: React.ReactNode;
}) {
  const entries: Array<{
    label: string;
    route: ReadOwnerRoute;
    icon: HnHomeIconName;
  }> = [
    {
      label: 'Lịch sử chung',
      route: { owner: 'P08', mode: 'records' },
      icon: 'history',
    },
    {
      label: 'Tổng hợp theo ngày',
      route: { owner: 'P08', mode: 'summary' },
      icon: 'clock',
    },
    {
      label: 'Lịch sử nhập / xuất',
      route: { owner: 'P08', mode: 'records', source: 'DOCUMENT' },
      icon: 'document',
    },
    { label: 'Lịch sử NFC', route: { owner: 'P22' }, icon: 'nfc' },
    {
      label: 'Lịch sử bảo hành',
      route: { owner: 'P23', kind: 'warranty' },
      icon: 'tool',
    },
    {
      label: 'Lịch sử phiên quét',
      route: { owner: 'P23', kind: 'sessions' },
      icon: 'scan',
    },
  ];
  return (
    <P22Frame
      title="Lịch sử thao tác"
      onBack={onBack}
      footerLabel="Về Trang chủ"
      footerOverride={footer}
      hub
    >
      <View testID="P22.S01" style={s.stack}>
        <View style={s.hubIntro}>
          <Text style={s.eyebrow}>
            {warehouseName?.toUpperCase() ?? 'KHO ĐANG LÀM VIỆC'}
          </Text>
          <Text accessibilityRole="header" style={[s.hero, s.hubHero]}>
            Xem lại công việc đã thực hiện
          </Text>
          <Text style={s.muted}>Tra cứu theo nghiệp vụ để mở đúng phiếu.</Text>
        </View>
        <View style={s.hubCards}>
          {entries.map((entry, index) => (
            <Pressable
              key={entry.label}
              style={[s.card, s.row, s.hubCard]}
              accessibilityRole="button"
              accessibilityLabel={entry.label}
              onPress={() => onOpen(entry.route)}
            >
              <P22IconTile name={entry.icon} large />
              <View style={[s.fill, s.compactStack]}>
                <Text style={s.title}>
                  {
                    [
                      'Lịch sử chung',
                      'Hoạt động theo ngày',
                      'Nhập / xuất',
                      'NFC',
                      'Bảo hành',
                      'Phiên quét',
                    ][index]
                  }
                </Text>
                <Text style={s.caption}>
                  {
                    [
                      'Tìm phiếu, serial và người thao tác',
                      'Tổng hợp và tra cứu hoạt động',
                      'Phiếu đã gửi và trạng thái xử lý',
                      'Gán, thay và thu hồi thẻ',
                      'Hồ sơ và quá trình xử lý',
                      'Mã đã quét, thời gian và kết quả',
                    ][index]
                  }
                </Text>
              </View>
              <HnHomeIcon
                name="chevron"
                color={HN_UI.textSecondary}
                size={22}
                strokeWidth={2}
              />
            </Pressable>
          ))}
        </View>
      </View>
    </P22Frame>
  );
}

const s = StyleSheet.create({
  stack: { gap: 20 },
  hubIntro: { gap: 5 },
  eyebrow: {
    color: HN_UI.textLink,
    fontSize: 11,
    lineHeight: 15.4,
    letterSpacing: 2,
    fontWeight: '700',
  },
  hero: { color: HN_UI.textPrimary, fontSize: 24, lineHeight: 31.2, fontWeight: '700' },
  hubHero: { marginVertical: 0 },
  muted: { color: HN_UI.textSecondary, fontSize: 16, lineHeight: 22 },
  hubCards: { gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  card: {
    padding: 14,
    backgroundColor: HN_UI.surface,
    borderWidth: 1,
    borderColor: HN_UI.border,
    borderRadius: 12,
  },
  hubCard: { minHeight: 86 },
  fill: { flex: 1, minWidth: 0 },
  compactStack: { gap: 3 },
  title: { color: HN_UI.textPrimary, fontSize: 20, lineHeight: 27, fontWeight: '700' },
  caption: { color: HN_UI.textSecondary, fontSize: 16, lineHeight: 21.6 },
});
