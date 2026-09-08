/**
 * Bộ ba màn tiếp nhận bảo hành — ảnh **41, 42, 43**.
 *
 * Ba màn này bị hoãn suốt Prompt 4 và người dùng nêu lại 2026-09-06:
 * *"thiếu các màn quá"*. Nay dựng xong, và bộ test canh cả phần dễ sai nhất:
 * nhánh **mất mã** không được đánh rơi phụ kiện — đúng lỗi Mini App đang mắc.
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { AppProviders } from '../src/app/App';
import {
  WarrantyCodeStep,
  WarrantyDefectStep,
  WarrantyDescriptionStep,
} from '../src/features/warranty/WarrantyIntakeScreens';
import {
  MESSAGE_DESCRIPTION_REQUIRED,
  MESSAGE_NAME_TOO_SHORT,
  MESSAGE_PRODUCT_REQUIRED,
  MESSAGE_REASON_REQUIRED,
  canSubmit,
  composeCustomerAddress,
  initialIntakeDraft,
  isMissingCode,
  nextStep,
  previousStep,
  setIntakeProvince,
  toCreateInput,
  toggleDefect,
  updateIntake,
  validateStep1,
  validateStep2,
  validateStep3,
  type WarrantyIntakeDraft,
} from '../src/features/warranty/warrantyIntake';
import { MESSAGE_PHONE_INVALID } from '../src/features/outbound/outboundDraft';
import { WarrantyIntakeFlow } from '../src/features/warranty/WarrantyIntakeFlow';
import { AppError } from '../src/errors/AppError';

const IDLE_GEO = {
  phase: 'ready' as const,
  items: [{ code: '31', name: 'Thành phố Hải Phòng' }],
  stale: false,
  reload: () => undefined,
};

/** Hồ sơ hợp lệ tối thiểu, nhánh **mất mã**. */
function missingCodeDraft(): WarrantyIntakeDraft {
  return updateIntake(initialIntakeDraft, {
    missingCodeReason: 'LOST_LABEL',
    manualProductDescription: 'Máy khoan cầm tay',
    customerName: 'Nguyễn Văn A',
    customerPhone: '0901234567',
    province: '31',
    provinceName: 'Thành phố Hải Phòng',
    ward: '11683',
    wardName: 'Phường Lê Chân',
    street: 'Số 5 ngõ 12',
    defectIds: ['DEF-006'],
    description: 'Máy không lên nguồn',
    accessoriesReceived: 'Sạc, hộp',
    receivedCondition: 'Xước vỏ',
  });
}

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

// ---------------------------------------------------------------------------
// Bước 1 — ảnh 41
// ---------------------------------------------------------------------------

describe('bước 1 — nhập/quét mã (ảnh 41)', () => {
  it('không có itemCode ⇒ đi nhánh MẤT MÃ', () => {
    expect(isMissingCode(initialIntakeDraft)).toBe(true);
    expect(
      isMissingCode(updateIntake(initialIntakeDraft, { itemCode: 'ITEM-1' })),
    ).toBe(false);
  });

  it('nhánh mất mã BẮT BUỘC lý do và mô tả sản phẩm', () => {
    const errors = validateStep1(initialIntakeDraft);
    expect(errors.missingCodeReason).toBe(MESSAGE_REASON_REQUIRED);
    expect(errors.manualProductDescription).toBe(MESSAGE_PRODUCT_REQUIRED);
  });

  it('nhánh CÓ mã thì không đòi hai trường đó', () => {
    const withCode = updateIntake(missingCodeDraft(), {
      itemCode: 'ITEM-1',
      missingCodeReason: '',
      manualProductDescription: '',
    });
    const errors = validateStep1(withCode);
    expect(errors.missingCodeReason).toBeUndefined();
    expect(errors.manualProductDescription).toBeUndefined();
  });

  it('tên khách tối thiểu 2 ký tự', () => {
    const short = updateIntake(missingCodeDraft(), { customerName: 'A' });
    expect(validateStep1(short).customerName).toBe(MESSAGE_NAME_TOO_SHORT);
  });

  it('số điện thoại theo cùng luật với luồng xuất', () => {
    const bad = updateIntake(missingCodeDraft(), { customerPhone: '0212345678' });
    expect(validateStep1(bad).customerPhone).toBe(MESSAGE_PHONE_INVALID);
  });

  it('đổi tỉnh thì xoá phường VÀ tên phường', () => {
    // Giữ tên phường cũ sẽ ghép ra địa chỉ lai hai tỉnh — hàng giao sai nơi.
    const moved = setIntakeProvince(missingCodeDraft(), '01', 'Hà Nội');
    expect(moved.ward).toBe('');
    expect(moved.wardName).toBe('');
    expect(moved.provinceName).toBe('Hà Nội');
  });

  it('trả về HẾT lỗi cùng lúc, không dừng ở lỗi đầu', () => {
    // Form dài; sửa từng lỗi một là bắt người dùng cuộn lên xuống nhiều lần.
    const errors = validateStep1(initialIntakeDraft);
    expect(Object.keys(errors).length).toBeGreaterThanOrEqual(5);
  });

  it('màn hiện đủ ô bắt buộc và badge nhánh', async () => {
    const view = await render(
      <WarrantyCodeStep
        draft={initialIntakeDraft}
        onChange={() => undefined}
        onNext={() => undefined}
        provinceState={IDLE_GEO}
        wardState={{ ...IDLE_GEO, phase: 'idle', items: [] }}
      />,
    );
    expect(view.text).toContain('Mất tem/mã');
    expect(view.text).toContain('Tên khách hàng*');
    expect(view.text).toContain('Số điện thoại*');
    expect(view.text).toContain('Chọn tỉnh/thành trước');
    await view.unmount();
  });
});

// ---------------------------------------------------------------------------
// Bước 2 — ảnh 42
// ---------------------------------------------------------------------------

describe('bước 2 — chọn bệnh lỗi (ảnh 42)', () => {
  const DEFECTS = [
    { id: 'd1', code: 'DEF-006', name: 'Rò dầu ở gioăng nắp máy' },
    { id: 'd2', code: 'DEF-013', name: 'Không lên nguồn' },
  ];

  it('🔴 KHÔNG bắt buộc chọn lỗi — danh mục WMS đang rỗng', () => {
    // Đo 2026-09-06: `GET /api/v1/defects?status=ACTIVE` trả 200 + mảng rỗng.
    // Nếu bước 2 vẫn chặn thì không hồ sơ bảo hành nào tạo được.
    // Mini App gốc cũng để tuỳ chọn — `warranty-flow.service.ts:71` có dấu `?`.
    expect(validateStep2(initialIntakeDraft)).toEqual({});
  });

  it('chọn được NHIỀU lỗi, bấm lại thì bỏ chọn', () => {
    let draft = toggleDefect(initialIntakeDraft, 'd1');
    draft = toggleDefect(draft, 'd2');
    expect(draft.defectIds).toEqual(['d1', 'd2']);
    draft = toggleDefect(draft, 'd1');
    expect(draft.defectIds).toEqual(['d2']);
  });

  it('hiện danh sách checkbox kèm mã lỗi', async () => {
    const view = await render(
      <WarrantyDefectStep
        draft={initialIntakeDraft}
        onChange={() => undefined}
        onNext={() => undefined}
        defects={DEFECTS}
      />,
    );
    expect(view.text).toContain('DEF-006');
    expect(view.text).toContain('Rò dầu ở gioăng nắp máy');
    await view.unmount();
  });

  it('🔴 403 nói RÕ là vấn đề QUYỀN, không phải "không có lỗi nào"', async () => {
    // Thủ kho không tự cấp quyền được — câu chữ phải chỉ họ tới người làm được.
    const view = await render(
      <WarrantyDefectStep
        draft={initialIntakeDraft}
        onChange={() => undefined}
        onNext={() => undefined}
        defects={[]}
        forbidden
      />,
    );
    expect(view.text).toContain('chưa có quyền');
    expect(view.text).toContain('Báo quản trị cấp quyền');
    await view.unmount();
  });

  it('đang tải thì KHÔNG hiện "chưa có danh mục"', async () => {
    // Hai trạng thái đó trông giống nhau nhưng nghĩa ngược nhau.
    const view = await render(
      <WarrantyDefectStep
        draft={initialIntakeDraft}
        onChange={() => undefined}
        onNext={() => undefined}
        defects={[]}
        loading
      />,
    );
    expect(view.text).toContain('Đang tải danh mục lỗi');
    expect(view.text).not.toContain('Chưa có danh mục lỗi');
    await view.unmount();
  });

  it('đếm số lỗi đã chọn', async () => {
    const view = await render(
      <WarrantyDefectStep
        draft={updateIntake(initialIntakeDraft, { defectIds: ['d1', 'd2'] })}
        onChange={() => undefined}
        onNext={() => undefined}
        defects={DEFECTS}
      />,
    );
    expect(view.text).toContain('Đã chọn 2');
    await view.unmount();
  });
});

// ---------------------------------------------------------------------------
// Bước 3 — ảnh 43
// ---------------------------------------------------------------------------

describe('bước 3 — mô tả và phụ kiện (ảnh 43)', () => {
  it('mô tả bắt buộc, phụ kiện và tình trạng tuỳ chọn', () => {
    expect(validateStep3(initialIntakeDraft).description).toBe(
      MESSAGE_DESCRIPTION_REQUIRED,
    );
    const filled = updateIntake(initialIntakeDraft, {
      description: 'Không lên nguồn',
    });
    expect(validateStep3(filled)).toEqual({});
  });

  it('lý do thiếu mã hiện READONLY ở bước cuối — đúng ảnh 43', async () => {
    const view = await render(
      <WarrantyDescriptionStep
        draft={missingCodeDraft()}
        onChange={() => undefined}
        onNext={() => undefined}
      />,
    );
    expect(view.text).toContain('LÝ DO THIẾU MÃ');
    expect(view.text).toContain('Mất tem/mã');
    await view.unmount();
  });

  it('nhãn nút cuối đúng ảnh 43', async () => {
    const view = await render(
      <WarrantyDescriptionStep
        draft={missingCodeDraft()}
        onChange={() => undefined}
        onNext={() => undefined}
      />,
    );
    expect(view.text).toContain('Tạo hồ sơ bảo hành');
    await view.unmount();
  });
});

// ---------------------------------------------------------------------------
// Chuyển bước và payload
// ---------------------------------------------------------------------------

describe('chuyển bước', () => {
  it('thiếu trường thì KHÔNG sang bước sau, và hiện banner tổng', () => {
    const blocked = nextStep(initialIntakeDraft);
    expect(blocked.step).toBe(0);
    expect(blocked.showStepError).toBe(true);
  });

  it('đủ thì sang bước sau và xoá banner', () => {
    const ok = nextStep(missingCodeDraft());
    expect(ok.step).toBe(1);
    expect(ok.showStepError).toBe(false);
  });

  it('quay lại KHÔNG mất dữ liệu đã nhập', () => {
    const back = previousStep(nextStep(missingCodeDraft()));
    expect(back.step).toBe(0);
    expect(back.customerName).toBe('Nguyễn Văn A');
  });

  it('sửa ô nào thì xoá lỗi ô ĐÓ, giữ lỗi ô khác', () => {
    const blocked = nextStep(initialIntakeDraft);
    const fixed = updateIntake(blocked, { customerName: 'Nguyễn Văn A' });
    expect(fixed.errors.customerName).toBeUndefined();
    expect(fixed.errors.customerPhone).toBeDefined();
  });
});

describe('payload gửi WMS', () => {
  it('ghép địa chỉ: số nhà, phường, tỉnh', () => {
    expect(composeCustomerAddress(missingCodeDraft())).toBe(
      'Số 5 ngõ 12, Phường Lê Chân, Thành phố Hải Phòng',
    );
  });

  it('bỏ phần rỗng, không sinh dấu phẩy thừa', () => {
    const noStreet = updateIntake(missingCodeDraft(), { street: '' });
    expect(composeCustomerAddress(noStreet)).not.toContain(', ,');
  });

  it('🐞 nhánh MẤT MÃ VẪN mang phụ kiện và tình trạng', () => {
    // Lỗi của Mini App: hàm chuẩn hoá payload chỉ giữ hai trường này ở nhánh có
    // item_code. Hồ sơ tạm là loại hay có tranh chấp nhất.
    const input = toCreateInput(missingCodeDraft());
    expect(input.itemCode).toBeUndefined();
    expect(input.missingCodeReason).toBe('LOST_LABEL');
    expect(input.accessoriesReceived).toBe('Sạc, hộp');
    expect(input.receivedCondition).toBe('Xước vỏ');
  });

  it('nhánh CÓ mã gửi itemCode, không gửi lý do thiếu mã', () => {
    const withCode = updateIntake(missingCodeDraft(), { itemCode: 'ITEM-1' });
    const input = toCreateInput(withCode);
    expect(input.itemCode).toBe('ITEM-1');
    expect(input.missingCodeReason).toBeUndefined();
    expect(input.accessoriesReceived).toBe('Sạc, hộp');
  });

  it('số điện thoại được lọc sạch trước khi gửi', () => {
    const messy = updateIntake(missingCodeDraft(), {
      customerPhone: '090 123 4567',
    });
    expect(toCreateInput(messy).customerPhone).toBe('0901234567');
  });

  it('canSubmit kiểm CẢ BA bước, không chỉ bước đang đứng', () => {
    expect(canSubmit(missingCodeDraft())).toBe(true);
    expect(canSubmit(initialIntakeDraft)).toBe(false);
    // Đủ bước 1 và 2 nhưng thiếu mô tả ⇒ vẫn không gửi được.
    const noDescription = updateIntake(missingCodeDraft(), { description: '' });
    expect(canSubmit(noDescription)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// resolve-code nối vào lối quét — ai gọi, và ba kết quả
// ---------------------------------------------------------------------------

describe('🔓 §2i G — resolve-code trong luồng tiếp nhận', () => {
  const noDefects = async () => ({ items: [] });

  async function renderFlow(
    resolveCode: (code: string) => Promise<Record<string, unknown>>,
    rawCode = 'SN-12345',
  ) {
    let tree: ReactTestRenderer.ReactTestRenderer | undefined;
    await ReactTestRenderer.act(async () => {
      tree = ReactTestRenderer.create(
        <AppProviders>
          <WarrantyIntakeFlow
            rawCode={rawCode}
            onExit={() => undefined}
            loadDefects={noDefects as never}
            resolveCode={resolveCode as never}
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

  it('mã ĐỦ điều kiện ⇒ hồ sơ thường, hiện tên sản phẩm', async () => {
    const view = await renderFlow(async () => ({
      eligible_for_warranty: true,
      item_code: 'ITEM-9',
      sku_name: 'Máy khoan HN-90',
    }));
    expect(view.text).toContain('Đã có mã');
    expect(view.text).toContain('Máy khoan HN-90');
    expect(view.text).not.toContain('Mất tem/mã');
    await view.unmount();
  });

  it('🔒 mã KHÔNG đủ điều kiện ⇒ hồ sơ tạm, và NÓI RÕ vì sao', async () => {
    // Chặn hẳn ở đây nghĩa là khách mang máy hỏng tới mà không mở được hồ sơ.
    // Im lặng đổi nhánh thì thủ kho tưởng máy tự ý bỏ qua mã vừa quét.
    const view = await renderFlow(async () => ({
      eligible_for_warranty: false,
      eligibility_code: 'OUT_OF_WARRANTY',
      sku_name: 'Máy khoan HN-90',
    }));
    expect(view.text).toContain('Mã không dùng được cho hồ sơ thường');
    expect(view.text).toContain('OUT_OF_WARRANTY');
    expect(view.text).toContain('SN-12345');
    await view.unmount();
  });

  it('🔒 gọi mạng HỎNG ⇒ vẫn mở được hồ sơ tạm, kèm lý do', async () => {
    // Mất mạng không phải lỗi của khách; họ đã mang máy tới rồi.
    const view = await renderFlow(async () => {
      throw new Error('mất mạng');
    });
    expect(view.text).toContain('Mã không dùng được cho hồ sơ thường');
    expect(view.text).toContain('Chưa hỏi được WMS');
    await view.unmount();
  });

  it('🔴 WMS TRẢ LỜI "không biết mã" ⇒ nói đúng vậy, KHÔNG nói "chưa hỏi được"', async () => {
    // Đo thật trên máy 2026-09-06: `resolve-code` trả 422 SKU_NOT_FOUND.
    // Gộp nó chung với mất mạng là nói sai sự thật — thủ kho sẽ đi kiểm tra
    // mạng trong khi vấn đề nằm ở cái tem.
    const view = await renderFlow(async () => {
      throw new AppError({
        kind: 'http',
        status: 422,
        code: 'SKU_NOT_FOUND',
        message: 'Không tìm thấy SKU.',
      });
    });
    expect(view.text).toContain('WMS không nhận ra mã');
    expect(view.text).toContain('SKU_NOT_FOUND');
    expect(view.text).not.toContain('Chưa hỏi được WMS');
    await view.unmount();
  });

  it('lỗi 5xx vẫn xử như CHƯA HỎI ĐƯỢC — máy chủ chưa kết luận gì về mã', async () => {
    const view = await renderFlow(async () => {
      throw new AppError({ kind: 'http', status: 503, message: 'Bảo trì' });
    });
    expect(view.text).toContain('Chưa hỏi được WMS');
    await view.unmount();
  });

  it('thiếu eligible_for_warranty ⇒ xử như KHÔNG đủ điều kiện', async () => {
    const view = await renderFlow(async () => ({ sku_name: 'Máy khoan' }));
    expect(view.text).toContain('Mất tem/mã');
    await view.unmount();
  });

  it('KHÔNG có mã ⇒ vào thẳng hồ sơ tạm, KHÔNG gọi resolve', async () => {
    let called = false;
    let tree: ReactTestRenderer.ReactTestRenderer | undefined;
    await ReactTestRenderer.act(async () => {
      tree = ReactTestRenderer.create(
        <AppProviders>
          <WarrantyIntakeFlow
            onExit={() => undefined}
            loadDefects={noDefects as never}
            resolveCode={(async () => {
              called = true;
              return {};
            }) as never}
          />
        </AppProviders>,
      );
    });
    expect(called).toBe(false);
    expect(JSON.stringify(tree?.toJSON())).toContain('Mất tem/mã');
    await ReactTestRenderer.act(() => tree?.unmount());
  });
});
