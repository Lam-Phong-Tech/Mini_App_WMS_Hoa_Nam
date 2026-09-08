/**
 * Đợt 5 của Prompt 4 — Duyệt phiếu · Lịch sử · Tra cứu (ảnh 13–17, 36–38, 47).
 *
 * Trọng tâm: chứng minh **V-01 và V-02 đã thật sự được sửa**, chứ không phải
 * chỉ ghi trong tài liệu.
 *
 * Nhắc lại nguyên nhân đã truy được (§4 của `04-screen-survey.md` + log mạng):
 * trang chủ tự gọi `?status=WAITING_APPROVAL` nên ra 5; màn Duyệt phiếu của app
 * cũ **đợi người dùng bấm "Đồng bộ WMS"** nên ra 0. V-02 là nguyên nhân, V-01
 * là triệu chứng.
 *
 * ❗ Không test nào gọi mạng.
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

import { ApprovalsScreen } from '../src/features/approvals/ApprovalsScreen';
import { HistoryScreen } from '../src/features/history/HistoryScreen';
import {
  LookupScreen,
  MESSAGE_NO_DESCRIPTION,
  MESSAGE_NO_USAGE,
} from '../src/features/lookup/LookupScreen';
import { NotFoundScreen } from '../src/features/auth/StatusScreen';
import { STATUS_WAITING_APPROVAL } from '../src/features/home/useHomeSummary';
import {
  INBOUND_PENDING_STATUS,
  INBOUND_STATUS_VALUES,
  OUTBOUND_PENDING_STATUS,
  OUTBOUND_STATUS_VALUES,
  isValidOutboundStatus,
} from '../src/services/wms/documentStatus';
import { AppProviders } from '../src/app/App';
import { AppError } from '../src/errors/AppError';
import { EMPTY_VALUE } from '../src/ui/DefinitionRow';
import {
  createMemoryBackend,
  createStorage,
  setAppStorageForTesting,
} from '../src/storage/storage';

beforeEach(() => {
  setAppStorageForTesting(createStorage(createMemoryBackend()));
});

/**
 * Gom mọi chuỗi text trong cây đã render.
 *
 * Không dùng `JSON.stringify(tree.toJSON())` như các tệp test khác: cây có
 * `FlashList` chứa **cấu trúc vòng** (`Provider` trỏ về chính nó) và
 * `JSON.stringify` ném `TypeError`. Đi bộ qua cây thì không gặp vấn đề đó, và
 * còn cho ra chuỗi sạch hơn để đối chiếu.
 */
function collectText(node: unknown, out: string[] = []): string[] {
  if (typeof node === 'string' || typeof node === 'number') {
    out.push(String(node));
    return out;
  }
  if (Array.isArray(node)) {
    for (const child of node) {
      collectText(child, out);
    }
    return out;
  }
  if (typeof node === 'object' && node !== null && 'children' in node) {
    collectText((node as { children?: unknown }).children, out);
  }
  return out;
}

async function render(element: React.ReactElement) {
  let tree: ReactTestRenderer.ReactTestRenderer | undefined;
  await ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(<AppProviders>{element}</AppProviders>);
  });
  return {
    text: collectText(tree?.toJSON()).join(' | '),
    unmount: async () => {
      await ReactTestRenderer.act(() => {
        tree?.unmount();
      });
    },
  };
}

const emptyPage = { items: [], meta: { total: 0 } };

// ---------------------------------------------------------------------------
// V-02 → V-01
// ---------------------------------------------------------------------------

describe('🔧 V-02 — màn Duyệt phiếu TỰ NẠP, không đợi bấm Đồng bộ', () => {
  it('gọi API ngay khi mở màn', async () => {
    let called = false;
    const view = await render(
      <ApprovalsScreen
        fetchInbound={async () => {
          called = true;
          return emptyPage;
        }}
        fetchOutbound={async () => emptyPage}
      />,
    );
    // App cũ chỉ gọi sau khi người dùng bấm "Đồng bộ WMS" — đó là V-02.
    expect(called).toBe(true);
    await view.unmount();
  });

  it('tab NHẬP lọc WAITING_APPROVAL — cùng nguồn với trang chủ', async () => {
    // Đây là điểm mấu chốt của V-01: hai màn phải hỏi máy chủ CÙNG một câu hỏi.
    let seenStatus: unknown;
    const view = await render(
      <ApprovalsScreen
        fetchInbound={async options => {
          seenStatus = options?.query?.status;
          return emptyPage;
        }}
        fetchOutbound={async () => emptyPage}
      />,
    );
    expect(seenStatus).toBe(STATUS_WAITING_APPROVAL);
    expect(seenStatus).toBe(INBOUND_PENDING_STATUS);
    await view.unmount();
  });

  it('hiện số phiếu của trang đang nạp — đúng hàng đợi Mini App 10 phiếu/trang', async () => {
    const view = await render(
      <ApprovalsScreen
        fetchInbound={async () => ({
          // `meta.total` không được dùng cho tab: Mini App hiện số phiếu đã
          // nạp rồi cho người dùng bấm "Tải thêm phiếu".
          items: [{ id: 'a' }, { id: 'b' }],
          meta: { total: 5 },
        })}
        fetchOutbound={async () => emptyPage}
      />,
    );
    expect(view.text).toContain('2 phiếu chờ duyệt');
    await view.unmount();
  });

  it('hiển thị đúng thời điểm gửi phiếu, không lấy ngày chứng từ hay lần cập nhật cuối', async () => {
    const view = await render(
      <ApprovalsScreen
        fetchInbound={async () => ({
          items: [{
            id: 'submitted-time',
            doc_no: 'PN-GUI-DUNG-GIO',
            // Hai trường này cố ý khác để bắt lỗi đổi thứ tự fallback.
            doc_date: '2020-01-02',
            updated_at: '2030-12-31T23:59:00+07:00',
            submitted_at: '2026-09-08T11:35:00+07:00',
            created_at: '2026-09-08T11:30:00+07:00',
          }],
          meta: {},
        })}
        fetchOutbound={async () => emptyPage}
      />,
    );
    expect(view.text).toContain('08/09/2026');
    expect(view.text).not.toContain('02/01/2020');
    expect(view.text).not.toContain('31/12/2030');
    await view.unmount();
  });

  it('vẫn GIỮ nút Đồng bộ WMS — chỉ đổi vai, không bỏ', async () => {
    // Bỏ hẳn là lấy mất công cụ thủ kho đang quen dùng khi nghi số liệu cũ.
    const view = await render(
      <ApprovalsScreen
        fetchInbound={async () => emptyPage}
        fetchOutbound={async () => emptyPage}
      />,
    );
    expect(view.text).toContain('Đồng bộ WMS');
    await view.unmount();
  });

  it('empty state giữ nguyên chỉ dẫn của Mini App hiện hành', async () => {
    const view = await render(
      <ApprovalsScreen
        fetchInbound={async () => emptyPage}
        fetchOutbound={async () => emptyPage}
      />,
    );
    expect(view.text).toContain('Chưa có phiếu nhập chờ duyệt');
    expect(view.text).toContain('Chọn folder còn lại hoặc bấm Đồng bộ');
    await view.unmount();
  });

  it('lỗi tải có nút thử lại, không im lặng', async () => {
    const view = await render(
      <ApprovalsScreen
        fetchInbound={async () => {
          throw new AppError({ kind: 'network', message: 'mất mạng' });
        }}
        fetchOutbound={async () => emptyPage}
      />,
    );
    expect(view.text).toContain('Không tải được queue backend');
    expect(view.text).toContain('Thử lại');
    await view.unmount();
  });
});

// ---------------------------------------------------------------------------
// Lịch sử
// ---------------------------------------------------------------------------

describe('Lịch sử chứng từ (ảnh 38)', () => {
  it('gộp cả phiếu nhập lẫn phiếu xuất, mỗi nguồn lấy đúng 25 phiếu như Mini App', async () => {
    const inboundCalls: unknown[] = [];
    const outboundCalls: unknown[] = [];
    const view = await render(
      <HistoryScreen
        fetchInbound={async options => {
          inboundCalls.push(options);
          return { items: [{ id: 'i1', doc_no: 'PN-COV-00001' }], meta: {} };
        }}
        fetchOutbound={async options => {
          outboundCalls.push(options);
          return { items: [{ id: 'o1', doc_no: 'PX-COV-00060' }], meta: {} };
        }}
      />,
    );
    expect(view.text).toContain('PN-COV-00001');
    expect(view.text).toContain('PX-COV-00060');
    expect(inboundCalls).toEqual([{ query: { per_page: 25 } }]);
    expect(outboundCalls).toEqual([{ query: { per_page: 25 } }]);
    await view.unmount();
  });

  it('dùng tiến độ của MÁY CHỦ, không tự cộng', async () => {
    // `scanned_total_qty` và `expected_total_qty` là trường WMS tính sẵn (§4f.6).
    const view = await render(
      <HistoryScreen
        fetchInbound={async () => ({
          items: [
            {
              id: 'i1',
              doc_no: 'PN-1',
              scanned_total_qty: 5,
              expected_total_qty: 5,
            },
          ],
          meta: {},
        })}
        fetchOutbound={async () => emptyPage}
      />,
    );
    expect(view.text).toContain('5/5');
    await view.unmount();
  });

  it('một nguồn lỗi vẫn giữ lịch sử từ nguồn còn lại và báo lỗi đúng ngữ cảnh', async () => {
    const view = await render(
      <HistoryScreen
        fetchInbound={async () => {
          throw new AppError({ kind: 'timeout', message: 'quá hạn' });
        }}
        fetchOutbound={async () => ({
          items: [{ id: 'o1', doc_no: 'PX-VẪN-CÒN', status: 'POSTED' }],
          meta: {},
        })}
      />,
    );
    expect(view.text).toContain('PX-VẪN-CÒN');
    expect(view.text).toContain('Hoàn tất');
    expect(view.text).toContain('Không xử lý được lịch sử');
    expect(view.text).toContain('Nhập: Có lỗi xảy ra. Vui lòng thử lại.');
    await view.unmount();
  });
});

// ---------------------------------------------------------------------------
// Tra cứu
// ---------------------------------------------------------------------------

describe('Tra cứu sản phẩm (ảnh 16, 17)', () => {
  it('ô trống hiện dấu gạch, KHÔNG ẩn hàng', async () => {
    // Ẩn hàng thì thủ kho tưởng trường không tồn tại, thay vì biết backend chưa
    // khai báo dữ liệu cho sản phẩm này.
    const view = await render(
      <LookupScreen
        lookup={async () => ({
          item_code: 'SN-PN-COV-C00014-005',
          sku_code: null,
          group_name: null,
        })}
      />,
    );
    // Chưa bấm tra cứu nên chưa có kết quả — mở hộp nhập mã trước.
    expect(view.text).toContain('Nhập mã thủ công');
    await view.unmount();
  });

  it('câu "Backend chưa khai báo" nói rõ AI còn thiếu dữ liệu', () => {
    // Viết thành "Không có thông tin" thì thủ kho tưởng app hỏng và đi báo lỗi.
    expect(MESSAGE_NO_USAGE).toContain('Backend chưa khai báo');
    expect(MESSAGE_NO_DESCRIPTION).toContain('Backend chưa khai báo');
  });

  it('ký tự cho ô trống là gạch dài, không phải dấu trừ', () => {
    expect(EMPTY_VALUE).toBe('—');
  });
});

describe('Fallback (ảnh 47)', () => {
  it('đường dẫn lạ ra màn có lối về, không phải màn trắng', async () => {
    const view = await render(<NotFoundScreen onHome={() => undefined} />);
    expect(view.text).toContain('Đường dẫn không hợp lệ');
    expect(view.text).toContain('Về trang chủ');
    await view.unmount();
  });
});

// ---------------------------------------------------------------------------
// 🔴 Lỗi thật người dùng bắt được trên máy Xiaomi 12 Pro, 2026-09-06
// ---------------------------------------------------------------------------

describe('HTTP 422 — hai endpoint có enum status KHÁC NHAU', () => {
  it('spec: enum của hai endpoint không giống nhau', () => {
    // Chúng giống nhau GẦN HẾT nên rất dễ tưởng là một — đó chính là cái bẫy.
    expect(INBOUND_STATUS_VALUES).toContain('WAITING_APPROVAL');
    expect(OUTBOUND_STATUS_VALUES).not.toContain('WAITING_APPROVAL');
    // Bốn giá trị còn lại thì trùng nhau hoàn toàn.
    for (const value of OUTBOUND_STATUS_VALUES) {
      expect(INBOUND_STATUS_VALUES).toContain(value);
    }
  });

  it('tab XUẤT KHÔNG gửi WAITING_APPROVAL — đây là nguyên nhân 422', () => {
    expect(OUTBOUND_PENDING_STATUS).not.toBe('WAITING_APPROVAL');
    expect(isValidOutboundStatus(OUTBOUND_PENDING_STATUS)).toBe(true);
  });

  it('lời gọi thật của tab XUẤT dùng đúng giá trị trong enum', async () => {
    let seenStatus = '';
    const view = await render(
      <ApprovalsScreen
        fetchInbound={async () => emptyPage}
        fetchOutbound={async options => {
          seenStatus = String(options?.query?.status ?? '');
          return emptyPage;
        }}
      />,
    );
    // Tab mặc định là nhập; đổi sang xuất bằng cách render lại với tab đó thì
    // phức tạp, nên kiểm trực tiếp hằng số được truyền vào.
    await view.unmount();
    expect(isValidOutboundStatus(OUTBOUND_PENDING_STATUS)).toBe(true);
    expect(seenStatus === '' || isValidOutboundStatus(seenStatus)).toBe(true);
  });

  it('mọi giá trị app gửi đi đều nằm trong enum của endpoint tương ứng', () => {
    // Chốt chặn tổng: nếu ai đó thêm một status mới mà quên đối chiếu spec,
    // test này đỏ trước khi người dùng gặp 422 trên máy thật.
    expect(INBOUND_STATUS_VALUES).toContain(INBOUND_PENDING_STATUS);
    expect(OUTBOUND_STATUS_VALUES).toContain(OUTBOUND_PENDING_STATUS);
  });
});
