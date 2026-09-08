/**
 * Đợt 3 của Prompt 4 — luồng Xuất kho (ảnh 25–35).
 *
 * Ba thứ dễ port sai nhất, và là trọng tâm test:
 *
 * 1. **Trường phụ thuộc** — đổi tỉnh phải xoá phường, nếu không sinh ra địa chỉ
 *    không tồn tại và hàng giao sai nơi.
 * 2. **Điều kiện đủ số lượng** — khác luồng nhập (chỉ cần ≥ 1 mã).
 * 3. **Tồn kho GIẢM**, và giảm ở mốc thứ ba — không phải lúc ghi nhận.
 *
 * ❗ Không test nào gọi mạng.
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

import {
  MESSAGE_GROUP_REQUIRED,
  MESSAGE_NOT_ISSUED_BODY,
  MESSAGE_PHONE_REQUIRED,
  MESSAGE_PROVINCE_REQUIRED,
  MESSAGE_QUANTITY_INVALID,
  MESSAGE_RECIPIENT_REQUIRED,
  MESSAGE_WARD_REQUIRED,
  OUTBOUND_OUTBOX_KIND,
  addOutboundCode,
  canRecordOutbound,
  changeProvince,
  hasFormErrors,
  initialOutboundDraft,
  isWardEnabled,
  outboundProgress,
  parseQuantity,
  startScanning,
  toOutboundPayload,
  updateForm,
  validateOutboundForm,
  type OutboundDraft,
  MAX_OUTBOUND_QUANTITY,
  MESSAGE_PHONE_INVALID,
  MESSAGE_QUANTITY_TOO_LARGE,
  MESSAGE_WAREHOUSE_REQUIRED,
  RECIPIENT_GROUPS,
  composeAddress,
  composeNote,
  isValidPhone,
  recipientGroupLabel,
  sanitisePhone,
  acceptedCodes,
  hasPendingChecks,
  rejectedCodes,
  settleOutboundCode,
} from '../src/features/outbound/outboundDraft';
import {
  ineligibleReason,
  isEligibleForOutbound,
} from '../src/services/wms/outboundWrite';
import {
  AppError,
  resolveFailureReason,
  serverAnswered,
} from '../src/errors/AppError';

// `types: ["jest"]` không kéo theo kiểu Node.
declare const __dirname: string;
import { OutboundResultScreen } from '../src/features/outbound/OutboundResultScreen';
import { OutboundFlow } from '../src/features/outbound/OutboundFlow';
import { OutboundCreateScreen } from '../src/features/outbound/OutboundCreateScreen';
import { OutboundReviewScreen } from '../src/features/outbound/OutboundReviewScreen';
import { BusinessScanScreen } from '../src/features/scan/BusinessScanScreen';
import { AppProviders } from '../src/app/App';
import { createOutbox } from '../src/sync/outbox';
import { createSyncEngine } from '../src/sync/syncEngine';
import { gateBlockedSender } from '../src/sync/bootstrap';
import { createLogger } from '../src/logging/logger';
import {
  createMemoryBackend,
  createStorage,
  setAppStorageForTesting,
} from '../src/storage/storage';

const silentLog = createLogger({ minLevel: 'debug', sink: () => undefined });

const code = (item: string, sku = 'DCCS20083-2') =>
  'HN1|SKU=' + sku + '|ITEM=' + item;

/**
 * Form hợp lệ tối thiểu — dùng làm điểm xuất phát cho các test khác.
 *
 * 🔧 2026-09-06: thêm `warehouseId` (bắt buộc dù không hiện trên form) và đổi
 * `recipientGroup` sang mã thật `DEALER` theo mô tả luồng xuất người dùng cung
 * cấp. Mã cũ `DAI_LY` là tôi tự đặt khi chưa biết enum thật.
 */
function validDraft(quantity = '2'): OutboundDraft {
  return updateForm(initialOutboundDraft, {
    warehouseId: 'wh-1',
    recipientGroup: 'DEALER',
    recipientName: 'Đại lý Minh Anh',
    phone: '0901234567',
    province: '31',
    provinceName: 'Thành phố Hải Phòng',
    ward: '31_LE_CHAN',
    wardName: 'Phường Lê Chân',
    quantity,
  });
}

beforeEach(() => {
  setAppStorageForTesting(createStorage(createMemoryBackend()));
});

// ---------------------------------------------------------------------------

describe('bước 1 — validation form dài (ảnh 25–27)', () => {
  it('form trống báo lỗi ở TỪNG trường bắt buộc', () => {
    const errors = validateOutboundForm(initialOutboundDraft.form);
    expect(errors.recipientGroup).toBe(MESSAGE_GROUP_REQUIRED);
    expect(errors.recipientName).toBe(MESSAGE_RECIPIENT_REQUIRED);
    expect(errors.phone).toBe(MESSAGE_PHONE_REQUIRED);
    expect(errors.province).toBe(MESSAGE_PROVINCE_REQUIRED);
    expect(errors.ward).toBe(MESSAGE_WARD_REQUIRED);
  });

  it('Tên phiếu và Địa chỉ KHÔNG bắt buộc — ảnh 25 không có dấu sao', () => {
    const errors = validateOutboundForm(validDraft().form);
    expect(errors.name).toBeUndefined();
    expect(errors.address).toBeUndefined();
    expect(hasFormErrors(errors)).toBe(false);
  });

  it('kho xuất thiếu thì CHẶN, dù kho không hiện trên form', () => {
    // Mô tả 2026-09-06: "kho không hiển thị trên form nhưng vẫn bắt buộc hợp lệ".
    // Không chặn ở đây thì thủ kho quét xong cả lô mới biết phiếu không gửi được.
    const noWarehouse = updateForm(validDraft(), { warehouseId: '' });
    expect(validateOutboundForm(noWarehouse.form).warehouseId).toBe(
      MESSAGE_WAREHOUSE_REQUIRED,
    );
    expect(MESSAGE_WAREHOUSE_REQUIRED).toContain('WMS');
  });

  describe('số điện thoại — 10 số, đầu số di động', () => {
    it.each(['0901234567', '0312345678', '0512345678', '0712345678', '0812345678'])(
      'nhận %s',
      phone => {
        expect(isValidPhone(phone)).toBe(true);
      },
    );

    it.each([
      ['9 số', '090123456'],
      ['11 số', '09012345678'],
      ['đầu số lạ', '0212345678'],
      ['đầu 01 cũ', '0123456789'],
      ['có chữ', '090123456a'],
      ['rỗng', ''],
    ])('từ chối %s', (_label, phone) => {
      expect(isValidPhone(phone)).toBe(false);
    });

    it('form báo đúng câu lỗi khi sai định dạng', () => {
      const bad = updateForm(validDraft(), { phone: '0212345678' });
      expect(validateOutboundForm(bad.form).phone).toBe(MESSAGE_PHONE_INVALID);
    });

    it('lọc ký tự không phải số ngay lúc gõ', () => {
      expect(sanitisePhone('090 123 4567')).toBe('0901234567');
      expect(sanitisePhone('090.123.4567')).toBe('0901234567');
      expect(sanitisePhone('abc0901234567xyz')).toBe('0901234567');
    });

    it('🔒 KHÔNG tự đổi +84 thành 0 — đoán hộ ở ô liên lạc là chỗ dễ sai', () => {
      // "+84912345678" bỏ ký tự lạ thành "84912345678", cắt 10 còn "8491234567"
      // — một số SAI, và `isValidPhone` phải bắt được.
      const filtered = sanitisePhone('+84912345678');
      expect(filtered).toBe('8491234567');
      expect(isValidPhone(filtered)).toBe(false);
    });
  });

  describe('số lượng — 1 đến 1000', () => {
    it('nhận cận trên', () => {
      const ok = validDraft(String(MAX_OUTBOUND_QUANTITY));
      expect(validateOutboundForm(ok.form).quantity).toBeUndefined();
    });

    it('từ chối vượt trần, kèm câu lỗi nói RÕ trần là bao nhiêu', () => {
      const over = validDraft(String(MAX_OUTBOUND_QUANTITY + 1));
      expect(validateOutboundForm(over.form).quantity).toBe(
        MESSAGE_QUANTITY_TOO_LARGE,
      );
      expect(MESSAGE_QUANTITY_TOO_LARGE).toContain('1000');
    });

    it('vẫn từ chối 0 và chữ', () => {
      expect(validateOutboundForm(validDraft('0').form).quantity).toBe(
        MESSAGE_QUANTITY_INVALID,
      );
      expect(validateOutboundForm(validDraft('3 thùng').form).quantity).toBe(
        MESSAGE_QUANTITY_INVALID,
      );
    });
  });

  it('bấm khi thiếu trường thì hiện CẢ banner tổng LẪN lỗi từng ô', () => {
    // Ảnh 27 có cả hai. Chỉ banner thì phải tự dò ô nào thiếu; chỉ lỗi từng ô
    // thì trên form dài họ không thấy vì ô lỗi nằm ngoài màn hình.
    const blocked = startScanning(initialOutboundDraft);
    expect(blocked.step).toBe(0);
    expect(blocked.showFormError).toBe(true);
    expect(hasFormErrors(blocked.fieldErrors)).toBe(true);
  });

  it('form hợp lệ thì sang bước quét và xoá banner lỗi', () => {
    const started = startScanning(validDraft());
    expect(started.step).toBe(1);
    expect(started.showFormError).toBe(false);
  });

  it('sửa một ô chỉ xoá lỗi của ô đó', () => {
    const blocked = startScanning(initialOutboundDraft);
    const fixed = updateForm(blocked, { phone: '0900000000' });
    expect(fixed.fieldErrors.phone).toBeUndefined();
    expect(fixed.fieldErrors.recipientName).toBe(MESSAGE_RECIPIENT_REQUIRED);
  });
});

describe('số lượng cần quét — phải là số nguyên dương', () => {
  it('nhận số nguyên dương', () => {
    expect(parseQuantity('5')).toBe(5);
    expect(parseQuantity(' 12 ')).toBe(12);
  });

  it('từ chối chuỗi lẫn chữ — "3 thùng" KHÔNG được hiểu thành 3', () => {
    // parseInt('3 thùng') cho 3. Một phiếu xuất sai số lượng là hàng giao
    // thiếu hoặc thừa.
    expect(parseQuantity('3 thùng')).toBeUndefined();
    expect(parseQuantity('3.5')).toBeUndefined();
    expect(parseQuantity('-2')).toBeUndefined();
    expect(parseQuantity('0')).toBeUndefined();
    expect(parseQuantity('')).toBeUndefined();
  });

  it('số lượng sai định dạng báo đúng câu lỗi', () => {
    const draft = updateForm(validDraft(), { quantity: 'ba' });
    expect(validateOutboundForm(draft.form).quantity).toBe(
      MESSAGE_QUANTITY_INVALID,
    );
  });
});

describe('trường phụ thuộc — tỉnh ↔ phường (ảnh 26)', () => {
  it('chưa chọn tỉnh thì ô Phường/Xã bị khoá', () => {
    expect(isWardEnabled(initialOutboundDraft.form)).toBe(false);
  });

  it('chọn tỉnh rồi thì mở khoá', () => {
    const draft = changeProvince(initialOutboundDraft, 'HP');
    expect(isWardEnabled(draft.form)).toBe(true);
  });

  it('ĐỔI tỉnh thì XOÁ phường đã chọn', () => {
    // Giữ phường cũ sau khi đổi tỉnh sinh ra địa chỉ không tồn tại — hàng giao
    // sai nơi. Đây là lỗi im lặng, không ai thấy cho tới lúc giao hàng.
    const chosen = validDraft();
    expect(chosen.form.ward).toBe('31_LE_CHAN');
    const moved = changeProvince(chosen, '01', 'Thành phố Hà Nội');
    expect(moved.form.province).toBe('01');
    expect(moved.form.ward).toBe('');
    // Xoá cả TÊN phường: giữ lại tên cũ thì địa chỉ ghép ra vẫn mang phường của
    // tỉnh khác — đúng cái lỗi im lặng mà test này sinh ra để chặn.
    expect(moved.form.wardName).toBe('');
    expect(moved.form.provinceName).toBe('Thành phố Hà Nội');
  });

  it('chọn lại ĐÚNG tỉnh cũ thì KHÔNG xoá phường', () => {
    const chosen = validDraft();
    expect(changeProvince(chosen, '31').form.ward).toBe('31_LE_CHAN');
  });
});

describe('bước 3 — phải quét ĐỦ số lượng (ảnh 29)', () => {
  it('chưa đủ thì không ghi nhận được', () => {
    // Khác luồng nhập kho, vốn chỉ cần ≥ 1 mã.
    let draft = startScanning(validDraft('2'));
    draft = addOutboundCode(draft, code('A-001'), 0).draft;
    expect(outboundProgress(draft).label).toBe('1/2');
    expect(canRecordOutbound(draft)).toBe(false);
  });

  it('đủ số lượng VÀ đã kiểm xong thì ghi nhận được', () => {
    let draft = startScanning(validDraft('2'));
    draft = addOutboundCode(draft, code('A-001'), 0).draft;
    draft = addOutboundCode(draft, code('A-002'), 1).draft;
    expect(outboundProgress(draft).label).toBe('2/2');

    // 🔧 2026-09-06: đủ số lượng CHƯA đủ — còn phải kiểm xong với WMS.
    expect(hasPendingChecks(draft)).toBe(true);
    expect(canRecordOutbound(draft)).toBe(false);

    draft = settleOutboundCode(draft, draft.codes[0]?.key ?? '', {
      eligible: true,
    });
    draft = settleOutboundCode(draft, draft.codes[1]?.key ?? '', {
      eligible: true,
    });
    expect(canRecordOutbound(draft)).toBe(true);
  });

  describe('🔓 §2g — kết quả resolve-code chặn mã không xuất được', () => {
    function scannedTwo() {
      let draft = startScanning(validDraft('2'));
      draft = addOutboundCode(draft, code('A-001'), 0).draft;
      draft = addOutboundCode(draft, code('A-002'), 1).draft;
      return draft;
    }

    it('mã bị từ chối KHÔNG tính vào tiến độ', () => {
      // Badge "2/2" trong khi có một mã WMS đã từ chối là con số nói dối ở đúng
      // chỗ thủ kho tin nhất.
      let draft = scannedTwo();
      draft = settleOutboundCode(draft, draft.codes[0]?.key ?? '', {
        eligible: true,
      });
      draft = settleOutboundCode(draft, draft.codes[1]?.key ?? '', {
        eligible: false,
        reason: 'Mã đang giữ chỗ cho phiếu PX-01.',
      });

      expect(outboundProgress(draft).label).toBe('1/2');
      expect(canRecordOutbound(draft)).toBe(false);
    });

    it('mã bị từ chối VẪN ở lại danh sách, kèm lý do', () => {
      // Xoá lặng thì thủ kho nghe tiếng bíp nhưng thấy con số không tăng, và
      // không biết phải làm gì với kiện hàng đang cầm trên tay.
      let draft = scannedTwo();
      draft = settleOutboundCode(draft, draft.codes[1]?.key ?? '', {
        eligible: false,
        reason: 'Mã đang giữ chỗ cho phiếu PX-01.',
      });

      expect(draft.codes).toHaveLength(2);
      expect(rejectedCodes(draft)).toHaveLength(1);
      expect(rejectedCodes(draft)[0]?.reason).toContain('PX-01');
    });

    it('payload gửi WMS CHỈ mang mã được chấp nhận', () => {
      // Gửi mã WMS đã từ chối lên `record` là để máy chủ rollback cả lô — spec
      // nói rõ lỗi một item huỷ toàn bộ transaction.
      let draft = scannedTwo();
      draft = settleOutboundCode(draft, draft.codes[0]?.key ?? '', {
        eligible: true,
      });
      draft = settleOutboundCode(draft, draft.codes[1]?.key ?? '', {
        eligible: false,
        reason: 'không đủ điều kiện',
      });

      const payload = toOutboundPayload(draft);
      expect(payload.codes).toHaveLength(1);
      expect(payload.codes[0]?.item).toBe('A-001');
    });

    it('mã đang chờ kiểm VẪN tính vào tiến độ', () => {
      // Nếu không, tiến độ tụt lùi mỗi lần mạng chậm và thủ kho quét thừa để bù.
      const draft = scannedTwo();
      expect(outboundProgress(draft).label).toBe('2/2');
      expect(acceptedCodes(draft)).toHaveLength(2);
    });

    it('resolve trả tên SKU thì cập nhật vào mã', () => {
      let draft = scannedTwo();
      draft = settleOutboundCode(draft, draft.codes[0]?.key ?? '', {
        eligible: true,
        skuName: 'Ống nhựa PVC 90',
        skuCode: 'PVC-90',
      });
      expect(draft.codes[0]?.skuName).toBe('Ống nhựa PVC 90');
      expect(draft.codes[0]?.sku).toBe('PVC-90');
    });
  });

  describe('lý do từ chối — nói được việc cần làm', () => {
    it('nêu SỐ PHIẾU đang giữ chỗ để thủ kho biết đi hỏi ai', () => {
      expect(
        ineligibleReason({ reservation: { doc_no: 'PX-COV-001' } }),
      ).toContain('PX-COV-001');
    });

    it('không có phiếu giữ chỗ thì nêu mã lý do của WMS', () => {
      expect(ineligibleReason({ eligibility_code: 'ITEM_LOCKED' })).toContain(
        'ITEM_LOCKED',
      );
    });

    it('không có gì thì vẫn ra câu đọc được, không để trống', () => {
      expect(ineligibleReason({})).not.toBe('');
    });

    it('🔒 thiếu eligible_for_outbound ⇒ coi là KHÔNG được xuất', () => {
      // Máy chủ chưa nói được thì client không thay nó quyết định. Với thao tác
      // lấy hàng ra khỏi kho, "không biết" phải xử như "không được".
      expect(isEligibleForOutbound({})).toBe(false);
      expect(isEligibleForOutbound({ eligible_for_outbound: false })).toBe(false);
      expect(isEligibleForOutbound({ eligible_for_outbound: true })).toBe(true);
    });
  });

  it('quét trùng ITEM không làm tăng tiến độ', () => {
    let draft = startScanning(validDraft('2'));
    draft = addOutboundCode(draft, code('A-001'), 0).draft;
    const again = addOutboundCode(draft, code('A-001'), 1);
    expect(again.accepted).toBe(false);
    expect(outboundProgress(again.draft).label).toBe('1/2');
  });

  it('quét THỪA vẫn nhận — không nuốt im mã người dùng vừa quét', () => {
    // Ảnh 29 chỉ chặn chiều "chưa đủ". Chặn chiều "thừa" là thêm nghiệp vụ mà
    // bộ ảnh không có; thủ kho quét nhầm cần thấy nó để gỡ ra.
    let draft = startScanning(validDraft('1'));
    draft = addOutboundCode(draft, code('A-001'), 0).draft;
    const extra = addOutboundCode(draft, code('A-002'), 1);
    expect(extra.accepted).toBe(true);
    expect(outboundProgress(extra.draft).label).toBe('2/1');
  });
});

// ---------------------------------------------------------------------------
// Đấu luồng thật — cùng hành vi ScannerPage của Mini App
// ---------------------------------------------------------------------------

describe('đấu luồng quét xuất kho Mini App', () => {
  it('chỉ cộng mã WMS cho phép rồi tự chuyển kiểm tra khi đủ số lượng', async () => {
    const resolveCode = jest.fn().mockResolvedValue({
      raw_code: 'TEM-XUAT-001',
      sku_code: 'SKU-XUAT-01',
      sku_name: 'Ống nhựa PVC 90',
      item_unique: 'ITEM-XUAT-01',
      eligible_for_outbound: true,
    });
    let tree: ReactTestRenderer.ReactTestRenderer | undefined;

    await ReactTestRenderer.act(() => {
      tree = ReactTestRenderer.create(
        <AppProviders>
          <OutboundFlow onExit={() => undefined} resolveCode={resolveCode} />
        </AppProviders>,
      );
    });

    let create = tree?.root.findByType(OutboundCreateScreen);
    await ReactTestRenderer.act(() => {
      create?.props.onChange(validDraft('1'));
    });
    create = tree?.root.findByType(OutboundCreateScreen);
    await ReactTestRenderer.act(() => {
      create?.props.onStart();
    });

    const scanner = tree?.root.findByType(BusinessScanScreen);
    await ReactTestRenderer.act(async () => {
      await scanner?.props.onScan('TEM-XUAT-001', 'CAMERA');
    });

    expect(resolveCode).toHaveBeenCalledWith({
      warehouseId: 'wh-1',
      rawCode: 'TEM-XUAT-001',
    });
    const review = tree?.root.findByType(OutboundReviewScreen);
    expect(review?.props.documentRef).toMatch(/^local-outbound-\d+/);
    expect(review?.props.draft.codes).toMatchObject([
      {
        raw: 'TEM-XUAT-001',
        sku: 'SKU-XUAT-01',
        skuName: 'Ống nhựa PVC 90',
        status: 'ok',
      },
    ]);
    await ReactTestRenderer.act(() => tree?.unmount());
  });

  it('mã WMS từ chối không được cộng vào tiến độ hay danh sách', async () => {
    const resolveCode = jest.fn().mockResolvedValue({
      eligible_for_outbound: false,
      reservation: { doc_no: 'PX-COV-001' },
    });
    let tree: ReactTestRenderer.ReactTestRenderer | undefined;

    await ReactTestRenderer.act(() => {
      tree = ReactTestRenderer.create(
        <AppProviders>
          <OutboundFlow onExit={() => undefined} resolveCode={resolveCode} />
        </AppProviders>,
      );
    });

    let create = tree?.root.findByType(OutboundCreateScreen);
    await ReactTestRenderer.act(() => {
      create?.props.onChange(validDraft('1'));
    });
    create = tree?.root.findByType(OutboundCreateScreen);
    await ReactTestRenderer.act(() => {
      create?.props.onStart();
    });

    const scanner = tree?.root.findByType(BusinessScanScreen);
    let feedback: { accepted?: boolean; message?: string } | undefined;
    await ReactTestRenderer.act(async () => {
      feedback = await scanner?.props.onScan('TEM-KHONG-DUOC-XUAT', 'CAMERA');
    });

    expect(feedback).toMatchObject({ accepted: false });
    expect(feedback?.message).toContain('PX-COV-001');
    const currentScanner = tree?.root.findByType(BusinessScanScreen);
    expect(currentScanner?.props.progressLabel).toBe('0/1');
    await ReactTestRenderer.act(() => tree?.unmount());
  });

  it('hai tem cùng một ITEM WMS chỉ được tính một lần', async () => {
    const resolveCode = jest.fn().mockResolvedValue({
      sku_code: 'SKU-XUAT-01',
      item_unique: 'ITEM-XUAT-01',
      eligible_for_outbound: true,
    });
    let tree: ReactTestRenderer.ReactTestRenderer | undefined;

    await ReactTestRenderer.act(() => {
      tree = ReactTestRenderer.create(
        <AppProviders>
          <OutboundFlow onExit={() => undefined} resolveCode={resolveCode} />
        </AppProviders>,
      );
    });
    let create = tree?.root.findByType(OutboundCreateScreen);
    await ReactTestRenderer.act(() => {
      create?.props.onChange(validDraft('2'));
    });
    create = tree?.root.findByType(OutboundCreateScreen);
    await ReactTestRenderer.act(() => {
      create?.props.onStart();
    });

    let scanner = tree?.root.findByType(BusinessScanScreen);
    await ReactTestRenderer.act(async () => {
      await scanner?.props.onScan('TEM-DAU-TIEN', 'CAMERA');
    });
    scanner = tree?.root.findByType(BusinessScanScreen);
    let feedback: { accepted?: boolean; message?: string } | undefined;
    await ReactTestRenderer.act(async () => {
      feedback = await scanner?.props.onScan('TEM-KHAC-CUNG-KIEN', 'CAMERA');
    });

    expect(feedback).toMatchObject({ accepted: false });
    expect(tree?.root.findByType(BusinessScanScreen).props.progressLabel).toBe('1/2');
    await ReactTestRenderer.act(() => tree?.unmount());
  });

  it('sau record hiện mã phiếu WMS, không hiện ID hàng đợi trên điện thoại', async () => {
    const outbox = createOutbox({
      storage: createStorage(createMemoryBackend()),
      log: silentLog,
    });
    const syncEngine = createSyncEngine({
      outbox,
      send: async () => ({ document_no: 'PX-COV-00060' }),
      log: silentLog,
    });
    const resolveCode = jest.fn().mockResolvedValue({
      sku_code: 'SKU-XUAT-01',
      item_unique: 'ITEM-XUAT-01',
      eligible_for_outbound: true,
    });
    let tree: ReactTestRenderer.ReactTestRenderer | undefined;

    await ReactTestRenderer.act(() => {
      tree = ReactTestRenderer.create(
        <AppProviders>
          <OutboundFlow
            onExit={() => undefined}
            dataLayer={{ outbox, syncEngine }}
            resolveCode={resolveCode}
          />
        </AppProviders>,
      );
    });

    let create = tree?.root.findByType(OutboundCreateScreen);
    await ReactTestRenderer.act(() => {
      create?.props.onChange(validDraft('1'));
    });
    create = tree?.root.findByType(OutboundCreateScreen);
    await ReactTestRenderer.act(() => {
      create?.props.onStart();
    });
    const scanner = tree?.root.findByType(BusinessScanScreen);
    await ReactTestRenderer.act(async () => {
      await scanner?.props.onScan('TEM-XUAT-001', 'CAMERA');
    });

    const review = tree?.root.findByType(OutboundReviewScreen);
    await ReactTestRenderer.act(async () => {
      await review?.props.onRecord();
    });

    const result = tree?.root.findByType(OutboundResultScreen);
    expect(result?.props.documentRef).toBe('PX-COV-00060');
    expect(result?.props.documentName).toMatch(/^Phiếu xuất /);
    await ReactTestRenderer.act(() => tree?.unmount());
  });
});

describe('tồn kho GIẢM, và giảm ở mốc thứ ba', () => {
  it('câu ở màn kết quả nói rõ tồn kho chưa giảm', () => {
    expect(MESSAGE_NOT_ISSUED_BODY).toContain('Tồn kho chỉ giảm sau khi');
    expect(MESSAGE_NOT_ISSUED_BODY).toContain('Post Issue');
  });

  it('trạng thái là "Chờ duyệt xuất kho", KHÔNG phải "Đã xuất"', async () => {
    let tree: ReactTestRenderer.ReactTestRenderer | undefined;
    await ReactTestRenderer.act(() => {
      tree = ReactTestRenderer.create(
        <AppProviders>
          <OutboundResultScreen
            documentName="Phiếu xuất"
            documentRef="PX-COV-00060"
            recipientName="Khách lẻ - Trần Thị Chín"
            quantity={5}
            outcome="posted"
            onHome={() => undefined}
            onNext={() => undefined}
          />
        </AppProviders>,
      );
    });
    const text = JSON.stringify(tree?.toJSON());
    expect(text).toContain('Chờ duyệt xuất kho');
    expect(text).toContain('Đã gửi duyệt phiếu xuất');
    // Hàng chưa rời kho ở mốc này.
    expect(text).not.toContain('Đã xuất kho thành công');
    await ReactTestRenderer.act(() => tree?.unmount());
  });
});

describe('§2d — bước ghi bị chặn, dữ liệu không mất', () => {
  it('phiếu xuất vào hàng đợi với khoá ổn định rồi bị chặn', async () => {
    const outbox = createOutbox({
      storage: createStorage(createMemoryBackend()),
      log: silentLog,
    });
    const syncEngine = createSyncEngine({
      outbox,
      send: gateBlockedSender,
      log: silentLog,
    });

    let draft = startScanning(validDraft('1'));
    draft = addOutboundCode(draft, code('A-001'), 0).draft;

    const record = outbox.enqueue({
      kind: OUTBOUND_OUTBOX_KIND,
      payload: toOutboundPayload(draft),
    });
    const result = await syncEngine.syncOne(record.id);

    expect(result.state).toBe('pending');
    expect(result.reason).toContain('GATE_WMS_API_INTEGRATION');

    const stored = outbox.get(record.id);
    expect(stored?.idempotencyKey).toBe(record.idempotencyKey);
    const payload = stored?.payload as { quantity: number; codes: unknown[] };
    expect(payload.quantity).toBe(1);
    expect(payload.codes).toHaveLength(1);
  });

  it('payload KHÔNG tự sinh Idempotency-Key', () => {
    const payload = toOutboundPayload(validDraft());
    expect(JSON.stringify(payload)).not.toContain('dempotency');
  });
});

// ---------------------------------------------------------------------------
// Payload gửi WMS — mô tả luồng xuất 2026-09-06
// ---------------------------------------------------------------------------

describe('payload phiếu xuất', () => {
  function scanned(quantity = '2') {
    let draft = startScanning(validDraft(quantity));
    draft = addOutboundCode(draft, code('A-001'), 1).draft;
    draft = addOutboundCode(draft, code('A-002'), 2, 'MANUAL').draft;
    return draft;
  }

  it('ghép địa chỉ theo thứ tự: chi tiết, phường, tỉnh', () => {
    const draft = updateForm(validDraft(), { address: 'Số 5 ngõ 12' });
    expect(composeAddress(draft.form)).toBe(
      'Số 5 ngõ 12, Phường Lê Chân, Thành phố Hải Phòng',
    );
  });

  it('bỏ phần rỗng, không sinh dấu phẩy thừa', () => {
    // Địa chỉ chi tiết không bắt buộc. ", , Hải Phòng" trông như dữ liệu hỏng.
    expect(composeAddress(validDraft().form)).toBe(
      'Phường Lê Chân, Thành phố Hải Phòng',
    );
    expect(composeAddress(validDraft().form)).not.toContain(', ,');
  });

  it('gộp nhóm đối tượng vào note đúng định dạng đã mô tả', () => {
    // ⚠️ Backend CHƯA có trường `recipient_type` — giữ đúng cách app cũ gộp.
    const draft = updateForm(validDraft(), { note: 'giao buổi sáng' });
    expect(composeNote(draft.form)).toBe(
      'Đối tượng xuất: Đại Lý · giao buổi sáng',
    );
  });

  it('không có ghi chú thì note chỉ còn nhóm đối tượng', () => {
    expect(composeNote(validDraft().form)).toBe('Đối tượng xuất: Đại Lý');
  });

  it('bốn nhóm đối tượng đúng mã và nhãn đã cho', () => {
    expect(RECIPIENT_GROUPS.map(group => group.value)).toEqual([
      'DEALER',
      'DISTRIBUTOR',
      'CONSTRUCTION_CUSTOMER',
      'RETAIL_CUSTOMER',
    ]);
    expect(recipientGroupLabel('CONSTRUCTION_CUSTOMER')).toBe(
      'Khách Công Trường',
    );
  });

  it('tên phiếu để trống thì tự sinh, KHÔNG gửi chuỗi rỗng', () => {
    // `name` là thứ người duyệt nhìn thấy đầu tiên; hàng không tên thì không
    // phân biệt được với hàng khác.
    const payload = toOutboundPayload(scanned(), new Date(2026, 8, 6, 14, 5));
    expect(payload.name).toBe('Phiếu xuất 14:05 06/09');
  });

  it('có tên thì giữ nguyên tên người dùng nhập', () => {
    const draft = updateForm(scanned(), { name: 'Giao Hải Phòng' });
    expect(toOutboundPayload(draft).name).toBe('Giao Hải Phòng');
  });

  it('giữ nguyên nguồn quét của từng mã', () => {
    const payload = toOutboundPayload(scanned());
    expect(payload.codes.map(item => item.source)).toEqual([
      'CAMERA',
      'MANUAL',
    ]);
  });

  it('mang theo kho xuất và địa chỉ đã ghép', () => {
    const payload = toOutboundPayload(scanned());
    expect(payload.warehouseId).toBe('wh-1');
    expect(payload.recipientAddress).toContain('Hải Phòng');
  });

  it('KHÔNG tự sinh Idempotency-Key trong payload', () => {
    expect(JSON.stringify(toOutboundPayload(scanned()))).not.toContain(
      'dempotency',
    );
  });
});

// ---------------------------------------------------------------------------
// 🔴 Phân biệt "WMS trả lời" với "chưa hỏi được" — đo thật 2026-09-06
// ---------------------------------------------------------------------------

describe('🔴 lý do khi resolve-code thất bại', () => {
  it('4xx ⇒ WMS ĐÃ trả lời, nói đúng vậy', () => {
    // Đo thật trên máy: `outbound/resolve-code` trả 422 SKU_NOT_FOUND cho mã
    // lạ. Báo "chưa hỏi được" ở đây khiến thủ kho đi kiểm tra mạng trong khi
    // vấn đề nằm ở cái tem.
    const reason = resolveFailureReason(
      new AppError({
        kind: 'http',
        status: 422,
        code: 'SKU_NOT_FOUND',
        message: 'x',
      }),
      'HN1|SKU=LA',
    );
    expect(reason).toContain('WMS không nhận ra mã');
    expect(reason).toContain('SKU_NOT_FOUND');
    expect(reason).not.toContain('Chưa hỏi được');
  });

  it('mất mạng ⇒ CHƯA hỏi được, không kết luận gì về mã', () => {
    const reason = resolveFailureReason(
      new AppError({ kind: 'network', message: 'mất mạng' }),
      'A-001',
    );
    expect(reason).toContain('Chưa hỏi được WMS');
    expect(reason).toContain('Quét lại khi có mạng');
  });

  it('🔒 5xx xếp vào CHƯA HỎI ĐƯỢC — máy chủ lỗi thì chưa đánh giá gì', () => {
    // Kết luận "mã hỏng" từ một lỗi 500 là bịa: máy chủ chưa hề nhìn vào mã.
    expect(serverAnswered(new AppError({ kind: 'http', status: 503, message: '' })))
      .toBe(false);
    expect(
      resolveFailureReason(
        new AppError({ kind: 'http', status: 500, message: 'x' }),
        'A-001',
      ),
    ).toContain('Chưa hỏi được');
  });

  it('timeout cũng là chưa hỏi được', () => {
    expect(serverAnswered(new AppError({ kind: 'timeout', message: '' }))).toBe(
      false,
    );
  });

  it('🔒 HAI luồng dùng CHUNG một hàm, không viết lại điều kiện', () => {
    // Lỗi này đã xảy ra hai lần — bảo hành rồi tới xuất kho. Khoá lại.
    const fs = require('fs');
    const path = require('path');
    for (const file of [
      'src/features/outbound/OutboundFlow.tsx',
      'src/features/warranty/WarrantyIntakeFlow.tsx',
    ]) {
      const source = fs.readFileSync(
        path.join(__dirname, '..', ...file.split('/')),
        'utf8',
      );
      // Không tệp nào được tự viết lại phép so sánh dải 4xx.
      expect(source).not.toMatch(/status\s*<\s*500/);
    }
  });
});
