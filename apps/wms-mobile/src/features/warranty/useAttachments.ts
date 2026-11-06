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

import { useCallback, useEffect, useRef, useState } from 'react';
import { AppError, toAppError, messageForUser } from '../../errors/AppError';
import { fetchWarrantyAttachments } from '../../services/wms/queries';
import {
  uploadWarrantyAttachment,
  type AttachmentFile,
  hashAttachmentFile,
  uploadOwnerAttachment,
  reconcileOwnerAttachment,
} from '../../services/wms/warrantyWrite';
import {
  captureSessionScope,
  isSessionScopeCurrent,
  subscribeSession,
} from '../../auth/session';
import {
  readUploadJournal,
  writeUploadJournal,
  uploadJournalKey,
  type PendingUpload,
} from './p18UploadJournal';
import { createP03RequestId } from '../../services/wms/p03Drafts';
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
  readonly content_type?: string;
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
  readonly unknown?: readonly {
    uri: string;
    name: string;
    key: string;
    sha256: string;
  }[];
}

function countByKind(
  uploaded: readonly RawAttachment[],
  pending: readonly PickedAttachment[],
): { images: number; videos: number } {
  let images = 0;
  let videos = 0;
  for (const item of uploaded) {
    if (
      ATTACHMENT_LIMITS.videoTypes.includes(
        item.content_type ?? item.mime_type ?? '',
      )
    ) {
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
  readonly enabled?: boolean;
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
  const uploadKeys = useRef(new Map<string, string>());
  const uploadHashes = useRef(new Map<string, string>());
  const uploadLatch = useRef(false);
  const journalError = useRef<string | undefined>(undefined);
  const mounted = useRef(true),
    epoch = useRef(0),
    readSequence = useRef(0),
    pendingProof = useRef<PendingUpload[]>([]);
  const [, scopeRevision] = useState(0);
  const binding = uploadJournalKey(caseId) ?? 'unverified:' + caseId;
  const currentBinding = useRef(binding),
    visibleBinding = useRef(binding);
  currentBinding.current = binding;
  const accepts = useCallback(
    (captured: ReturnType<typeof captureSessionScope>, ticket: number) =>
      mounted.current &&
      visibleBinding.current === currentBinding.current &&
      epoch.current === ticket &&
      isSessionScopeCurrent(captured),
    [],
  );
  useEffect(() => subscribeSession(() => scopeRevision(n => n + 1)), []);
  useEffect(() => {
    const epochRef = epoch;
    mounted.current = true;
    visibleBinding.current = binding;
    epoch.current++;
    uploadLatch.current = false;
    uploadKeys.current.clear();
    uploadHashes.current.clear();
    let saved: PendingUpload[] = [],
      error: string | undefined;
    try {
      saved = readUploadJournal(uploadJournalKey(caseId));
    } catch {
      error = 'Chưa đọc được journal upload. Giữ dữ liệu; không upload mới.';
    }
    pendingProof.current = saved;
    journalError.current = error;
    setState({
      uploaded: [],
      pending: saved.map(row => ({
        file: {
          uri: row.uri,
          name: row.name,
          type: 'application/octet-stream',
        },
        bytes: 0,
        isVideo: false,
      })),
      loading: true,
      uploading: false,
      unknown: saved,
      error,
    });
    if (error) uploadLatch.current = true;
    return () => {
      mounted.current = false;
      epochRef.current++;
    };
  }, [binding, caseId]);

  const counts = countByKind(state.uploaded, state.pending);

  const refresh = useCallback(() => {
    if (deps.enabled === false) return;
    const captured = captureSessionScope(),
      ticket = epoch.current,
      read = ++readSequence.current;
    setState(current => ({ ...current, loading: true, error: undefined }));
    loadList(caseId)
      .then(page => {
        if (!accepts(captured, ticket) || read !== readSequence.current) return;
        setState(current => ({
          ...current,
          uploaded: page.items as readonly RawAttachment[],
          loading: false,
        }));
      })
      .catch(cause => {
        if (!accepts(captured, ticket) || read !== readSequence.current) return;
        setState(current => ({
          ...current,
          loading: false,
          // 🔴 KHÔNG nuốt thành danh sách rỗng — "0 ảnh" trông y hệt hồ sơ chưa
          // có ảnh nào, và người xử lý sẽ chụp lại từ đầu.
          error:
            'Không tải được danh sách file: ' +
            messageForUser(toAppError(cause)),
        }));
      });
  }, [caseId, loadList, deps.enabled, accepts]);

  useEffect(refresh, [refresh, binding]);

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
    if (
      visibleBinding.current !== currentBinding.current ||
      uploadLatch.current ||
      pendingProof.current.length
    )
      return;
    const captured = captureSessionScope(),
      ticket = epoch.current;
    pickLibrary(counts)
      .then(outcome => {
        if (accepts(captured, ticket)) handleOutcome(outcome);
      })
      .catch(() => undefined);
  }, [counts, handleOutcome, pickLibrary, accepts]);

  const addFromCamera = useCallback(() => {
    if (
      visibleBinding.current !== currentBinding.current ||
      uploadLatch.current ||
      pendingProof.current.length
    )
      return;
    const captured = captureSessionScope(),
      ticket = epoch.current;
    pickCamera(counts)
      .then(outcome => {
        if (accepts(captured, ticket)) handleOutcome(outcome);
      })
      .catch(() => undefined);
  }, [counts, handleOutcome, pickCamera, accepts]);

  /** Bỏ một tệp **chưa gửi**. Tệp đã gửi thì không có đường bỏ — K chưa duyệt. */
  const removePending = useCallback((uri: string) => {
    if (visibleBinding.current !== currentBinding.current) return;
    if (
      uploadLatch.current ||
      pendingProof.current.some(row => row.uri === uri)
    )
      return;
    setState(current => ({
      ...current,
      pending: current.pending.filter(item => item.file.uri !== uri),
      notice: undefined,
    }));
  }, []);

  const uploadAll = useCallback(
    async (attachmentType: string) => {
      if (
        visibleBinding.current !== currentBinding.current ||
        deps.enabled === false ||
        uploadLatch.current ||
        state.uploading ||
        state.pending.length === 0 ||
        pendingProof.current.length ||
        state.unknown?.length
      ) {
        return;
      }
      uploadLatch.current = true;
      const captured = captureSessionScope(),
        ticket = epoch.current,
        journalKey = uploadJournalKey(caseId, captured);
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
      const rejected: string[] = [];

      // TUẦN TỰ — xem chú thích đầu tệp.
      const unknown: {
        uri: string;
        name: string;
        key: string;
        sha256: string;
      }[] = [];
      for (const item of queue) {
        if (!accepts(captured, ticket)) break;
        let dispatched = false;
        try {
          if (deps.upload)
            await send(caseId, item.file as AttachmentFile, attachmentType);
          else {
            const scope = captured;
            if (!scope.warehouseId)
              throw new AppError({
                kind: 'blocked_by_gate',
                code: 'P18_WAREHOUSE_REQUIRED',
                message: 'Chưa xác minh kho upload.',
              });
            const key =
              uploadKeys.current.get(item.file.uri) ?? createP03RequestId();
            uploadKeys.current.set(item.file.uri, key);
            const sha =
              uploadHashes.current.get(item.file.uri) ??
              (await hashAttachmentFile(item.file as AttachmentFile));
            uploadHashes.current.set(item.file.uri, sha);
            if (!accepts(captured, ticket)) break;
            await uploadOwnerAttachment(
              'warranty',
              caseId,
              item.file as AttachmentFile,
              {
                warehouseId: scope.warehouseId,
                idempotencyKey: key,
                attachmentType,
                expectedScope: captured,
                expectedSha256: sha,
                beforeDispatch: () => {
                  if (!accepts(captured, ticket))
                    throw new AppError({
                      kind: 'cancelled',
                      code: 'P18_SCOPE_CHANGED',
                      message: 'Phiên upload đã thay đổi.',
                    });
                  const proof = {
                    uri: item.file.uri,
                    name: item.file.name,
                    key,
                    sha256: sha,
                  };
                  writeUploadJournal(journalKey, [
                    ...pendingProof.current,
                    proof,
                  ]);
                  pendingProof.current.push(proof);
                  dispatched = true;
                },
              },
            );
          }
          if (!accepts(captured, ticket)) return;
          if (!deps.upload) {
            pendingProof.current = pendingProof.current.filter(
              row => row.uri !== item.file.uri,
            );
            writeUploadJournal(journalKey, pendingProof.current);
          }
          sent.push(item.file.uri);
        } catch (cause) {
          const error = toAppError(cause);
          const key = uploadKeys.current.get(item.file.uri),
            sha = uploadHashes.current.get(item.file.uri);
          if (
            !deps.upload &&
            dispatched &&
            key &&
            sha &&
            error.code !== 'P18_UPLOAD_REJECTED_VERIFIED'
          )
            unknown.push({
              uri: item.file.uri,
              name: item.file.name,
              key,
              sha256: sha,
            });
          if (
            accepts(captured, ticket) &&
            error.code === 'P18_UPLOAD_REJECTED_VERIFIED'
          ) {
            pendingProof.current = pendingProof.current.filter(
              row => row.uri !== item.file.uri,
            );
            writeUploadJournal(journalKey, pendingProof.current);
            rejected.push(item.file.uri);
          }
          failed.push(
            item.file.name + ': ' + messageForUser(toAppError(cause)),
          );
        }
        if (!accepts(captured, ticket)) break;
        setState(current => ({
          ...current,
          progress: {
            done: (current.progress?.done ?? 0) + 1,
            total: queue.length,
          },
        }));
        if (unknown.length) break;
      }

      if (!accepts(captured, ticket)) return;
      setState(current => ({
        ...current,
        uploading: false,
        progress: undefined,
        // Chỉ bỏ khỏi hàng chờ những tệp ĐÃ gửi được. Tệp hỏng ở lại để thử
        // lại — bỏ hết sẽ khiến người dùng phải chọn lại từ đầu.
        pending: current.pending.filter(
          item =>
            !sent.includes(item.file.uri) && !rejected.includes(item.file.uri),
        ),
        unknown,
        error:
          failed.length === 0
            ? undefined
            : 'Có ' +
              String(failed.length) +
              ' tệp chưa gửi được: ' +
              failed.join(' · '),
        notice:
          sent.length === 0
            ? undefined
            : 'Đã tải lên ' + String(sent.length) + ' tệp.',
      }));

      uploadLatch.current = false;
      refresh();
    },
    [
      caseId,
      refresh,
      send,
      state.pending,
      state.uploading,
      state.unknown,
      deps.upload,
      deps.enabled,
      accepts,
    ],
  );

  const reconcile = useCallback(
    async (uri: string) => {
      if (
        visibleBinding.current !== currentBinding.current ||
        uploadLatch.current ||
        deps.enabled === false
      )
        return;
      const item = state.unknown?.find(value => value.uri === uri);
      if (!item) return;
      const scope = captureSessionScope();
      const ticket = epoch.current;
      if (!scope.warehouseId)
        throw new AppError({
          kind: 'blocked_by_gate',
          message: 'Chưa xác minh kho upload.',
        });
      uploadLatch.current = true;
      try {
        const result = await reconcileOwnerAttachment(
          'warranty',
          caseId,
          item.key,
          scope.warehouseId,
          item.sha256,
        );
        if (!accepts(scope, ticket)) return;
        if (result.outcome === 'SUCCEEDED' || result.outcome === 'REJECTED') {
          pendingProof.current = pendingProof.current.filter(
            value => value.key !== item.key,
          );
          writeUploadJournal(
            uploadJournalKey(caseId, scope),
            pendingProof.current,
          );
          setState(current => ({
            ...current,
            unknown: (current.unknown ?? []).filter(value => value.uri !== uri),
            pending: current.pending.filter(value => value.file.uri !== uri),
            notice:
              result.outcome === 'SUCCEEDED'
                ? 'Đã đối chiếu upload thành công.'
                : 'Owner đã từ chối upload; không gửi lại tự động.',
          }));
          refresh();
        }
        return result;
      } catch (cause) {
        if (accepts(scope, ticket))
          setState(current => ({
            ...current,
            error: messageForUser(toAppError(cause)),
          }));
        throw cause;
      } finally {
        if (accepts(scope, ticket)) uploadLatch.current = false;
      }
    },
    [caseId, refresh, state.unknown, deps.enabled, accepts],
  );

  const dismissMessages = useCallback(() => {
    setState(current => ({ ...current, error: undefined, notice: undefined }));
  }, []);

  return {
    ...(visibleBinding.current === binding
      ? state
      : {
          uploaded: [],
          pending: [],
          unknown: [],
          loading: true,
          uploading: false,
        }),
    error: journalError.current ?? state.error,
    counts,
    addFromLibrary,
    addFromCamera,
    removePending,
    uploadAll,
    refresh,
    dismissMessages,
    reconcile,
  };
}

export type { AppError };
