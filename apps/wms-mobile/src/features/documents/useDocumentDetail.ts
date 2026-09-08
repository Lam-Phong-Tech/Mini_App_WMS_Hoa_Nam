/**
 * Nạp chi tiết một chứng từ — dùng chung cho phiếu nhập và phiếu xuất.
 *
 * 🎨 Nguồn: ảnh **21, 22** (phiếu nhập) và **31, 32, 33** (phiếu xuất).
 *
 * ## 🔴 Vì sao có tệp này
 *
 * Người dùng chỉ ra 2026-09-06: *"bên duyệt không xem được chi tiết phiếu"*.
 * Đúng — màn Duyệt chỉ vẽ thẻ tóm tắt, không có đường vào chi tiết. Với người
 * duyệt thì đó là thiếu sót nghiêm trọng: họ được yêu cầu **duyệt** một phiếu
 * mà không xem được phiếu ấy có gì.
 *
 * ## Hai luồng lấy mã ở HAI chỗ khác nhau
 *
 * | Luồng | Mã đã quét nằm ở |
 * |---|---|
 * | Nhập | endpoint riêng `{id}/scan-entries?status=ACTIVE&per_page=200` |
 * | Xuất | ngay trong chi tiết: `item_matches` hoặc `matches` |
 *
 * Không gộp thành một đường gọi. Gộp thì một trong hai luồng sẽ gọi một
 * endpoint không tồn tại — và lỗi đó chỉ lộ ra khi mở đúng loại phiếu ấy.
 *
 * ## Lỗi tải KHÔNG bị nuốt thành danh sách rỗng
 *
 * Cùng nguyên tắc đã áp cho timeline bảo hành: một phiếu 8 mã mà hiện "0 mã"
 * trông y hệt phiếu chưa quét gì. Người duyệt sẽ từ chối nhầm.
 */

import { useCallback, useEffect, useState } from 'react';
import { toAppError, type AppError } from '../../errors/AppError';
import {
  fetchInboundDocument,
  fetchInboundScanEntries,
  fetchOutboundDocument,
} from '../../services/wms/queries';
import type {
  InboundDocument,
  OutboundDocument,
  ScanEntry,
} from '../../services/wms/types';

export type DocumentKind = 'inbound' | 'outbound';

export type AnyDocument = InboundDocument | OutboundDocument;

export interface DocumentDetailState {
  readonly phase: 'loading' | 'ready' | 'error';
  readonly document?: AnyDocument;
  readonly entries: readonly ScanEntry[];
  /** Lỗi khi tải **danh sách mã** — tách khỏi lỗi tải phiếu. */
  readonly entriesError?: AppError;
  readonly error?: AppError;
}

/**
 * Bóc danh sách mã từ chi tiết phiếu **xuất**.
 *
 * Đọc cả `item_matches` lẫn `matches` vì Mini App đang chạy gộp cả hai
 * (`OutboundDocumentDetailPage/index.tsx:359-361`) — dấu hiệu cho thấy chính
 * backend cũng trả lúc trường này lúc trường kia.
 */
export function extractOutboundEntries(
  document: AnyDocument | undefined,
): readonly ScanEntry[] {
  if (document === undefined) {
    return [];
  }
  const source = document as {
    item_matches?: readonly ScanEntry[];
    matches?: readonly ScanEntry[];
  };
  return [...(source.item_matches ?? []), ...(source.matches ?? [])];
}

export interface UseDocumentDetailDeps {
  readonly loadInbound?: typeof fetchInboundDocument;
  readonly loadOutbound?: typeof fetchOutboundDocument;
  readonly loadEntries?: typeof fetchInboundScanEntries;
}

export function useDocumentDetail(
  kind: DocumentKind,
  documentId: string,
  deps: UseDocumentDetailDeps = {},
): DocumentDetailState & { reload: () => void } {
  const loadInbound = deps.loadInbound ?? fetchInboundDocument;
  const loadOutbound = deps.loadOutbound ?? fetchOutboundDocument;
  const loadEntries = deps.loadEntries ?? fetchInboundScanEntries;

  const [state, setState] = useState<DocumentDetailState>({
    phase: 'loading',
    entries: [],
  });

  const run = useCallback(async () => {
    setState({ phase: 'loading', entries: [] });
    try {
      const document =
        kind === 'inbound'
          ? await loadInbound(documentId)
          : await loadOutbound(documentId);

      if (kind === 'outbound') {
        // Mã nằm sẵn trong chi tiết — không có lời gọi thứ hai để mà hỏng.
        setState({
          phase: 'ready',
          document,
          entries: extractOutboundEntries(document),
        });
        return;
      }

      // Luồng nhập: một lời gọi nữa. Hỏng phần này KHÔNG được làm hỏng cả màn —
      // phiếu vẫn xem được, chỉ là chưa có danh sách mã, và nói rõ điều đó.
      try {
        const page = await loadEntries(documentId);
        setState({ phase: 'ready', document, entries: page.items });
      } catch (cause) {
        setState({
          phase: 'ready',
          document,
          entries: [],
          entriesError: toAppError(cause),
        });
      }
    } catch (cause) {
      setState({ phase: 'error', entries: [], error: toAppError(cause) });
    }
  }, [documentId, kind, loadEntries, loadInbound, loadOutbound]);

  useEffect(() => {
    run().catch(() => undefined);
  }, [run]);

  const reload = useCallback(() => {
    run().catch(() => undefined);
  }, [run]);

  return { ...state, reload };
}

/** Nhãn hiển thị của một mã đã quét. Thử lần lượt các trường backend có thể trả. */
export function entryLabel(entry: ScanEntry): string {
  return (
    entry.item_unique ??
    entry.serial_number ??
    entry.code_value ??
    entry.raw_code ??
    entry.id ??
    '(không đọc được mã)'
  );
}
