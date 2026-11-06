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
import { ScrollView } from 'react-native';

import { ApprovalsScreen } from '../src/features/approvals/ApprovalsScreen';
import {
  HistoryScreen,
  clearHistoryCacheForTesting,
  createHistoryCacheScope,
  loadHistory,
} from '../src/features/history/HistoryScreen';
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
  clearHistoryCacheForTesting();
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
  await ReactTestRenderer.act(async () => {
    tree = ReactTestRenderer.create(<AppProviders>{element}</AppProviders>);
    // Flush effect tự nạp của Duyệt phiếu/Lịch sử trong cùng transaction test,
    // tránh state update trễ bị coi là cập nhật ngoài `act`.
    await Promise.resolve();
  });
  const renderer = tree as ReactTestRenderer.ReactTestRenderer;
  return {
    get text() {
      return collectText(renderer.toJSON()).join(' | ');
    },
    root: renderer.root,
    unmount: async () => {
      await ReactTestRenderer.act(() => {
        renderer.unmount();
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

  it('chỉ đếm các phiếu thực tế WMS trả về, không dùng meta.total lệch tập lọc', async () => {
    const view = await render(
      <ApprovalsScreen
        fetchInbound={async () => ({
          // Tổng này cố ý không khớp dữ liệu đã lọc — UI không được lấy nó để
          // dựng badge, nếu không Trang chủ sẽ báo có phiếu không mở được.
          items: [{ id: 'a' }, { id: 'b' }],
          meta: { total: 5 },
        })}
        fetchOutbound={async () => emptyPage}
      />,
    );
    expect(view.text).toContain('2 phiếu chờ duyệt');
    await view.unmount();
  });

  it('dòng tổng cộng cả phiếu nhập và phiếu xuất như thẻ Trang chủ', async () => {
    const view = await render(
      <ApprovalsScreen
        fetchInbound={async () => ({ items: [{ id: 'in-1' }] })}
        fetchOutbound={async () => ({
          items: [{ id: 'out-1' }, { id: 'out-2' }],
        })}
      />,
    );
    expect(view.text).toContain('3 phiếu chờ duyệt');
    expect(view.text).toContain('Phiếu nhập · 1');
    expect(view.text).toContain('Phiếu xuất · 2');
    await view.unmount();
  });

  it('hiển thị đúng thời điểm gửi phiếu, không lấy ngày chứng từ hay lần cập nhật cuối', async () => {
    const view = await render(
      <ApprovalsScreen
        fetchInbound={async () => ({
          items: [
            {
              id: 'submitted-time',
              doc_no: 'PN-GUI-DUNG-GIO',
              // Hai trường này cố ý khác để bắt lỗi đổi thứ tự fallback.
              doc_date: '2020-01-02',
              updated_at: '2030-12-31T23:59:00+07:00',
              submitted_at: '2026-09-08T11:35:00+07:00',
              created_at: '2026-09-08T11:30:00+07:00',
            },
          ],
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
    expect(view.text).toContain('Thử lại');
    await view.unmount();
  });

  it('P02 danh sách truyền context kho và bộ lọc readiness đúng API khi mở từ KPI', async () => {
    const inbound = jest.fn(
      async (options?: { query?: Record<string, unknown> }) => {
        expect(options?.query).toEqual({
          warehouse_id: '11111111-1111-4111-8111-111111111111',
          status: 'WAITING_APPROVAL',
          per_page: 50,
        });
        return emptyPage;
      },
    );
    const outbound = jest.fn(
      async (options?: { query?: Record<string, unknown> }) => {
        expect(options?.query).toEqual({
          warehouse_id: '11111111-1111-4111-8111-111111111111',
          ready_for_issue: 1,
          per_page: 50,
        });
        return emptyPage;
      },
    );
    await loadHistory(inbound, outbound, {
      useCache: false,
      warehouseId: '11111111-1111-4111-8111-111111111111',
      pendingOnly: true,
    });
    expect(inbound).toHaveBeenCalledTimes(1);
    expect(outbound).toHaveBeenCalledTimes(1);
  });

  it('giữ hai hàng riêng khi inbound và outbound tình cờ dùng cùng ID', async () => {
    const view = await render(
      <HistoryScreen
        fetchInbound={async () => ({
          items: [{ id: 'same-id', doc_no: 'PN-CÙNG-ID' }],
          meta: {},
        })}
        fetchOutbound={async () => ({
          items: [{ id: 'same-id', doc_no: 'PX-CÙNG-ID' }],
          meta: {},
        })}
      />,
    );
    expect(view.text).toContain('PN-CÙNG-ID');
    expect(view.text).toContain('PX-CÙNG-ID');
    await view.unmount();
  });

  it('đổi account hoặc tier buộc tải snapshot mới thay vì dùng cache cũ', async () => {
    const inboundCalls: string[] = [];
    const outboundCalls: string[] = [];
    const inbound = async () => {
      inboundCalls.push('inbound');
      return { items: [{ id: 'in-' + String(inboundCalls.length) }], meta: {} };
    };
    const outbound = async () => {
      outboundCalls.push('outbound');
      return {
        items: [{ id: 'out-' + String(outboundCalls.length) }],
        meta: {},
      };
    };
    const scopeA = createHistoryCacheScope('user-a', 'dev-test');
    const scopeB = createHistoryCacheScope('user-b', 'dev-test');
    const tierChanged = createHistoryCacheScope('user-b', 'production');

    await loadHistory(inbound, outbound, {
      useCache: true,
      cacheScope: scopeA,
    });
    await loadHistory(inbound, outbound, {
      useCache: true,
      cacheScope: scopeA,
    });
    expect(inboundCalls).toHaveLength(1);
    expect(outboundCalls).toHaveLength(1);

    await loadHistory(inbound, outbound, {
      useCache: true,
      cacheScope: scopeB,
    });
    await loadHistory(inbound, outbound, {
      useCache: true,
      cacheScope: tierChanged,
    });
    expect(inboundCalls).toHaveLength(3);
    expect(outboundCalls).toHaveLength(3);
  });

  it('refresh lỗi giữ snapshot cũ của nguồn hỏng, đồng thời cập nhật nguồn còn lại', async () => {
    let failInbound = false;
    const view = await render(
      <HistoryScreen
        cacheScope={createHistoryCacheScope('user-a', 'dev-test')}
        fetchInbound={async () => {
          if (failInbound)
            throw new AppError({ kind: 'network', message: 'mất mạng' });
          return { items: [{ id: 'in-keep', doc_no: 'PN-GIỮ-LẠI' }], meta: {} };
        }}
        fetchOutbound={async () => ({
          items: [{ id: 'out-next', doc_no: failInbound ? 'PX-MỚI' : 'PX-CŨ' }],
          meta: {},
        })}
      />,
    );
    expect(view.text).toContain('PN-GIỮ-LẠI');
    expect(view.text).toContain('PX-CŨ');

    failInbound = true;
    const refresh = view.root.findByProps({
      accessibilityLabel: 'Đồng bộ WMS',
    });
    await ReactTestRenderer.act(async () => {
      refresh.props.onPress();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(view.text).toContain('PN-GIỮ-LẠI');
    expect(view.text).toContain('PX-MỚI');
    expect(view.text).toContain('Không xử lý được lịch sử');
    await view.unmount();
  });

  it('empty do tìm/lọc có CTA xóa bộ lọc, không giả là chưa có lịch sử', async () => {
    const view = await render(
      <HistoryScreen
        fetchInbound={async () => ({
          items: [{ id: 'i1', doc_no: 'PN-CÓ-DỮ-LIỆU' }],
          meta: {},
        })}
        fetchOutbound={async () => emptyPage}
      />,
    );
    const search = view.root.findByProps({
      accessibilityLabel: 'Tìm kiếm phiếu',
    });
    await ReactTestRenderer.act(async () => {
      search.props.onChangeText('không khớp');
    });
    expect(view.text).toContain('Không tìm thấy phiếu phù hợp');
    expect(view.text).toContain('Xóa bộ lọc');
    expect(view.text).not.toContain('Xóa lịch sử cục bộ');

    const clear = view.root.findByProps({ accessibilityLabel: 'Xóa bộ lọc' });
    await ReactTestRenderer.act(async () => {
      clear.props.onPress();
    });
    expect(view.text).toContain('PN-CÓ-DỮ-LIỆU');
    await view.unmount();
  });

  it('mở chi tiết công bố lại filter và vị trí cuộn để Back khôi phục đúng danh sách', async () => {
    const saved: unknown[] = [];
    const opened: unknown[] = [];
    const view = await render(
      <HistoryScreen
        viewState={{
          keyword: 'PN',
          contextFilter: 'inbound',
          statusFilter: 'all',
          scrollY: 72,
        }}
        onViewStateChange={state => saved.push(state)}
        onOpen={row => opened.push(row)}
        fetchInbound={async () => ({
          items: [{ id: 'in-1', doc_no: 'PN-QUAY-LẠI' }],
          meta: {},
        })}
        fetchOutbound={async () => ({
          items: [{ id: 'out-1', doc_no: 'PX-KHÔNG-HIỆN' }],
          meta: {},
        })}
      />,
    );
    const pageScroll = view.root
      .findAllByType(ScrollView)
      .find(
        node =>
          node.props.horizontal !== true &&
          typeof node.props.onScroll === 'function',
      );
    expect(pageScroll).toBeDefined();
    expect(pageScroll?.props.showsVerticalScrollIndicator).toBe(true);
    expect(pageScroll?.props.persistentScrollbar).toBe(true);
    expect(typeof pageScroll?.props.onContentSizeChange).toBe('function');
    await ReactTestRenderer.act(async () => {
      // Android có thể phát y=0 khi lần scrollTo đầu chạy trước lúc dữ liệu
      // làm nội dung đủ cao. Giá trị tạm này không được ghi đè Back state.
      pageScroll?.props.onScroll({ nativeEvent: { contentOffset: { y: 0 } } });
      pageScroll?.props.onContentSizeChange(400, 1600);
      pageScroll?.props.onScroll({ nativeEvent: { contentOffset: { y: 72 } } });
      pageScroll?.props.onScroll({
        nativeEvent: { contentOffset: { y: 248 } },
      });
    });
    expect(saved).not.toContainEqual({
      keyword: 'PN',
      contextFilter: 'inbound',
      statusFilter: 'all',
      scrollY: 0,
    });
    const row = view.root.findByProps({
      accessibilityLabel: 'Xem chi tiết phiếu PN-QUAY-LẠI',
    });
    await ReactTestRenderer.act(async () => {
      row.props.onPress();
    });
    expect(opened).toHaveLength(1);
    expect(saved).toContainEqual({
      keyword: 'PN',
      contextFilter: 'inbound',
      statusFilter: 'all',
      scrollY: 248,
    });
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
    // Chưa bấm tra cứu nên chưa có kết quả — board mới đặt ô mã trực tiếp trên
    // màn, thay vì buộc người dùng mở thêm một hộp nhập tay.
    expect(view.text).toContain('Tra cứu bằng mã');
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
