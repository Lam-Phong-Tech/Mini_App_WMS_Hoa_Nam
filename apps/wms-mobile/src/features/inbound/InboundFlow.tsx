/**
 * Luồng nhập kho — nối bốn bước, resolve mã thật và ghi qua hàng đợi bền vững.
 *
 * 🎨 Nguồn: ảnh **18–24**.
 *
 * ```
 * Tạo phiếu (18) → Quét mã (19) → Kiểm tra (20) → Kết quả (23, 24)
 * ```
 *
 * ## Bước ghi — đúng contract Mini App
 *
 * Bấm *Ghi nhận nhập*:
 * 1. Đưa phiếu vào **hàng đợi thật** (`outbox.enqueue`) — có `idempotencyKey`
 *    sinh một lần, giữ nguyên qua mọi lần gửi lại.
 * 2. Gọi `syncEngine.syncOne`, bộ gửi nhập gọi `inbound/record` với chính
 *    `idempotencyKey` đó.
 * 3. Nếu WMS nhận, màn kết quả dùng mã phiếu WMS trả về; nếu không, vẫn hiện
 *    hàng đợi kèm lý do để không làm mất dữ liệu quét.
 *
 * Dữ liệu quét **không mất**: nó nằm trong hàng đợi, trạng thái `pending`, chờ
 * Gate mở là gửi được. Đây là điểm khác biệt so với việc khoá nút — khoá nút thì
 * thủ kho quét xong rồi không làm gì được với đống mã vừa quét.
 *
 * Mã chỉ được thêm sau `inbound/resolve-code`, cùng quy tắc với Mini App web.
 */

import React, { useCallback, useRef, useState } from 'react';
import { serverNow } from '../../auth/serverClock';
import { AppError, toAppError } from '../../errors/AppError';
import { getDataLayer } from '../../sync/bootstrap';
import { Button } from '../../ui/Button';
import { Input } from '../../ui/Input';
import { Sheet } from '../../ui/Sheet';
import { BusinessScanScreen } from '../scan/BusinessScanScreen';
import { InboundCreateScreen } from './InboundCreateScreen';
import { InboundResultScreen } from './InboundResultScreen';
import type { InboundResultOutcome } from './InboundResultScreen';
import { InboundReviewScreen } from './InboundReviewScreen';
import {
  INBOUND_OUTBOX_KIND,
  addComponentBox,
  addResolvedScannedCode,
  continueToScan,
  dedupePhysicalInboundCodes,
  initialInboundDraft,
  parseComponentBoxCode,
  parseComponentBoxQuantity,
  removeNewestSkuCode,
  toOutboxPayload,
  totals,
  type ComponentBoxCode,
  type InboundDraft,
  type InboundItemType,
} from './inboundDraft';
import type { ScanSource } from '../../scanner/scanPayload';
import { normalizeScanCode, parseScanPayload } from '../../scanner/scanPayload';
import {
  isNewItemCandidate,
  recordedDocumentNo,
  resolveCode as resolveInboundCode,
  resolvedDisplayName,
  type RecordedDocument,
  type ResolvedCode,
} from '../../services/wms/inboundWrite';
import type { ScanFeedback } from '../scan/BusinessScanScreen';
import {
  findExistingInboundSku,
  type ExistingInboundSku,
} from './existingSkuLookup';

export interface InboundFlowProps {
  onExit: () => void;
  /** Tiêm để test không cần tầng dữ liệu thật. */
  dataLayer?: Pick<ReturnType<typeof getDataLayer>, 'outbox' | 'syncEngine'>;
  /** Tiêm để test không gọi WMS. Mỗi mã phải resolve trước khi được giữ lại. */
  resolveCode?: typeof resolveInboundCode;
  /** Đối soát thứ hai khi resolver nhầm SKU đã có thành SKU mới. */
  lookupExistingSku?: (
    rawCode: string,
  ) => Promise<ExistingInboundSku | undefined>;
}

interface RecordOutcome {
  readonly outcome: InboundResultOutcome;
  readonly reason?: string;
  readonly documentRef: string;
  readonly quantity: number;
  readonly name: string;
}

/** Mã đã đọc nhưng cần một thao tác người dùng trước khi được thêm vào phiếu. */
type PendingInboundScan =
  | {
      readonly type: 'new-item';
      readonly raw: string;
      readonly source: ScanSource;
      readonly resolved: ResolvedCode;
    }
  | {
      readonly type: 'component-box';
      readonly source: ScanSource;
      readonly box: ComponentBoxCode;
    };

function canonicalText(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim() !== '') {
    return value.trim();
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return undefined;
}

function sameBoxNumber(left: string, right: string): boolean {
  const leftNumber = Number(left);
  const rightNumber = Number(right);
  return (
    Number.isSafeInteger(leftNumber) &&
    Number.isSafeInteger(rightNumber) &&
    leftNumber === rightNumber
  );
}

/**
 * Chỉ tin cấu trúc `BOX-<SKU>-<số>` khi WMS cũng nhận diện cùng một hộp.
 * `raw_code` vẫn là bằng chứng gốc được gửi lại ở bước record; các trường
 * bên dưới chỉ là đối chiếu để không đưa nhầm SKU/hộp vào cả batch.
 */
function canonicalComponentBox(
  scanned: ComponentBoxCode,
  resolved: ResolvedCode,
): ComponentBoxCode {
  const resolvedType = canonicalText(resolved.item_type)?.toUpperCase();
  if (resolvedType !== undefined && resolvedType !== 'BOX') {
    throw new AppError({
      kind: 'http',
      status: 422,
      code: 'ITEM_TYPE_MISMATCH',
      message:
        'WMS nhận diện mã này là ' +
        resolvedType +
        ', không phải mã hộp linh kiện. Không thêm mã vào phiếu nhập.',
    });
  }

  const resolvedSku = canonicalText(resolved.sku_code);
  if (
    resolvedSku !== undefined &&
    normalizeScanCode(resolvedSku) !== normalizeScanCode(scanned.sku)
  ) {
    throw new AppError({
      kind: 'http',
      status: 422,
      code: 'SKU_CODE_MISMATCH',
      message:
        'SKU WMS trả về (' +
        resolvedSku +
        ') không khớp SKU trên mã hộp (' +
        scanned.sku +
        '). Không thêm mã vào phiếu nhập.',
    });
  }

  const resolvedBoxNumber = canonicalText(resolved.box_number);
  if (
    resolvedBoxNumber !== undefined &&
    !sameBoxNumber(resolvedBoxNumber, scanned.boxNumber)
  ) {
    throw new AppError({
      kind: 'http',
      status: 422,
      code: 'BOX_NUMBER_MISMATCH',
      message:
        'Số hộp WMS trả về (' +
        resolvedBoxNumber +
        ') không khớp mã đã quét (' +
        scanned.boxNumber +
        '). Không thêm mã vào phiếu nhập.',
    });
  }

  const skuStatus = canonicalText(resolved.sku_status)?.toUpperCase();
  if (
    resolved.sku_active === false ||
    resolved.is_sku_active === false ||
    skuStatus === 'INACTIVE' ||
    skuStatus === 'DISABLED' ||
    skuStatus === 'ARCHIVED'
  ) {
    throw new AppError({
      kind: 'http',
      status: 422,
      code: 'SKU_NOT_ACTIVE',
      message:
        'SKU ' +
        (resolvedSku ?? scanned.sku) +
        ' trong mã hộp chưa hoạt động trên WMS. Kích hoạt SKU hoặc quét đúng mã hộp trước khi nhập.',
    });
  }

  return {
    ...scanned,
    ...(resolvedSku === undefined ? {} : { sku: resolvedSku }),
  };
}

/** Biến phản hồi 422 mơ hồ của WMS thành lỗi có SKU ngay tại lúc quét. */
function isInactiveSkuError(error: AppError): boolean {
  return (
    error.status !== undefined &&
    error.status >= 400 &&
    error.status < 500 &&
    /\bsku\b.*(?:không|chưa).*(?:hoạt động|active)|\binactive\b/i.test(
      error.message,
    )
  );
}

export function InboundFlow({
  onExit,
  dataLayer,
  resolveCode = resolveInboundCode,
  lookupExistingSku = findExistingInboundSku,
}: InboundFlowProps): React.ReactElement {
  const [draft, setDraft] = useState<InboundDraft>(initialInboundDraft);
  const [recording, setRecording] = useState(false);
  // State chỉ cập nhật sau render; ref khóa ngay trong cùng event loop để một
  // cú chạm đúp không tạo hai outbox record/cùng lô gửi lên WMS.
  const recordingRef = useRef(false);
  const [result, setResult] = useState<RecordOutcome | undefined>();
  const [pendingScan, setPendingScan] = useState<PendingInboundScan>();
  const [boxQuantity, setBoxQuantity] = useState('');
  const [boxQuantityError, setBoxQuantityError] = useState<string>();

  const handleScan = useCallback(
    async (raw: string, source: ScanSource): Promise<ScanFeedback> => {
      const warehouseId = draft.warehouseId ?? '';
      if (warehouseId === '') {
        throw new AppError({
          kind: 'config',
          message: 'Thiếu kho nhận để kiểm tra mã nhập.',
        });
      }

      // Hộp linh kiện vẫn phải được WMS resolve trước khi hỏi số lượng. Bản
      // cũ bỏ qua bước này, khiến SKU ngừng hoạt động/chệch SKU chỉ lộ ra khi
      // cả phiếu bị record từ chối.
      const componentBox = parseComponentBoxCode(raw);
      let resolved: ResolvedCode;
      try {
        resolved = await resolveCode({ warehouseId, rawCode: raw });
      } catch (error) {
        const appError = toAppError(error);
        if (componentBox !== undefined && isInactiveSkuError(appError)) {
          throw new AppError({
            kind: 'http',
            status: appError.status,
            code: appError.code ?? 'SKU_NOT_ACTIVE',
            route: appError.route,
            requestId: appError.requestId,
            cause: appError,
            message:
              'SKU ' +
              componentBox.sku +
              ' trong mã hộp chưa hoạt động trên WMS. Kích hoạt SKU hoặc quét đúng mã hộp trước khi nhập.',
          });
        }
        throw error;
      }

      if (componentBox !== undefined) {
        const canonicalBox = canonicalComponentBox(componentBox, resolved);
        setBoxQuantity('');
        setBoxQuantityError(undefined);
        setPendingScan({ type: 'component-box', source, box: canonicalBox });
        return {
          accepted: false,
          requiresInput: true,
          message:
            'Đã nhận diện hộp linh kiện ' +
            canonicalBox.sku +
            '. Nhập số lượng thực tế để xác nhận.',
        };
      }

      const parsed = parseScanPayload(raw);
      const resolverSaysNew = isNewItemCandidate(resolved);
      // `NEW_ITEM_CANDIDATE` là ITEM mới, không phải SKU mới. Khi resolver đã
      // trả `sku_id`, đó là bằng chứng trực tiếp SKU đã tồn tại — kể cả SKU
      // chưa có balance/tồn trong kho. Không được bỏ qua rồi dò một trang đầu
      // danh mục, vì endpoint danh mục có thể phân trang và sẽ mở nhầm hộp
      // “Sản phẩm hay linh kiện”. Chỉ NEW không có `sku_id` mới cần đối soát
      // thứ hai để phát hiện trường hợp resolver chưa map được SKU cũ.
      const resolutionStatus = String(resolved.resolution_status ?? '')
        .trim()
        .toUpperCase();
      const resolverHasExistingSku =
        (typeof resolved.sku_id === 'string' &&
          resolved.sku_id.trim() !== '') ||
        // Dù backend cũ chưa echo `sku_id`, enum NEW_ITEM tự nó đã nói SKU có
        // sẵn và chỉ ITEM là mới. `NEW_SKU_CANDIDATE` là enum riêng nên không
        // được suy rộng quy tắc này sang nó.
        (resolutionStatus === 'NEW_ITEM_CANDIDATE' &&
          typeof resolved.sku_code === 'string' &&
          resolved.sku_code.trim() !== '');
      const knownSku =
        resolverSaysNew && !resolverHasExistingSku
          ? await lookupExistingSku(raw)
          : undefined;
      const resolvedSku =
        resolved.sku_code?.trim() ?? knownSku?.skuCode ?? parsed.sku;
      const productId =
        resolved.product_id ?? resolved.sku_id ?? knownSku?.productId;
      const isTrulyNew =
        resolverSaysNew && !resolverHasExistingSku && knownSku === undefined;

      // `inbound/record` không nhận lại hiện vật đã nằm trong kho hoặc đã xuất.
      // Chặn ngay sau resolve để một mã không hợp lệ không làm hỏng cả batch ở
      // bước gửi duyệt. Chỉ dùng hai trạng thái backend đã xác nhận; không coi
      // `ACTIVE` hoặc trạng thái chưa biết là không thể nhập để tránh chặn nhầm.
      const receiptState = String(
        resolved.stock_status ?? resolved.object_status ?? '',
      )
        .trim()
        .toUpperCase();
      if (receiptState === 'IN_STOCK' || receiptState === 'ISSUED') {
        throw new AppError({
          kind: 'http',
          status: 422,
          code: 'ITEM_NOT_RECEIVABLE',
          message:
            'Mã này đang ở trạng thái ' +
            receiptState +
            ', không thể nhập lại. Hãy dùng mã này để tra cứu hoặc xuất kho.',
        });
      }

      // SKU trong bảng tồn là mã *loại hàng*, không phải định danh một hiện
      // vật. `inbound/record` chỉ nhận QR ITEM, barcode đã gán physical-code,
      // hoặc mã BOX. Nếu resolver không tìm được mã vật lý nhưng đối soát lại
      // thấy chính chuỗi vừa quét là SKU, trước đây app vẫn cộng cục bộ rồi để
      // cả phiếu rơi vào 422 khi gửi duyệt. Chặn ngay tại quét để thủ kho đổi
      // sang tem QR/serial của sản phẩm — không được bịa ITEM thay cho backend.
      const isBareKnownSku =
        resolverSaysNew &&
        knownSku !== undefined &&
        parsed.item === undefined &&
        normalizeScanCode(raw) === normalizeScanCode(knownSku.skuCode);
      if (isBareKnownSku) {
        throw new AppError({
          kind: 'http',
          status: 422,
          message:
            'SKU ' +
            knownSku.skuCode +
            ' đã có trong danh mục nhưng đây không phải mã hiện vật. ' +
            'Hãy quét QR có SKU + ITEM, serial/barcode đã gán cho sản phẩm, hoặc mã BOX.',
        });
      }

      // Đây là điều kiện nguyên bản của `processInboundReceiptScan`: WMS phải
      // xác định được SKU/sản phẩm, trừ ba trạng thái được phép tạo mới lúc
      // record. Không cho mã mơ hồ đi tới bước ghi nhận.
      if (!productId && !resolvedSku && !isTrulyNew) {
        throw new AppError({
          kind: 'http',
          status: 422,
          message: 'Mã đã đọc được nhưng backend chưa resolve được SKU.',
        });
      }

      // WMS không thể biết mã mới là hàng hoàn chỉnh hay linh kiện. Dừng đúng
      // một lần để thủ kho quyết định, tuyệt đối không mặc định thành sản phẩm.
      if (isTrulyNew) {
        setPendingScan({ type: 'new-item', raw, source, resolved });
        return {
          accepted: false,
          requiresInput: true,
          message: 'SKU mới: chọn loại hàng trước khi tiếp tục quét.',
        };
      }

      const scan = addResolvedScannedCode(draft, raw, serverNow(), source, {
        itemId: resolved.item_id,
        skuCode: resolvedSku,
        skuName: resolvedDisplayName(resolved) ?? knownSku?.skuName,
        itemUnique: resolved.item_unique,
        serialNumber: resolved.serial_number,
      });
      if (!scan.accepted) {
        return {
          accepted: false,
          message: 'Mã này đã được quét. Vui lòng quét sản phẩm khác.',
        };
      }

      setDraft(scan.draft);
      const skuQuantity = scan.draft.codes
        .filter(code => code.sku === resolvedSku)
        .reduce((total, code) => total + code.quantity, 0);
      const stockContext = [
        knownSku?.warehouseName ?? resolved.current_location?.warehouse_name,
        knownSku?.stockStatus ??
          resolved.stock_status ??
          resolved.object_status,
        knownSku?.availableQuantity === undefined
          ? undefined
          : 'Khả dụng ' + String(knownSku.availableQuantity),
      ]
        .filter(
          (value): value is string =>
            typeof value === 'string' && value.trim() !== '',
        )
        .join(' · ');
      return {
        // Nói rõ kết quả đối soát trước khi cộng: SKU có trên WMS khác với
        // SKU mới phải chọn loại hàng. Số lượng ở đây là số đã quét trong
        // phiếu nháp; tồn kho chỉ thay đổi khi phiếu được Post Receipt.
        message:
          '✓ SKU ' +
          (resolvedSku ?? resolved.item_unique ?? parsed.item ?? raw) +
          (knownSku?.foundInInventory
            ? ' đã có trong kho'
            : ' đã có trên WMS') +
          (stockContext === '' ? '' : ' · ' + stockContext) +
          ' · Đã cộng 1 · SL SKU: ' +
          String(skuQuantity) +
          ' · Tổng ' +
          String(scan.draft.codes.length) +
          ' mã',
      };
    },
    [draft, resolveCode],
  );

  const dismissPendingScan = useCallback(() => {
    setPendingScan(undefined);
    setBoxQuantity('');
    setBoxQuantityError(undefined);
  }, []);

  const confirmNewItemType = useCallback(
    (itemType: InboundItemType) => {
      if (pendingScan?.type !== 'new-item') {
        return;
      }

      const pending = pendingScan;
      const scan = addResolvedScannedCode(
        draft,
        pending.raw,
        serverNow(),
        pending.source,
        {
          skuCode: pending.resolved.sku_code,
          skuName: resolvedDisplayName(pending.resolved),
          itemUnique: pending.resolved.item_unique,
          serialNumber: pending.resolved.serial_number,
          itemType,
        },
      );

      if (scan.accepted) {
        setDraft(scan.draft);
        dismissPendingScan();
      }
    },
    [dismissPendingScan, draft, pendingScan],
  );

  const confirmComponentBox = useCallback(() => {
    if (pendingScan?.type !== 'component-box') {
      return;
    }

    const quantity = parseComponentBoxQuantity(boxQuantity);
    if (quantity === undefined) {
      setBoxQuantityError('Nhập số lượng là số nguyên lớn hơn 0.');
      return;
    }

    const scan = addComponentBox(
      draft,
      pendingScan.box,
      quantity,
      serverNow(),
      pendingScan.source,
    );
    if (!scan.accepted) {
      setBoxQuantityError('Hộp này đã được quét trong phiếu nhập.');
      return;
    }

    setDraft(scan.draft);
    dismissPendingScan();
  }, [boxQuantity, dismissPendingScan, draft, pendingScan]);

  const handleRecord = useCallback(async () => {
    // Chống double submit — Prompt 4 §A.
    if (recordingRef.current) {
      return;
    }
    recordingRef.current = true;
    setRecording(true);

    const layer = dataLayer ?? getDataLayer();
    // Không gửi cùng một item_id/item_unique hai lần trong batch. Bình thường
    // không có khác biệt vì lúc quét đã chặn; đây là lớp cuối cho QR khác nhau
    // cùng resolve về một hiện vật và dữ liệu nháp từ bản cũ.
    const submissionDraft = dedupePhysicalInboundCodes(draft);
    if (submissionDraft !== draft) {
      setDraft(submissionDraft);
    }
    const summary = totals(submissionDraft);

    // Vào hàng đợi TRƯỚC khi thử gửi: nếu app chết giữa chừng thì phiếu vẫn còn.
    const record = layer.outbox.enqueue({
      kind: INBOUND_OUTBOX_KIND,
      payload: toOutboxPayload(submissionDraft),
    });

    try {
      const sync = await layer.syncEngine.syncOne(record.id);
      setResult({
        name: draft.name,
        quantity: summary.totalScanned,
        documentRef:
          sync.state === 'synced'
            ? recordedDocumentReference(sync.response, record.id)
            : record.id,
        outcome:
          sync.state === 'synced'
            ? 'posted'
            : sync.state === 'pending'
            ? 'queued'
            : sync.state === 'failed'
            ? 'failed'
            : 'reconcile',
        reason: sync.reason,
      });
    } catch (error) {
      setResult({
        name: draft.name,
        quantity: summary.totalScanned,
        documentRef: record.id,
        outcome: 'reconcile',
        reason: toAppError(error).message,
      });
    } finally {
      recordingRef.current = false;
      setRecording(false);
    }
  }, [dataLayer, draft]);

  const restart = useCallback(() => {
    setDraft(initialInboundDraft);
    setResult(undefined);
  }, []);

  if (result !== undefined) {
    return (
      <InboundResultScreen
        documentName={result.name}
        documentRef={result.documentRef}
        quantity={result.quantity}
        outcome={result.outcome}
        reason={result.reason}
        onHome={onExit}
        onNext={restart}
      />
    );
  }

  switch (draft.step) {
    case 0:
      return (
        <InboundCreateScreen
          draft={draft}
          onChange={setDraft}
          onBack={onExit}
          onContinue={() => setDraft(current => continueToScan(current))}
        />
      );

    case 1:
      return (
        <>
          <BusinessScanScreen
            title="Quét hàng nhập"
            documentName={draft.name}
            sessionLabel="Phiên quét nhập kho"
            scannedCount={draft.codes.length}
            scanPaused={pendingScan !== undefined}
            onScan={handleScan}
            onBack={() => setDraft(current => ({ ...current, step: 0 }))}
            onDone={() => setDraft(current => ({ ...current, step: 2 }))}
          />

          <Sheet
            visible={pendingScan?.type === 'new-item'}
            onDismiss={dismissPendingScan}
            title="Đây là sản phẩm hay linh kiện?"
            message="Không tìm thấy SKU này trong danh mục hoặc tồn kho WMS. Chọn đúng loại để WMS tạo và hạch toán đúng danh mục."
          >
            <Button
              label="Sản phẩm"
              onPress={() => confirmNewItemType('PRODUCT')}
            />
            <Button
              label="Linh kiện"
              variant="secondary"
              onPress={() => confirmNewItemType('COMPONENT')}
            />
            <Button
              label="Huỷ"
              variant="secondary"
              onPress={dismissPendingScan}
            />
          </Sheet>

          <Sheet
            visible={pendingScan?.type === 'component-box'}
            onDismiss={dismissPendingScan}
            title="Hộp linh kiện"
            message={
              pendingScan?.type === 'component-box'
                ? 'SKU ' +
                  pendingScan.box.sku +
                  ' · Hộp số ' +
                  pendingScan.box.boxNumber +
                  '. Nhập số lượng đã kiểm đếm thực tế.'
                : undefined
            }
          >
            <Input
              label="Số lượng linh kiện trong hộp*"
              placeholder="VD: 50"
              value={boxQuantity}
              onChangeText={value => {
                setBoxQuantity(value);
                setBoxQuantityError(undefined);
              }}
              keyboardType="number-pad"
              returnKeyType="done"
              onSubmitEditing={confirmComponentBox}
              errorText={boxQuantityError}
            />
            <Button
              label="Xác nhận số lượng"
              onPress={confirmComponentBox}
              disabled={boxQuantity.trim() === ''}
            />
            <Button
              label="Huỷ"
              variant="secondary"
              onPress={dismissPendingScan}
            />
          </Sheet>
        </>
      );

    default:
      return (
        <InboundReviewScreen
          draft={draft}
          onRemoveNewestSku={sku =>
            setDraft(current => removeNewestSkuCode(current, sku))
          }
          documentRef={draft.localDocumentRef ?? 'local-phiên-nhập'}
          recording={recording}
          onRecord={handleRecord}
          onBackToScan={() => setDraft(current => ({ ...current, step: 1 }))}
        />
      );
  }
}

function recordedDocumentReference(
  response: unknown,
  fallback: string,
): string {
  if (typeof response !== 'object' || response === null) {
    return fallback;
  }
  const document = response as RecordedDocument;
  return (
    recordedDocumentNo(document) ??
    (document.id === undefined || document.id === null
      ? fallback
      : String(document.id))
  );
}
