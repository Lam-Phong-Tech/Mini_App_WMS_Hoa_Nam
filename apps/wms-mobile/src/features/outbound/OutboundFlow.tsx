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

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
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
import { Dialog } from '../../ui/Dialog';
import { Button } from '../../ui/Button';
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
import {
  cancelDraft,
  getActiveDraft,
  removeDraft,
  saveDraft,
} from '../../sync/draftStore';

const styles = StyleSheet.create({
  dialogActions: { gap: 8 },
});

export interface OutboundFlowProps {
  onExit: () => void;
  /** Mở chứng từ thật sau khi WMS đã trả id phiếu. */
  onViewDocument?: (documentId: string) => void;
  dataLayer?: Pick<ReturnType<typeof getDataLayer>, 'outbox' | 'syncEngine'>;
  /** Tiêm để test không cần mạng. */
  resolveCode?: typeof resolveOutboundCode;
}

interface RecordOutcome {
  readonly outcome: OutboundResultOutcome;
  readonly reason?: string;
  readonly documentRef: string;
  readonly quantity: number;
  readonly name: string;
  readonly recipientName: string;
  readonly documentId?: string;
}

/** Trạng thái hiển thị giữ nguyên từng kết quả outbox, không gộp lỗi. */
export type OutboundResultOutcome =
  | 'posted'
  | 'queued'
  | 'failed'
  | 'conflict'
  | 'unknown';

export function resultOutcomeForState(
  state: Awaited<ReturnType<ReturnType<typeof getDataLayer>['syncEngine']['syncOne']>>['state'],
): OutboundResultOutcome {
  switch (state) {
    case 'synced':
      return 'posted';
    case 'pending':
      return 'queued';
    case 'failed':
      return 'failed';
    case 'conflict':
      return 'conflict';
    case 'unknown':
      return 'unknown';
    default:
      // `syncing` only appears for a concurrent call; the UI already prevents
      // that path, but an explicit unknown result is safer than “queued”.
      return 'unknown';
  }
}

export function OutboundFlow({
  onExit,
  onViewDocument,
  dataLayer,
  resolveCode = resolveOutboundCode,
}: OutboundFlowProps): React.ReactElement {
  const [resumeCandidate] = useState(() => getActiveDraft<OutboundDraft>('outbound'));
  const draftIdRef = useRef(
    resumeCandidate?.id ?? 'draft-outbound-' + String(Date.now()),
  );
  const [draft, setDraft] = useState<OutboundDraft>(
    () => resumeCandidate?.payload ?? initialOutboundDraft,
  );
  const [resumeOpen, setResumeOpen] = useState(resumeCandidate !== undefined);
  const [exitOpen, setExitOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  // Chặn ngay trong event loop; chỉ dùng state `recording` thì hai lần chạm
  // sát nhau vẫn có thể cùng tạo hai phiếu trước khi React kịp render lại.
  const recordingRef = useRef(false);
  const [result, setResult] = useState<RecordOutcome | undefined>();
  // Rời màn kiểm tra sang gán NFC nhưng giữ nguyên phiếu nháp/mã đã quét.
  const [nfcCode, setNfcCode] = useState<string | undefined>();

  const hasDraftContent =
    draft.form.name.trim() !== '' ||
    draft.form.recipientName.trim() !== '' ||
    draft.codes.length > 0 ||
    draft.step !== 0;

  useEffect(() => {
    if (result !== undefined || !hasDraftContent) return;
    saveDraft('outbound', draftIdRef.current, draft);
  }, [draft, hasDraftContent, result]);

  const requestExit = useCallback(() => {
    if (hasDraftContent) setExitOpen(true);
    else onExit();
  }, [hasDraftContent, onExit]);

  const saveAndExit = useCallback(() => {
    saveDraft('outbound', draftIdRef.current, draft);
    setExitOpen(false);
    setResumeOpen(false);
    onExit();
  }, [draft, onExit]);

  const cancelAndExit = useCallback(() => {
    cancelDraft('outbound', draftIdRef.current);
    setExitOpen(false);
    setResumeOpen(false);
    onExit();
  }, [onExit]);

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
      if (sync.state === 'synced') removeDraft('outbound', draftIdRef.current);
      setResult({
        ...base,
        documentRef:
          sync.state === 'synced'
            ? recordedOutboundReference(sync.response, record.id)
            : record.id,
        outcome: resultOutcomeForState(sync.state),
        reason: sync.reason,
        documentId:
          sync.state === 'synced'
            ? recordedOutboundDocumentId(sync.response)
            : undefined,
      });
    } catch (error) {
      setResult({
        ...base,
        documentRef: record.id,
        outcome: 'unknown',
        reason: toAppError(error).message,
      });
    } finally {
      recordingRef.current = false;
      setRecording(false);
    }
  }, [dataLayer, draft]);

  const restart = useCallback(() => {
    draftIdRef.current = 'draft-outbound-' + String(Date.now());
    setDraft(initialOutboundDraft);
    setResult(undefined);
    setResumeOpen(false);
  }, []);

  const dialogs = (
    <>
      <Dialog
        visible={resumeOpen}
        dismissible={false}
        title="Bạn đang có phiếu chưa hoàn tất"
        message="Dữ liệu đã nhập được giữ lại trên thiết bị trong 1 tuần. Bạn có thể tiếp tục, lưu nháp để thoát hoặc hủy phiếu."
        onDismiss={() => undefined}
      >
        <View style={styles.dialogActions}>
          <Button label="Tiếp tục phiếu" onPress={() => setResumeOpen(false)} />
          <Button label="Lưu nháp và thoát" variant="secondary" onPress={saveAndExit} />
          <Button label="Bỏ phiếu" variant="danger" onPress={cancelAndExit} />
          <Button label="Hủy" variant="secondary" onPress={() => setResumeOpen(false)} />
        </View>
      </Dialog>
      <Dialog
        visible={exitOpen}
        title="Phiếu chưa hoàn tất"
        message="Bạn muốn lưu phiếu nháp để tiếp tục trong 1 tuần, hay chuyển phiếu sang trạng thái đã hủy?"
        onDismiss={() => setExitOpen(false)}
      >
        <View style={styles.dialogActions}>
          <Button label="Lưu nháp và thoát" onPress={saveAndExit} />
          <Button label="Bỏ phiếu" variant="danger" onPress={cancelAndExit} />
          <Button label="Tiếp tục soạn" variant="secondary" onPress={() => setExitOpen(false)} />
        </View>
      </Dialog>
    </>
  );

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
        onViewDocument={
          result.documentId === undefined || onViewDocument === undefined
            ? undefined
            : () => onViewDocument(result.documentId as string)
        }
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
        <>
        <OutboundCreateScreen
          draft={draft}
          onChange={setDraft}
          onBack={requestExit}
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
        {dialogs}
        </>
      );

    case 1:
      return (
        <BusinessScanScreen
          title="Xuất kho"
          documentName={
            draft.form.name === '' ? 'Phiếu xuất kho' : draft.form.name
          }
          stepLabel="Bước 2/3"
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
        <>
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
        {dialogs}
        </>
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

function recordedOutboundDocumentId(response: unknown): string | undefined {
  if (typeof response !== 'object' || response === null) return undefined;
  const document = response as RecordedOutboundDocument & {
    readonly document_id?: string | number;
  };
  const value = document.id ?? document.document_id;
  return value === undefined || value === null ? undefined : String(value);
}
