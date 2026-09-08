/**
 * Danh mục địa chỉ và xoá từng mã ở luồng xuất.
 *
 * Hai phần này đến từ mô tả luồng xuất người dùng cung cấp 2026-09-06, trong đó
 * có một điểm họ tự đánh dấu **chưa đạt**: *"Hiện chưa có nút xóa riêng từng mã
 * tại màn kiểm tra."*
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { AppProviders } from '../src/app/App';
import { OutboundReviewScreen } from '../src/features/outbound/OutboundReviewScreen';
import {
  addOutboundCode,
  initialOutboundDraft,
  removeOutboundCode,
  settleOutboundCode,
  startScanning,
  updateForm,
  type OutboundDraft,
} from '../src/features/outbound/outboundDraft';
import {
  GEO_CACHE_TTL_MS,
  extractUnits,
  fetchProvinces,
  fetchWards,
} from '../src/services/geo/provinces';
import {
  createMemoryBackend,
  createStorage,
  setAppStorageForTesting,
} from '../src/storage/storage';
import { createLogger } from '../src/logging/logger';
import { stripComments } from '../test-utils/sourceScan';

// `types: ["jest"]` không kéo theo kiểu Node, mà test này đọc mã nguồn thật.
declare const __dirname: string;

const silentLog = createLogger({ minLevel: 'debug', sink: () => undefined });

const code = (item: string) => 'HN1|SKU=DCCS20083-2|ITEM=' + item;

beforeEach(() => {
  setAppStorageForTesting(createStorage(createMemoryBackend()));
});

// ---------------------------------------------------------------------------
// Danh mục hành chính
// ---------------------------------------------------------------------------

describe('bóc danh mục hành chính', () => {
  it('đọc mảng phẳng — danh sách tỉnh', () => {
    expect(
      extractUnits([
        { code: 1, name: 'Thành phố Hà Nội' },
        { code: '31', name: 'Thành phố Hải Phòng' },
      ]),
    ).toEqual([
      { code: '1', name: 'Thành phố Hà Nội' },
      { code: '31', name: 'Thành phố Hải Phòng' },
    ]);
  });

  it('đọc object có wards — API v2 sau sáp nhập 2025', () => {
    expect(
      extractUnits({ code: 31, wards: [{ code: 11683, name: 'Phường Lê Chân' }] }),
    ).toEqual([{ code: '11683', name: 'Phường Lê Chân' }]);
  });

  it('vẫn đọc được dạng cũ districts[].wards', () => {
    // Một endpoint đổi shape giữa chừng mà app chết cứng thì đắt hơn nhiều so
    // với mấy dòng phòng thủ này.
    const units = extractUnits({
      districts: [
        { wards: [{ code: 1, name: 'Phường A' }] },
        { wards: [{ code: 2, name: 'Phường B' }] },
      ],
    });
    expect(units.map(unit => unit.name)).toEqual(['Phường A', 'Phường B']);
  });

  it('bỏ bản ghi thiếu mã hoặc thiếu tên, không đẩy rác vào ô chọn', () => {
    expect(
      extractUnits([
        { code: 1, name: 'Hợp lệ' },
        { code: 2 },
        { name: 'Thiếu mã' },
        { code: 3, name: '   ' },
        null,
        'không phải object',
      ]),
    ).toEqual([{ code: '1', name: 'Hợp lệ' }]);
  });
});

describe('🔒 gọi dịch vụ bên thứ ba', () => {
  it('KHÔNG gửi header xác thực nào — token WMS không được rời khỏi WMS', async () => {
    // Nếu tệp này lỡ dùng `apiClient`, bearer token kho hàng sẽ được gửi sang
    // một máy chủ không liên quan. Rò rỉ thật, âm thầm, khó phát hiện.
    const fs = require('fs');
    const path = require('path');
    // Bóc chú thích trước khi quét: tệp đó **giải thích** vì sao không dùng
    // `apiClient`, và nhắc tên một lệnh cấm là ngược lại với vi phạm nó.
    const source = stripComments(
      fs.readFileSync(
        path.join(__dirname, '..', 'src', 'services', 'geo', 'provinces.ts'),
        'utf8',
      ),
    );
    expect(source).not.toContain('apiClient');
    expect(source).not.toContain('Authorization');
    expect(source).not.toContain('getSession');
    // Chiều dương: bộ lọc không được nuốt luôn phần code cần kiểm.
    expect(source).toContain('fetch(');
  });

  it('chỉ gửi mã tỉnh, không gửi dữ liệu người nhận', async () => {
    const urls: string[] = [];
    await fetchWards('31', {
      request: async url => {
        urls.push(url);
        return [{ code: 1, name: 'Phường A' }];
      },
    });
    expect(urls[0]).toContain('/p/31?depth=2');
    // Không có gì khác đi kèm.
    expect(urls[0]).not.toMatch(/recipient|phone|name=/i);
  });

  it('chưa chọn tỉnh thì KHÔNG gọi mạng', async () => {
    let called = false;
    const result = await fetchWards('', {
      request: async () => {
        called = true;
        return [];
      },
    });
    expect(called).toBe(false);
    expect(result.items).toEqual([]);
  });
});

describe('cache 24 giờ', () => {
  const payload = [{ code: 1, name: 'Thành phố Hà Nội' }];

  it('lần hai đọc cache, không gọi mạng lại', async () => {
    let calls = 0;
    const request = async () => {
      calls += 1;
      return payload;
    };
    await fetchProvinces({ request, now: () => 1000 });
    await fetchProvinces({ request, now: () => 1000 + GEO_CACHE_TTL_MS - 1 });
    expect(calls).toBe(1);
  });

  it('quá 24 giờ thì gọi lại', async () => {
    let calls = 0;
    const request = async () => {
      calls += 1;
      return payload;
    };
    await fetchProvinces({ request, now: () => 1000 });
    await fetchProvinces({ request, now: () => 1000 + GEO_CACHE_TTL_MS + 1 });
    expect(calls).toBe(2);
  });

  it('🔒 mạng hỏng thì DÙNG TIẾP cache quá hạn, không bỏ trắng ô chọn', async () => {
    // Tỉnh/phường là trường BẮT BUỘC. Vứt cache đi đúng lúc dịch vụ ngoài chết
    // nghĩa là thủ kho không tạo được phiếu, dù câu trả lời nằm sẵn trên máy.
    await fetchProvinces({ request: async () => payload, now: () => 1000 });

    const result = await fetchProvinces({
      request: async () => {
        throw new Error('mất mạng');
      },
      now: () => 1000 + GEO_CACHE_TTL_MS + 1,
      log: silentLog,
    });

    expect(result.items).toHaveLength(1);
    expect(result.stale).toBe(true);
  });

  it('mạng hỏng và CHƯA có cache thì báo lỗi, không giả vờ rỗng', async () => {
    // Danh sách rỗng trông y hệt "tỉnh này không có phường nào" — người dùng sẽ
    // ngồi tìm mãi thay vì biết là mất mạng.
    await expect(
      fetchProvinces({
        request: async () => {
          throw new Error('mất mạng');
        },
        log: silentLog,
      }),
    ).rejects.toBeDefined();
  });

  it('phản hồi rỗng cũng là lỗi, không ghi cache rỗng', async () => {
    await expect(
      fetchProvinces({ request: async () => [], log: silentLog }),
    ).rejects.toMatchObject({ kind: 'parse' });
  });

  it('cache theo TỪNG tỉnh, không lẫn phường của tỉnh khác', async () => {
    const seen: string[] = [];
    const request = async (url: string) => {
      seen.push(url);
      return [{ code: 1, name: 'Phường X' }];
    };
    await fetchWards('01', { request });
    await fetchWards('31', { request });
    await fetchWards('01', { request });
    // Tỉnh 01 chỉ gọi một lần; tỉnh 31 là lần gọi riêng.
    expect(seen).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Xoá từng mã — điểm người dùng đánh dấu "chưa đạt"
// ---------------------------------------------------------------------------

describe('xoá từng mã ở màn kiểm tra', () => {
  function scanned(): OutboundDraft {
    let draft = startScanning(
      updateForm(initialOutboundDraft, {
        warehouseId: 'wh-1',
        recipientGroup: 'DEALER',
        recipientName: 'Đại lý Minh Anh',
        phone: '0901234567',
        province: '31',
        provinceName: 'Hải Phòng',
        ward: '11683',
        wardName: 'Lê Chân',
        quantity: '3',
      }),
    );
    for (const item of ['A-001', 'A-002', 'A-003']) {
      draft = addOutboundCode(draft, code(item), 1).draft;
    }
    return draft;
  }

  it('xoá đúng MỘT mã, giữ nguyên các mã khác', () => {
    const draft = scanned();
    const target = draft.codes[1];
    const after = removeOutboundCode(draft, target?.key ?? '');
    expect(after.codes).toHaveLength(2);
    expect(after.codes.map(item => item.item)).toEqual(['A-001', 'A-003']);
  });

  it('xoá xong thì KHÔNG còn đủ số lượng — nút ghi nhận phải khoá lại', () => {
    const draft = scanned();
    const after = removeOutboundCode(draft, draft.codes[0]?.key ?? '');
    expect(after.codes).toHaveLength(2);
    // 2 < 3 ⇒ chưa đủ. Nếu vẫn cho ghi nhận thì phiếu gửi lên thiếu hàng.
    expect(after.codes.length).toBeLessThan(3);
  });

  async function render(props: { posted?: boolean; canRemove?: boolean }) {
    let tree: ReactTestRenderer.ReactTestRenderer | undefined;
    await ReactTestRenderer.act(() => {
      tree = ReactTestRenderer.create(
        <AppProviders>
          <OutboundReviewScreen
            draft={scanned()}
            documentRef="local-abc"
            posted={props.posted}
            onRemoveCode={
              props.canRemove === false ? undefined : () => undefined
            }
            onRecord={() => undefined}
          />
        </AppProviders>,
      );
    });
    return {
      text: JSON.stringify(tree?.toJSON()),
      unmount: async () => {
        await ReactTestRenderer.act(() => tree?.unmount());
      },
    };
  }

  it('hứa "Vuốt trái để xoá" KHI xoá được thật', async () => {
    // Viết chữ mà không làm được là loại lỗi tệ nhất: thủ kho vuốt mãi không
    // được và không có đường nào khác để gỡ mã ra.
    const view = await render({});
    expect(view.text).toContain('Vuốt trái để xoá');
    await view.unmount();
  });

  it('phiếu ĐÃ ghi nhận thì KHÔNG hứa vuốt xoá nữa', async () => {
    const view = await render({ posted: true });
    expect(view.text).not.toContain('Vuốt trái để xoá');
    await view.unmount();
  });

  it('không truyền onRemoveCode thì cũng không hứa', async () => {
    const view = await render({ canRemove: false });
    expect(view.text).not.toContain('Vuốt trái để xoá');
    await view.unmount();
  });
});

// ---------------------------------------------------------------------------
// Màn Kiểm tra phải nói ĐÚNG trạng thái từng mã — §2g
// ---------------------------------------------------------------------------

describe('màn Kiểm tra hiển thị kết quả resolve-code', () => {
  function withVerdicts(): OutboundDraft {
    let draft = startScanning(
      updateForm(initialOutboundDraft, {
        warehouseId: 'wh-1',
        recipientGroup: 'DEALER',
        recipientName: 'Đại lý Minh Anh',
        phone: '0901234567',
        province: '31',
        provinceName: 'Hải Phòng',
        ward: '11683',
        wardName: 'Lê Chân',
        quantity: '3',
      }),
    );
    for (const item of ['A-001', 'A-002', 'A-003']) {
      draft = addOutboundCode(draft, code(item), 1).draft;
    }
    draft = settleOutboundCode(draft, draft.codes[0]?.key ?? '', {
      eligible: true,
      skuName: 'Ống nhựa PVC 90',
    });
    draft = settleOutboundCode(draft, draft.codes[1]?.key ?? '', {
      eligible: false,
      reason: 'Mã đang giữ chỗ cho phiếu PX-COV-001.',
    });
    // Mã thứ ba cố ý để nguyên `checking`.
    return draft;
  }

  async function render() {
    let tree: ReactTestRenderer.ReactTestRenderer | undefined;
    await ReactTestRenderer.act(() => {
      tree = ReactTestRenderer.create(
        <AppProviders>
          <OutboundReviewScreen
            draft={withVerdicts()}
            documentRef="local-abc"
            onRemoveCode={() => undefined}
            onRecord={() => undefined}
          />
        </AppProviders>,
      );
    });
    return {
      text: JSON.stringify(tree?.toJSON()),
      unmount: async () => {
        await ReactTestRenderer.act(() => tree?.unmount());
      },
    };
  }

  it('🔒 mã bị từ chối KHÔNG mang nhãn "Đã quét"', async () => {
    // Nhãn xanh cho một mã WMS đã từ chối là nói dối ở đúng chỗ thủ kho dựa
    // vào để quyết định ghi nhận.
    const view = await render();
    expect(view.text).toContain('Không xuất được');
    await view.unmount();
  });

  it('hiện LÝ DO ngay dưới mã, kèm số phiếu đang giữ chỗ', async () => {
    const view = await render();
    expect(view.text).toContain('PX-COV-001');
    await view.unmount();
  });

  it('mã đang chờ WMS trả lời hiện "Đang kiểm tra"', async () => {
    const view = await render();
    expect(view.text).toContain('Đang kiểm tra');
    await view.unmount();
  });

  it('hiện tên SKU thay cho mã thô khi WMS trả về', async () => {
    const view = await render();
    expect(view.text).toContain('Ống nhựa PVC 90');
    await view.unmount();
  });

  it('banner tổng nói RÕ số mã hỏng và hậu quả', async () => {
    const view = await render();
    expect(view.text).toContain('1 mã không xuất được');
    expect(view.text).toContain('KHÔNG được gửi lên phiếu');
    await view.unmount();
  });
});
