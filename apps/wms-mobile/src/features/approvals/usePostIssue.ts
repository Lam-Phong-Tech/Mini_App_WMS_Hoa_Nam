/**
 * Duyệt phiếu **xuất** — Post Issue, kể cả hàng loạt.
 *
 * 🔓 `GATE_WMS §2h` — người dùng duyệt F ngày 2026-09-06.
 *
 * ## Quy trình lấy đúng từ mô tả luồng xuất (2026-09-06)
 *
 * > *"app xử lý tuần tự từng phiếu: 1. `GET /outbound-documents/{id}` để lấy
 * > ETag mới. 2. `POST /outbound-documents/{id}/post-issue`. Có kết quả một
 * > phần: phiếu thành công được duyệt, phiếu lỗi vẫn giữ lại để thử lại."*
 *
 * ## Vì sao đọc lại phiếu trước mỗi lần Post
 *
 * `version` trong danh sách là ảnh chụp lúc tải. Giữa lúc tải và lúc bấm duyệt
 * có thể ai đó đã sửa phiếu — và với optimistic locking, gửi version cũ thì
 * hoặc bị `412` (mất công), hoặc tệ hơn nếu máy chủ dễ dãi: **ghi đè mất thay
 * đổi của người khác**. Một request đọc thêm rẻ hơn nhiều so với việc đó.
 *
 * ## Vì sao TUẦN TỰ chứ không song song
 *
 * Mỗi lần Post là một lệnh **giảm tồn kho**. Bắn 20 lệnh cùng lúc thì khi có
 * sự cố giữa chừng, không ai nói được cái nào đã đi và cái nào chưa. Tuần tự
 * thì trạng thái luôn đọc được: đã xong tới phiếu thứ n.
 *
 * Chậm hơn, và đó là đánh đổi đúng ở chỗ này.
 *
 * ## Kết quả một phần là trạng thái hợp lệ, không phải lỗi
 *
 * Duyệt 10 phiếu mà 2 hỏng thì **8 phiếu kia đã thật sự được duyệt** — tồn kho
 * đã giảm. Coi cả mẻ là "thất bại" rồi cho bấm lại sẽ khiến 8 phiếu đó được
 * gửi lần hai. Chúng không nhân đôi nhờ `Idempotency-Key`, nhưng thủ kho vẫn
 * mất niềm tin vào con số họ đang nhìn.
 */

import { useCallback, useRef, useState } from 'react';
import { toAppError } from '../../errors/AppError';
import { postIssue } from '../../services/wms/outboundWrite';
import { fetchOutboundDocument } from '../../services/wms/queries';
import type { OutboundDocument } from '../../services/wms/types';

/** Tiền tố cho biết khoá do app này sinh, giúp tra cứu phía máy chủ. */
export const POST_ISSUE_KEY_PREFIX = 'wmshn-postissue-';

/**
 * Khoá idempotency của một phiếu. **Suy thẳng từ mã phiếu** — cùng phiếu thì
 * cùng khoá, qua mọi lần bấm lại và cả sau khi khởi động lại app.
 *
 * ⚠️ Client Mini App đang chạy rơi về `generateClientScanId()` khi không được
 * truyền khoá (`scan.service.ts:1748`) — mỗi lần thử lại một khoá mới, đúng thứ
 * người dùng cấm ngày 2026-09-05.
 */
export function postIssueIdempotencyKey(documentId: string): string {
  return (POST_ISSUE_KEY_PREFIX + documentId).slice(0, 100);
}

/**
 * Phiếu này có Post được không.
 *
 * `ready_for_issue` do **máy chủ tính**. Client không tự suy từ
 * `scanned_total_qty >= expected_total_qty`: điều kiện đủ để xuất còn phụ thuộc
 * những thứ client không thấy (giữ chỗ tồn, quyền, trạng thái từng item).
 */
export function canPostIssue(document: OutboundDocument): boolean {
  return document.ready_for_issue === true;
}

/** Vì sao chưa Post được — để hiện thay cho một nút mờ câm lặng. */
export function issueBlockedReason(
  document: OutboundDocument,
): string | undefined {
  if (canPostIssue(document)) {
    return undefined;
  }
  const scanned = document.scanned_total_qty ?? 0;
  const expected = document.expected_total_qty ?? 0;
  if (expected > 0 && scanned < expected) {
    return (
      'Còn thiếu ' +
      String(expected - scanned) +
      ' mã chưa quét. WMS chỉ cho Post Issue khi phiếu đã quét đủ.'
    );
  }
  return 'WMS chưa đánh dấu phiếu này sẵn sàng Post Issue.';
}

export interface PostIssueOutcome {
  readonly documentId: string;
  readonly docNo?: string;
  readonly ok: boolean;
  readonly reason?: string;
}

export interface PostIssueState {
  /** Các phiếu người dùng đã tick. */
  readonly selected: readonly string[];
  /** Đang chờ người dùng xác nhận mẻ này. */
  readonly confirming: boolean;
  /** Mã phiếu đang xử lý — để hiện tiến độ tuần tự. */
  readonly running?: string;
  /** Đã xử lý xong bao nhiêu trong mẻ. */
  readonly done: number;
  readonly total: number;
  /** Kết quả từng phiếu của mẻ gần nhất. */
  readonly outcomes: readonly PostIssueOutcome[];
}

export interface UsePostIssueDeps {
  readonly post?: typeof postIssue;
  readonly fetchDocument?: typeof fetchOutboundDocument;
  /** Gọi sau khi cả mẻ chạy xong, để màn nạp lại danh sách. */
  readonly onFinished?: (outcomes: readonly PostIssueOutcome[]) => void;
}

const IDLE: PostIssueState = {
  selected: [],
  confirming: false,
  done: 0,
  total: 0,
  outcomes: [],
};

export function usePostIssue(deps: UsePostIssueDeps = {}) {
  const submit = deps.post ?? postIssue;
  const readDocument = deps.fetchDocument ?? fetchOutboundDocument;
  const [state, setState] = useState<PostIssueState>(IDLE);
  const issuingRef = useRef(false);

  const toggle = useCallback((documentId: string) => {
    setState(current => ({
      ...current,
      selected: current.selected.includes(documentId)
        ? current.selected.filter(id => id !== documentId)
        : [...current.selected, documentId],
      outcomes: [],
    }));
  }, []);

  /** *"Chọn tất cả phiếu sẵn sàng"* — chỉ phiếu máy chủ nói là Post được. */
  const selectAllReady = useCallback((documents: readonly OutboundDocument[]) => {
    const ready = documents.filter(canPostIssue).map(document => document.id);
    setState(current => ({
      ...current,
      // Bấm lần hai khi đã chọn hết thì bỏ chọn hết — cùng một nút, hai chiều.
      selected: current.selected.length === ready.length ? [] : ready,
      outcomes: [],
    }));
  }, []);

  const ask = useCallback(() => {
    setState(current =>
      current.selected.length === 0
        ? current
        : { ...current, confirming: true },
    );
  }, []);

  const cancel = useCallback(() => {
    setState(current => ({ ...current, confirming: false }));
  }, []);

  const confirm = useCallback(async () => {
    // 🔧 Đọc danh sách chọn từ `state`, KHÔNG từ trong một `setState` updater.
    //
    // Bản đầu lấy `queue` bằng cách gán trong updater rồi dùng ngay sau đó —
    // sai, vì React không chạy updater đồng bộ tại chỗ gọi. Hàng đợi luôn rỗng
    // và **không phiếu nào được gửi**, trong khi giao diện vẫn báo đã xong.
    // Loại lỗi im lặng đúng nghĩa: không exception, không log, chỉ là không có
    // gì xảy ra.
    const queue = state.selected;
    if (queue.length === 0 || issuingRef.current) {
      return;
    }
    issuingRef.current = true;

    setState(current => ({
      ...current,
      confirming: false,
      done: 0,
      total: queue.length,
      outcomes: [],
    }));

    try {
      const outcomes: PostIssueOutcome[] = [];

      // TUẦN TỰ — xem chú thích đầu tệp.
      for (const documentId of queue) {
        setState(current => ({ ...current, running: documentId }));
        try {
          // Bước 1: đọc lại phiếu để có `version` mới nhất.
          const fresh = await readDocument(documentId);
          // Bước 2: Post Issue. `postIssue` tự kiểm tier ngay trước khi gửi.
          const issued = await submit(
            { documentId, version: fresh.version ?? '' },
            postIssueIdempotencyKey(documentId),
          );
          outcomes.push({
            documentId,
            docNo: issued.doc_no ?? fresh.doc_no,
            ok: true,
          });
        } catch (cause) {
          // Phiếu lỗi **giữ lại để thử lại** — không bỏ qua, không dừng cả mẻ.
          outcomes.push({
            documentId,
            ok: false,
            reason: toAppError(cause).message,
          });
        }
        setState(current => ({ ...current, done: current.done + 1 }));
      }

      const failed = outcomes.filter(outcome => !outcome.ok).map(o => o.documentId);
      setState(current => ({
        ...current,
        running: undefined,
        outcomes,
        // Giữ lại đúng những phiếu lỗi trong ô chọn: bấm duyệt lần nữa là thử lại
        // đúng chúng, không đụng tới phiếu đã xuất xong.
        selected: failed,
      }));
      deps.onFinished?.(outcomes);
    } finally {
      issuingRef.current = false;
    }
  }, [deps, readDocument, state.selected, submit]);

  const dismissOutcomes = useCallback(() => {
    setState(current => ({ ...current, outcomes: [] }));
  }, []);

  return {
    ...state,
    toggle,
    selectAllReady,
    ask,
    cancel,
    confirm,
    dismissOutcomes,
  };
}

/** Tóm tắt kết quả một mẻ, để hiện một dòng cho thủ kho. */
export function summariseOutcomes(
  outcomes: readonly PostIssueOutcome[],
): string {
  const ok = outcomes.filter(outcome => outcome.ok).length;
  const failed = outcomes.length - ok;
  if (failed === 0) {
    return 'Đã xuất kho ' + String(ok) + ' phiếu.';
  }
  if (ok === 0) {
    return 'Không phiếu nào xuất được (' + String(failed) + ' lỗi).';
  }
  // Nói RÕ cả hai con số: "8 xong, 2 lỗi" khác hẳn "có lỗi xảy ra" — tồn kho
  // của 8 phiếu kia đã giảm thật rồi.
  return (
    'Đã xuất kho ' +
    String(ok) +
    ' phiếu, ' +
    String(failed) +
    ' phiếu lỗi và vẫn đang chờ.'
  );
}
