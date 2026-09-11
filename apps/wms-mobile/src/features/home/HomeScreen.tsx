/**
 * Trang chủ Scanner.
 *
 * Bố cục bám board khóa `02_Trang_chu_ORIGINAL.jpg`: hero ảnh kho, ba chỉ số,
 * bốn tác vụ, CTA quét và chứng từ gần đây. Chỉ hình thức được đồng bộ; mọi số
 * liệu vẫn đi từ useHomeSummary và mọi tác vụ vẫn vào luồng WMS thật.
 */

import React, { useCallback } from 'react';
import {
  ImageBackground,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '../../ui/Text';
import { Badge } from '../../ui/Badge';
import { Banner } from '../../ui/Banner';
import { Button } from '../../ui/Button';
import { EmptyState } from '../../ui/EmptyState';
import { AppIcon, type AppIconName } from '../../ui/AppIcon';
import { useTheme } from '../../theme/ThemeProvider';
import { scannerAssets } from '../../theme/scannerAssets';
import { messageForUser } from '../../errors/AppError';
import { useHomeSummary } from './useHomeSummary';

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flex: 1 },
  hero: { minHeight: 232 },
  heroShade: { flex: 1, backgroundColor: 'rgba(5, 49, 70, 0.74)' },
  heroContent: { flex: 1, paddingHorizontal: 20, paddingBottom: 26, gap: 13 },
  brand: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brandStart: { flexDirection: 'row', alignItems: 'center', flex: 1, minWidth: 0 },
  scanMark: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 13,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  brandCopy: { flex: 1, minWidth: 0 },
  avatar: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 21,
    backgroundColor: '#0c81ad',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.36)',
  },
  avatarText: { color: '#fff', fontWeight: '700' },
  welcomeRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  welcomeCopy: { flex: 1, minWidth: 0 },
  online: { flexDirection: 'row', alignItems: 'center', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5 },
  onlineDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#78df9d' },
  content: { paddingHorizontal: 16, paddingBottom: 26, gap: 20 },
  statRail: {
    flexDirection: 'row',
    marginTop: -19,
    borderRadius: 15,
    overflow: 'hidden',
    borderWidth: 1,
  },
  stat: { flex: 1, minWidth: 0, paddingHorizontal: 12, paddingVertical: 14, gap: 4 },
  statDivider: { borderLeftWidth: 1 },
  statTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionAction: { flexDirection: 'row', alignItems: 'center' },
  taskGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  task: { width: '48.3%', minWidth: 0 },
  taskCard: {
    minHeight: 82,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 13,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  taskActive: { borderColor: '#0c6286', backgroundColor: '#0c6286' },
  taskIcon: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  taskCopy: { flex: 1, minWidth: 0 },
  scanCta: { flexDirection: 'row', alignItems: 'center', borderRadius: 13, padding: 15 },
  scanCtaIcon: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  scanCtaCopy: { flex: 1, minWidth: 0 },
  documentList: { borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  document: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 13, paddingVertical: 12 },
  documentCopy: { flex: 1, minWidth: 0 },
  documentIcon: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  line: { height: 1, marginLeft: 61 },
  pressed: { opacity: 0.78 },
  brandMain: { color: '#fff', fontWeight: '700' },
  brandSub: { color: 'rgba(255,255,255,0.78)' },
  heroEyebrow: { color: 'rgba(255,255,255,0.76)', letterSpacing: 0.8 },
  heroTitle: { color: '#fff' },
  heroSubtitle: { color: 'rgba(255,255,255,0.84)' },
  onlineOn: { gap: 5, backgroundColor: 'rgba(22,134,87,0.88)' },
  onlineText: { color: '#fff', fontWeight: '600' },
  gap5: { gap: 5 },
  taskPlain: { backgroundColor: '#fff', borderColor: '#dce9ef' },
  taskActiveIcon: { backgroundColor: 'rgba(255,255,255,0.13)' },
  taskIconPlain: { backgroundColor: '#eaf5fa' },
  taskActiveTitle: { color: '#fff', fontWeight: '700' },
  taskTitle: { color: '#12384e', fontWeight: '700' },
  taskActiveHint: { color: 'rgba(255,255,255,0.8)' },
  taskHint: { color: '#527186' },
  ctaIcon: { backgroundColor: 'rgba(255,255,255,0.12)' },
  ctaTitle: { color: '#fff', fontWeight: '700' },
  ctaHint: { color: 'rgba(255,255,255,0.76)' },
  documentEnd: { alignItems: 'flex-end', gap: 4 },
});

const TASKS: ReadonlyArray<{
  key: 'inbound' | 'outbound' | 'warranty' | 'nfc';
  icon: AppIconName;
  title: string;
  hint: string;
}> = [
  { key: 'inbound', icon: 'package-plus', title: 'Nhập kho', hint: 'Nhận hàng và kiểm đếm' },
  { key: 'outbound', icon: 'package-minus', title: 'Xuất kho', hint: 'Soạn hàng theo phiếu' },
  { key: 'warranty', icon: 'shield-check', title: 'Bảo hành', hint: 'Tiếp nhận và sửa chữa' },
  { key: 'nfc', icon: 'nfc', title: 'Thẻ NFC', hint: 'Liên kết và tra cứu thẻ' },
] as const;

export type HomeTaskKey = 'lookup' | (typeof TASKS)[number]['key'];

export interface HomeScreenProps {
  userName?: string;
  onSelectTask?: (key: HomeTaskKey) => void;
  onSeeAll?: () => void;
  onOpenDocument?: (kind: 'inbound' | 'outbound', documentId: string) => void;
  deps?: Parameters<typeof useHomeSummary>[0];
}

function formatTime(date: Date | undefined): string {
  if (date === undefined) return '—';
  return String(date.getHours()).padStart(2, '0') + ':' + String(date.getMinutes()).padStart(2, '0');
}

function initials(value: string | undefined): string {
  const parts = value?.trim().split(/\s+/).filter(Boolean) ?? [];
  return (parts.length === 0 ? 'HN' : parts.slice(-2).map(part => part[0]).join('')).toUpperCase();
}

function documentLabel(status: string | undefined): { label: string; tone: 'primary' | 'success' | 'warning' } {
  const value = String(status ?? '').toUpperCase();
  if (['POSTED', 'APPROVED', 'COMPLETED'].includes(value)) return { label: 'Đã ghi sổ', tone: 'success' };
  if (['PENDING', 'WAITING_APPROVAL', 'SUBMITTED'].includes(value)) return { label: 'Chờ xử lý', tone: 'warning' };
  return { label: 'Đang xử lý', tone: 'primary' };
}

export function HomeScreen({
  userName,
  onSelectTask,
  onSeeAll,
  onOpenDocument,
  deps,
}: HomeScreenProps): React.ReactElement {
  const theme = useTheme();
  const home = useHomeSummary(deps);
  const user = userName?.trim() || 'bạn';

  const selectTask = useCallback(
    (key: HomeTaskKey) => () => onSelectTask?.(key),
    [onSelectTask],
  );

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.surfaceCanvas }]}>
      <ScrollView style={styles.scroll} contentContainerStyle={{ paddingBottom: theme.spacing.lg }}>
        <ImageBackground source={scannerAssets.warehouseDark} style={styles.hero}>
          <View style={styles.heroShade}>
            <SafeAreaView edges={['top']} style={styles.heroContent}>
              <View style={styles.brand}>
                <View style={[styles.brandStart, { gap: theme.spacing.sm }]}>
                  <View style={styles.scanMark}><AppIcon name="scan" size={22} color="#fff" /></View>
                  <View style={styles.brandCopy}>
                    <Text variant="caption" numberOfLines={1} style={styles.brandMain}>HOA NAM SCANNER</Text>
                    <Text variant="caption" numberOfLines={1} style={styles.brandSub}>WMS · Vận hành chuyên nghiệp</Text>
                  </View>
                </View>
                <View style={styles.avatar}><Text variant="caption" style={styles.avatarText}>{initials(user)}</Text></View>
              </View>
              <View style={styles.welcomeRow}>
                <View style={styles.welcomeCopy}>
                  <Text variant="caption" style={styles.heroEyebrow}>KHO HOA NAM</Text>
                  <Text variant="screenTitle" numberOfLines={1} style={styles.heroTitle}>{'Chào bạn, ' + user}</Text>
                  <Text variant="caption" style={styles.heroSubtitle}>Cùng vận hành kho hiệu quả hôm nay!</Text>
                </View>
                <View style={[styles.online, styles.onlineOn]}>
                  <View style={styles.onlineDot} />
                  <Text variant="caption" style={styles.onlineText}>Đang hoạt động</Text>
                </View>
              </View>
            </SafeAreaView>
          </View>
        </ImageBackground>

        <View style={styles.content}>
          <View style={[styles.statRail, { backgroundColor: theme.colors.surface, borderColor: theme.colors.divider }]}>
            <View style={styles.stat}>
              <View style={styles.statTop}><Text variant="metric" style={{ color: theme.colors.danger }}>{home.phase === 'loading' ? '—' : String(home.summary.pendingApproval ?? 0)}</Text><AppIcon name="approvals" size={18} color={theme.colors.danger} /></View>
              <Text variant="caption" tone="muted">Cần xử lý</Text>
              <Text variant="caption" tone="muted">{home.phase === 'loading' ? 'Đang tải' : String(home.summary.pendingApproval ?? 0) + ' phiếu'}</Text>
            </View>
            <View style={[styles.stat, styles.statDivider, { borderLeftColor: theme.colors.divider }]}>
              <View style={styles.statTop}><Text variant="metric" style={{ color: theme.colors.primary }}>{home.phase === 'loading' ? '—' : String(home.summary.approvedCount ?? 0)}</Text><AppIcon name="check-circle" size={18} color={theme.colors.primary} /></View>
              <Text variant="caption" tone="muted">Web đã xử lý hôm nay</Text>
              <Text variant="caption" tone="muted">Hoàn tất</Text>
            </View>
            <View style={[styles.stat, styles.statDivider, { borderLeftColor: theme.colors.divider }]}>
              <View style={styles.statTop}><Text variant="metric" style={{ color: theme.colors.textStrong }}>{formatTime(home.loadedAt)}</Text><AppIcon name="clock" size={18} color={theme.colors.primary} /></View>
              <Text variant="caption" tone="muted">Cập nhật lúc</Text>
            </View>
          </View>

          {home.phase === 'error' && home.error !== undefined ? <Banner tone="danger" title="Không tải được dữ liệu trang chủ" message={messageForUser(home.error)}><Button label="Thử lại" variant="secondary" onPress={home.reload} /></Banner> : null}

          <View style={styles.sectionHead}>
            <Text variant="cardTitle" tone="strong">Tác vụ kho</Text>
            <View style={[styles.sectionAction, styles.gap5]}><Text variant="caption" tone="primary">Chọn nghiệp vụ để bắt đầu</Text><AppIcon name="chevron-right" size={14} color={theme.colors.primary} /></View>
          </View>

          <View style={[styles.taskGrid, { gap: theme.spacing.md }]}>
            {TASKS.map((task, index) => {
              const active = index === 0;
              return <Pressable key={task.key} accessibilityRole="button" accessibilityLabel={task.title + '. ' + task.hint} onPress={selectTask(task.key)} style={({ pressed }) => [styles.task, pressed ? styles.pressed : undefined]}>
                <View style={[styles.taskCard, active ? styles.taskActive : styles.taskPlain, { gap: theme.spacing.sm }]}>
                  <View style={[styles.taskIcon, active ? styles.taskActiveIcon : styles.taskIconPlain]}><AppIcon name={task.icon} size={20} color={active ? '#fff' : theme.colors.primary} /></View>
                  <View style={styles.taskCopy}>
                    <Text variant="body" numberOfLines={1} style={active ? styles.taskActiveTitle : styles.taskTitle}>{task.title}</Text>
                    <Text variant="caption" numberOfLines={2} style={active ? styles.taskActiveHint : styles.taskHint}>{task.hint}</Text>
                  </View>
                  <AppIcon name="chevron-right" size={14} color={active ? '#fff' : theme.colors.primary} />
                </View>
              </Pressable>;
            })}
          </View>

          <Pressable accessibilityRole="button" accessibilityLabel="Quét hoặc nhập mã sản phẩm" onPress={selectTask('lookup')} style={({ pressed }) => [pressed ? styles.pressed : undefined]}>
            <View style={[styles.scanCta, { gap: theme.spacing.md, backgroundColor: theme.colors.primary }]}>
              <View style={[styles.scanCtaIcon, styles.ctaIcon]}><AppIcon name="scan" size={24} color="#fff" /></View>
              <View style={styles.scanCtaCopy}><Text variant="body" style={styles.ctaTitle}>Quét hoặc nhập mã sản phẩm</Text><Text variant="caption" style={styles.ctaHint}>QR · Serial · SKU</Text></View>
              <AppIcon name="chevron-right" color="#fff" />
            </View>
          </Pressable>

          <View style={styles.sectionHead}>
            <Text variant="cardTitle" tone="strong">Chứng từ gần đây</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Xem tất cả chứng từ" onPress={onSeeAll} style={({ pressed }) => [pressed ? styles.pressed : undefined]}><View style={[styles.sectionAction, styles.gap5]}><Text variant="caption" tone="primary">Xem tất cả</Text><AppIcon name="chevron-right" size={14} color={theme.colors.primary} /></View></Pressable>
          </View>

          {home.phase === 'loading' ? <View style={[styles.documentList, { borderColor: theme.colors.divider, backgroundColor: theme.colors.surface, padding: theme.spacing.lg }]}><Text variant="caption" tone="muted">Đang tải chứng từ…</Text></View> : home.summary.recent.length === 0 ? <View style={[styles.documentList, { borderColor: theme.colors.divider, backgroundColor: theme.colors.surface, padding: theme.spacing.xl }]}><EmptyState icon={<AppIcon name="approvals" color={theme.colors.primary} />} title="Chưa có phiếu nào" hint="Phiếu vừa ghi nhận và gửi lên WMS sẽ hiển thị tại đây." /></View> : <View style={[styles.documentList, { borderColor: theme.colors.divider, backgroundColor: theme.colors.surface }]}>
            {home.summary.recent.map((document, index) => {
              const status = documentLabel(document.mini_app_status ?? document.status);
              return <React.Fragment key={document.id}>
                {index === 0 ? null : <View style={[styles.line, { backgroundColor: theme.colors.divider }]} />}
                <Pressable accessibilityRole="button" accessibilityLabel={'Mở chứng từ ' + (document.doc_no ?? document.id)} onPress={() => onOpenDocument?.('inbound', document.id)} disabled={onOpenDocument === undefined} style={({ pressed }) => [styles.document, { gap: theme.spacing.md, opacity: pressed ? 0.74 : 1 }]}>
                  <View style={[styles.documentIcon, { backgroundColor: theme.colors.primarySoft }]}><AppIcon name="package-plus" size={19} color={theme.colors.primary} /></View>
                  <View style={styles.documentCopy}><Text variant="body" tone="strong" numberOfLines={1}>{document.doc_no ?? document.id}</Text><Text variant="caption" tone="muted" numberOfLines={1}>{(document.source_name ?? 'Phiếu nhập kho') + (document.doc_date === undefined ? '' : ' · ' + document.doc_date)}</Text></View>
                  <View style={styles.documentEnd}><Badge label={status.label} tone={status.tone} /><AppIcon name="chevron-right" size={13} color={theme.colors.textMuted} /></View>
                </Pressable>
              </React.Fragment>;
            })}
          </View>}
        </View>
      </ScrollView>
    </View>
  );
}
