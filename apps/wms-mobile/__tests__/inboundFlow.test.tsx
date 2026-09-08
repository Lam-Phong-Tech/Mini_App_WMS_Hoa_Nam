/**
 * Đợt 2 của Prompt 4 — luồng Nhập kho (ảnh 18–24).
 *
 * Trọng tâm test là hai thứ dễ port sai nhất:
 *
 * 1. **Ba mốc tồn kho** — quét (máy) → ghi nhận (tạo phiếu, chờ duyệt) →
 *    Post Receipt (tăng tồn). Nói nhầm mốc là thủ kho tưởng hàng đã vào kho.
 * 2. **Bước ghi bị Gate chặn nhưng dữ liệu KHÔNG mất** — phiếu phải nằm lại
 *    hàng đợi với `idempotencyKey` ổn định.
 *
 * ❗ Không test nào gọi mạng.
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

import {
  INBOUND_OUTBOX_KIND,
  INBOUND_STEPS,
  MESSAGE_NAME_REQUIRED,
  MESSAGE_WAREHOUSE_REQUIRED,
  MESSAGE_NOT_POSTED_BODY,
  addComponentBox,
  addScannedCode,
  addResolvedScannedCode,
  canContinueToScan,
  canRecord,
  continueToScan,
  dedupePhysicalInboundCodes,
  groupBySku,
  initialInboundDraft,
  parseComponentBoxCode,
  parseComponentBoxQuantity,
  removeScannedCode,
  removeNewestSkuCode,
  setDraftName,
  setDraftWarehouse,
  toOutboxPayload,
  totals,
} from '../src/features/inbound/inboundDraft';
import { InboundFlow } from '../src/features/inbound/InboundFlow';
import { InboundCreateScreen } from '../src/features/inbound/InboundCreateScreen';
import { InboundReviewScreen } from '../src/features/inbound/InboundReviewScreen';
import { SWIPE_DELETE_THRESHOLD } from '../src/ui/SwipeToDelete';
import { BusinessScanScreen } from '../src/features/scan/BusinessScanScreen';
import { InboundResultScreen } from '../src/features/inbound/InboundResultScreen';
import { Button } from '../src/ui/Button';
import { Input } from '../src/ui/Input';
import { CodeInput } from '../src/ui/CodeInput';
import { Sheet } from '../src/ui/Sheet';
import { AppProviders } from '../src/app/App';
import { createOutbox } from '../src/sync/outbox';
import { createSyncEngine } from '../src/sync/syncEngine';
import { gateBlockedSender } from '../src/sync/bootstrap';
import { createInboundSender } from '../src/sync/inboundSender';
import {
  MESSAGE_WRONG_ENVIRONMENT,
  resetTierCheckForTesting,
  setTierCheckForTesting,
} from '../src/services/wms/tierCheck';
import { createLogger } from '../src/logging/logger';
import { AppError } from '../src/errors/AppError';
import {
  createMemoryBackend,
  createStorage,
  setAppStorageForTesting,
} from '../src/storage/storage';

const silentLog = createLogger({ minLevel: 'debug', sink: () => undefined });

/** Mã production thật: `HN1|SKU=…|ITEM=…` — người dùng xác nhận 2026-09-05. */
const code = (item: string, sku = 'DCCS20083-2') =>
  'HN1|SKU=' + sku + '|ITEM=' + item;

beforeEach(() => {
  setAppStorageForTesting(createStorage(createMemoryBackend()));
});

// ---------------------------------------------------------------------------

describe('chống trùng hiện vật trước khi tạo batch nhập', () => {
  it('hai QR khác nhau cùng item_id chỉ giữ một dòng', () => {
    const first = addResolvedScannedCode(
      initialInboundDraft,
      'https://qr.example/tem-a',
      1,
      'CAMERA',
      { itemId: '0f5c5b9a-0001', itemUnique: 'ITEM-A', skuCode: 'SKU-A' },
    );
    const second = addResolvedScannedCode(
      first.draft,
      'https://qr.example/tem-b',
      2,
      'CAMERA',
      { itemId: '0f5c5b9a-0001', itemUnique: 'ITEM-B', skuCode: 'SKU-A' },
    );

    expect(first.accepted).toBe(true);
    expect(second.accepted).toBe(false);
    expect(second.draft.codes).toHaveLength(1);
  });

  it('candidate chưa có item_id vẫn khóa theo item_unique', () => {
    const first = addResolvedScannedCode(
      initialInboundDraft,
      'SKU-CANDIDATE-A',
      1,
      'CAMERA',
      { itemUnique: 'ITEM-CANDIDATE-01', skuCode: 'SKU-CANDIDATE' },
    );
    const second = addResolvedScannedCode(
      first.draft,
      'SKU-CANDIDATE-B',
      2,
      'CAMERA',
      { itemUnique: 'ITEM-CANDIDATE-01', skuCode: 'SKU-CANDIDATE' },
    );

    expect(second.accepted).toBe(false);
  });

  it('lớp cuối loại dòng trùng của nháp cũ nhưng giữ SKU trần lặp', () => {
    const legacy = {
      ...initialInboundDraft,
      codes: [
        {
          key: 'legacy-a',
          raw: 'https://qr.example/a',
          itemId: 'item-01',
          item: 'ITEM-A',
          quantity: 1,
          source: 'CAMERA' as const,
          at: 1,
        },
        {
          key: 'legacy-b',
          raw: 'https://qr.example/b',
          itemId: 'item-01',
          item: 'ITEM-B',
          quantity: 1,
          source: 'CAMERA' as const,
          at: 2,
        },
        {
          key: 'sku-1',
          raw: 'SKU-REPEAT',
          quantity: 1,
          source: 'CAMERA' as const,
          at: 3,
        },
        {
          key: 'sku-2',
          raw: 'SKU-REPEAT',
          quantity: 1,
          source: 'CAMERA' as const,
          at: 4,
        },
      ],
    };

    expect(
      dedupePhysicalInboundCodes(legacy).codes.map(code => code.key),
    ).toEqual(['legacy-a', 'sku-1', 'sku-2']);
  });
});

// ---------------------------------------------------------------------------

describe('bước 1 — tạo phiếu (ảnh 18)', () => {
  it('bốn bước đúng nhãn trong ảnh', () => {
    expect(INBOUND_STEPS).toEqual([
      'Thông tin',
      'Quét mã',
      'Kiểm tra',
      'Gửi duyệt',
    ]);
  });

  it('chưa nhập tên thì KHÔNG sang bước quét được', () => {
    // Ảnh 18: nút "TIẾP TỤC QUÉT" ở trạng thái mờ. Khác màn Đăng nhập, nơi nút
    // luôn bấm được — giữ đúng từng màn, không thống nhất cho gọn.
    expect(canContinueToScan(initialInboundDraft)).toBe(false);
    const blocked = continueToScan(initialInboundDraft);
    expect(blocked.step).toBe(0);
    expect(blocked.nameError).toBe(MESSAGE_NAME_REQUIRED);
  });

  it('tên chỉ có khoảng trắng vẫn là trống', () => {
    expect(canContinueToScan(setDraftName(initialInboundDraft, '   '))).toBe(
      false,
    );
  });

  it('có tên NHƯNG chưa có kho nhận thì vẫn KHÔNG sang bước quét', () => {
    // 🔧 2026-09-06: contract `inbound/record` bắt buộc `dst_warehouse_id`.
    // Cho qua bước này khi thiếu kho nghĩa là để thủ kho quét xong cả lô rồi
    // mới biết phiếu không gửi được — mất công vô ích ở đúng chỗ tốn công nhất.
    const named = setDraftName(initialInboundDraft, 'Lô hàng sáng');
    expect(canContinueToScan(named)).toBe(false);
    const blocked = continueToScan(named);
    expect(blocked.step).toBe(0);
    expect(blocked.warehouseError).toBe(MESSAGE_WAREHOUSE_REQUIRED);
    // Tên hợp lệ thì KHÔNG được báo lỗi tên kèm theo.
    expect(blocked.nameError).toBeUndefined();
  });

  it('thiếu cả hai thì báo CẢ HAI lỗi cùng lúc', () => {
    const blocked = continueToScan(initialInboundDraft);
    expect(blocked.nameError).toBe(MESSAGE_NAME_REQUIRED);
    expect(blocked.warehouseError).toBe(MESSAGE_WAREHOUSE_REQUIRED);
  });

  it('có tên và kho thì sang bước quét', () => {
    const ready = setDraftWarehouse(
      setDraftName(initialInboundDraft, 'Lô hàng sáng'),
      'wh-1',
      'KHO01 — Kho tổng',
    );
    expect(canContinueToScan(ready)).toBe(true);
    expect(continueToScan(ready).step).toBe(1);
  });

  it('lỗi kho nói là CHƯA LẤY ĐƯỢC, không phải "vui lòng chọn"', () => {
    // Kho không phải thứ người dùng gõ ra — nó đến từ WMS. Nguyên nhân thường
    // là mất mạng, nên câu chữ phải chỉ đúng chỗ để họ khỏi loay hoay bấm lại.
    expect(MESSAGE_WAREHOUSE_REQUIRED).toContain('WMS');
  });
});

describe('bước 2 — quét và gom theo SKU (ảnh 18, 19)', () => {
  const named = setDraftWarehouse(
    setDraftName(initialInboundDraft, 'Lô sáng'),
    'wh-1',
  );

  it('gom mã cùng SKU nhưng ĐẾM ĐỦ từng ITEM', () => {
    // Ảnh 18: "Mini App gom các mã cùng SKU sau khi quét".
    // Prompt 3: mỗi ITEM là một kiện vật lý ⇒ 4 kiện cùng SKU phải đếm đủ 4.
    let draft = named;
    for (const item of ['A-001', 'A-002', 'A-003', 'A-004']) {
      draft = addScannedCode(draft, code(item), 0).draft;
    }
    expect(totals(draft).totalScanned).toBe(4);
    expect(totals(draft).skuCount).toBe(1);
    expect(groupBySku(draft.codes)[0]?.codes).toHaveLength(4);
  });

  it('quét lại cùng ITEM thì bị từ chối, không tăng số lượng', () => {
    let draft = addScannedCode(named, code('A-001'), 0).draft;
    const again = addScannedCode(draft, code('A-001'), 1);
    expect(again.accepted).toBe(false);
    expect(totals(again.draft).totalScanned).toBe(1);
  });

  it('giữ THỨ TỰ quét, không sắp xếp lại', () => {
    // Thủ kho quét theo thứ tự lấy hàng khỏi thùng; danh sách nhảy loạn sau mỗi
    // lần quét làm họ mất chỗ đang nhìn.
    let draft = named;
    draft = addScannedCode(draft, code('B-1', 'SKU-B'), 0).draft;
    draft = addScannedCode(draft, code('A-1', 'SKU-A'), 1).draft;
    expect(groupBySku(draft.codes).map(group => group.sku)).toEqual([
      'SKU-B',
      'SKU-A',
    ]);
  });

  it('mã không đọc được SKU vẫn hiện, không bị nuốt', () => {
    // Nuốt đi là giấu mất hàng đã quét.
    const draft = addScannedCode(named, 'MA-LA-KHONG-THEO-DINH-DANG', 0).draft;
    expect(totals(draft).totalScanned).toBe(1);
    expect(groupBySku(draft.codes)).toHaveLength(1);
  });

  it('chỉ thêm mã sau khi dùng kết quả resolve của WMS', () => {
    const resolved = addResolvedScannedCode(
      named,
      'tem-vat-ly-001',
      0,
      'MANUAL',
      {
        skuCode: 'SKU-WMS-01',
        skuName: 'Máy bơm WMS',
        itemUnique: 'ITEM-WMS-01',
      },
    );
    expect(resolved.accepted).toBe(true);
    expect(resolved.draft.codes[0]).toMatchObject({
      raw: 'tem-vat-ly-001',
      sku: 'SKU-WMS-01',
      skuName: 'Máy bơm WMS',
      item: 'ITEM-WMS-01',
      source: 'MANUAL',
    });
  });

  it('SKU đã có trên WMS được quét lại để cộng số lượng; không báo trùng', () => {
    const first = addResolvedScannedCode(named, 'SKU-BOM-01', 0, 'CAMERA', {
      skuCode: 'SKU-BOM-01',
      skuName: 'Máy bơm',
    });
    const second = addResolvedScannedCode(
      first.draft,
      'SKU-BOM-01',
      1,
      'CAMERA',
      { skuCode: 'SKU-BOM-01', skuName: 'Máy bơm' },
    );

    expect(first.accepted).toBe(true);
    expect(second.accepted).toBe(true);
    expect(totals(second.draft).totalScanned).toBe(2);
    expect(groupBySku(second.draft.codes)).toHaveLength(1);
    expect(second.draft.codes[0]?.key).not.toBe(second.draft.codes[1]?.key);
  });

  it('QR hiện vật không có ITEM vẫn bị chặn nếu quét lại cùng tem', () => {
    const first = addResolvedScannedCode(
      named,
      'https://qr.example/item-001',
      0,
      'CAMERA',
      { skuCode: 'SKU-BOM-01' },
    );
    const second = addResolvedScannedCode(
      first.draft,
      'https://qr.example/item-001',
      1,
      'CAMERA',
      { skuCode: 'SKU-BOM-01' },
    );

    expect(second.accepted).toBe(false);
    expect(totals(second.draft).totalScanned).toBe(1);
  });

  it('nhận đúng hộp linh kiện, kể cả SKU có dấu gạch ngang', () => {
    expect(parseComponentBoxCode('BOX-DCCS20083-2-001')).toEqual({
      raw: 'BOX-DCCS20083-2-001',
      sku: 'DCCS20083-2',
      boxNumber: '001',
    });
    expect(parseComponentBoxCode('BOX--001')).toBeUndefined();
    expect(parseComponentBoxCode('BOX-DCPL1-HOP01')).toBeUndefined();
  });

  it('hộp linh kiện ghi nhận số lượng đã kiểm đếm, không coi hộp là 1 món', () => {
    const box = parseComponentBoxCode('BOX-DCPL1-001');
    expect(box).toBeDefined();
    expect(parseComponentBoxQuantity('24')).toBe(24);
    expect(parseComponentBoxQuantity('024')).toBe(24);
    expect(parseComponentBoxQuantity('0')).toBeUndefined();
    expect(parseComponentBoxQuantity('2.5')).toBeUndefined();

    const added = addComponentBox(named, box!, 24, 0, 'CAMERA');
    expect(added.accepted).toBe(true);
    expect(totals(added.draft).totalScanned).toBe(24);
    expect(added.draft.codes[0]).toMatchObject({
      sku: 'DCPL1',
      itemType: 'COMPONENT',
      quantity: 24,
      boxNumber: '001',
    });
  });

  it('xoá được một mã đã quét (ảnh 20: "Vuốt trái để xoá")', () => {
    let draft = addScannedCode(named, code('A-001'), 0).draft;
    draft = addScannedCode(draft, code('A-002'), 1).draft;
    const key = draft.codes[0]?.key ?? '';
    expect(totals(removeScannedCode(draft, key)).totalScanned).toBe(1);
  });
});

describe('đấu luồng quét Mini App', () => {
  it('chỉ cộng mã sau resolve-code và đưa tên SKU WMS sang màn kiểm tra', async () => {
    const resolveCode = jest.fn().mockResolvedValue({
      raw_code: 'TEM-001',
      sku_code: 'SKU-WMS-01',
      sku_name: 'Máy bơm WMS',
      item_unique: 'ITEM-WMS-01',
    });
    let tree: ReactTestRenderer.ReactTestRenderer | undefined;

    await ReactTestRenderer.act(() => {
      tree = ReactTestRenderer.create(
        <AppProviders>
          <InboundFlow
            onExit={() => undefined}
            resolveCode={resolveCode}
            lookupExistingSku={async () => undefined}
          />
        </AppProviders>,
      );
    });

    let create = tree?.root.findByType(InboundCreateScreen);
    await ReactTestRenderer.act(() => {
      create?.props.onChange(
        setDraftWarehouse(
          setDraftName(create?.props.draft ?? initialInboundDraft, 'Lô WMS'),
          'wh-1',
          'KHO01 — Kho tổng',
        ),
      );
    });
    create = tree?.root.findByType(InboundCreateScreen);
    await ReactTestRenderer.act(() => {
      create?.props.onContinue();
    });

    const scanner = tree?.root.findByType(BusinessScanScreen);
    await ReactTestRenderer.act(async () => {
      await scanner?.props.onScan('TEM-001', 'CAMERA');
    });
    expect(resolveCode).toHaveBeenCalledWith({
      warehouseId: 'wh-1',
      rawCode: 'TEM-001',
    });

    await ReactTestRenderer.act(() => {
      scanner?.props.onDone();
    });
    const review = tree?.root.findByType(InboundReviewScreen);
    expect(review?.props.documentRef).toMatch(/^local-/);
    expect(review?.props.draft.codes[0]).toMatchObject({
      sku: 'SKU-WMS-01',
      skuName: 'Máy bơm WMS',
      item: 'ITEM-WMS-01',
    });
    await ReactTestRenderer.act(() => tree?.unmount());
  });

  it.each(['IN_STOCK', 'ISSUED'])(
    'không đưa mã %s vào batch nhập dù resolve-code thành công',
    async stockStatus => {
      const resolveCode = jest.fn().mockResolvedValue({
        raw_code: 'TEM-NOT-RECEIVABLE',
        item_id: 'item-not-receivable',
        sku_code: 'SKU-WMS-01',
        stock_status: stockStatus,
      });
      let tree: ReactTestRenderer.ReactTestRenderer | undefined;

      await ReactTestRenderer.act(() => {
        tree = ReactTestRenderer.create(
          <AppProviders>
            <InboundFlow
              onExit={() => undefined}
              resolveCode={resolveCode}
              lookupExistingSku={async () => undefined}
            />
          </AppProviders>,
        );
      });
      let create = tree?.root.findByType(InboundCreateScreen);
      await ReactTestRenderer.act(() => {
        create?.props.onChange(
          setDraftWarehouse(
            setDraftName(create?.props.draft ?? initialInboundDraft, 'Lô WMS'),
            'wh-1',
          ),
        );
      });
      create = tree?.root.findByType(InboundCreateScreen);
      await ReactTestRenderer.act(() => create?.props.onContinue());

      const scanner = tree?.root.findByType(BusinessScanScreen);
      await expect(
        scanner?.props.onScan('TEM-NOT-RECEIVABLE', 'CAMERA'),
      ).rejects.toMatchObject({
        status: 422,
        code: 'ITEM_NOT_RECEIVABLE',
      });
      expect(tree?.root.findByType(BusinessScanScreen).props.scannedCount).toBe(
        0,
      );
      await ReactTestRenderer.act(() => tree?.unmount());
    },
  );

  it('mã SKU mới bắt buộc chọn sản phẩm hoặc linh kiện trước khi thêm vào phiếu', async () => {
    const resolveCode = jest.fn().mockResolvedValue({
      raw_code: 'SKU-MOI-01',
      resolution_status: 'NEW_SKU_CANDIDATE',
    });
    let tree: ReactTestRenderer.ReactTestRenderer | undefined;

    await ReactTestRenderer.act(() => {
      tree = ReactTestRenderer.create(
        <AppProviders>
          <InboundFlow
            onExit={() => undefined}
            resolveCode={resolveCode}
            lookupExistingSku={async () => undefined}
          />
        </AppProviders>,
      );
    });
    let create = tree?.root.findByType(InboundCreateScreen);
    await ReactTestRenderer.act(() => {
      create?.props.onChange(
        setDraftWarehouse(
          setDraftName(create?.props.draft ?? initialInboundDraft, 'Lô mới'),
          'wh-1',
        ),
      );
    });
    create = tree?.root.findByType(InboundCreateScreen);
    await ReactTestRenderer.act(() => create?.props.onContinue());

    let scanner = tree?.root.findByType(BusinessScanScreen);
    await ReactTestRenderer.act(async () => {
      await scanner?.props.onScan('SKU-MOI-01', 'CAMERA');
    });
    scanner = tree?.root.findByType(BusinessScanScreen);
    expect(scanner?.props.scannedCount).toBe(0);
    expect(scanner?.props.scanPaused).toBe(true);
    expect(JSON.stringify(tree?.toJSON())).toContain(
      'Đây là sản phẩm hay linh kiện?',
    );

    const componentButton = tree?.root
      .findAllByType(Button)
      .find(button => button.props.label === 'Linh kiện');
    await ReactTestRenderer.act(() => componentButton?.props.onPress());
    scanner = tree?.root.findByType(BusinessScanScreen);
    expect(scanner?.props.scannedCount).toBe(1);
    expect(scanner?.props.scanPaused).toBe(false);

    await ReactTestRenderer.act(() => scanner?.props.onDone());
    const review = tree?.root.findByType(InboundReviewScreen);
    expect(review?.props.draft.codes[0]).toMatchObject({
      itemType: 'COMPONENT',
      quantity: 1,
    });
    await ReactTestRenderer.act(() => tree?.unmount());
  });

  it('resolver báo SKU mới nhưng tồn kho có SKU thì vẫn cộng vào SKU hiện hữu', async () => {
    const resolveCode = jest.fn().mockResolvedValue({
      raw_code: 'HN1|SKU=HN-PV-BASE-002|ITEM=PV-002-001',
      resolution_status: 'NEW_SKU_CANDIDATE',
    });
    const lookupExistingSku = jest.fn().mockResolvedValue({
      skuCode: 'HN-PV-BASE-002',
      skuName: 'Máy bơm nước PV mẫu 002',
      warehouseName: 'Kho tổng Hoa Nam',
      stockStatus: 'Khả dụng',
      availableQuantity: 26,
      foundInInventory: true,
    });
    let tree: ReactTestRenderer.ReactTestRenderer | undefined;

    await ReactTestRenderer.act(() => {
      tree = ReactTestRenderer.create(
        <AppProviders>
          <InboundFlow
            onExit={() => undefined}
            resolveCode={resolveCode}
            lookupExistingSku={lookupExistingSku}
          />
        </AppProviders>,
      );
    });
    let create = tree?.root.findByType(InboundCreateScreen);
    await ReactTestRenderer.act(() => {
      create?.props.onChange(
        setDraftWarehouse(
          setDraftName(
            create?.props.draft ?? initialInboundDraft,
            'Lô đối soát',
          ),
          'wh-1',
        ),
      );
    });
    create = tree?.root.findByType(InboundCreateScreen);
    await ReactTestRenderer.act(() => create?.props.onContinue());

    let scanner = tree?.root.findByType(BusinessScanScreen);
    let firstFeedback: unknown;
    await ReactTestRenderer.act(async () => {
      firstFeedback = await scanner?.props.onScan(
        'HN1|SKU=HN-PV-BASE-002|ITEM=PV-002-001',
        'CAMERA',
      );
    });
    scanner = tree?.root.findByType(BusinessScanScreen);
    let secondFeedback: unknown;
    await ReactTestRenderer.act(async () => {
      secondFeedback = await scanner?.props.onScan(
        'HN1|SKU=HN-PV-BASE-002|ITEM=PV-002-002',
        'CAMERA',
      );
    });

    expect(lookupExistingSku).toHaveBeenCalledTimes(2);
    expect(String((firstFeedback as { message?: string }).message)).toContain(
      'đã có trong kho',
    );
    expect(String((secondFeedback as { message?: string }).message)).toContain(
      'SL SKU: 2',
    );
    expect(tree?.root.findByType(BusinessScanScreen).props.scannedCount).toBe(
      2,
    );
    expect(
      tree?.root.findAllByType(Sheet).some(sheet => sheet.props.visible),
    ).toBe(false);
    await ReactTestRenderer.act(() => tree?.unmount());
  });

  it('QR DCCS20061-2 trong batch 121-170 vào SKU có sẵn dù chưa có tồn', async () => {
    // Regression: QR 122 trong docs/qr-test-codes-composite-121-170.
    // Đây là ITEM mới của SKU DCCS20061-2, không phải yêu cầu tạo SKU mới.
    const raw = 'HN1|SKU=DCCS20061-2|ITEM=DCCS20061-2-001';
    const resolveCode = jest.fn().mockResolvedValue({
      raw_code: raw,
      resolution_status: 'NEW_ITEM_CANDIDATE',
      // Một số bản backend cũ chỉ echo sku_code. NEW_ITEM vẫn khẳng định
      // SKU có sẵn, không được mở luồng tạo SKU mới.
      sku_id: null,
      sku_code: 'DCCS20061-2',
      sku_name: 'SKU DCCS20061-2',
      item_id: null,
      item_unique: 'DCCS20061-2-001',
    });
    // SKU có trong danh mục nhưng chưa có balance. App không cần dò lại trang
    // danh mục vì `sku_id` từ resolver đã là bằng chứng có thẩm quyền.
    const lookupExistingSku = jest.fn().mockResolvedValue(undefined);
    let tree: ReactTestRenderer.ReactTestRenderer | undefined;

    await ReactTestRenderer.act(() => {
      tree = ReactTestRenderer.create(
        <AppProviders>
          <InboundFlow
            onExit={() => undefined}
            resolveCode={resolveCode}
            lookupExistingSku={lookupExistingSku}
          />
        </AppProviders>,
      );
    });
    let create = tree?.root.findByType(InboundCreateScreen);
    await ReactTestRenderer.act(() => {
      create?.props.onChange(
        setDraftWarehouse(
          setDraftName(
            create?.props.draft ?? initialInboundDraft,
            'Lô SKU chưa tồn',
          ),
          'wh-1',
        ),
      );
    });
    create = tree?.root.findByType(InboundCreateScreen);
    await ReactTestRenderer.act(() => create?.props.onContinue());

    const scanner = tree?.root.findByType(BusinessScanScreen);
    let feedback: unknown;
    await ReactTestRenderer.act(async () => {
      feedback = await scanner?.props.onScan(raw, 'CAMERA');
    });

    expect(lookupExistingSku).not.toHaveBeenCalled();
    expect(String((feedback as { message?: string }).message)).toContain(
      'đã có trên WMS',
    );
    expect(tree?.root.findByType(BusinessScanScreen).props.scannedCount).toBe(
      1,
    );
    expect(
      tree?.root.findAllByType(Sheet).some(sheet => sheet.props.visible),
    ).toBe(false);
    await ReactTestRenderer.act(() => tree?.unmount());
  });

  it('không nhận SKU trần đã có khi backend không tìm được mã hiện vật', async () => {
    const resolveCode = jest.fn().mockResolvedValue({
      raw_code: 'HN-PV-BASE-002',
      resolution_status: 'NEW_SKU_CANDIDATE',
    });
    const lookupExistingSku = jest.fn().mockResolvedValue({
      skuCode: 'HN-PV-BASE-002',
      skuName: 'Máy bơm nước PV mẫu 002',
      foundInInventory: true,
    });
    let tree: ReactTestRenderer.ReactTestRenderer | undefined;

    await ReactTestRenderer.act(() => {
      tree = ReactTestRenderer.create(
        <AppProviders>
          <InboundFlow
            onExit={() => undefined}
            resolveCode={resolveCode}
            lookupExistingSku={lookupExistingSku}
          />
        </AppProviders>,
      );
    });
    let create = tree?.root.findByType(InboundCreateScreen);
    await ReactTestRenderer.act(() => {
      create?.props.onChange(
        setDraftWarehouse(
          setDraftName(
            create?.props.draft ?? initialInboundDraft,
            'Lô SKU trần',
          ),
          'wh-1',
        ),
      );
    });
    create = tree?.root.findByType(InboundCreateScreen);
    await ReactTestRenderer.act(() => create?.props.onContinue());

    const scanner = tree?.root.findByType(BusinessScanScreen);
    await expect(
      scanner?.props.onScan('HN-PV-BASE-002', 'CAMERA'),
    ).rejects.toMatchObject({
      message: expect.stringContaining('không phải mã hiện vật'),
    });
    expect(tree?.root.findByType(BusinessScanScreen).props.scannedCount).toBe(
      0,
    );
    expect(
      tree?.root.findAllByType(Sheet).some(sheet => sheet.props.visible),
    ).toBe(false);
    await ReactTestRenderer.act(() => tree?.unmount());
  });

  it('BOX-SKU-SỐ mở ô kiểm đếm rồi ghi lượng linh kiện thay vì 1 hộp', async () => {
    const resolveCode = jest.fn().mockResolvedValue({
      raw_code: 'BOX-DCPL1-001',
      item_type: 'BOX',
      sku_code: 'DCPL1',
      box_code: 'BOX-DCPL1-001',
      box_number: '001',
      requires_quantity: true,
      resolution_status: 'EXISTING_SKU',
    });
    let tree: ReactTestRenderer.ReactTestRenderer | undefined;
    await ReactTestRenderer.act(() => {
      tree = ReactTestRenderer.create(
        <AppProviders>
          <InboundFlow onExit={() => undefined} resolveCode={resolveCode} />
        </AppProviders>,
      );
    });
    let create = tree?.root.findByType(InboundCreateScreen);
    await ReactTestRenderer.act(() => {
      create?.props.onChange(
        setDraftWarehouse(
          setDraftName(create?.props.draft ?? initialInboundDraft, 'Lô hộp'),
          'wh-1',
        ),
      );
    });
    create = tree?.root.findByType(InboundCreateScreen);
    await ReactTestRenderer.act(() => create?.props.onContinue());

    let scanner = tree?.root.findByType(BusinessScanScreen);
    await ReactTestRenderer.act(async () => {
      await scanner?.props.onScan('BOX-DCPL1-001', 'CAMERA');
    });
    expect(resolveCode).toHaveBeenCalledWith({
      warehouseId: 'wh-1',
      rawCode: 'BOX-DCPL1-001',
    });
    expect(JSON.stringify(tree?.toJSON())).toContain('Hộp linh kiện');
    expect(JSON.stringify(tree?.toJSON())).toContain('Hộp số 001');

    const quantityInput = tree?.root
      .findAllByType(Input)
      .find(input => input.props.label === 'Số lượng linh kiện trong hộp*');
    await ReactTestRenderer.act(() => quantityInput?.props.onChangeText('24'));
    const confirmButton = tree?.root
      .findAllByType(Button)
      .find(button => button.props.label === 'Xác nhận số lượng');
    await ReactTestRenderer.act(() => confirmButton?.props.onPress());

    scanner = tree?.root.findByType(BusinessScanScreen);
    expect(scanner?.props.scannedCount).toBe(1);
    await ReactTestRenderer.act(() => scanner?.props.onDone());
    const review = tree?.root.findByType(InboundReviewScreen);
    expect(review?.props.draft.codes[0]).toMatchObject({
      raw: 'BOX-DCPL1-001',
      sku: 'DCPL1',
      itemType: 'COMPONENT',
      quantity: 24,
      boxNumber: '001',
    });
    await ReactTestRenderer.act(() => tree?.unmount());
  });

  it('chặn mã hộp có SKU không hoạt động ngay lúc quét, không chờ tới gửi duyệt', async () => {
    const resolveCode = jest.fn().mockRejectedValue(
      new AppError({
        kind: 'http',
        status: 422,
        code: 'SKU_NOT_ACTIVE',
        message: 'SKU trong QR đang không Đang hoạt động.',
      }),
    );
    let tree: ReactTestRenderer.ReactTestRenderer | undefined;
    await ReactTestRenderer.act(() => {
      tree = ReactTestRenderer.create(
        <AppProviders>
          <InboundFlow onExit={() => undefined} resolveCode={resolveCode} />
        </AppProviders>,
      );
    });
    let create = tree?.root.findByType(InboundCreateScreen);
    await ReactTestRenderer.act(() => {
      create?.props.onChange(
        setDraftWarehouse(
          setDraftName(
            create?.props.draft ?? initialInboundDraft,
            'Lô hộp lỗi',
          ),
          'wh-1',
        ),
      );
    });
    create = tree?.root.findByType(InboundCreateScreen);
    await ReactTestRenderer.act(() => create?.props.onContinue());

    const scanner = tree?.root.findByType(BusinessScanScreen);
    await expect(
      scanner?.props.onScan('BOX-DCCS20083-2-001', 'CAMERA'),
    ).rejects.toMatchObject({
      code: 'SKU_NOT_ACTIVE',
      message: expect.stringContaining('DCCS20083-2'),
    });
    expect(resolveCode).toHaveBeenCalledWith({
      warehouseId: 'wh-1',
      rawCode: 'BOX-DCCS20083-2-001',
    });
    expect(tree?.root.findByType(BusinessScanScreen).props.scannedCount).toBe(
      0,
    );
    expect(
      tree?.root.findAllByType(Sheet).some(sheet => sheet.props.visible),
    ).toBe(false);
    await ReactTestRenderer.act(() => tree?.unmount());
  });

  it('nhập tay mã BOX đóng sheet mã rồi mở ngay sheet số lượng', async () => {
    const resolveCode = jest.fn().mockResolvedValue({
      raw_code: 'BOX-HN-COMP-BASE-003-002',
      item_type: 'BOX',
      sku_code: 'HN-COMP-BASE-003',
      box_number: 2,
      requires_quantity: true,
    });
    let tree: ReactTestRenderer.ReactTestRenderer | undefined;
    await ReactTestRenderer.act(() => {
      tree = ReactTestRenderer.create(
        <AppProviders>
          <InboundFlow onExit={() => undefined} resolveCode={resolveCode} />
        </AppProviders>,
      );
    });
    let create = tree?.root.findByType(InboundCreateScreen);
    await ReactTestRenderer.act(() => {
      create?.props.onChange(
        setDraftWarehouse(
          setDraftName(create?.props.draft ?? initialInboundDraft, 'Lô hộp'),
          'wh-1',
        ),
      );
    });
    create = tree?.root.findByType(InboundCreateScreen);
    await ReactTestRenderer.act(() => create?.props.onContinue());

    const manualButton = tree?.root
      .findAllByType(Button)
      .find(button => button.props.label === 'Nhập tay');
    await ReactTestRenderer.act(() => manualButton?.props.onPress());

    const codeInput = tree?.root
      .findAllByType(CodeInput)
      .find(input => input.props.label === 'Mã sản phẩm / mã tem');
    await ReactTestRenderer.act(() =>
      codeInput?.props.onChangeText('BOX-HN-COMP-BASE-003-002'),
    );
    const checkButton = tree?.root
      .findAllByType(Button)
      .find(button => button.props.label === 'Kiểm tra mã');
    await ReactTestRenderer.act(async () => {
      checkButton?.props.onPress();
      await Promise.resolve();
    });

    const sheets = tree?.root.findAllByType(Sheet) ?? [];
    expect(
      sheets.find(sheet => sheet.props.title === 'Nhập mã thủ công')?.props
        .visible,
    ).toBe(false);
    expect(
      sheets.find(sheet => sheet.props.title === 'Hộp linh kiện')?.props
        .visible,
    ).toBe(true);
    await ReactTestRenderer.act(() => tree?.unmount());
  });
});

describe('bước 3 — điều kiện ghi nhận (ảnh 20)', () => {
  it('chưa quét mã nào thì KHÔNG ghi nhận được', () => {
    expect(canRecord(setDraftName(initialInboundDraft, 'x'))).toBe(false);
  });

  it('có ít nhất một mã thì ghi nhận được', () => {
    const draft = addScannedCode(
      setDraftName(initialInboundDraft, 'x'),
      code('A-001'),
      0,
    ).draft;
    expect(canRecord(draft)).toBe(true);
  });

  it('payload đưa vào hàng đợi KHÔNG tự sinh Idempotency-Key', () => {
    // Khoá đó do outbox sinh một lần lúc tạo bản ghi và giữ nguyên qua mọi lần
    // gửi lại (quy tắc người dùng chốt 2026-09-05). Sinh thêm ở đây là tạo hai
    // khoá cho cùng một phiếu.
    const draft = addScannedCode(
      setDraftName(initialInboundDraft, 'Lô sáng'),
      code('A-001'),
      0,
    ).draft;
    const payload = toOutboxPayload(draft);
    expect(JSON.stringify(payload)).not.toContain('dempotency');
    expect(payload.name).toBe('Lô sáng');
    expect(payload.codes).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Ba mốc tồn kho — câu chữ phải nguyên văn
// ---------------------------------------------------------------------------

describe('ba mốc tồn kho — nói sai là thủ kho tưởng hàng đã vào kho', () => {
  it('câu ở màn kết quả nói rõ tồn kho CHƯA tăng', () => {
    expect(MESSAGE_NOT_POSTED_BODY).toContain('Tồn kho chỉ tăng sau khi');
    expect(MESSAGE_NOT_POSTED_BODY).toContain('Post Receipt');
  });

  it('trạng thái là "Chờ duyệt nhập kho", KHÔNG phải "Hoàn tất"', async () => {
    let tree: ReactTestRenderer.ReactTestRenderer | undefined;
    await ReactTestRenderer.act(() => {
      tree = ReactTestRenderer.create(
        <AppProviders>
          <InboundResultScreen
            documentName="Lô sáng"
            documentRef="PN-COV-P00060"
            quantity={8}
            outcome="posted"
            onHome={() => undefined}
            onNext={() => undefined}
          />
        </AppProviders>,
      );
    });
    const text = JSON.stringify(tree?.toJSON());
    expect(text).toContain('Chờ duyệt nhập kho');
    expect(text).not.toContain('Hoàn tất');
    await ReactTestRenderer.act(() => tree?.unmount());
  });

  it('lỗi khi Gửi duyệt hiện đúng phản hồi WMS, không giả là đang chờ gửi', async () => {
    let tree: ReactTestRenderer.ReactTestRenderer | undefined;
    await ReactTestRenderer.act(() => {
      tree = ReactTestRenderer.create(
        <AppProviders>
          <InboundResultScreen
            documentName="Lô sáng"
            documentRef="local-test"
            quantity={1}
            outcome="failed"
            reason="Kho nhận không còn hoạt động."
            onHome={() => undefined}
            onNext={() => undefined}
          />
        </AppProviders>,
      );
    });
    const text = JSON.stringify(tree?.toJSON());
    expect(text).toContain('WMS từ chối phiếu nhập');
    expect(text).toContain('Kho nhận không còn hoạt động.');
    expect(text).toContain('Bị từ chối — chưa tạo phiếu');
    expect(text).not.toContain('Chờ gửi lên WMS');
    await ReactTestRenderer.act(() => tree?.unmount());
  });
});

// ---------------------------------------------------------------------------
// Bước ghi — hàng đợi giữ được dữ liệu kể cả khi bộ gửi từ chối
// ---------------------------------------------------------------------------

/**
 * 🔧 Đổi khung 2026-09-06. Trước đây nhập kho **bị chặn** (`§2d` chỉ mở đọc);
 * từ `§2e` thì `inbound/record` gửi thật, và mặc định của app là `defaultSender`.
 *
 * Bộ test dưới đây vì vậy **không còn** khẳng định nhập kho bị chặn — nó tiêm
 * `gateBlockedSender` để kiểm một tính chất vẫn còn giá trị và quan trọng hơn:
 * **bộ gửi từ chối thì phiếu nằm lại hàng đợi, khoá không đổi, dữ liệu không
 * mất.** Đó đúng là điều xảy ra khi mất mạng hoặc máy chủ từ chối.
 */
describe('bộ gửi từ chối: phiếu ở lại hàng đợi, KHÔNG mất dữ liệu', () => {
  function makeLayer() {
    const outbox = createOutbox({
      storage: createStorage(createMemoryBackend()),
      log: silentLog,
    });
    return {
      outbox,
      syncEngine: createSyncEngine({
        outbox,
        send: gateBlockedSender,
        log: silentLog,
      }),
    };
  }

  it('phiếu vào hàng đợi với khoá idempotency ổn định, rồi bị từ chối', async () => {
    const layer = makeLayer();

    const record = layer.outbox.enqueue({
      kind: INBOUND_OUTBOX_KIND,
      payload: toOutboxPayload(
        addScannedCode(
          setDraftName(initialInboundDraft, 'Lô sáng'),
          code('A-001'),
          0,
        ).draft,
      ),
    });
    const key = record.idempotencyKey;
    expect(key.length).toBeGreaterThanOrEqual(8);

    const result = await layer.syncEngine.syncOne(record.id);

    // Bị từ chối ⇒ quay về `pending`, KHÔNG bao giờ bị đánh dấu `synced` sai sự thật.
    expect(result.state).toBe('pending');
    expect(result.reason).toContain('GATE_WMS_API_INTEGRATION');

    // Dữ liệu quét vẫn còn nguyên trong hàng đợi, và khoá không đổi.
    const stored = layer.outbox.get(record.id);
    expect(stored?.idempotencyKey).toBe(key);
    expect(stored?.state).toBe('pending');
    expect((stored?.payload as { codes: unknown[] }).codes).toHaveLength(1);
  });

  it('màn kết quả hiện "queued" kèm ĐÚNG lý do, không phải màn thành công giả', async () => {
    const layer = makeLayer();
    let tree: ReactTestRenderer.ReactTestRenderer | undefined;

    await ReactTestRenderer.act(() => {
      tree = ReactTestRenderer.create(
        <AppProviders>
          <InboundFlow onExit={() => undefined} dataLayer={layer} />
        </AppProviders>,
      );
    });

    // Màn đầu là bước tạo phiếu.
    expect(JSON.stringify(tree?.toJSON())).toContain('Tạo phiếu nhập mới');
    await ReactTestRenderer.act(() => tree?.unmount());
  });
});

/**
 * 🔓 `GATE_WMS §2e` — mặc định của app KHÔNG còn chặn nhập kho.
 *
 * Test này canh chiều ngược lại với bộ trên: nếu ai đó lỡ trả `defaultSender`
 * về `gateBlockedSender`, luồng nhập kho sẽ lặng lẽ ngừng gửi mà không ai biết
 * — màn kết quả vẫn hiện `queued` như thể chỉ mất mạng.
 */
describe('§2e — bộ gửi mặc định của app', () => {
  it('phiếu nhập kho ĐI QUA nhánh gửi thật, không rơi vào bộ chặn', async () => {
    let sentKey: string | undefined;
    const sender = createInboundSender(gateBlockedSender, {
      send: async (_input, key) => {
        sentKey = key;
        return {};
      },
    });

    const outbox = createOutbox({
      storage: createStorage(createMemoryBackend()),
      log: silentLog,
    });
    const engine = createSyncEngine({ outbox, send: sender, log: silentLog });

    const queued = outbox.enqueue({
      kind: INBOUND_OUTBOX_KIND,
      payload: toOutboxPayload(
        addScannedCode(
          setDraftWarehouse(
            setDraftName(initialInboundDraft, 'Lô sáng'),
            'wh-1',
          ),
          code('A-001'),
          0,
        ).draft,
      ),
    });

    const result = await engine.syncOne(queued.id);
    expect(result.state).toBe('synced');
    expect(sentKey).toBe(queued.idempotencyKey);
  });

  it('luồng CHƯA duyệt vẫn rơi về bộ chặn', async () => {
    const sender = createInboundSender(gateBlockedSender, {
      send: async () => ({}),
    });
    const outbox = createOutbox({
      storage: createStorage(createMemoryBackend()),
      log: silentLog,
    });
    const engine = createSyncEngine({ outbox, send: sender, log: silentLog });

    const queued = outbox.enqueue({
      kind: 'OUTBOUND_ISSUE_DRAFT',
      payload: { name: 'Phiếu xuất' },
    });

    const result = await engine.syncOne(queued.id);
    expect(result.state).toBe('pending');
    expect(result.reason).toContain('GATE_WMS_API_INTEGRATION');
  });
});

// ---------------------------------------------------------------------------
// Màn quét nghiệp vụ — tách khỏi màn chẩn đoán (2026-09-06)
// ---------------------------------------------------------------------------

describe('BusinessScanScreen — bám thiết kế Mini App, không phải màn chẩn đoán', () => {
  async function renderScan(
    props: Partial<Parameters<typeof BusinessScanScreen>[0]> = {},
  ) {
    let tree: ReactTestRenderer.ReactTestRenderer | undefined;
    await ReactTestRenderer.act(() => {
      tree = ReactTestRenderer.create(
        <AppProviders>
          <BusinessScanScreen
            title="Quét hàng nhập"
            documentName="hi"
            sessionLabel="Phiên quét nhập kho"
            scannedCount={0}
            onScan={() => undefined}
            onBack={() => undefined}
            onDone={() => undefined}
            {...props}
          />
        </AppProviders>,
      );
    });
    const text = JSON.stringify(tree?.toJSON());
    return {
      text,
      unmount: async () => {
        await ReactTestRenderer.act(() => tree?.unmount());
      },
    };
  }

  it('hiện đúng header, phiên và badge như ảnh người dùng gửi', async () => {
    const view = await renderScan();
    expect(view.text).toContain('Quét hàng nhập');
    expect(view.text).toContain('Phiên quét nhập kho');
    expect(view.text).toContain('0 MÃ');
    expect(view.text).toContain('đã quét 0 mã');
    await view.unmount();
  });

  // Trạng thái tier là biến cấp module ⇒ dọn sau mỗi ca để không rò sang ca sau.
  afterEach(() => {
    resetTierCheckForTesting();
  });

  it('chưa cấp quyền thì hiện thẻ "Sẵn sàng quét mã" + lối nhập tay', async () => {
    setTierCheckForTesting({ status: 'matched', expected: 'dev-test' });
    const view = await renderScan();
    expect(view.text).toContain('Sẵn sàng quét mã');
    expect(view.text).toContain('Nhập mã thủ công');
    await view.unmount();
  });

  describe('🔒 mục 2 — sai môi trường thì KHÔNG cho quét', () => {
    it.each([
      ['chưa kiểm tra lần nào', 'unchecked'],
      ['máy chủ khai tier khác', 'mismatched'],
      ['máy chủ không khai tier', 'missing'],
      ['không gọi được máy chủ', 'unreachable'],
    ])('%s', async (_label, status) => {
      setTierCheckForTesting({
        status: status as 'mismatched',
        expected: 'dev-test',
        reported: status === 'mismatched' ? 'customer-production' : undefined,
      });
      const view = await renderScan();
      expect(view.text).toContain(MESSAGE_WRONG_ENVIRONMENT);
      expect(view.text).not.toContain('Sẵn sàng quét mã');
      // Không mở lối nhập tay: mã gõ tay cũng đi cùng một đường lên máy chủ.
      expect(view.text).not.toContain('Nhập mã thủ công');
      await view.unmount();
    });

    it('nói RÕ máy chủ khai gì để thủ kho báo lại được', async () => {
      setTierCheckForTesting({
        status: 'mismatched',
        expected: 'dev-test',
        reported: 'customer-production',
      });
      const view = await renderScan();
      expect(view.text).toContain('customer-production');
      expect(view.text).toContain('bộ phận kỹ thuật');
      await view.unmount();
    });
  });

  it('nút kết thúc MỜ khi chưa quét mã nào', async () => {
    // Đúng ảnh 1 người dùng gửi: "Kiểm tra phiếu" mờ khi đã quét 0 mã.
    const view = await renderScan({ scannedCount: 0 });
    expect(view.text).toContain('"disabled":true');
    await view.unmount();
  });

  it('luồng xuất hiện tiến độ N/M thay vì đếm thô', async () => {
    const view = await renderScan({
      title: 'Quét hàng xuất',
      progressLabel: '2/5',
      scannedCount: 2,
    });
    expect(view.text).toContain('2/5');
    await view.unmount();
  });

  it('KHÔNG còn là màn chẩn đoán — không có mục "Quyền camera"', async () => {
    // Màn chẩn đoán của Prompt 3 liệt kê trạng thái quyền dạng bảng. Màn nghiệp
    // vụ không được có thứ đó: thủ kho đang cầm hàng, không đi đọc bảng.
    const view = await renderScan();
    expect(view.text).not.toContain('Màn kiểm chứng nguồn quét camera');
    await view.unmount();
  });
});

// ---------------------------------------------------------------------------
// Vuốt trái để xoá — chức năng tôi từng HỨA trong UI mà không làm
// ---------------------------------------------------------------------------

describe('vuốt trái để xoá (ảnh 20)', () => {
  it('xoá đúng 1 mã mới nhất của SKU, không làm mất cả nhóm', () => {
    // Mini App hiện danh sách theo SKU, nhưng nút sau thao tác vuốt là "Xoá 1".
    let draft = setDraftName(initialInboundDraft, 'Lô sáng');
    draft = addScannedCode(draft, code('A-001', 'SKU-A'), 0).draft;
    draft = addScannedCode(draft, code('A-002', 'SKU-A'), 1).draft;
    draft = addScannedCode(draft, code('B-001', 'SKU-B'), 2).draft;
    expect(totals(draft).totalScanned).toBe(3);

    const after = removeNewestSkuCode(draft, 'SKU-A');
    expect(totals(after).totalScanned).toBe(2);
    expect(totals(after).skuCount).toBe(2);
    expect(
      groupBySku(after.codes).find(group => group.sku === 'SKU-A')?.codes,
    ).toHaveLength(1);
  });

  it('xoá được 1 mã trong nhóm "không đọc được SKU"', () => {
    let draft = setDraftName(initialInboundDraft, 'x');
    draft = addScannedCode(draft, 'MA-LA', 0).draft;
    expect(totals(removeNewestSkuCode(draft, undefined)).totalScanned).toBe(0);
  });

  it('ngưỡng vuốt đủ xa để cuộn danh sách không kích hoạt nhầm', () => {
    // Danh sách mã quét cuộn dọc; ngưỡng quá nhỏ thì mỗi lần cuộn là xoá nhầm.
    expect(SWIPE_DELETE_THRESHOLD).toBeGreaterThanOrEqual(64);
  });

  it('màn Kiểm tra hiện chữ "Vuốt trái để xoá" KHI có thể xoá thật', async () => {
    // Trước 2026-09-06 chữ này hiện mà không có cử chỉ nào — hứa suông trong UI.
    let draft = setDraftName(initialInboundDraft, 'Lô sáng');
    draft = addScannedCode(draft, code('A-001'), 0).draft;

    let tree: ReactTestRenderer.ReactTestRenderer | undefined;
    await ReactTestRenderer.act(() => {
      tree = ReactTestRenderer.create(
        <AppProviders>
          <InboundReviewScreen
            draft={draft}
            documentRef="local-1"
            onRemoveNewestSku={() => undefined}
            onRecord={() => undefined}
          />
        </AppProviders>,
      );
    });
    expect(JSON.stringify(tree?.toJSON())).toContain('Vuốt trái để xoá');
    await ReactTestRenderer.act(() => tree?.unmount());
  });

  it('phiếu ĐÃ ghi nhận thì KHÔNG hứa vuốt xoá nữa', async () => {
    // Dữ liệu đã thuộc về WMS — sửa từ máy không có nghĩa.
    let draft = setDraftName(initialInboundDraft, 'Lô sáng');
    draft = addScannedCode(draft, code('A-001'), 0).draft;

    let tree: ReactTestRenderer.ReactTestRenderer | undefined;
    await ReactTestRenderer.act(() => {
      tree = ReactTestRenderer.create(
        <AppProviders>
          <InboundReviewScreen
            draft={draft}
            documentRef="PN-COV-P00060"
            recorded
            onRecord={() => undefined}
          />
        </AppProviders>,
      );
    });
    expect(JSON.stringify(tree?.toJSON())).not.toContain('Vuốt trái để xoá');
    await ReactTestRenderer.act(() => tree?.unmount());
  });
});
