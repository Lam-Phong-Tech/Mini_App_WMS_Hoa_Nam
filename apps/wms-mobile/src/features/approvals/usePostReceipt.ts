/**
 * Hành động **Post Receipt** ở màn Duyệt phiếu.
 *
 * 🔓 `GATE_WMS §2f` — người dùng duyệt C ngày 2026-09-06.
 *
 * ## Vì sao có bước xác nhận
 *
 * Đây là **lệnh tăng tồn kho thật**, không hoàn tác bằng cách bấm lại. Mọi
 * hành động khác trong app đều lùi được: quét nhầm thì vuốt xoá, phiếu ghi
 * nhận nhầm thì còn ở trạng thái chờ duyệt. Cái này thì không. Một hộp xác
 * nhận là chi phí rẻ nhất đứng giữa ngón tay trượt và một lần kiểm kê lại kho.
 *
 * Hộp xác nhận **nêu tên phiếu và số lượng** chứ không hỏi chung chung *"bạn có
 * chắc không"* — câu hỏi chung chung thì ai cũng bấm Có mà không đọc.
 *
 * ## Khoá idempotency suy ra từ mã phiếu
 *
 * Người dùng chốt 2026-09-05: *"Khi retry phải dùng lại đúng Idempotency-Key
 * cũ."* Một phiếu có đúng một lệnh Post, nên khoá suy thẳng từ `documentId` là
 * ổn định qua mọi lần bấm lại, kể cả sau khi khởi động lại app — không cần lưu
 * gì thêm.
 *
 * ⚠️ Client Mini App đang chạy gọi `generateClientScanId()` **mỗi lần**
 * (`receipt-flow.service.ts:911`), tức mỗi lần thử lại một khoá mới. Không sao
 * chép chỗ đó.
 *
 * ## Chỉ mở nút khi máy chủ nói được
 *
 * Điều kiện là `ready_for_post` — **máy chủ tính**, client không tự suy từ
 * `scanned/expected`. Spec: *"Chỉ SCANNING full-scan mới được Post."* Client tự
 * đoán rồi bấm sẽ ăn lỗi ở tận bước cuối, sau khi thủ kho tưởng đã xong.
 */

import { useCallback, useRef, useState } from 'react';
import { toAppError, type AppError } from '../../errors/AppError';
import { postReceipt } from '../../services/wms/inboundWrite';
import type { InboundDocument } from '../../services/wms/types';

/** Tiền tố cho biết khoá do app này sinh, giúp tra cứu phía máy chủ. */
export const POST_RECEIPT_KEY_PREFIX = 'wmshn-postreceipt-';

/**
 * Khoá idempotency của một phiếu. **Thuần tuý suy ra từ mã phiếu** — cùng phiếu
 * thì cùng khoá, mãi mãi.
 */
export function postReceiptIdempotencyKey(documentId: string): string {
  return (POST_RECEIPT_KEY_PREFIX + documentId).slice(0, 100);
}

/**
 * Phiếu này có được phép Post không.
 *
 * `ready_for_post === true` là điều kiện **duy nhất**. Thiếu trường đó ⇒ không
 * cho: máy chủ chưa nói được thì client không thay nó quyết định.
 */
export function canPostReceipt(document: InboundDocument): boolean {
  return document.ready_for_post === true;
}

/**
 * Vì sao nút bị khoá — để hiện cho thủ kho thay vì một nút mờ câm lặng.
 */
export function postBlockedReason(
  document: InboundDocument,
): string | undefined {
  if (canPostReceipt(document)) {
    return undefined;
  }
  const scanned = document.scanned_total_qty ?? 0;
  const expected = document.expected_total_qty ?? 0;
  if (expected > 0 && scanned < expected) {
    return (
      'Còn thiếu ' +
      String(expected - scanned) +
      ' mã chưa quét. WMS chỉ cho Post khi phiếu đã quét đủ.'
    );
  }
  return 'WMS chưa đánh dấu phiếu này sẵn sàng Post.';
}

export interface PostReceiptState {
  /** Phiếu đang chờ người dùng xác nhận. */
  readonly confirming?: InboundDocument;
  /** Mã phiếu đang gửi. */
  readonly posting?: string;
  /** Mã các phiếu đã Post xong trong phiên này. */
  readonly posted: readonly string[];
  readonly error?: AppError;
}

export interface UsePostReceiptDeps {
  readonly post?: typeof postReceipt;
  /** Gọi lại sau khi Post xong, để màn nạp lại danh sách. */
  readonly onPosted?: (documentId: string) => void;
}

export function usePostReceipt(deps: UsePostReceiptDeps = {}) {
  const submit = deps.post ?? postReceipt;
  const [state, setState] = useState<PostReceiptState>({ posted: [] });
  const postingRef = useRef(false);

  const ask = useCallback((document: InboundDocument) => {
    setState(current => ({ ...current, confirming: document, error: undefined }));
  }, []);

  const cancel = useCallback(() => {
    setState(current => ({ ...current, confirming: undefined }));
  }, []);

  const confirm = useCallback(async () => {
    const document = state.confirming;
    if (document === undefined || postingRef.current) {
      return;
    }
    postingRef.current = true;

    // Đóng hộp xác nhận NGAY và chuyển sang trạng thái đang gửi — chống bấm hai
    // lần. Bấm đúp ở đây không tạo phiếu trùng nhờ Idempotency-Key, nhưng vẫn
    // là hai request thừa và hai lần chờ.
    setState(current => ({
      ...current,
      confirming: undefined,
      posting: document.id,
      error: undefined,
    }));

    try {
      await submit(
        { documentId: document.id, version: document.version ?? '' },
        postReceiptIdempotencyKey(document.id),
      );
      setState(current => ({
        ...current,
        posting: undefined,
        posted: [...current.posted, document.id],
      }));
      deps.onPosted?.(document.id);
    } catch (cause) {
      setState(current => ({
        ...current,
        posting: undefined,
        error: toAppError(cause),
      }));
    } finally {
      postingRef.current = false;
    }
  }, [deps, state.confirming, submit]);

  const dismissError = useCallback(() => {
    setState(current => ({ ...current, error: undefined }));
  }, []);

  return { ...state, ask, cancel, confirm, dismissError };
}
