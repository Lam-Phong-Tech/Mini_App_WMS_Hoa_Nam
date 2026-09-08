/**
 * Ảnh/video của một hồ sơ bảo hành — ảnh **46**.
 *
 * 🔓 `GATE_WMS §2i` **J** (tải lên) + Change Control `GATE_01 §11` #2 (module
 * chọn ảnh), người dùng duyệt 2026-09-06.
 *
 * ## 🔴 Không có nút xoá — và màn hình phải nói ra
 *
 * **K (`DELETE warranty-attachments/{id}`) chưa được duyệt.** Hệ quả thật: tải
 * nhầm ảnh lên thì **không gỡ ra được từ app**.
 *
 * Đó là lý do hook này tách bạch hai danh sách:
 *
 * | Danh sách | Bỏ được không |
 * |---|---|
 * | **Chờ tải** (đã chọn, chưa gửi) | ✅ bỏ thoải mái — mới nằm trên máy |
 * | **Đã tải lên** | ❌ không, cho tới khi K được duyệt |
 *
 * Cho bỏ ở danh sách chờ là chỗ duy nhất còn cứu được. Người dùng nhìn lại
 * trước khi bấm Tải lên, thay vì phát hiện sau khi đã gửi.
 *
 * ## Tải TUẦN TỰ
 *
 * Mỗi tệp một request, chạy lần lượt. Bắn 10 request song song qua mạng kho sẽ
 * làm tất cả cùng chậm và cùng có nguy cơ timeout. Tuần tự thì thấy được đang
 * ở tệp thứ mấy, và tệp hỏng không kéo theo tệp khác.
 *
 * ## ⚠️ Không có `Idempotency-Key`
 *
 * Spec không khai header đó cho endpoint tải file, và `writeGate` chặn. Nghĩa
 * là **gửi trùng sẽ tạo hai bản ghi file**. Hook chống bấm hai lần bằng cờ
 * `uploading`; ở tầng dưới không có gì đỡ.
 */

import { useCallback, useEffect, useState } from 'react';
import { toAppError, messageForUser, type AppError } from '../../errors/AppError';
import { fetchWarrantyAttachments } from '../../services/wms/queries';
import {
  uploadWarrantyAttachment,
  type AttachmentFile,
} from '../../services/wms/warrantyWrite';
import { ATTACHMENT_LIMITS } from './warrantyPolicy';
import {
  captureAttachment,
  pickFromLibrary,
  type PickedAttachment,
} from './attachmentPicker';

interface RawAttachment {
  readonly id?: string;
  readonly file_name?: string;
  readonly mime_type?: string;
  readonly attachment_type?: string;
}

export interface AttachmentsState {
  /** Đã có trên WMS. **Không xoá được** — xem chú thích đầu tệp. */
  readonly uploaded: readonly RawAttachment[];
  /** Đã chọn, chưa gửi. Bỏ được. */
  readonly pending: readonly PickedAttachment[];
  readonly loading: boolean;
  readonly uploading: boolean;
  /** Đang gửi tệp thứ mấy trên tổng bao nhiêu. */
  readonly progress?: { readonly done: number; readonly total: number };
  readonly error?: string;
  readonly notice?: string;
}

function countByKind(
  uploaded: readonly RawAttachment[],
  pending: readonly PickedAttachment[],
): { images: number; videos: number } {
  let images = 0;
  let videos = 0;
  for (const item of uploaded) {
    if (ATTACHMENT_LIMITS.videoTypes.includes(item.mime_type ?? '')) {
      videos += 1;
    } else {
      images += 1;
    }
  }
  for (const item of pending) {
    if (item.isVideo) {
      videos += 1;
    } else {
      images += 1;
    }
  }
  return { images, videos };
}

export interface UseAttachmentsDeps {
  readonly load?: typeof fetchWarrantyAttachments;
  readonly upload?: typeof uploadWarrantyAttachment;
  readonly pick?: typeof pickFromLibrary;
  readonly capture?: typeof captureAttachment;
}

export function useAttachments(caseId: string, deps: UseAttachmentsDeps = {}) {
  const loadList = deps.load ?? fetchWarrantyAttachments;
  const send = deps.upload ?? uploadWarrantyAttachment;
  const pickLibrary = deps.pick ?? pickFromLibrary;
  const pickCamera = deps.capture ?? captureAttachment;

  const [state, setState] = useState<AttachmentsState>({
    uploaded: [],
    pending: [],
    loading: true,
    uploading: false,
  });

  const counts = countByKind(state.uploaded, state.pending);

  const refresh = useCallback(() => {
    setState(current => ({ ...current, loading: true, error: undefined }));
    loadList(caseId)
      .then(page =>
        setState(current => ({
          ...current,
          uploaded: page.items as readonly RawAttachment[],
          loading: false,
        })),
      )
      .catch(cause =>
        setState(current => ({
          ...current,
          loading: false,
          // 🔴 KHÔNG nuốt thành danh sách rỗng — "0 ảnh" trông y hệt hồ sơ chưa
          // có ảnh nào, và người xử lý sẽ chụp lại từ đầu.
          error:
            'Không tải được danh sách file: ' +
            messageForUser(toAppError(cause)),
        })),
      );
  }, [caseId, loadList]);

  useEffect(refresh, [refresh]);

  const handleOutcome = useCallback(
    (outcome: Awaited<ReturnType<typeof pickFromLibrary>>) => {
      if (outcome.kind === 'cancelled') {
        // Đóng hộp chọn là hành động bình thường — không thông báo gì.
        return;
      }
      if (outcome.kind === 'error') {
        setState(current => ({ ...current, error: outcome.message }));
        return;
      }
      setState(current => ({
        ...current,
        pending: [...current.pending, ...outcome.items],
        error: undefined,
        notice:
          outcome.kind === 'partial'
            ? 'Bỏ qua ' +
              String(outcome.rejected.length) +
              ' tệp: ' +
              outcome.rejected.join(' · ')
            : undefined,
      }));
    },
    [],
  );

  const addFromLibrary = useCallback(() => {
    pickLibrary(counts).then(handleOutcome).catch(() => undefined);
  }, [counts, handleOutcome, pickLibrary]);

  const addFromCamera = useCallback(() => {
    pickCamera(counts).then(handleOutcome).catch(() => undefined);
  }, [counts, handleOutcome, pickCamera]);

  /** Bỏ một tệp **chưa gửi**. Tệp đã gửi thì không có đường bỏ — K chưa duyệt. */
  const removePending = useCallback((uri: string) => {
    setState(current => ({
      ...current,
      pending: current.pending.filter(item => item.file.uri !== uri),
      notice: undefined,
    }));
  }, []);

  const uploadAll = useCallback(
    async (attachmentType: string) => {
      if (state.uploading || state.pending.length === 0) {
        return;
      }
      const queue = state.pending;
      setState(current => ({
        ...current,
        uploading: true,
        error: undefined,
        notice: undefined,
        progress: { done: 0, total: queue.length },
      }));

      const failed: string[] = [];
      const sent: string[] = [];

      // TUẦN TỰ — xem chú thích đầu tệp.
      for (const item of queue) {
        try {
          await send(caseId, item.file as AttachmentFile, attachmentType);
          sent.push(item.file.uri);
        } catch (cause) {
          failed.push(item.file.name + ': ' + messageForUser(toAppError(cause)));
        }
        setState(current => ({
          ...current,
          progress: {
            done: (current.progress?.done ?? 0) + 1,
            total: queue.length,
          },
        }));
      }

      setState(current => ({
        ...current,
        uploading: false,
        progress: undefined,
        // Chỉ bỏ khỏi hàng chờ những tệp ĐÃ gửi được. Tệp hỏng ở lại để thử
        // lại — bỏ hết sẽ khiến người dùng phải chọn lại từ đầu.
        pending: current.pending.filter(item => !sent.includes(item.file.uri)),
        error:
          failed.length === 0
            ? undefined
            : 'Có ' + String(failed.length) + ' tệp chưa gửi được: ' +
              failed.join(' · '),
        notice:
          sent.length === 0
            ? undefined
            : 'Đã tải lên ' + String(sent.length) + ' tệp.',
      }));

      refresh();
    },
    [caseId, refresh, send, state.pending, state.uploading],
  );

  const dismissMessages = useCallback(() => {
    setState(current => ({ ...current, error: undefined, notice: undefined }));
  }, []);

  return {
    ...state,
    counts,
    addFromLibrary,
    addFromCamera,
    removePending,
    uploadAll,
    refresh,
    dismissMessages,
  };
}

export type { AppError };
