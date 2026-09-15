/**
 * Tra cứu sản phẩm/tồn kho — chỉ đọc WMS.
 *
 * Board 04 có bốn panel: ô tra cứu, thông tin sản phẩm, tồn, lịch sử. API
 * hiện xác nhận được tra cứu trace + catalogue; nó chưa trả contract an toàn
 * cho tổng tồn theo vị trí hoặc lịch sử giao dịch của một item. Màn này chỉ
 * hiển thị đúng dữ liệu trace thực có, không cộng/suy diễn số tồn còn lại.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Page } from '../../ui/Page';
import { Box } from '../../ui/Box';
import { Text } from '../../ui/Text';
import { CodeInput } from '../../ui/CodeInput';
import { Button } from '../../ui/Button';
import { Badge } from '../../ui/Badge';
import { Banner } from '../../ui/Banner';
import { FilterChipRow } from '../../ui/FilterChipRow';
import { DefinitionRow } from '../../ui/DefinitionRow';
import { AppIcon } from '../../ui/AppIcon';
import { useTheme } from '../../theme/ThemeProvider';
import { messageForUser, serverAnswered, toAppError, type AppError } from '../../errors/AppError';
import {
  lookupInventoryByCode,
  searchLookupCatalog,
  type LookupCatalogItem,
} from './inventoryLookup';

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  headBody: { flex: 1 },
  actions: { flexDirection: 'row' },
  half: { flex: 1 },
  resultTitle: { flex: 1 },
  itemHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  itemCopy: { flex: 1 },
  movementRow: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#dce8ee' },
  movementRowLast: { borderBottomWidth: 0 },
});

/** API Clipboard chỉ có ở web bảo mật; native không báo thành công giả. */
interface ClipboardNavigator {
  readonly navigator?: { readonly clipboard?: { writeText(text: string): Promise<void> } };
}

export const MESSAGE_NO_USAGE = 'Backend chưa khai báo công dụng cho sản phẩm này.';
export const MESSAGE_NO_DESCRIPTION = 'Backend chưa khai báo mô tả cho sản phẩm này.';
export const MESSAGE_LOOKUP_CODE_REQUIRED = 'Vui lòng nhập mã QR/Barcode, serial hoặc SKU.';

/** Hình dạng thực sự được trace/catalogue hiện có trả về cho màn tra cứu. */
export interface LookupResult {
  readonly id?: string;
  /** SKU ID chuẩn — dùng cho GET /inventory, không lấy item ID thay thế. */
  readonly sku_id?: string;
  readonly qr_code?: string | null;
  readonly sku_code?: string | null;
  readonly item_code?: string | null;
  readonly serial?: string | null;
  readonly product_name?: string | null;
  readonly group_name?: string | null;
  readonly unit?: string | null;
  readonly warehouse_name?: string | null;
  readonly status?: string | null;
  readonly usage?: string | null;
  readonly description?: string | null;
  /** Chỉ các số BE trả từ GET /inventory; không có phép tính suy diễn. */
  readonly inventory_by_warehouse?: readonly LookupWarehouseBalance[];
  /** Biến động WMS từ trace/ledger, mới nhất trước. */
  readonly movements?: readonly LookupMovement[];
}

export interface LookupWarehouseBalance {
  readonly warehouseName?: string;
  readonly warehouseCode?: string;
  readonly locationName?: string;
  readonly locationCode?: string;
  readonly stockStatus?: string;
  readonly totalQty?: number;
  readonly availableQty?: number;
  readonly reservedQty?: number;
  readonly unavailableQty?: number;
}

export interface LookupMovement {
  readonly id?: string;
  readonly type?: string;
  readonly quantityDelta?: number;
  readonly occurredAt?: string;
  readonly warehouseName?: string;
  readonly documentNo?: string;
  readonly status?: string;
}

export interface LookupScreenProps {
  onHome?: () => void;
  /** Mở camera quét QR/Barcode. Camera chỉ chuyển mã, không ghi WMS. */
  onScan?: () => void;
  onScanAgain?: () => void;
  /** NFC là luồng độc lập theo UID; chỉ hiện khi AppShell có route thật. */
  onLookupNfc?: () => void;
  /** Mã vừa nhận từ camera. */
  initialCode?: string;
  /** Tiêm để test không cần mạng; signal cho phép hủy lookup cũ. */
  lookup?: (code: string, signal?: AbortSignal) => Promise<LookupResult | undefined>;
  /** GET catalogue theo keyword; chỉ phục vụ tìm tên / chọn SKU thật. */
  searchCatalog?: (
    keyword: string,
    options?: { skuType?: 'PRODUCT' | 'COMPONENT'; signal?: AbortSignal },
  ) => Promise<readonly LookupCatalogItem[]>;
}

const defaultLookup = lookupInventoryByCode;
const defaultSearchCatalog = searchLookupCatalog;
type LookupRequest = { id: number; controller?: AbortController };
type CatalogFilter = 'ALL' | 'PRODUCT' | 'COMPONENT';

function quantityLabel(value: number | undefined): string {
  return value === undefined ? '—' : String(value);
}

function movementLabel(value: string | undefined): string {
  const labels: Record<string, string> = {
    OPENING: 'Tồn đầu kỳ',
    RECEIPT: 'Nhập kho',
    ISSUE: 'Xuất kho',
    COMPONENT_ISSUE: 'Xuất linh kiện',
    REVERSAL: 'Điều chỉnh / hoàn tác',
  };
  return labels[value ?? ''] ?? value ?? 'Biến động kho';
}

export function LookupScreen({
  onHome,
  onScan,
  onScanAgain,
  onLookupNfc,
  initialCode,
  lookup = defaultLookup,
  searchCatalog = defaultSearchCatalog,
}: LookupScreenProps): React.ReactElement {
  const theme = useTheme();
  const [code, setCode] = useState('');
  const [inputError, setInputError] = useState<string | undefined>();
  const [result, setResult] = useState<LookupResult | undefined>();
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<AppError | undefined>();
  const [notFound, setNotFound] = useState(false);
  const [copiedLabel, setCopiedLabel] = useState<string | undefined>();
  const [catalogItems, setCatalogItems] = useState<readonly LookupCatalogItem[]>([]);
  const [catalogFilter, setCatalogFilter] = useState<CatalogFilter>('ALL');
  const initialCodeHandled = useRef<string | undefined>(undefined);
  const requestRef = useRef<LookupRequest>({ id: 0 });

  const cancelLookup = useCallback(() => {
    requestRef.current.controller?.abort();
    requestRef.current = { id: requestRef.current.id + 1 };
    setSearching(false);
  }, []);

  useEffect(() => () => requestRef.current.controller?.abort(), []);

  const lookupCode = useCallback(async (input: string) => {
    const trimmed = input.trim();
    if (trimmed === '') {
      setInputError(MESSAGE_LOOKUP_CODE_REQUIRED);
      return;
    }

    requestRef.current.controller?.abort();
    const controller = new AbortController();
    const requestId = requestRef.current.id + 1;
    requestRef.current = { id: requestId, controller };

    setCode(trimmed);
    setInputError(undefined);
    setSearching(true);
    // Không giữ card của mã cũ lúc đang hỏi mã mới — đó là cách thủ kho soạn
    // nhầm hàng dù API trả đúng.
    setResult(undefined);
    setCatalogItems([]);
    setError(undefined);
    setNotFound(false);

    try {
      const found = await lookup(trimmed, controller.signal);
      if (requestRef.current.id !== requestId) return;
      setResult(found);
      setNotFound(found === undefined);
    } catch (cause) {
      if (requestRef.current.id !== requestId) return;
      const appError = toAppError(cause);
      // Bấm hủy hoặc quét mã mới không phải là lỗi cần báo đỏ.
      if (appError.kind === 'cancelled') return;
      if (serverAnswered(appError)) {
        try {
          const items = await searchCatalog(trimmed, {
            ...(catalogFilter === 'ALL' ? {} : { skuType: catalogFilter }),
            signal: controller.signal,
          });
          if (requestRef.current.id !== requestId) return;
          setCatalogItems(items);
          setNotFound(items.length === 0);
        } catch (catalogCause) {
          if (requestRef.current.id !== requestId) return;
          const catalogError = toAppError(catalogCause);
          // Trace đã trả 4xx xác nhận mã vật lý không tồn tại. Catalogue chỉ
          // là trợ giúp tìm theo tên; nó lỗi không được biến kết luận thật đó
          // thành "lỗi mạng" hay giấu nhánh không tìm thấy.
          if (catalogError.kind !== 'cancelled') setNotFound(true);
        }
      } else {
        setError(appError);
      }
    } finally {
      if (requestRef.current.id === requestId) {
        requestRef.current = { id: requestId };
        setSearching(false);
      }
    }
  }, [catalogFilter, lookup, searchCatalog]);

  const submit = useCallback(() => {
    if (!searching) lookupCode(code).catch(() => undefined);
  }, [code, lookupCode, searching]);

  const copyValue = useCallback(async (label: string, value?: string | null) => {
    if (value === undefined || value === null || value.trim() === '') return;
    const clipboard = (globalThis as unknown as ClipboardNavigator).navigator?.clipboard;
    if (clipboard === undefined) return;
    try {
      await clipboard.writeText(value);
      setCopiedLabel(label);
      setTimeout(() => setCopiedLabel(undefined), 1200);
    } catch {
      // Không báo sao chép thành công nếu OS/browser không cấp clipboard.
    }
  }, []);

  useEffect(() => {
    const normalized = initialCode?.trim();
    if (normalized === undefined || normalized === '' || initialCodeHandled.current === normalized) return;
    initialCodeHandled.current = normalized;
    setCode(normalized);
    lookupCode(normalized).catch(() => undefined);
  }, [initialCode, lookupCode]);

  const startScanAgain = () => {
    cancelLookup();
    setCode('');
    setInputError(undefined);
    setResult(undefined);
    setCatalogItems([]);
    setNotFound(false);
    setError(undefined);
    (onScanAgain ?? onScan ?? (() => undefined))();
  };

  return (
    <Page
      title={result === undefined ? 'Tra cứu sản phẩm' : 'Thông tin sản phẩm'}
      subtitle={result === undefined ? 'Tìm mã, tên sản phẩm, SKU, serial' : 'Dữ liệu chỉ đọc từ WMS'}
      onBack={onHome}
      scroll
      headerVariant="brand"
    >
      <Box card padding="lg" gap="md">
        <View style={[styles.head, { gap: theme.spacing.md }]}>
          <View style={styles.headBody}>
            <Text variant="cardTitle" tone="strong">Tra cứu bằng mã</Text>
            <Text variant="caption" tone="muted">
              QR, barcode, serial hoặc SKU; tra cứu không tạo chứng từ và không đổi tồn kho.
            </Text>
          </View>
          <AppIcon name="search" color={theme.colors.primary} size={24} />
        </View>
        <CodeInput
          label="Mã sản phẩm / mã tem"
          placeholder="Nhập QR, barcode hoặc serial"
          value={code}
          errorText={inputError}
          onChangeText={value => { setCode(value); setInputError(undefined); }}
          returnKeyType="search"
          onSubmitEditing={submit}
          leftAdornment={<AppIcon name="search" color={theme.colors.primary} size={18} />}
        />
        <View style={[styles.actions, { gap: theme.spacing.md }]}>
          {onScan === undefined ? null : (
            <Button label="Quét mã" variant="secondary" onPress={onScan} style={styles.half} />
          )}
          <Button label="Tra cứu" onPress={submit} loading={searching} disabled={searching} style={styles.half} />
        </View>
        {onLookupNfc === undefined ? null : (
          <Button label="Tra cứu bằng thẻ NFC" variant="secondary" onPress={onLookupNfc} />
        )}
      </Box>

      {catalogItems.length === 0 ? null : (
        <>
          <View style={styles.itemHead}>
            <Text variant="cardTitle" tone="strong">Kết quả sản phẩm</Text>
            <Text variant="caption" tone="muted">{String(catalogItems.length)} SKU</Text>
          </View>
          <FilterChipRow
            chips={[
              { key: 'ALL', label: 'Tất cả' },
              { key: 'PRODUCT', label: 'Sản phẩm' },
              { key: 'COMPONENT', label: 'Linh kiện' },
            ]}
            activeKey={catalogFilter}
            onSelect={selected => {
              const next = selected as CatalogFilter;
              setCatalogFilter(next);
              searchCatalog(code, {
                ...(next === 'ALL' ? {} : { skuType: next }),
              }).then(items => setCatalogItems(items)).catch(() => undefined);
            }}
          />
          {catalogItems.map(item => (
            <Button
              key={item.skuId ?? item.skuCode}
              label={item.skuCode + (item.skuName === undefined ? '' : ' · ' + item.skuName)}
              variant="secondary"
              onPress={() => { lookupCode(item.skuCode).catch(() => undefined); }}
              accessibilityLabel={'Tra cứu SKU ' + item.skuCode}
            />
          ))}
        </>
      )}

      {searching ? (
        <Banner
          tone="info"
          icon={<AppIcon name="search" color={theme.colors.infoText} />}
          title="Đang tra cứu mã trên WMS"
          message="Đang chờ kết quả của đúng mã mới nhất; bạn có thể hủy để quét mã khác."
        >
          <Button label="Hủy tra cứu" variant="secondary" onPress={cancelLookup} />
        </Banner>
      ) : null}

      {error === undefined ? null : (
        <Banner tone="danger" title="Không tra cứu được" message={messageForUser(error)}>
          <Button label="Thử lại" variant="secondary" onPress={submit} />
        </Banner>
      )}

      {notFound ? (
        <Banner
          tone="warning"
          icon={<AppIcon name="search" color={theme.colors.warningText} />}
          title="Không tìm thấy sản phẩm"
          message={'WMS không có hiện vật hoặc SKU khớp mã "' + code.trim() + '".'}
        />
      ) : null}

      {copiedLabel === undefined ? null : <Banner tone="success" title={'Đã sao chép ' + copiedLabel} />}

      {result === undefined ? null : (
        <>
          {(() => {
            const inventory = result.inventory_by_warehouse ?? [];
            const movements = result.movements ?? [];
            return <>
          <Banner
            tone="success"
            icon={<AppIcon name="check-circle" color={theme.colors.success} />}
            title="Đã nhận diện sản phẩm"
            message="Thông tin dưới đây được lấy trực tiếp từ backend WMS và không làm thay đổi tồn kho."
          />

          <Box card padding="lg" gap="md">
            <View style={[styles.head, { gap: theme.spacing.md }]}>
              <View style={styles.resultTitle}>
                <Text variant="caption" tone="muted">Sản phẩm</Text>
                <Text variant="cardTitle" tone="strong">
                  {result.product_name ?? result.item_code ?? result.qr_code ?? result.id ?? '—'}
                </Text>
              </View>
              <Badge label={result.status ?? 'Tra cứu'} uppercase tone="success" />
            </View>
            <DefinitionRow label="Mã QR/Barcode" value={result.qr_code} onCopy={() => { copyValue('mã QR/Barcode', result.qr_code).catch(() => undefined); }} />
            <DefinitionRow label="SKU" value={result.sku_code} onCopy={() => { copyValue('SKU', result.sku_code).catch(() => undefined); }} />
            <DefinitionRow label="Mã item" value={result.item_code} onCopy={() => { copyValue('mã item', result.item_code).catch(() => undefined); }} />
            <DefinitionRow label="Serial" value={result.serial} onCopy={() => { copyValue('serial', result.serial).catch(() => undefined); }} />
            <DefinitionRow label="Nhóm" value={result.group_name} />
            <DefinitionRow label="Đơn vị" value={result.unit} last />
          </Box>

          <Box card padding="lg" gap="sm">
            <Text variant="cardTitle" tone="strong">Tồn kho theo kho</Text>
            {inventory.length === 0 ? (
              <Text variant="caption" tone="muted">
                WMS chưa trả số dư theo kho cho SKU này hoặc tài khoản hiện tại không có quyền xem.
              </Text>
            ) : inventory.map((balance, index) => {
              const location = [balance.locationCode, balance.locationName]
                .filter((value): value is string => value !== undefined && value !== '')
                .join(' · ');
              return (
                <Box key={(balance.warehouseCode ?? balance.warehouseName ?? 'kho') + String(index)} card padding="md" gap="xs">
                  <View style={styles.itemHead}>
                    <View style={styles.itemCopy}>
                      <Text variant="body" tone="strong">
                        {location === '' ? (balance.warehouseName ?? balance.warehouseCode ?? 'Kho WMS') : location}
                      </Text>
                      <Text variant="caption" tone="muted">
                        {location === '' ? (balance.stockStatus ?? 'Trạng thái WMS chưa khai báo') : (balance.warehouseName ?? balance.warehouseCode ?? 'Kho WMS')}
                      </Text>
                    </View>
                    <Badge label={'Khả dụng ' + quantityLabel(balance.availableQty)} tone="success" />
                  </View>
                  <Text variant="caption" tone="muted">
                    {'Tổng: ' + quantityLabel(balance.totalQty) + ' · Đang giữ: ' + quantityLabel(balance.reservedQty) + ' · Không khả dụng: ' + quantityLabel(balance.unavailableQty)}
                  </Text>
                </Box>
              );
            })}
          </Box>

          <Box card padding="lg" gap="sm">
            <Text variant="cardTitle" tone="strong">Lịch sử giao dịch</Text>
            {movements.length === 0 ? (
              <Text variant="caption" tone="muted">
                WMS chưa trả biến động nào cho mã này.
              </Text>
            ) : movements.map((movement, index) => (
              <View
                key={movement.id ?? String(index)}
                style={[styles.itemHead, styles.movementRow, index === movements.length - 1 ? styles.movementRowLast : undefined]}
              >
                <View style={styles.itemCopy}>
                  <Text variant="body" tone="strong">{movementLabel(movement.type)}</Text>
                  <Text variant="caption" tone="muted">
                    {[movement.documentNo, movement.warehouseName, movement.occurredAt].filter(Boolean).join(' · ') || 'WMS chưa trả chứng từ/thời điểm'}
                  </Text>
                </View>
                <Text variant="body" tone="strong">
                  {movement.quantityDelta === undefined ? '—' : (movement.quantityDelta > 0 ? '+' : '') + String(movement.quantityDelta)}
                </Text>
              </View>
            ))}
          </Box>

          <Box card padding="lg" gap="sm">
            <Text variant="cardTitle" tone="strong">Công dụng</Text>
            <Text variant="caption" tone="muted">{result.usage ?? MESSAGE_NO_USAGE}</Text>
          </Box>

          <Box card padding="lg" gap="sm">
            <Text variant="cardTitle" tone="strong">Mô tả sản phẩm</Text>
            <Text variant="caption" tone="muted">{result.description ?? MESSAGE_NO_DESCRIPTION}</Text>
          </Box>

          <View style={[styles.actions, { gap: theme.spacing.md }]}>
            <Button label="Trang chủ" variant="secondary" onPress={onHome ?? (() => undefined)} style={styles.half} />
            <Button label="Quét mã khác" onPress={startScanAgain} style={styles.half} />
          </View>
            </>;
          })()}
        </>
      )}

    </Page>
  );
}
