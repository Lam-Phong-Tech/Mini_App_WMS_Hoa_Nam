/**
 * Luồng xuất kho — nối bốn bước và đấu vào hàng đợi thật.
 *
 * 🎨 Nguồn: ảnh **25–35**.
 *
 * ```
 * Thông tin (25–27) → Quét mã (28) → Kiểm tra (29, 30) → Kết quả (34, 35)
 * ```
 *
 * Cùng khuôn với `InboundFlow`, khác ở chỗ **số lượng đặt trước** nên màn quét
 * hiện badge `N/M` và nút xác nhận chỉ mở khi quét đủ.
 *
 * Mỗi mã phải được WMS xác thực trước khi được cộng vào phiên. Khi đủ số lượng,
 * Mini App tự chuyển sang bước kiểm tra; record chỉ tạo phiếu chờ duyệt, không
 * tự Post Issue hay làm giảm tồn kho.
 */

import React, { useCallback, useRef, useState } from 'react';
import { serverNow } from '../../auth/serverClock';
import {
  isEligibleForOutbound,
  ineligibleReason,
  outboundDisplayName,
  recordedOutboundDocumentNo,
  resolveOutboundCode,
  type RecordedOutboundDocument,
} from '../../services/wms/outboundWrite';
import { toAppError } from '../../errors/AppError';
import { getDataLayer } from '../../sync/bootstrap';
import { BusinessScanScreen } from '../scan/BusinessScanScreen';
import type { ScanFeedback } from '../scan/BusinessScanScreen';
import { OutboundCreateScreen } from './OutboundCreateScreen';
import { OutboundResultScreen } from './OutboundResultScreen';
import { OutboundReviewScreen } from './OutboundReviewScreen';
import { NfcAssignmentScreen } from '../nfc/NfcAssignmentScreen';
import type { ScanSource } from '../../scanner/scanPayload';
import {
  OUTBOUND_OUTBOX_KIND,
  addOutboundCode,
  defaultOutboundName,
  initialOutboundDraft,
  outboundProgress,
  removeOutboundCode,
  settleOutboundCode,
  startScanning,
  targetQuantity,
  toOutboundPayload,
  type OutboundDraft,
  updateForm,
} from './outboundDraft';

export interface OutboundFlowProps {
  onExit: () => void;
  dataLayer?: Pick<ReturnType<typeof getDataLayer>, 'outbox' | 'syncEngine'>;
  /** Tiêm để test không cần mạng. */
  resolveCode?: typeof resolveOutboundCode;
}

interface RecordOutcome {
  readonly outcome: 'posted' | 'queued';
  readonly reason?: string;
  readonly documentRef: string;
  readonly quantity: number;
  readonly name: string;
  readonly recipientName: string;
}

export function OutboundFlow({
  onExit,
  dataLayer,
  resolveCode = resolveOutboundCode,
}: OutboundFlowProps): React.ReactElement {
  const [draft, setDraft] = useState<OutboundDraft>(initialOutboundDraft);
  const [recording, setRecording] = useState(false);
  // Chặn ngay trong event loop; chỉ dùng state `recording` thì hai lần chạm
  // sát nhau vẫn có thể cùng tạo hai phiếu trước khi React kịp render lại.
  const recordingRef = useRef(false);
  const [result, setResult] = useState<RecordOutcome | undefined>();
  // Rời màn kiểm tra sang gán NFC nhưng giữ nguyên phiếu nháp/mã đã quét.
  const [nfcCode, setNfcCode] = useState<string | undefined>();

  /**
   * Khớp `ScannerPage.processOutboundLocalCode` của Mini App: chờ
   * `resolve-code` trước, chỉ giữ mã được WMS cho phép xuất, rồi tự mở bước
   * kiểm tra khi đủ số lượng. Nhờ vậy badge và danh sách không bao giờ báo đã
   * quét một kiện mà WMS vừa từ chối.
   */
  const handleScan = useCallback(
    async (raw: string, source: ScanSource): Promise<ScanFeedback> => {
      const progress = outboundProgress(draft);
      if (progress.scanned >= progress.target) {
        return {
          accepted: false,
          message: 'Phiên xuất kho đã đủ số lượng. Đang mở màn kiểm tra.',
        };
      }

      const warehouseId = draft.form.warehouseId ?? '';
      if (warehouseId === '') {
        throw new Error('Thiếu kho xuất để kiểm tra mã. Vui lòng tạo lại phiên xuất kho.');
      }

      // Giống Mini App: chặn trùng từ QR/Barcode ngay trên máy trước khi gọi
      // WMS. Cùng một mã bị camera đọc lặp không được tạo thêm request.
      const scan = addOutboundCode(draft, raw, serverNow(), source);
      if (!scan.accepted) {
        return {
          accepted: false,
          message: 'Mã này đã được quét. Vui lòng quét sản phẩm khác.',
        };
      }

      const resolved = await resolveCode({ warehouseId, rawCode: raw });
      if (!isEligibleForOutbound(resolved)) {
        return { accepted: false, message: ineligibleReason(resolved) };
      }

      // Có tem khác nhau nhưng cùng `item_unique` cũng là một kiện. Mini App
      // kiểm điều này sau resolve để không cho một kiện được quét hai lần bằng
      // hai biểu diễn QR khác nhau.
      const physicalItem = resolved.item_unique ?? resolved.item_id;
      if (
        physicalItem !== undefined &&
        draft.codes.some(code => code.item === physicalItem)
      ) {
        return {
          accepted: false,
          message: 'Mã này đã được quét. Vui lòng quét sản phẩm khác.',
        };
      }

      const checked = settleOutboundCode(scan.draft, scan.draft.codes.at(-1)?.key ?? '', {
        eligible: true,
        skuName: outboundDisplayName(resolved),
        skuCode: resolved.sku_code,
        itemUnique: physicalItem,
      });
      const nextProgress = outboundProgress(checked);
      setDraft({
        ...checked,
        step:
          nextProgress.scanned >= nextProgress.target
            ? 2
            : checked.step,
      });
      return {
        message:
          '✓ Quét thành công ' +
          (resolved.item_unique ?? resolved.sku_code ?? raw) +
          ' · ' +
          nextProgress.label,
      };
    },
    [draft, resolveCode],
  );

  const handleRecord = useCallback(async () => {
    if (recordingRef.current) {
      return;
    }
    recordingRef.current = true;
    setRecording(true);

    const layer = dataLayer ?? getDataLayer();

    // Vào hàng đợi TRƯỚC khi thử gửi — app chết giữa chừng thì phiếu vẫn còn.
    const payload = toOutboundPayload(draft);
    const record = layer.outbox.enqueue({
      kind: OUTBOUND_OUTBOX_KIND,
      payload,
    });

    const base = {
      name: payload.name,
      recipientName: draft.form.recipientName,
      quantity: targetQuantity(draft),
    };

    try {
      const sync = await layer.syncEngine.syncOne(record.id);
      setResult({
        ...base,
        documentRef:
          sync.state === 'synced'
            ? recordedOutboundReference(sync.response, record.id)
            : record.id,
        outcome: sync.state === 'synced' ? 'posted' : 'queued',
        reason: sync.reason,
      });
    } catch (error) {
      setResult({
        ...base,
        documentRef: record.id,
        outcome: 'queued',
        reason: toAppError(error).message,
      });
    } finally {
      recordingRef.current = false;
      setRecording(false);
    }
  }, [dataLayer, draft]);

  const restart = useCallback(() => {
    setDraft(initialOutboundDraft);
    setResult(undefined);
  }, []);

  if (result !== undefined) {
    return (
      <OutboundResultScreen
        documentName={result.name}
        documentRef={result.documentRef}
        recipientName={result.recipientName}
        quantity={result.quantity}
        outcome={result.outcome}
        queuedReason={result.reason}
        onHome={onExit}
        onNext={restart}
      />
    );
  }

  if (nfcCode !== undefined) {
    return (
      <NfcAssignmentScreen
        initialCode={nfcCode}
        onBack={() => setNfcCode(undefined)}
      />
    );
  }

  switch (draft.step) {
    case 0:
      return (
        <OutboundCreateScreen
          draft={draft}
          onChange={setDraft}
          onBack={onExit}
          onStart={() =>
            setDraft(current => {
              const started = startScanning(current);
              // Mini App gán tên mặc định cho *phiên* ngay lúc bắt đầu quét,
              // không để màn camera/kiểm tra hiện "Phiếu xuất kho" chung chung.
              return started.step === 1 && started.form.name.trim() === ''
                ? updateForm(started, {
                    name: defaultOutboundName(new Date(serverNow())),
                  })
                : started;
            })
          }
        />
      );

    case 1:
      return (
        <BusinessScanScreen
          title="Quét hàng xuất"
          documentName={
            draft.form.name === '' ? 'Phiếu xuất kho' : draft.form.name
          }
          sessionLabel="Phiếu xuất đang quét"
          scannedCount={outboundProgress(draft).scanned}
          // Badge hiện `N/M` như ảnh 28 — luồng xuất có mốc số lượng.
          progressLabel={outboundProgress(draft).label}
          onScan={handleScan}
          onBack={() => setDraft(current => ({ ...current, step: 0 }))}
          onDone={() => setDraft(current => ({ ...current, step: 2 }))}
        />
      );

    default:
      return (
        <OutboundReviewScreen
          draft={draft}
          onRemoveCode={key =>
            setDraft(current => removeOutboundCode(current, key))
          }
          documentRef={draft.localDocumentRef ?? 'local-outbound'}
          recording={recording}
          onRecord={handleRecord}
          onBackToScan={() => setDraft(current => ({ ...current, step: 1 }))}
          onAssignNfc={rawCode => setNfcCode(rawCode)}
        />
      );
  }
}

function recordedOutboundReference(response: unknown, fallback: string): string {
  if (typeof response !== 'object' || response === null) {
    return fallback;
  }
  const document = response as RecordedOutboundDocument;
  return recordedOutboundDocumentNo(document) ??
    (document.id === undefined || document.id === null
      ? fallback
      : String(document.id));
}
