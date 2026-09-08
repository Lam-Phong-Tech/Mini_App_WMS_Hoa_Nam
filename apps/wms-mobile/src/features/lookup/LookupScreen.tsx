/**
 * Tra cứu sản phẩm.
 *
 * 🎨 Nguồn: ảnh **14–17**.
 *
 * | Ảnh | Phần |
 * |:--:|---|
 * | 14 | Hộp nhập mã thủ công **dạng modal**, mở đè lên màn quét |
 * | 15 | Nhập mã thủ công dạng **màn riêng** — cùng chức năng, khác lối vào |
 * | 16 | Chi tiết sản phẩm: banner xanh + các hàng, ô trống hiện `—`, có nút sao chép |
 * | 17 | Công dụng và mô tả: *"Backend chưa khai báo…"* + hai nút cuối màn |
 *
 * ## Hai quy tắc hiển thị đáng giữ
 *
 * 1. **Ô trống hiện `—`, không ẩn hàng** (ảnh 16 có SKU, Nhóm, Đơn vị, Kho,
 *    Trạng thái đều trống). Ẩn hàng đi thì thủ kho tưởng trường không tồn tại,
 *    thay vì biết là backend chưa khai báo dữ liệu cho sản phẩm này.
 * 2. **Câu "Backend chưa khai báo…"** (ảnh 17) nói rõ **ai** còn thiếu dữ liệu.
 *    Viết thành *"Không có thông tin"* thì thủ kho tưởng app hỏng và đi báo lỗi.
 *
 * ## Banner xanh — một cam kết nghiệp vụ
 *
 * Ảnh 16: *"Thông tin dưới đây được lấy trực tiếp từ backend WMS và không làm
 * thay đổi tồn kho."* Đây là lý do tra cứu **an toàn** để quét bao nhiêu lần
 * cũng được, và cần nói ra — thủ kho vốn quen rằng mọi lần quét đều ghi gì đó.
 *
 * ✅ Đọc thật qua `GET /api/v1/mini-app/products`.
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
import { Sheet } from '../../ui/Sheet';
import { DefinitionRow } from '../../ui/DefinitionRow';
import { AppIcon } from '../../ui/AppIcon';
import { useTheme } from '../../theme/ThemeProvider';
import { messageForUser, toAppError, type AppError } from '../../errors/AppError';
import { serverAnswered } from '../../errors/AppError';
import { lookupInventoryByCode } from './inventoryLookup';

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  headBody: {
    flex: 1,
  },
  actions: {
    flexDirection: 'row',
  },
  half: {
    flex: 1,
  },
});

/** API Clipboard chỉ có ở web bảo mật (HTTPS); native không hiện báo thành công giả. */
interface ClipboardNavigator {
  readonly navigator?: {
    readonly clipboard?: {
      writeText(text: string): Promise<void>;
    };
  };
}

/** Câu nguyên văn ảnh 17 — nói rõ AI còn thiếu dữ liệu. */
export const MESSAGE_NO_USAGE =
  'Backend chưa khai báo công dụng cho sản phẩm này.';
export const MESSAGE_NO_DESCRIPTION =
  'Backend chưa khai báo mô tả cho sản phẩm này.';

/** Hình dạng đủ dùng cho màn này. Không khai thừa trường chưa từng thấy thật. */
export interface LookupResult {
  readonly id?: string;
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
}

export interface LookupScreenProps {
  onHome?: () => void;
  /** Mở camera quét QR/Barcode như ScannerPage của Mini App. */
  onScan?: () => void;
  onScanAgain?: () => void;
  /** Luồng độc lập: chạm NFC để tra cứu hậu xuất/bảo hành. */
  onLookupNfc?: () => void;
  /** Mã nhận từ camera. Màn tự tra cứu khi được truyền vào. */
  initialCode?: string;
  /** Tiêm để test không cần mạng. */
  lookup?: (code: string) => Promise<LookupResult | undefined>;
}

const defaultLookup = lookupInventoryByCode;

export function LookupScreen({
  onHome,
  onScan,
  onScanAgain,
  onLookupNfc,
  initialCode,
  lookup = defaultLookup,
}: LookupScreenProps): React.ReactElement {
  const theme = useTheme();
  const [manualOpen, setManualOpen] = useState(false);
  const [code, setCode] = useState('');
  const [result, setResult] = useState<LookupResult | undefined>();
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<AppError | undefined>();
  const [notFound, setNotFound] = useState(false);
  const [copiedLabel, setCopiedLabel] = useState<string | undefined>();
  const initialCodeHandled = useRef<string | undefined>(undefined);

  const lookupCode = useCallback(async (input: string) => {
    const trimmed = input.trim();
    if (trimmed === '') {
      return;
    }
    setSearching(true);
    setError(undefined);
    setNotFound(false);
    try {
      const found = await lookup(trimmed);
      setResult(found);
      setNotFound(found === undefined);
      setManualOpen(false);
    } catch (cause) {
      const appError = toAppError(cause);
      // 4xx nghĩa là WMS đã kết luận mã không hợp lệ/chưa có trong kho. Hiện
      // đúng trạng thái "không tìm thấy" thay vì nói app gặp lỗi mạng.
      if (serverAnswered(appError)) {
        setResult(undefined);
        setNotFound(true);
      } else {
        setError(appError);
      }
    } finally {
      setSearching(false);
    }
  }, [lookup]);

  const submit = useCallback(() => {
    if (searching) return;
    lookupCode(code).catch(() => undefined);
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
      // Quyền clipboard do trình duyệt quyết định. Không báo "đã sao chép" khi
      // hệ điều hành chặn; giá trị vẫn hiển thị đầy đủ để thủ kho sao chép tay.
    }
  }, []);

  // Camera chỉ nhận mã rồi chuyển qua màn chi tiết. Call API ở đây đảm bảo cả
  // quét camera và nhập tay dùng chính xác cùng một luồng truy vết.
  useEffect(() => {
    const normalized = initialCode?.trim();
    if (normalized === undefined || normalized === '' || initialCodeHandled.current === normalized) {
      return;
    }
    initialCodeHandled.current = normalized;
    setCode(normalized);
    lookupCode(normalized).catch(() => undefined);
  }, [initialCode, lookupCode]);

  return (
    <Page title="Chi tiết sản phẩm" subtitle="Tra cứu từ QR/Barcode" scroll>
      {onScan === undefined ? null : (
        <Button label="Quét QR/Barcode" onPress={onScan} />
      )}
      <Button
        label="Nhập mã thủ công"
        variant={onScan === undefined ? 'primary' : 'secondary'}
        onPress={() => setManualOpen(true)}
      />
      {onLookupNfc === undefined ? null : (
        <Button
          label="Tra cứu bằng thẻ NFC"
          variant="secondary"
          onPress={onLookupNfc}
        />
      )}

      {error === undefined ? null : (
        <Banner
          tone="danger"
          title="Không tra cứu được"
          message={messageForUser(error)}
        >
          <Button
            label="Thử lại"
            variant="secondary"
            onPress={() => {
              submit();
            }}
          />
        </Banner>
      )}

      {notFound ? (
        <Banner
          tone="warning"
          icon={<AppIcon name="clock" color={theme.colors.warningText} />}
          title="Không tìm thấy sản phẩm"
          message={'Không có sản phẩm nào khớp mã "' + code.trim() + '".'}
        />
      ) : null}

      {copiedLabel === undefined ? null : (
        <Banner tone="success" title={'Đã sao chép ' + copiedLabel} />
      )}

      {result === undefined ? null : (
        <>
          <Banner
            tone="success"
            icon={<Text>✓</Text>}
            title="Đã nhận diện sản phẩm"
            // Cam kết nghiệp vụ — xem chú thích đầu tệp.
            message="Thông tin dưới đây được lấy trực tiếp từ backend WMS và không làm thay đổi tồn kho."
          />

          <Box card padding="lg" gap="md">
            <View style={[styles.head, { gap: theme.spacing.md }]}>
              <View style={styles.headBody}>
                <Text variant="caption" tone="muted">
                  Sản phẩm
                </Text>
                <Text variant="cardTitle" tone="strong">
                  {result.product_name ?? result.item_code ?? result.qr_code ?? result.id ?? '—'}
                </Text>
              </View>
              <Badge label="Tra cứu" uppercase />
            </View>

            {/* Ô trống hiện `—`, KHÔNG ẩn hàng — xem chú thích đầu tệp. */}
            <DefinitionRow
              label="Mã QR/Barcode"
              value={result.qr_code}
              onCopy={() => {
                copyValue('mã QR/Barcode', result.qr_code).catch(() => undefined);
              }}
            />
            <DefinitionRow
              label="SKU"
              value={result.sku_code}
              onCopy={() => {
                copyValue('SKU', result.sku_code).catch(() => undefined);
              }}
            />
            <DefinitionRow
              label="Mã item"
              value={result.item_code}
              onCopy={() => {
                copyValue('mã item', result.item_code).catch(() => undefined);
              }}
            />
            <DefinitionRow
              label="Serial"
              value={result.serial}
              onCopy={() => {
                copyValue('serial', result.serial).catch(() => undefined);
              }}
            />
            <DefinitionRow label="Nhóm" value={result.group_name} />
            <DefinitionRow label="Đơn vị" value={result.unit} />
            <DefinitionRow label="Kho" value={result.warehouse_name} />
            <DefinitionRow label="Trạng thái" value={result.status} last />
          </Box>

          <Box card padding="lg" gap="sm">
            <Text variant="cardTitle" tone="strong">
              Công dụng
            </Text>
            <Text variant="caption" tone="muted">
              {result.usage ?? MESSAGE_NO_USAGE}
            </Text>
          </Box>

          <Box card padding="lg" gap="sm">
            <Text variant="cardTitle" tone="strong">
              Mô tả sản phẩm
            </Text>
            <Text variant="caption" tone="muted">
              {result.description ?? MESSAGE_NO_DESCRIPTION}
            </Text>
          </Box>

          <View style={[styles.actions, { gap: theme.spacing.md }]}>
            <Button
              label="Trang chủ"
              variant="secondary"
              onPress={onHome ?? (() => undefined)}
              style={styles.half}
            />
            <Button
              label="Quét mã khác"
              onPress={onScanAgain ?? onScan ?? (() => undefined)}
              style={styles.half}
            />
          </View>
        </>
      )}

      {/* Ảnh 14 — hộp nhập mã thủ công dạng modal. */}
      <Sheet
        visible={manualOpen}
        onDismiss={() => setManualOpen(false)}
        title="Nhập mã thủ công"
        message="Nhập QR/Barcode để tra cứu chi tiết sản phẩm trên WMS"
      >
        <CodeInput
          label="Mã sản phẩm / mã tem"
          placeholder="Nhập QR, barcode hoặc serial"
          value={code}
          onChangeText={setCode}
          returnKeyType="search"
          onSubmitEditing={submit}
        />
        <Button
          label="Kiểm tra mã"
          loading={searching}
          disabled={code.trim() === '' || searching}
          onPress={submit}
        />
        <Button
          label="Huỷ"
          variant="secondary"
          onPress={() => setManualOpen(false)}
        />
      </Sheet>
    </Page>
  );
}
