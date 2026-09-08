/**
 * Chi tiết chứng từ — ảnh **21, 22** (nhập) và **31, 32, 33** (xuất).
 *
 * 🔴 Màn này lẽ ra phải có từ đầu. Người dùng chỉ ra 2026-09-06: *"bên duyệt
 * không xem được chi tiết phiếu"* — người duyệt được yêu cầu quyết định về một
 * phiếu mà không mở được phiếu ấy ra xem.
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { AppProviders } from '../src/app/App';
import { DocumentDetailScreen } from '../src/features/documents/DocumentDetailScreen';
import { ApprovalsScreen } from '../src/features/approvals/ApprovalsScreen';
import {
  entryLabel,
  extractOutboundEntries,
} from '../src/features/documents/useDocumentDetail';
import { AppError } from '../src/errors/AppError';
import { ManualCodeScreen } from '../src/features/scan/ManualCodeScreen';

// `types: ["jest"]` không kéo theo kiểu Node, mà test cuối đọc mã nguồn thật.
declare const __dirname: string;
import type { InboundDocument, OutboundDocument } from '../src/services/wms/types';

const INBOUND: InboundDocument = {
  id: 'in-1',
  doc_no: 'PN-COV-P00060',
  doc_date: '2026-09-06',
  status: 'WAITING_APPROVAL',
  version: 3,
  expected_total_qty: 8,
  scanned_total_qty: 8,
  ready_for_post: true,
};

const OUTBOUND: OutboundDocument = {
  id: 'out-1',
  doc_no: 'PX-COV-001',
  status: 'POSTED',
  version: 5,
  expected_total_qty: 2,
  scanned_total_qty: 2,
  recipient_name: 'Đại lý Minh Anh',
  recipient_type: 'DEALER',
  recipient_address_snapshot: 'Số 5, Phường Lê Chân, Hải Phòng',
  // SĐT cố ý để trống — ảnh 31 có hàng SĐT rỗng, phải hiện `—`.
  recipient_phone_snapshot: null,
};

async function render(node: React.ReactElement) {
  let tree: ReactTestRenderer.ReactTestRenderer | undefined;
  await ReactTestRenderer.act(async () => {
    tree = ReactTestRenderer.create(<AppProviders>{node}</AppProviders>);
  });
  return {
    text: JSON.stringify(tree?.toJSON()),
    unmount: async () => {
      await ReactTestRenderer.act(() => tree?.unmount());
    },
  };
}

/** Trạng thái `useDocumentDetail` dựng sẵn, khỏi phải giả lập tầng mạng. */
function detailState(over: Record<string, unknown> = {}) {
  return {
    phase: 'ready' as const,
    entries: [],
    reload: () => undefined,
    ...over,
  } as never;
}

// ---------------------------------------------------------------------------

describe('phiếu NHẬP — ảnh 21, 22', () => {
  it('hiện mã phiếu, trạng thái và tiến độ', async () => {
    const view = await render(
      <DocumentDetailScreen
        kind="inbound"
        documentId="in-1"
        detail={detailState({ document: INBOUND })}
      />,
    );
    expect(view.text).toContain('PN-COV-P00060');
    expect(view.text).toContain('PHIẾU NHẬP');
    expect(view.text).toContain('Chờ duyệt');
    expect(view.text).toContain('8/8');
    await view.unmount();
  });

  it('phiếu chờ duyệt nói rõ tồn kho CHƯA tăng', async () => {
    const view = await render(
      <DocumentDetailScreen
        kind="inbound"
        documentId="in-1"
        detail={detailState({ document: INBOUND })}
      />,
    );
    expect(view.text).toContain('Tồn kho chỉ tăng sau khi Post Receipt');
    await view.unmount();
  });

  it('phiếu đã POSTED đổi sang câu đã tăng tồn', async () => {
    const view = await render(
      <DocumentDetailScreen
        kind="inbound"
        documentId="in-1"
        detail={detailState({
          document: { ...INBOUND, status: 'POSTED' },
        })}
      />,
    );
    expect(view.text).toContain('Tồn kho đã tăng');
    await view.unmount();
  });
});

describe('phiếu XUẤT — ảnh 31, 32, 33', () => {
  it('hiện người nhận, nhóm đối tượng và địa chỉ', async () => {
    const view = await render(
      <DocumentDetailScreen
        kind="outbound"
        documentId="out-1"
        detail={detailState({ document: OUTBOUND })}
      />,
    );
    expect(view.text).toContain('Đại lý Minh Anh');
    expect(view.text).toContain('DEALER');
    expect(view.text).toContain('Hải Phòng');
    await view.unmount();
  });

  it('hàng SĐT trống hiện dấu — đúng ảnh 31', async () => {
    const view = await render(
      <DocumentDetailScreen
        kind="outbound"
        documentId="out-1"
        detail={detailState({ document: OUTBOUND })}
      />,
    );
    // `DefinitionRow` dùng EMPTY_VALUE = '—'. Ô trống KHÔNG được biến mất:
    // hàng biến mất trông như phiếu không có trường đó.
    expect(view.text).toContain('Số điện thoại');
    expect(view.text).toContain('—');
    await view.unmount();
  });

  it('phiếu POSTED nói tồn kho đã giảm', async () => {
    const view = await render(
      <DocumentDetailScreen
        kind="outbound"
        documentId="out-1"
        detail={detailState({ document: OUTBOUND })}
      />,
    );
    expect(view.text).toContain('Tồn kho đã giảm');
    await view.unmount();
  });

  it('KHÔNG hiện hàng "Ngày chứng từ" — phiếu xuất không có trường đó', async () => {
    const view = await render(
      <DocumentDetailScreen
        kind="outbound"
        documentId="out-1"
        detail={detailState({ document: OUTBOUND })}
      />,
    );
    expect(view.text).not.toContain('Ngày chứng từ');
    await view.unmount();
  });
});

describe('danh sách mã đã quét', () => {
  const entries = [
    { id: 'e1', item_unique: 'DCST20152-001', sku_name: 'Ống PVC', scanned_at: '07:41' },
    { id: 'e2', serial_number: 'SN-002', sku_code: 'PVC-90' },
  ];

  it('hiện từng mã kèm SKU', async () => {
    const view = await render(
      <DocumentDetailScreen
        kind="inbound"
        documentId="in-1"
        detail={detailState({ document: INBOUND, entries })}
      />,
    );
    expect(view.text).toContain('DCST20152-001');
    expect(view.text).toContain('SN-002');
    expect(view.text).toContain('Ống PVC');
    expect(view.text).toContain('2 mã');
    await view.unmount();
  });

  it('🔒 lỗi tải mã KHÔNG bị nuốt thành danh sách rỗng', async () => {
    // Một phiếu 8 mã mà hiện "0 mã" trông y hệt phiếu chưa quét gì — người
    // duyệt sẽ từ chối nhầm. Phải nói rõ là CHƯA BIẾT.
    const view = await render(
      <DocumentDetailScreen
        kind="inbound"
        documentId="in-1"
        detail={detailState({
          document: INBOUND,
          entries: [],
          entriesError: new AppError({ kind: 'network', message: 'mất mạng' }),
        })}
      />,
    );
    expect(view.text).toContain('Không tải được danh sách mã');
    expect(view.text).toContain('không duyệt khi chưa xem được');
    expect(view.text).not.toContain('Phiếu chưa có mã nào');
    await view.unmount();
  });

  it('rỗng THẬT thì nói rõ là đã tải và thực sự rỗng', async () => {
    const view = await render(
      <DocumentDetailScreen
        kind="inbound"
        documentId="in-1"
        detail={detailState({ document: INBOUND, entries: [] })}
      />,
    );
    expect(view.text).toContain('thực sự rỗng');
    await view.unmount();
  });

  it('lỗi tải PHIẾU thì hiện lỗi, không hiện màn trống', async () => {
    const view = await render(
      <DocumentDetailScreen
        kind="inbound"
        documentId="in-1"
        detail={detailState({
          phase: 'error',
          document: undefined,
          error: new AppError({ kind: 'http', status: 404, message: 'Không thấy' }),
        })}
      />,
    );
    expect(view.text).toContain('Không tải được phiếu');
    await view.unmount();
  });
});

describe('bóc mã của phiếu xuất', () => {
  it('đọc cả item_matches lẫn matches', () => {
    // Mini App đang chạy gộp cả hai — dấu hiệu backend trả lúc trường này lúc
    // trường kia.
    const merged = extractOutboundEntries({
      ...OUTBOUND,
      item_matches: [{ id: 'a' }],
      matches: [{ id: 'b' }],
    } as never);
    expect(merged.map(entry => entry.id)).toEqual(['a', 'b']);
  });

  it('không có trường nào thì trả mảng rỗng, không ném', () => {
    expect(extractOutboundEntries(OUTBOUND)).toEqual([]);
    expect(extractOutboundEntries(undefined)).toEqual([]);
  });

  it('nhãn mã thử lần lượt các trường backend có thể trả', () => {
    expect(entryLabel({ item_unique: 'A', serial_number: 'B' })).toBe('A');
    expect(entryLabel({ serial_number: 'B', raw_code: 'C' })).toBe('B');
    expect(entryLabel({ raw_code: 'C' })).toBe('C');
    expect(entryLabel({})).toContain('không đọc được');
  });
});

// ---------------------------------------------------------------------------

describe('🔴 màn Duyệt phải mở được chi tiết', () => {
  async function renderApprovals(onOpen?: (k: string, id: string) => void) {
    return render(
      <ApprovalsScreen
        fetchInbound={async () => ({ items: [INBOUND] })}
        fetchOutbound={async () => ({ items: [] })}
        onOpenDocument={onOpen as never}
      />,
    );
  }

  it('thẻ phiếu có nhãn trợ năng nói rõ là bấm được', async () => {
    const view = await renderApprovals(() => undefined);
    expect(view.text).toContain('Mở chi tiết');
    await view.unmount();
  });

  it('không truyền onOpenDocument thì KHÔNG hứa bấm được', async () => {
    const view = await renderApprovals(undefined);
    expect(view.text).not.toContain('Mở chi tiết');
    await view.unmount();
  });

  it('có nhãn trợ năng nêu đúng mã phiếu', async () => {
    const view = await renderApprovals(() => undefined);
    expect(view.text).toContain('Mở chi tiết PN-COV-P00060');
    await view.unmount();
  });
});

// ---------------------------------------------------------------------------
// Ảnh 15 — nhập mã thủ công, màn riêng
// ---------------------------------------------------------------------------

describe('ảnh 15 — nhập mã thủ công màn riêng', () => {
  it('có ô Ghi chú — đó là điểm khác bản modal ảnh 14', async () => {
    const view = await render(
      <ManualCodeScreen onCancel={() => undefined} onSubmit={() => undefined} />,
    );
    expect(view.text).toContain('Mã QR/Barcode*');
    expect(view.text).toContain('Ghi chú');
    await view.unmount();
  });

  it('hai nút đúng ảnh: Huỷ / Xác nhận', async () => {
    const view = await render(
      <ManualCodeScreen onCancel={() => undefined} onSubmit={() => undefined} />,
    );
    expect(view.text).toContain('Huỷ');
    expect(view.text).toContain('Xác nhận');
    // Bản modal dùng nhãn "Kiểm tra mã" — không lẫn hai màn.
    expect(view.text).not.toContain('Kiểm tra mã');
    await view.unmount();
  });

  it('mã rỗng thì KHÔNG gọi onSubmit', async () => {
    let called = false;
    let tree: ReactTestRenderer.ReactTestRenderer | undefined;
    await ReactTestRenderer.act(async () => {
      tree = ReactTestRenderer.create(
        <AppProviders>
          <ManualCodeScreen
            onCancel={() => undefined}
            onSubmit={() => {
              called = true;
            }}
          />
        </AppProviders>,
      );
    });
    // Không gõ gì rồi bấm Xác nhận. Tìm theo prop `label` — `JSON.stringify`
    // trên props của một node RN sẽ vỡ vì cấu trúc vòng.
    const confirm = tree?.root.findAll(
      node =>
        typeof node.props.onPress === 'function' &&
        node.props.label === 'Xác nhận',
    );
    expect(confirm?.length).toBeGreaterThan(0);
    await ReactTestRenderer.act(async () => {
      confirm?.forEach(node => node.props.onPress());
    });
    expect(called).toBe(false);
    await ReactTestRenderer.act(() => tree?.unmount());
  });

  it('đọc thử mã ngay để người dùng thấy máy hiểu ra sao', async () => {
    // Gõ nhầm một ký tự trong chuỗi dài rất khó tự phát hiện — hiện SKU/ITEM
    // máy đọc được TRƯỚC khi xác nhận là cách rẻ nhất để bắt lỗi đó.
    const source = require('fs').readFileSync(
      require('path').join(
        __dirname,
        '..',
        'src',
        'features',
        'scan',
        'ManualCodeScreen.tsx',
      ),
      'utf8',
    );
    expect(source).toContain('MÁY ĐỌC ĐƯỢC');
    expect(source).toContain('parseScanPayload');
  });
});
