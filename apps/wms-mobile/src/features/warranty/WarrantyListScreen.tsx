/**
 * Bảo hành — danh sách tiếp nhận.
 *
 * 🎨 Nguồn: ảnh **39, 40**.
 *
 * Bố cục: hai `StatCard` → ba nút nhận hàng → 5 tab trạng thái cuộn ngang →
 * danh sách hồ sơ.
 *
 * ✅ **Đọc thật** qua `GET /api/v1/mini-app/warranty-cases` — một trong 11
 * endpoint đã kiểm chứng trả 200.
 *
 * ## 🔴 PII: hiện đúng thứ máy chủ trả, không tự che
 *
 * Ảnh 40 chụp bằng tài khoản **có** quyền PII nên hiện `Hoàng Văn Nam ·
 * 0912021098`. Cùng màn đó, tài khoản **thủ kho** nhận `H*** V*** N*** ·
 * ******372`. Màn này không biết vai của người đang dùng và **không cần biết** —
 * nó hiển thị nguyên thứ máy chủ trả về.
 *
 * Hồ sơ đã **ẩn danh** (hết hạn lưu trữ) hiện câu riêng do BA chốt, và các thao
 * tác liên hệ / tải tệp bị ẩn.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Page } from '../../ui/Page';
import { Box } from '../../ui/Box';
import { Text } from '../../ui/Text';
import { Button } from '../../ui/Button';
import { Badge } from '../../ui/Badge';
import { Banner } from '../../ui/Banner';
import { StatCard } from '../../ui/StatCard';
import { EmptyState } from '../../ui/EmptyState';
import { FilterChipRow } from '../../ui/FilterChipRow';
import { AppIcon } from '../../ui/AppIcon';
import { useTheme } from '../../theme/ThemeProvider';
import { messageForUser, toAppError, type AppError } from '../../errors/AppError';
import { fetchWarrantyCases } from '../../services/wms/queries';
import type { WarrantyCase } from '../../services/wms/types';
import {
  MESSAGE_ANONYMIZED,
  WARRANTY_TABS,
  displayPii,
  isCaseAnonymized,
  isPiiMasked,
} from './warrantyPolicy';

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
  },
  actions: {
    flexDirection: 'row',
  },
  half: {
    flex: 1,
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  cardHeadBody: {
    flex: 1,
  },
});

export interface WarrantyListScreenProps {
  onBack?: () => void;
  onScan?: () => void;
  onManualEntry?: () => void;
  onCreateWithoutCode?: () => void;
  onOpenCase?: (warrantyCase: WarrantyCase) => void;
  /** Tiêm để test không cần mạng. */
  fetchCases?: typeof fetchWarrantyCases;
}

export function WarrantyListScreen({
  onBack,
  onScan,
  onManualEntry,
  onCreateWithoutCode,
  onOpenCase,
  fetchCases = fetchWarrantyCases,
}: WarrantyListScreenProps): React.ReactElement {
  const theme = useTheme();
  const [tab, setTab] = useState<string>(WARRANTY_TABS[0].key);
  const [cases, setCases] = useState<readonly WarrantyCase[]>([]);
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<AppError | undefined>();

  const load = useCallback(
    async (status: string) => {
      setPhase('loading');
      setError(undefined);
      try {
        const page = await fetchCases({ query: { status } });
        setCases(page.items);
        setPhase('ready');
      } catch (cause) {
        setError(toAppError(cause));
        setPhase('error');
      }
    },
    [fetchCases],
  );

  useEffect(() => {
    load(tab).catch(() => undefined);
  }, [load, tab]);

  return (
    <Page
      title="Tiếp nhận bảo hành"
      subtitle="Mini App · Bảo hành"
      onBack={onBack}
      scroll
    >
      <View style={[styles.row, { gap: theme.spacing.md }]}>
        <StatCard
          label={warrantyStatusLabel(tab)}
          value={phase === 'loading' && cases.length === 0 ? '…' : String(cases.length)}
          icon={<AppIcon name="shield-check" color={theme.colors.primaryStrong} />}
        />
        <StatCard
          label="Luồng tiếp nhận"
          value="2"
          footnote="Có mã · mất mã"
          icon={<AppIcon name="scan" color={theme.colors.primaryStrong} />}
        />
      </View>

      <Box card padding="lg" gap="md">
        <Text variant="cardTitle" tone="strong">
          Nhận sản phẩm bảo hành
        </Text>
        <Text variant="caption" tone="muted">
          Quét/nhập mã để kiểm tra trước. Nếu mất tem/mã, tạo hồ sơ tạm.
        </Text>
        <View style={[styles.actions, { gap: theme.spacing.md }]}>
          <Button
            label="Quét mã"
            onPress={onScan ?? (() => undefined)}
            style={styles.half}
          />
          <Button
            label="Nhập tay"
            variant="secondary"
            onPress={onManualEntry ?? (() => undefined)}
            style={styles.half}
          />
        </View>
        <Button
          label="Mất tem/mã · Tạo hồ sơ tạm"
          variant="secondary"
          onPress={onCreateWithoutCode ?? (() => undefined)}
        />
      </Box>

      <FilterChipRow
        chips={WARRANTY_TABS.map(item => ({
          key: item.key,
          label: item.label,
        }))}
        activeKey={tab}
        onSelect={setTab}
      />

      <View style={[styles.cardHead, { gap: theme.spacing.sm }]}>
        <Text variant="cardTitle" tone="strong" style={styles.cardHeadBody}>
          {'Hồ sơ ' + warrantyStatusLabel(tab)}
        </Text>
        <Button
          label="Đồng bộ"
          variant="secondary"
          onPress={() => {
            load(tab).catch(() => undefined);
          }}
        />
      </View>

      {phase === 'error' && error !== undefined ? (
        <Banner
          tone="danger"
          title="Không tải được danh sách bảo hành"
          message={messageForUser(error)}
        >
          <Button
            label="Thử lại"
            variant="secondary"
            onPress={() => {
              load(tab).catch(() => undefined);
            }}
          />
        </Banner>
      ) : phase === 'loading' ? (
        <Box card padding="lg">
          <Text variant="caption" tone="muted">
            Đang tải hồ sơ…
          </Text>
        </Box>
      ) : cases.length === 0 ? (
        <Box card padding="lg">
          <EmptyState
            title="Chưa có hồ sơ ở trạng thái này"
            hint="Chọn tab khác hoặc tiếp nhận sản phẩm mới."
          />
        </Box>
      ) : (
        cases.map(item => {
          const anonymized = isCaseAnonymized(item);
          const masked = isPiiMasked(item);
          return (
            <Box key={item.warranty_case_id} card padding="lg" gap="sm">
              {/* 🔴 Sửa 2026-09-06: trước đây CHỈ dòng tên sản phẩm bấm được.
                  Bấm vào mã hồ sơ hay nhãn trạng thái thì **không có gì xảy
                  ra** — đo trên máy thật: chạm (559, 2045) trên mã
                  `WC-RPTW-0157` im lặng, chạm dòng tên sản phẩm mới mở.
                  Thủ kho đeo găng nhắm vào mã là chuyện đương nhiên. Bọc cả
                  thẻ như `ApprovalsScreen` vẫn làm. */}
              <Pressable
                accessibilityRole={
                  onOpenCase === undefined ? undefined : 'button'
                }
                accessibilityLabel={
                  onOpenCase === undefined
                    ? undefined
                    : 'Xem chi tiết hồ sơ ' +
                      String(item.warranty_case_code ?? item.warranty_case_id)
                }
                disabled={onOpenCase === undefined}
                onPress={() => onOpenCase?.(item)}
                style={{ gap: theme.spacing.sm }}
              >
                <View style={[styles.cardHead, { gap: theme.spacing.sm }]}>
                  <Text
                    variant="caption"
                    tone="muted"
                    style={styles.cardHeadBody}
                  >
                    {item.warranty_case_code ?? item.warranty_case_id}
                  </Text>
                  <Badge
                    label={warrantyStatusLabel(item.status)}
                    tone={anonymized ? 'neutral' : 'success'}
                    uppercase
                  />
                </View>

                <Text variant="cardTitle" tone="strong">
                  {item.sku_name ??
                    displayPii(item.manual_product_description) ??
                    'Sản phẩm chưa xác định'}
                </Text>
              </Pressable>

              {anonymized ? (
                // Câu nguyên văn BA chốt — không diễn đạt lại.
                <Text variant="caption" tone="muted">
                  {MESSAGE_ANONYMIZED}
                </Text>
              ) : (
                <Text variant="caption" tone="muted">
                  {[displayPii(item.customer_name), displayPii(item.customer_phone)]
                    .filter(value => value !== undefined)
                    .join(' · ') || '—'}
                  {masked ? ' (đã che theo quyền)' : ''}
                </Text>
              )}
            </Box>
          );
        })
      )}
    </Page>
  );
}

function warrantyStatusLabel(status?: string): string {
  const labels: Readonly<Record<string, string>> = {
    RECEIVED: 'Đã tiếp nhận',
    CHECKING: 'Đang kiểm tra',
    REPAIRING: 'Đang sửa',
    COMPLETED: 'Hoàn tất',
    RETURNED: 'Đã trả khách',
    CANCELLED: 'Đã hủy',
  };
  const normalized = (status ?? 'RECEIVED').toUpperCase();
  return labels[normalized] ?? status ?? 'Đã tiếp nhận';
}
