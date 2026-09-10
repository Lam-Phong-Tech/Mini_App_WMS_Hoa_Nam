/** Luồng quét và xác nhận xuất linh kiện phục vụ một hồ sơ bảo hành. */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { messageForUser, toAppError } from '../../errors/AppError';
import type { WarrantyCase } from '../../services/wms/types';
import {
  issueWarrantyComponents,
  type WarrantyComponentBatchResult,
} from '../../services/wms/warrantyComponentWrite';
import { Box } from '../../ui/Box';
import { Badge } from '../../ui/Badge';
import { Banner } from '../../ui/Banner';
import { Button } from '../../ui/Button';
import { DefinitionRow } from '../../ui/DefinitionRow';
import { Input } from '../../ui/Input';
import { Page } from '../../ui/Page';
import { Sheet } from '../../ui/Sheet';
import { Select } from '../../ui/Select';
import { Text } from '../../ui/Text';
import { useTheme } from '../../theme/ThemeProvider';
import { BusinessScanScreen } from '../scan/BusinessScanScreen';
import type { ScanFeedback } from '../scan/BusinessScanScreen';
import { parseComponentBoxCode } from '../inbound/inboundDraft';
import { useWarehouses, warehouseLabel } from '../inbound/useWarehouses';
import { canIssueWarrantyComponents } from './warrantyPolicy';
import {
  addWarrantyComponent,
  createWarrantyComponentDraft,
  hasWarrantyComponentCode,
  removeWarrantyComponent,
  warrantyComponentPostIdempotencyKey,
  warrantyComponentTotal,
  type ResolvedWarrantyComponentSku,
  type WarrantyComponentDraft,
} from './warrantyComponentDraft';
import { resolveWarrantyComponentSku } from './warrantyComponentSkuLookup';

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  headBody: {
    flex: 1,
  },
  rowHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});

type IssueStep = 'scan' | 'review' | 'done';

export interface WarrantyComponentIssueFlowProps {
  warrantyCase: WarrantyCase;
  onBack: () => void;
  onComplete: (updatedCase: WarrantyCase) => void;
  /** Tiêm để test không gọi WMS thật. */
  submitComponents?: typeof issueWarrantyComponents;
}

function updatedWarrantyCase(
  original: WarrantyCase,
  outcome: WarrantyComponentBatchResult,
): WarrantyCase {
  if (outcome.warrantyCase !== undefined) return outcome.warrantyCase;
  return original;
}

export function WarrantyComponentIssueFlow({
  warrantyCase,
  onBack,
  onComplete,
  submitComponents = issueWarrantyComponents,
}: WarrantyComponentIssueFlowProps): React.ReactElement {
  const theme = useTheme();
  const [draft, setDraft] = useState<WarrantyComponentDraft>(() =>
    createWarrantyComponentDraft(warrantyCase.warranty_case_id),
  );
  const warehouses = useWarehouses();
  const [warehouseId, setWarehouseId] = useState<string>();
  const [step, setStep] = useState<IssueStep>('scan');
  const [pendingBox, setPendingBox] = useState<{
    readonly code: string;
    readonly sku: ResolvedWarrantyComponentSku;
  }>();
  const [boxQuantity, setBoxQuantity] = useState('');
  const [boxQuantityError, setBoxQuantityError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [submitError, setSubmitError] = useState<string>();
  const [outcome, setOutcome] = useState<WarrantyComponentBatchResult>();

  useEffect(() => {
    const first = warehouses.warehouses[0];
    if (warehouseId === undefined && first !== undefined) {
      setWarehouseId(first.id);
    }
  }, [warehouseId, warehouses.warehouses]);

  const handleScan = useCallback(
    async (rawCode: string): Promise<ScanFeedback> => {
      if (hasWarrantyComponentCode(draft, rawCode)) {
        return {
          accepted: false,
          message: 'Mã này đã có trong danh sách xuất linh kiện.',
        };
      }

      // Scan chưa tạo phiếu hoặc đổi tồn. Chỉ khi map được `sku_id` chuẩn mới
      // thêm vào nháp; create sau đó dùng các SKU này để dựng lines.
      if (warehouseId === undefined) {
        return {
          accepted: false,
          message: 'Đang tải kho xuất. Vui lòng thử quét lại sau ít giây.',
        };
      }
      const sku = await resolveWarrantyComponentSku({
        rawCode,
        warehouseId,
        caseId: warrantyCase.warranty_case_id,
      });
      if (sku.requiresQuantity) {
        setPendingBox({ code: rawCode.trim(), sku });
        setBoxQuantity('');
        setBoxQuantityError(undefined);
        return {
          accepted: false,
          requiresInput: true,
          message: 'Đã nhận diện hộp linh kiện. Nhập số lượng cần xuất.',
        };
      }

      setDraft(current => addWarrantyComponent(current, rawCode, undefined, sku));
      return {
        accepted: true,
        message: 'Đã thêm linh kiện có mã, số lượng 1.',
      };
    },
    [draft, warehouseId],
  );

  const dismissBox = useCallback(() => {
    setPendingBox(undefined);
    setBoxQuantity('');
    setBoxQuantityError(undefined);
  }, []);

  const confirmBox = useCallback(() => {
    if (pendingBox === undefined) return;
    try {
      const next = addWarrantyComponent(
        draft,
        pendingBox.code,
        boxQuantity,
        pendingBox.sku,
      );
      setDraft(next);
      dismissBox();
    } catch (error) {
      setBoxQuantityError(
        error instanceof Error ? error.message : 'Số lượng không hợp lệ.',
      );
    }
  }, [boxQuantity, dismissBox, draft, pendingBox]);

  const confirmIssue = useCallback(async () => {
    if (
      submittingRef.current ||
      draft.items.length === 0 ||
      warehouseId === undefined
    ) {
      return;
    }
    submittingRef.current = true;
    setSubmitting(true);
    setSubmitError(undefined);
    try {
      const result = await submitComponents({
        caseId: warrantyCase.warranty_case_id,
        warehouseId,
        postIdempotencyKey: warrantyComponentPostIdempotencyKey(
          draft.caseId,
          draft.sessionId,
        ),
        items: draft.items.map(item => ({
          skuId: item.skuId ?? '',
          codeValue: item.rawCode,
          quantity: item.quantity,
        })),
      });
      setOutcome(result);
      setStep('done');
    } catch (error) {
      const appError = toAppError(error);
      setSubmitError(
        appError.kind === 'config' ? appError.message : messageForUser(appError),
      );
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }, [draft, submitComponents, warehouseId, warrantyCase]);

  if (!canIssueWarrantyComponents(warrantyCase.status)) {
    return (
      <Page title="Xuất linh kiện bảo hành" onBack={onBack}>
        <Banner
          tone="warning"
          title="Hồ sơ chưa ở bước được xuất linh kiện"
          message="Chỉ hồ sơ Đang kiểm tra hoặc Đang sửa chữa mới được xuất linh kiện."
        />
        <Button label="Quay lại hồ sơ" variant="secondary" onPress={onBack} />
      </Page>
    );
  }

  if (step === 'scan') {
    const pendingBoxDetails =
      pendingBox === undefined
        ? undefined
        : parseComponentBoxCode(pendingBox.code);
    return (
      <>
        <BusinessScanScreen
          title="Xuất linh kiện bảo hành"
          documentName={
            warrantyCase.warranty_case_code ?? warrantyCase.warranty_case_id
          }
          sessionLabel="Linh kiện phục vụ bảo hành"
          scannedCount={draft.items.length}
          scanPaused={pendingBox !== undefined}
          doneLabel="Kiểm tra linh kiện"
          onScan={handleScan}
          onBack={onBack}
          onDone={() => setStep('review')}
        />

        <Sheet
          visible={pendingBox !== undefined}
          onDismiss={dismissBox}
          title="Hộp linh kiện"
          message={
            pendingBox === undefined
              ? undefined
              : 'SKU ' +
                (pendingBox.sku.skuCode ?? pendingBoxDetails?.sku ?? 'chưa rõ') +
                (pendingBoxDetails?.boxNumber === undefined
                  ? ''
                  : ' · Hộp số ' + pendingBoxDetails.boxNumber) +
                (pendingBox.sku.availableQuantity === undefined
                  ? ''
                  : ' · Tồn khả dụng ' +
                    String(pendingBox.sku.availableQuantity)) +
                '. Nhập số lượng cần xuất cho máy này.'
          }
        >
          <Input
            label="Số lượng linh kiện cần xuất*"
            placeholder="VD: 2"
            value={boxQuantity}
            keyboardType="number-pad"
            returnKeyType="done"
            onChangeText={value => {
              setBoxQuantity(value);
              setBoxQuantityError(undefined);
            }}
            onSubmitEditing={confirmBox}
            errorText={boxQuantityError}
          />
          <Button
            label="Xác nhận số lượng"
            onPress={confirmBox}
            disabled={boxQuantity.trim() === ''}
          />
          <Button label="Huỷ" variant="secondary" onPress={dismissBox} />
        </Sheet>
      </>
    );
  }

  if (step === 'done' && outcome !== undefined) {
    const nextCase = updatedWarrantyCase(warrantyCase, outcome);
    return (
      <Page title="Đã xuất linh kiện" subtitle="Bảo hành" scroll>
        <Banner
          tone="success"
          title="Xuất linh kiện thành công"
          message={
            'Đã xuất ' +
            String(outcome.issuedQuantity) +
            ' linh kiện trên ' +
            String(outcome.issuedLines) +
            ' mã/hộp cho hồ sơ ' +
            (warrantyCase.warranty_case_code ?? warrantyCase.warranty_case_id) +
            '.'
          }
        />
        <Box card padding="lg" gap="md">
          <DefinitionRow
            label="Hồ sơ"
            value={
              warrantyCase.warranty_case_code ?? warrantyCase.warranty_case_id
            }
          />
          <DefinitionRow
            label="Số mã/hộp"
            value={String(outcome.issuedLines)}
          />
          <DefinitionRow
            label="Tổng số lượng"
            value={String(outcome.issuedQuantity)}
            last
          />
        </Box>
        <Button
          label="Về hồ sơ bảo hành"
          onPress={() => onComplete(nextCase)}
        />
      </Page>
    );
  }

  return (
    <Page
      title="Xác nhận xuất linh kiện"
      subtitle={warrantyCase.warranty_case_code ?? warrantyCase.warranty_case_id}
      onBack={() => setStep('scan')}
      scroll
    >
      <Box card padding="lg" gap="md">
        <View style={[styles.head, { gap: theme.spacing.md }]}>
          <View style={styles.headBody}>
            <Text variant="caption" tone="muted">
              Hồ sơ bảo hành
            </Text>
            <Text variant="cardTitle" tone="strong">
              {warrantyCase.sku_name ??
                warrantyCase.manual_product_description ??
                'Sản phẩm chưa xác định'}
            </Text>
          </View>
          <Badge label={String(warrantyComponentTotal(draft)) + ' linh kiện'} />
        </View>
        <DefinitionRow
          label="Mã hồ sơ"
          value={warrantyCase.warranty_case_code ?? warrantyCase.warranty_case_id}
          last
        />
      </Box>

      <Banner
        tone="info"
        title="Chưa xuất kho ở bước quét"
        message="Kiểm tra đúng mã và số lượng. Tồn kho chỉ thay đổi khi bấm Xác nhận xuất linh kiện."
      />

      <Select
        label="Kho xuất linh kiện*"
        placeholder="Chọn kho xuất"
        disabled={warehouses.phase === 'loading'}
        disabledPlaceholder="Đang tải danh sách kho…"
        value={warehouseId}
        options={warehouses.warehouses.map(warehouse => ({
          value: warehouse.id,
          label: warehouseLabel(warehouse),
        }))}
        errorText={
          warehouses.error === undefined
            ? warehouseId === undefined
              ? 'Chưa lấy được kho xuất. Vui lòng thử lại.'
              : undefined
            : messageForUser(warehouses.error)
        }
        onChange={setWarehouseId}
        sheetTitle="Chọn kho xuất linh kiện"
      />
      {warehouses.phase === 'error' ? (
        <Button label="Tải lại danh sách kho" variant="secondary" onPress={warehouses.reload} />
      ) : null}

      <View style={styles.rowHead}>
        <Text variant="cardTitle" tone="strong">
          Danh sách linh kiện
        </Text>
        <Text variant="caption" tone="muted">
          {String(draft.items.length) + ' mã/hộp'}
        </Text>
      </View>

      {draft.items.map((item, index) => (
        <Box key={item.key} card padding="lg" gap="sm">
          <View style={styles.rowHead}>
            <Text variant="caption" tone="muted">
              {'Dòng #' + String(index + 1)}
            </Text>
            <Badge
              label={item.kind === 'BOX' ? 'Mã hộp' : 'Mã linh kiện'}
              tone={item.kind === 'BOX' ? 'primary' : 'success'}
            />
          </View>
          <Text variant="body" tone="strong">
            {item.rawCode}
          </Text>
          {item.sku === undefined ? null : (
            <Text variant="caption" tone="muted">
              {'SKU ' + item.sku + ' · Hộp số ' + item.boxNumber}
            </Text>
          )}
          {item.skuName === undefined ? null : (
            <Text variant="caption" tone="muted">
              {item.skuName}
            </Text>
          )}
          <DefinitionRow
            label="Số lượng xuất"
            value={String(item.quantity)}
            last
          />
          <Button
            label="Bỏ khỏi danh sách"
            variant="secondary"
            disabled={submitting}
            onPress={() =>
              setDraft(current => removeWarrantyComponent(current, item.key))
            }
          />
        </Box>
      ))}

      {submitError === undefined ? null : (
        <Banner
          tone="danger"
          title="Không xuất được linh kiện"
          message={submitError}
        />
      )}

      <Button
        label="Xác nhận xuất linh kiện"
        onPress={() => {
          confirmIssue().catch(() => undefined);
        }}
        loading={submitting}
        disabled={draft.items.length === 0 || warehouseId === undefined || submitting}
      />
      <Button
        label="Quay lại quét"
        variant="secondary"
        disabled={submitting}
        onPress={() => setStep('scan')}
      />
    </Page>
  );
}
