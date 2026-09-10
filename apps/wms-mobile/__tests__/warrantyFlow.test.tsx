/**
 * Đợt 4 của Prompt 4 — luồng Bảo hành (ảnh 39–46).
 *
 * Ba rủi ro của luồng này, mỗi cái một nhóm test:
 *
 * 1. **PII che theo vai** — client không tự che, không giả định đã che.
 * 2. **`defects` trả 403 với thủ kho** — là trạng thái hợp lệ, không phải sự cố.
 * 3. **Hồ sơ ẩn danh** — nhận ra qua `[ANONYMIZED]`, ẩn thao tác liên hệ/tải tệp.
 *
 * ❗ Không test nào gọi mạng.
 */

import React from 'react';

// `types: ["jest"]` không kéo theo kiểu Node.
declare const __dirname: string;
import ReactTestRenderer from 'react-test-renderer';

import {
  ATTACHMENT_LIMITS,
  MESSAGE_ANONYMIZED,
  MESSAGE_NOTE_REQUIRED,
  WARRANTY_TABS,
  actionVisibility,
  displayPii,
  isCaseAnonymized,
  isDefectPermissionDenied,
  isPiiMasked,
  requiresNote,
  validateAttachment,
  validateTransition,
  MESSAGE_CONFIRMED_DEFECT_REQUIRED,
  WARRANTY_STATUSES,
  canTransition,
  canIssueWarrantyComponents,
  isWarrantyStatus,
  nextStatuses,
  requiresConfirmedDefect,
} from '../src/features/warranty/warrantyPolicy';
import { WarrantyListScreen } from '../src/features/warranty/WarrantyListScreen';
import { WarrantyDetailScreen } from '../src/features/warranty/WarrantyDetailScreen';
import { AppProviders } from '../src/app/App';
import { AppError } from '../src/errors/AppError';
import { ANONYMIZED_MARKER } from '../src/services/wms/types';
import type { WarrantyCase } from '../src/services/wms/types';
import {
  createMemoryBackend,
  createStorage,
  setAppStorageForTesting,
} from '../src/storage/storage';

beforeEach(() => {
  setAppStorageForTesting(createStorage(createMemoryBackend()));
});

/** Hồ sơ thủ kho nhìn thấy — PII đã bị máy chủ che (khảo sát 2026-09-05). */
const MASKED_CASE: WarrantyCase = {
  warranty_case_id: 'B0276D89-9436-44D0-BD16-E7D13372E74F',
  warranty_case_code: 'BH-0001',
  status: 'RECEIVED',
  sku_name: 'Piston + xéc-măng cho Cờ lê Hoa Nam A50',
  customer_name: 'H*** V*** N***',
  customer_phone: '******372',
  pii_masked: true,
};

/** Cùng hồ sơ, tài khoản CÓ quyền PII — đúng như ảnh 40. */
const FULL_CASE: WarrantyCase = {
  ...MASKED_CASE,
  customer_name: 'Hoàng Văn Nam',
  customer_phone: '0912021372',
  pii_masked: false,
};

/** Hồ sơ đã hết hạn lưu trữ, job `warranty:purge-pii` đã ghi đè. */
const ANONYMIZED_CASE: WarrantyCase = {
  ...MASKED_CASE,
  customer_name: ANONYMIZED_MARKER,
  customer_phone: null,
  manual_product_description: ANONYMIZED_MARKER,
  pii_masked: false,
};

// ---------------------------------------------------------------------------

describe('rủi ro 1 — PII che theo vai, client KHÔNG tự che', () => {
  it('nhận ra hồ sơ đã bị máy chủ che', () => {
    expect(isPiiMasked(MASKED_CASE)).toBe(true);
    expect(isPiiMasked(FULL_CASE)).toBe(false);
  });

  it('nhận ra cả khi cờ pii_masked vắng mặt, dựa vào dấu sao', () => {
    // Cờ có thể không có ở mọi phản hồi; dấu sao là bằng chứng còn lại.
    const noFlag: WarrantyCase = {
      warranty_case_id: 'x',
      customer_name: 'N*** V*** A***',
    };
    expect(isPiiMasked(noFlag)).toBe(true);
  });

  it('hiển thị NGUYÊN thứ máy chủ trả, không sửa lại', () => {
    // Tự che ở client sai cả hai chiều: che thứ máy chủ cho xem thì quản lý
    // không làm việc được; tin rằng mình che được thì lộ khi logic client sai.
    expect(displayPii(MASKED_CASE.customer_name)).toBe('H*** V*** N***');
    expect(displayPii(FULL_CASE.customer_name)).toBe('Hoàng Văn Nam');
  });

  it('vai CÓ quyền PII vẫn liên hệ được khách', () => {
    expect(actionVisibility(FULL_CASE).canContactCustomer).toBe(true);
    // Vai bị che thì nút gọi vô nghĩa vì số đã bị che.
    expect(actionVisibility(MASKED_CASE).canContactCustomer).toBe(false);
  });
});

describe('rủi ro 2 — defects trả 403 là TRẠNG THÁI HỢP LỆ', () => {
  it('nhận ra 403 và ACCESS_DENIED', () => {
    expect(
      isDefectPermissionDenied(
        new AppError({ kind: 'http', status: 403, message: 'x' }),
      ),
    ).toBe(true);
    expect(
      isDefectPermissionDenied(
        new AppError({ kind: 'http', code: 'ACCESS_DENIED', message: 'x' }),
      ),
    ).toBe(true);
  });

  it('KHÔNG nhầm lỗi mạng thành thiếu quyền', () => {
    // Hiện "bạn không có quyền" khi thật ra mất mạng là chẩn đoán sai, và thủ
    // kho sẽ đi xin quyền thay vì kiểm tra wifi.
    expect(
      isDefectPermissionDenied(
        new AppError({ kind: 'network', message: 'mất mạng' }),
      ),
    ).toBe(false);
    expect(
      isDefectPermissionDenied(
        new AppError({ kind: 'http', status: 500, message: 'x' }),
      ),
    ).toBe(false);
  });
});

describe('rủi ro 3 — hồ sơ đã ẩn danh', () => {
  it('nhận ra qua chuỗi [ANONYMIZED] ở TÊN hoặc MÔ TẢ', () => {
    // API chưa có cờ `pii_anonymized` (BA xác nhận 2026-09-06), nên chuỗi này
    // là dấu hiệu duy nhất.
    expect(isCaseAnonymized(ANONYMIZED_CASE)).toBe(true);
    expect(isCaseAnonymized(MASKED_CASE)).toBe(false);
    expect(
      isCaseAnonymized({
        warranty_case_id: 'x',
        manual_product_description: ANONYMIZED_MARKER,
      }),
    ).toBe(true);
  });

  it('ẩn cả liên hệ khách LẪN tải tệp đính kèm', () => {
    // Tệp đã bị xoá vật lý khỏi storage — nút tải chỉ dẫn tới 404.
    const visibility = actionVisibility(ANONYMIZED_CASE);
    expect(visibility.canContactCustomer).toBe(false);
    expect(visibility.canDownloadAttachments).toBe(false);
  });

  it('hồ sơ bình thường KHÔNG bị ẩn nhầm nút tải tệp', () => {
    expect(actionVisibility(MASKED_CASE).canDownloadAttachments).toBe(true);
  });

  it('câu hiển thị đúng nguyên văn BA chốt', () => {
    expect(MESSAGE_ANONYMIZED).toBe(
      'Thông tin khách hàng đã được ẩn danh theo chính sách lưu trữ.',
    );
  });
});

describe('chuyển trạng thái — ghi chú bắt buộc (ảnh 45)', () => {
  it('ba trạng thái kết thúc đều đòi ghi chú', () => {
    expect(requiresNote('CHECKING', 'COMPLETED')).toBe(true);
    expect(requiresNote('REPAIRING', 'COMPLETED')).toBe(true);
    expect(requiresNote('COMPLETED', 'RETURNED')).toBe(true);
    expect(requiresNote('RECEIVED', 'CANCELLED')).toBe(true);
  });

  it('trạng thái giữa chừng KHÔNG đòi ghi chú', () => {
    expect(requiresNote('RECEIVED', 'CHECKING')).toBe(false);
    expect(requiresNote('CHECKING', 'REPAIRING')).toBe(false);
  });

  it('thiếu ghi chú khi Huỷ thì chặn kèm đúng câu lỗi', () => {
    const base = { current: 'RECEIVED', target: 'CANCELLED', confirmedDefect: '' };
    expect(validateTransition({ ...base, note: '' })).toBe(MESSAGE_NOTE_REQUIRED);
    expect(validateTransition({ ...base, note: '   ' })).toBe(
      MESSAGE_NOTE_REQUIRED,
    );
  });

  it('có ghi chú thì cho qua', () => {
    expect(
      validateTransition({
        current: 'RECEIVED',
        target: 'CANCELLED',
        note: 'Khách đổi ý',
        confirmedDefect: '',
      }),
    ).toBeUndefined();
    // Bước không bắt buộc thì ghi chú rỗng vẫn qua.
    expect(
      validateTransition({
        current: 'RECEIVED',
        target: 'CHECKING',
        note: '',
        confirmedDefect: '',
      }),
    ).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Đồ thị vòng đời hồ sơ — mô tả luồng bảo hành 2026-09-06
// ---------------------------------------------------------------------------

describe('🔴 trạng thái phải là giá trị THẬT của WMS', () => {
  it('dùng CHECKING, KHÔNG phải INSPECTING', () => {
    // Bản trước dùng `INSPECTING` ⇒ tab "Kiểm tra" gọi `?status=INSPECTING` và
    // luôn rỗng, hoặc 422 — đúng loại lỗi đã bắt được trên máy ở luồng xuất.
    expect(WARRANTY_STATUSES).toContain('CHECKING');
    expect(WARRANTY_STATUSES).not.toContain('INSPECTING');
    expect(isWarrantyStatus('INSPECTING')).toBe(false);
  });

  it('đủ SÁU trạng thái, gồm cả CANCELLED', () => {
    // Hồ sơ huỷ thường là hồ sơ có tranh chấp — hay bị hỏi lại nhất.
    expect([...WARRANTY_STATUSES]).toEqual([
      'RECEIVED',
      'CHECKING',
      'REPAIRING',
      'COMPLETED',
      'RETURNED',
      'CANCELLED',
    ]);
    expect(WARRANTY_TABS.map(tab => tab.key)).toContain('CANCELLED');
  });

  it('tab nào cũng ứng với một trạng thái thật', () => {
    for (const tab of WARRANTY_TABS) {
      expect(isWarrantyStatus(tab.key)).toBe(true);
    }
  });
});

describe('đồ thị chuyển trạng thái', () => {
  it.each([
    ['RECEIVED', ['CHECKING', 'CANCELLED']],
    ['CHECKING', ['REPAIRING', 'COMPLETED', 'CANCELLED']],
    ['REPAIRING', ['COMPLETED', 'CANCELLED']],
    ['COMPLETED', ['RETURNED']],
  ])('%s có đúng các bước tiếp', (current, expected) => {
    expect([...nextStatuses(current)]).toEqual(expected);
  });

  it('RETURNED và CANCELLED là ngõ cụt', () => {
    expect(nextStatuses('RETURNED')).toEqual([]);
    expect(nextStatuses('CANCELLED')).toEqual([]);
  });

  it('🔒 KHÔNG cho nhảy cóc', () => {
    // Nhảy từ Tiếp nhận thẳng sang Hoàn tất là bỏ qua bước kiểm tra — hồ sơ
    // không còn bằng chứng đã kiểm cái gì.
    expect(canTransition('RECEIVED', 'COMPLETED')).toBe(false);
    expect(canTransition('RECEIVED', 'REPAIRING')).toBe(false);
    expect(canTransition('RETURNED', 'CHECKING')).toBe(false);
  });

  it('trạng thái lạ ⇒ không bước nào, và KHÔNG ném lỗi', () => {
    expect(nextStatuses('KHONG_CO_THAT')).toEqual([]);
    expect(canTransition('KHONG_CO_THAT', 'COMPLETED')).toBe(false);
  });

  it('bước không hợp lệ bị chặn TRƯỚC khi hỏi ghi chú', () => {
    // Bước sai thì câu "thiếu ghi chú" vô nghĩa và gây hiểu nhầm.
    const problem = validateTransition({
      current: 'RECEIVED',
      target: 'COMPLETED',
      note: '',
      confirmedDefect: '',
    });
    expect(problem).toContain('Không chuyển được');
    expect(problem).not.toBe(MESSAGE_NOTE_REQUIRED);
  });
});

describe('Kết quả kiểm tra — trường KHÁC với ghi chú', () => {
  it('bắt buộc khi đi từ CHECKING sang REPAIRING hoặc COMPLETED', () => {
    expect(requiresConfirmedDefect('CHECKING', 'REPAIRING')).toBe(true);
    expect(requiresConfirmedDefect('CHECKING', 'COMPLETED')).toBe(true);
  });

  it('KHÔNG bắt buộc ở bước khác', () => {
    expect(requiresConfirmedDefect('CHECKING', 'CANCELLED')).toBe(false);
    expect(requiresConfirmedDefect('REPAIRING', 'COMPLETED')).toBe(false);
    expect(requiresConfirmedDefect('RECEIVED', 'CHECKING')).toBe(false);
  });

  it('thiếu thì chặn, kèm đúng câu lỗi', () => {
    expect(
      validateTransition({
        current: 'CHECKING',
        target: 'REPAIRING',
        note: 'có ghi chú',
        confirmedDefect: '  ',
      }),
    ).toBe(MESSAGE_CONFIRMED_DEFECT_REQUIRED);
  });

  it('hỏi Kết quả kiểm tra TRƯỚC ghi chú', () => {
    // CHECKING→COMPLETED cần cả hai. Hỏi cái kỹ thuật trước vì nó là thứ người
    // dùng vừa làm xong; ghi chú là thứ họ viết sau khi đã kết luận.
    expect(
      validateTransition({
        current: 'CHECKING',
        target: 'COMPLETED',
        note: '',
        confirmedDefect: '',
      }),
    ).toBe(MESSAGE_CONFIRMED_DEFECT_REQUIRED);
  });

  it('đủ cả hai thì cho qua', () => {
    expect(
      validateTransition({
        current: 'CHECKING',
        target: 'COMPLETED',
        note: 'Đã thay gioăng',
        confirmedDefect: 'Rò dầu ở gioăng nắp máy',
      }),
    ).toBeUndefined();
  });
});

describe('giới hạn tệp đính kèm (ảnh 46)', () => {
  const none = { images: 0, videos: 0 };

  it('giới hạn đúng con số trong ảnh', () => {
    expect(ATTACHMENT_LIMITS.maxImages).toBe(10);
    expect(ATTACHMENT_LIMITS.maxVideos).toBe(2);
    expect(ATTACHMENT_LIMITS.imageBytes).toBe(10 * 1024 * 1024);
    expect(ATTACHMENT_LIMITS.videoBytes).toBe(300 * 1024 * 1024);
    expect(ATTACHMENT_LIMITS.videoSeconds).toBe(300);
  });

  it('nhận ảnh hợp lệ', () => {
    expect(
      validateAttachment({ mimeType: 'image/jpeg', bytes: 2_000_000 }, none),
    ).toBeUndefined();
  });

  it('từ chối ảnh quá 10MB', () => {
    expect(
      validateAttachment({ mimeType: 'image/png', bytes: 11 * 1024 * 1024 }, none),
    ).toContain('10MB');
  });

  it('từ chối video quá dài dù dung lượng nhỏ', () => {
    // 5 phút là giới hạn riêng, không suy ra được từ dung lượng.
    expect(
      validateAttachment(
        { mimeType: 'video/mp4', bytes: 1_000_000, seconds: 400 },
        none,
      ),
    ).toContain('5 phút');
  });

  it('từ chối khi đã đủ số lượng', () => {
    expect(
      validateAttachment(
        { mimeType: 'image/jpeg', bytes: 100 },
        { images: 10, videos: 0 },
      ),
    ).toContain('10 ảnh');
    expect(
      validateAttachment(
        { mimeType: 'video/mp4', bytes: 100, seconds: 10 },
        { images: 0, videos: 2 },
      ),
    ).toContain('2 video');
  });

  it('từ chối định dạng ngoài danh sách', () => {
    expect(
      validateAttachment({ mimeType: 'image/gif', bytes: 100 }, none),
    ).toContain('JPG/PNG/WEBP');
  });
});

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

async function render(element: React.ReactElement) {
  let tree: ReactTestRenderer.ReactTestRenderer | undefined;
  await ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(<AppProviders>{element}</AppProviders>);
  });
  return {
    text: JSON.stringify(tree?.toJSON()),
    unmount: async () => {
      await ReactTestRenderer.act(() => {
        tree?.unmount();
      });
    },
  };
}

describe('màn danh sách bảo hành (ảnh 39, 40)', () => {
  it('sáu tab đúng nhãn và thứ tự vòng đời hồ sơ', () => {
    // 🔧 2026-09-06: thêm tab "Đã huỷ". Ảnh 39 chỉ chụp năm tab đầu, nhưng WMS
    // có sáu trạng thái và hồ sơ huỷ vẫn phải tra được — đó thường là hồ sơ có
    // tranh chấp, tức là hồ sơ hay bị hỏi lại nhất.
    expect(WARRANTY_TABS.map(tab => tab.label)).toEqual([
      'Tiếp nhận',
      'Kiểm tra',
      'Sửa chữa',
      'Hoàn tất',
      'Đã trả',
      'Đã huỷ',
    ]);
  });

  it('hồ sơ ẩn danh hiện câu của BA, KHÔNG hiện tên đã bị ghi đè', async () => {
    const view = await render(
      <WarrantyListScreen
        fetchCases={async () => ({ items: [ANONYMIZED_CASE], meta: { total: 1 } })}
      />,
    );
    expect(view.text).toContain(MESSAGE_ANONYMIZED);
    // Không được hiện chuỗi kỹ thuật ra trước mặt thủ kho.
    expect(view.text).not.toContain(ANONYMIZED_MARKER);
    await view.unmount();
  });

  it('lỗi tải có nút thử lại, không im lặng', async () => {
    const view = await render(
      <WarrantyListScreen
        fetchCases={async () => {
          throw new AppError({ kind: 'network', message: 'mất mạng' });
        }}
      />,
    );
    expect(view.text).toContain('Không tải được danh sách bảo hành');
    expect(view.text).toContain('Thử lại');
    await view.unmount();
  });
});

describe('màn chi tiết hồ sơ (ảnh 44–46)', () => {
  it.each(['CHECKING', 'REPAIRING'])(
    'hiện Xuất linh kiện khi hồ sơ ở %s',
    async status => {
      expect(canIssueWarrantyComponents(status)).toBe(true);
      const view = await render(
        <WarrantyDetailScreen
          warrantyCase={{ ...MASKED_CASE, status }}
          attachmentsState={attachments()}
          onIssueComponents={() => undefined}
        />,
      );
      expect(view.text).toContain('Xuất linh kiện');
      await view.unmount();
    },
  );

  it.each(['RECEIVED', 'COMPLETED', 'RETURNED', 'CANCELLED'])(
    'ẩn Xuất linh kiện khi hồ sơ ở %s',
    async status => {
      expect(canIssueWarrantyComponents(status)).toBe(false);
      const view = await render(
        <WarrantyDetailScreen
          warrantyCase={{ ...MASKED_CASE, status }}
          attachmentsState={attachments()}
          onIssueComponents={() => undefined}
        />,
      );
      expect(view.text).not.toContain('Xuất linh kiện');
      await view.unmount();
    },
  );

  it('giữ danh sách linh kiện đã xuất trong hồ sơ đã trả, nhưng không cho xuất thêm', async () => {
    const view = await render(
      <WarrantyDetailScreen
        warrantyCase={{ ...MASKED_CASE, status: 'RETURNED' }}
        attachmentsState={attachments()}
        onIssueComponents={() => undefined}
        componentHistory={[
          {
            id: 'document-posted-1',
            documentNumber: 'CID-20260909144859-2EUF',
            postedAt: '2026-09-09 14:48:59+00',
            lines: [
              {
                id: 'component-line-1',
                skuCode: 'AABC',
                skuName: 'ABC',
                quantity: 1,
                scannedCodeCount: 1,
              },
            ],
          },
        ]}
      />,
    );
    expect(view.text).toContain('Linh kiện bảo hành');
    expect(view.text).toContain('1 phiếu đã xuất');
    expect(view.text).toContain('CID-20260909144859-2EUF');
    expect(view.text).toContain('AABC · ABC');
    expect(view.text).toContain('1 linh kiện · 1 mã/hộp');
    expect(view.text).not.toContain('Xuất linh kiện');
    await view.unmount();
  });

  it('hồ sơ ẩn danh không hiện hàng khách hàng, hiện banner thay thế', async () => {
    const view = await render(
      <WarrantyDetailScreen warrantyCase={ANONYMIZED_CASE} />,
    );
    expect(view.text).toContain(MESSAGE_ANONYMIZED);
    expect(view.text).toContain('tệp đính kèm đã được gỡ');
    await view.unmount();
  });

  /** Trạng thái tệp đính kèm dựng sẵn — khỏi chạm module native lẫn mạng. */
  function attachments(over: Record<string, unknown> = {}) {
    return {
      uploaded: [],
      pending: [],
      loading: false,
      uploading: false,
      counts: { images: 0, videos: 0 },
      addFromLibrary: () => undefined,
      addFromCamera: () => undefined,
      removePending: () => undefined,
      uploadAll: async () => undefined,
      refresh: () => undefined,
      dismissMessages: () => undefined,
      ...over,
    } as never;
  }

  it('hồ sơ bình thường hiện HAI lối thêm tệp và badge hạn mức', async () => {
    const view = await render(
      <WarrantyDetailScreen
        warrantyCase={MASKED_CASE}
        attachmentsState={attachments()}
      />,
    );
    expect(view.text).toContain('Chọn từ thư viện');
    expect(view.text).toContain('Chụp ảnh');
    expect(view.text).toContain('0/10 ảnh · 0/2 video');
    await view.unmount();
  });

  it('🔴 nói TRƯỚC rằng chưa gỡ được file sau khi gửi', async () => {
    // K (xoá file) chưa duyệt. Nói sau khi đã gửi thì đã muộn.
    const view = await render(
      <WarrantyDetailScreen
        warrantyCase={MASKED_CASE}
        attachmentsState={attachments()}
      />,
    );
    expect(view.text).toContain('Chưa gỡ được file sau khi gửi');
    await view.unmount();
  });

  it('hàng CHỜ tải có nút Bỏ; danh sách ĐÃ tải thì không', async () => {
    const view = await render(
      <WarrantyDetailScreen
        warrantyCase={MASKED_CASE}
        attachmentsState={attachments({
          pending: [
            {
              file: { uri: 'file:///a.jpg', name: 'a.jpg', type: 'image/jpeg' },
              bytes: 100,
              isVideo: false,
            },
          ],
          uploaded: [{ id: 'u1', file_name: 'da-gui.jpg' }],
          counts: { images: 2, videos: 0 },
        })}
      />,
    );
    expect(view.text).toContain('CHỜ TẢI LÊN');
    expect(view.text).toContain('a.jpg');
    expect(view.text).toContain('Bỏ tệp a.jpg');
    expect(view.text).toContain('ĐÃ TẢI LÊN');
    expect(view.text).toContain('da-gui.jpg');
    // Tệp đã gửi KHÔNG có nút bỏ.
    expect(view.text).not.toContain('Bỏ tệp da-gui.jpg');
    await view.unmount();
  });

  it('nhóm file dùng giá trị của CONTRACT, không phải nhãn đọc từ ảnh', async () => {
    // `INSPECT` (đọc theo ảnh) vs `INSPECTION` (contract) rất dễ tưởng là một —
    // gửi sai thì hoặc bị từ chối, hoặc lưu sai nhóm một cách im lặng.
    const source = require('fs').readFileSync(
      require('path').join(
        __dirname,
        '..',
        'src',
        'features',
        'warranty',
        'WarrantyDetailScreen.tsx',
      ),
      'utf8',
    );
    expect(source).toContain('ATTACHMENT_TYPES');
    expect(source).not.toContain("value: 'INSPECT'");
  });

  it('nhắc ghi chú bắt buộc ngay trên màn', async () => {
    const view = await render(
      <WarrantyDetailScreen warrantyCase={MASKED_CASE} />,
    );
    expect(view.text).toContain('Ghi chú bắt buộc khi Hoàn tất');
    await view.unmount();
  });
});
