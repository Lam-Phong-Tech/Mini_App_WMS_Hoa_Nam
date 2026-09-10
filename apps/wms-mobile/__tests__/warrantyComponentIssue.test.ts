import {
  allowsIdempotencyKey,
  allowsIfMatch,
  approvedWriteFor,
} from '../src/api/writeGate';
import {
  addWarrantyComponent,
  createWarrantyComponentDraft,
  hasWarrantyComponentCode,
  removeWarrantyComponent,
  warrantyComponentIdempotencyKey,
  warrantyComponentPostIdempotencyKey,
  warrantyComponentTotal,
} from '../src/features/warranty/warrantyComponentDraft';
import {
  componentIssuePostPath,
  componentIssueScanPath,
  issueWarrantyComponents,
  type WarrantyComponentWriteClient,
} from '../src/services/wms/warrantyComponentWrite';
import {
  COMPONENT_ISSUE_RESOLVE_CODE_PATH,
  resolveWarrantyComponentSku,
  type WarrantyComponentSkuLookupClient,
} from '../src/features/warranty/warrantyComponentSkuLookup';
import { fetchPostedWarrantyComponentHistory } from '../src/services/wms/warrantyComponentRead';
import type { ReadClient } from '../src/services/wms/readOnlyClient';
import type { RequestOptions } from '../src/api/client';
import {
  isWarrantyComponentWarehouseLocked,
  loadWarrantyComponentSession,
  saveWarrantyComponentSession,
} from '../src/features/warranty/warrantyComponentSession';
import {
  createMemoryBackend,
  createStorage,
  setAppStorageForTesting,
} from '../src/storage/storage';

beforeEach(() => {
  setAppStorageForTesting(createStorage(createMemoryBackend()));
});

interface SentRequest {
  readonly path: string;
  readonly method?: string;
  readonly body?: unknown;
  readonly headers?: Record<string, string>;
}

function sequenceClient(
  responses: readonly {
    readonly data: unknown;
    readonly etag?: string;
  }[],
): { client: WarrantyComponentWriteClient; sent: SentRequest[] } {
  const sent: SentRequest[] = [];
  let index = 0;
  return {
    sent,
    client: {
      async request<T>(options: RequestOptions) {
        sent.push(options);
        const current = responses[index] ?? responses[responses.length - 1];
        index += 1;
        return {
          status: 200,
          data: { success: true, data: current?.data } as T,
          header: (name: string) =>
            name.toLowerCase() === 'etag' ? current?.etag : undefined,
        };
      },
    },
  };
}

const DOCUMENT_ID = 'd8e5b1d2-8c27-4c73-a6d7-9f21b6f2ac01';
const LINES = [
  { id: 'line-component-a', sku_id: 'sku-component-a' },
  { id: 'line-component-b', sku_id: 'sku-component-b' },
] as const;

describe('nháp xuất linh kiện bảo hành', () => {
  it('mã linh kiện có tem tự nhận số lượng 1 và lưu SKU đã đối soát', () => {
    const draft = addWarrantyComponent(
      createWarrantyComponentDraft('case-1', 'session-1'),
      ' HN1|SKU=LK-01|ITEM=I-01 ',
      undefined,
      { skuId: 'sku-01', skuCode: 'LK-01', skuName: 'Linh kiện 01' },
    );
    expect(draft.items[0]).toMatchObject({
      kind: 'ITEM',
      quantity: 1,
      rawCode: 'HN1|SKU=LK-01|ITEM=I-01',
      skuId: 'sku-01',
    });
  });

  it('mã hộp bắt buộc số lượng nguyên dương', () => {
    const draft = createWarrantyComponentDraft('case-1', 'session-1');
    expect(() => addWarrantyComponent(draft, 'BOX-SEED-RPT-001')).toThrow(
      'Số lượng trong hộp phải là số nguyên dương',
    );
    expect(() => addWarrantyComponent(draft, 'BOX-SEED-RPT-001', '0')).toThrow();

    const added = addWarrantyComponent(
      draft,
      'BOX-SEED-RPT-001',
      '3',
      { skuId: 'sku-carbon-brush', skuCode: 'DCA-CARBONBRUSH' },
    );
    expect(added.items[0]).toMatchObject({
      kind: 'BOX',
      sku: 'SEED-RPT',
      skuId: 'sku-carbon-brush',
      boxNumber: '001',
      quantity: 3,
    });
  });

  it('chặn trùng, tính tổng và cho bỏ riêng từng dòng', () => {
    let draft = createWarrantyComponentDraft('case-1', 'session-1');
    draft = addWarrantyComponent(draft, 'ITEM-1');
    draft = addWarrantyComponent(draft, 'BOX-SKU-002', 4);
    expect(hasWarrantyComponentCode(draft, ' item-1 ')).toBe(true);
    expect(() => addWarrantyComponent(draft, 'item-1')).toThrow(
      'đã có trong danh sách',
    );
    expect(warrantyComponentTotal(draft)).toBe(5);

    const firstKey = draft.items[0]?.key ?? '';
    draft = removeWarrantyComponent(draft, firstKey);
    expect(draft.items).toHaveLength(1);
    expect(warrantyComponentTotal(draft)).toBe(4);
  });

  it('giữ khoá Post ổn định trong cùng phiên nháp', () => {
    const draft = createWarrantyComponentDraft('case-1', 'session-1');
    expect(warrantyComponentPostIdempotencyKey(draft.caseId, draft.sessionId)).toBe(
      warrantyComponentPostIdempotencyKey('case-1', 'session-1'),
    );
    expect(warrantyComponentPostIdempotencyKey('case-1', 'session-1')).toMatch(
      /^wmshn-wcomponent-post-/,
    );
    expect(warrantyComponentIdempotencyKey('case-1', 'session-1', 'ITEM-1')).toMatch(
      /^wmshn-wcomponent-/,
    );
  });
});

describe('API gốc xuất linh kiện bảo hành', () => {
  it('đối soát mã hộp theo kho và hồ sơ qua resolver component issue', async () => {
    const sent: RequestOptions[] = [];
    const client: WarrantyComponentSkuLookupClient = {
      async request<T>(options: RequestOptions) {
        sent.push(options);
        return {
          status: 200,
          data: {
            success: true,
            data: {
              container_id: 'box-1',
              sku_id: 'sku-carbon-brush',
              sku_code: 'DCA-CARBONBRUSH',
              sku_name: 'Chổi than',
              eligible_for_issue: true,
              case_allows_issue: true,
              requires_quantity: true,
              available_qty: 325,
            },
          } as T,
        };
      },
    };

    await expect(
      resolveWarrantyComponentSku(
        {
          rawCode: ' BOX-SEED-RPT-001 ',
          warehouseId: 'warehouse-1',
          caseId: 'case-checking-1',
        },
        {},
        client,
      ),
    ).resolves.toEqual({
      skuId: 'sku-carbon-brush',
      skuCode: 'DCA-CARBONBRUSH',
      skuName: 'Chổi than',
      requiresQuantity: true,
      availableQuantity: 325,
    });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      path: COMPONENT_ISSUE_RESOLVE_CODE_PATH,
      method: 'POST',
      body: {
        raw_code: 'BOX-SEED-RPT-001',
        warehouse_id: 'warehouse-1',
        warranty_case_id: 'case-checking-1',
      },
    });
    expect(sent[0]?.headers).toBeUndefined();
  });

  it('chặn HTTP 200 khi WMS báo mã hộp không tồn tại trong danh mục', async () => {
    const client: WarrantyComponentSkuLookupClient = {
      async request<T>(_options: RequestOptions) {
        return {
          status: 200,
          data: {
            success: true,
            data: {
              eligible_for_issue: false,
              case_allows_issue: true,
              eligibility_code: 'BOX_SKU_NOT_FOUND',
            },
          } as T,
        };
      },
    };

    await expect(
      resolveWarrantyComponentSku(
        {
          rawCode: 'BOX-DCPL1-001',
          warehouseId: 'warehouse-1',
          caseId: 'case-checking-1',
        },
        {},
        client,
      ),
    ).rejects.toMatchObject({
      code: 'BOX_SKU_NOT_FOUND',
      message: expect.stringContaining('SKU trong mã hộp không tồn tại'),
    });
  });

  it('chặn mã dù mã hợp lệ nếu hồ sơ không được phép xuất', async () => {
    const client: WarrantyComponentSkuLookupClient = {
      async request<T>() {
        return {
          status: 200,
          data: {
            success: true,
            data: {
              sku_id: 'sku-carbon-brush',
              eligible_for_issue: true,
              case_allows_issue: false,
            },
          } as T,
        };
      },
    };

    await expect(
      resolveWarrantyComponentSku(
        {
          rawCode: 'BOX-SEED-RPT-001',
          warehouseId: 'warehouse-1',
          caseId: 'case-closed-1',
        },
        {},
        client,
      ),
    ).rejects.toThrow('Hồ sơ bảo hành chưa ở trạng thái Đang kiểm tra hoặc Đang sửa chữa.');
  });

  it('diễn giải lỗi linh kiện serial quét nhầm mã hộp', async () => {
    const client: WarrantyComponentSkuLookupClient = {
      async request<T>() {
        return {
          status: 200,
          data: {
            success: true,
            data: {
              eligible_for_issue: false,
              case_allows_issue: true,
              eligibility_code: 'SERIAL_COMPONENT_REQUIRES_ITEM',
            },
          } as T,
        };
      },
    };

    await expect(
      resolveWarrantyComponentSku(
        {
          rawCode: 'BOX-SERIAL-COMPONENT-001',
          warehouseId: 'warehouse-1',
          caseId: 'case-repairing-1',
        },
        {},
        client,
      ),
    ).rejects.toThrow('quét tem trên từng linh kiện');
  });

  it('hiện lý do cụ thể BE trả về cho eligibility code mới', async () => {
    const client: WarrantyComponentSkuLookupClient = {
      async request<T>() {
        return {
          status: 200,
          data: {
            success: true,
            data: {
              eligible_for_issue: false,
              case_allows_issue: true,
              eligibility_code: 'COMPONENT_SKU_REQUIRED',
              eligibility_message: 'Hộp không gắn với SKU linh kiện ACTIVE.',
            },
          } as T,
        };
      },
    };

    await expect(
      resolveWarrantyComponentSku(
        {
          rawCode: 'BOX-RPTW-001',
          warehouseId: 'warehouse-1',
          caseId: 'case-checking-1',
        },
        {},
        client,
      ),
    ).rejects.toThrow(
      'Hộp không gắn với SKU linh kiện ACTIVE. (COMPONENT_SKU_REQUIRED).',
    );
  });

  it('tạo phiếu, scan đúng line/version, rồi Post đúng một lần', async () => {
    const { client, sent } = sequenceClient([
      { data: { id: DOCUMENT_ID, version: 1, lines: LINES } },
      { data: { id: DOCUMENT_ID, version: 2, lines: LINES } },
      { data: { id: DOCUMENT_ID, version: 3, lines: LINES } },
      { data: { id: DOCUMENT_ID, version: 4, status: 'POSTED', lines: LINES } },
    ]);
    const ensureTier = jest.fn(async () => undefined);
    const loadCase = jest.fn(async () => ({
      warranty_case_id: 'case-1',
      status: 'REPAIRING',
      version: 2,
    }));

    const result = await issueWarrantyComponents(
      {
        caseId: 'case-1',
        warehouseId: 'warehouse-1',
        postIdempotencyKey: 'stable-post-key',
        items: [
          { skuId: 'sku-component-a', codeValue: 'SERIAL-001', quantity: 1 },
          { skuId: 'sku-component-b', codeValue: 'BOX-SEED-RPT-001', quantity: 3 },
        ],
      },
      { ensureTier, loadCase },
      client,
    );

    expect(ensureTier).toHaveBeenCalledTimes(1);
    expect(sent).toHaveLength(4);
    expect(sent[0]).toMatchObject({
      path: '/api/v1/component-issue-documents',
      method: 'POST',
      body: {
        warehouse_id: 'warehouse-1',
        warranty_case_id: 'case-1',
        lines: [
          { sku_id: 'sku-component-a', required_qty: 1 },
          { sku_id: 'sku-component-b', required_qty: 3 },
        ],
      },
      headers: undefined,
    });
    expect(sent[1]).toMatchObject({
      path: componentIssueScanPath(DOCUMENT_ID),
      method: 'POST',
      body: {
        line_id: 'line-component-a',
        quantity: 1,
        code_value: 'SERIAL-001',
      },
      headers: { 'If-Match': '1' },
    });
    expect(sent[2]).toMatchObject({
      path: componentIssueScanPath(DOCUMENT_ID),
      method: 'POST',
      body: {
        line_id: 'line-component-b',
        quantity: 3,
        code_value: 'BOX-SEED-RPT-001',
      },
      headers: { 'If-Match': '2' },
    });
    expect(sent[3]).toMatchObject({
      path: componentIssuePostPath(DOCUMENT_ID),
      method: 'POST',
      body: {},
      headers: {
        'If-Match': '3',
        'Idempotency-Key': 'stable-post-key',
      },
    });
    expect(result).toMatchObject({
      documentId: DOCUMENT_ID,
      issuedLines: 2,
      issuedQuantity: 4,
      version: '4',
      warrantyCase: { warranty_case_id: 'case-1' },
    });
  });

  it('giữ lines là sibling của document trong phản hồi WMS khi create, scan và Post', async () => {
    const { client, sent } = sequenceClient([
      {
        data: {
          document: { id: DOCUMENT_ID, version: 1 },
          lines: [LINES[0]],
        },
      },
      {
        data: {
          document: { id: DOCUMENT_ID, version: 2 },
          lines: [LINES[0]],
        },
      },
      {
        data: {
          document: { id: DOCUMENT_ID, version: 3, status: 'POSTED' },
          lines: [LINES[0]],
        },
      },
    ]);

    await expect(
      issueWarrantyComponents(
        {
          caseId: 'case-1',
          warehouseId: 'warehouse-1',
          postIdempotencyKey: 'post-key',
          items: [
            {
              skuId: 'sku-component-a',
              codeValue: 'BOX-AABC-1',
              quantity: 1,
            },
          ],
        },
        {
          ensureTier: async () => undefined,
          loadCase: async () => ({ warranty_case_id: 'case-1' }),
        },
        client,
      ),
    ).resolves.toMatchObject({
      documentId: DOCUMENT_ID,
      issuedQuantity: 1,
    });

    expect(sent).toHaveLength(3);
    expect(sent[1]).toMatchObject({
      path: componentIssueScanPath(DOCUMENT_ID),
      headers: { 'If-Match': '1' },
    });
    expect(sent[2]).toMatchObject({
      path: componentIssuePostPath(DOCUMENT_ID),
      headers: { 'If-Match': '2' },
    });
  });

  it('tải lại phiếu khi create chỉ trả id, không dùng version/line suy đoán', async () => {
    const { client, sent } = sequenceClient([
      { data: { id: DOCUMENT_ID } },
      { data: { id: DOCUMENT_ID, version: 8, lines: LINES } },
      { data: { id: DOCUMENT_ID, version: 9, status: 'POSTED', lines: LINES } },
    ]);
    const loadDocument = jest.fn(async () => ({
      id: DOCUMENT_ID,
      version: 7,
      lines: [LINES[0]],
    }));

    await issueWarrantyComponents(
      {
        caseId: 'case-1',
        warehouseId: 'warehouse-1',
        postIdempotencyKey: 'post-key',
        items: [
          { skuId: 'sku-component-a', codeValue: 'SERIAL-001', quantity: 1 },
        ],
      },
      {
        ensureTier: async () => undefined,
        loadDocument,
        loadCase: async () => ({ warranty_case_id: 'case-1' }),
      },
      client,
    );

    expect(loadDocument).toHaveBeenCalledWith(DOCUMENT_ID);
    expect(sent[1]?.headers?.['If-Match']).toBe('7');
    expect(sent[2]?.headers?.['If-Match']).toBe('8');
  });

  it('giữ marker scan dở sau retry để không gửi scan lần hai khi chưa đối chiếu', async () => {
    const progress: Array<{ pendingCodeKey?: string }> = [];
    const input = {
      caseId: 'case-1',
      warehouseId: 'warehouse-1',
      postIdempotencyKey: 'post-key',
      items: [
        { skuId: 'sku-component-a', codeValue: 'SERIAL-001', quantity: 1 },
      ],
    };
    const loadDocument = async () => ({
      id: DOCUMENT_ID,
      version: 1,
      lines: [LINES[0]],
    });
    const noWriteClient: WarrantyComponentWriteClient = {
      request: async () => {
        throw new Error('Không được scan/Create/Post khi marker chưa đối chiếu.');
      },
    };

    await expect(
      issueWarrantyComponents(
        input,
        {
          existingDocumentId: DOCUMENT_ID,
          pendingCodeKey: 'SERIAL-001',
          loadDocument,
          onProgress: value => progress.push(value),
        },
        noWriteClient,
      ),
    ).rejects.toMatchObject({ code: 'COMPONENT_SCAN_RECONCILIATION_REQUIRED' });
    expect(progress.at(-1)?.pendingCodeKey).toBe('SERIAL-001');

    await expect(
      issueWarrantyComponents(
        input,
        {
          existingDocumentId: DOCUMENT_ID,
          pendingCodeKey: progress.at(-1)?.pendingCodeKey,
          loadDocument,
        },
        noWriteClient,
      ),
    ).rejects.toMatchObject({ code: 'COMPONENT_SCAN_RECONCILIATION_REQUIRED' });
  });

  it('lưu id phiếu ngay sau Create trước khi GET chi tiết có thể lỗi', async () => {
    const progress: Array<{ documentId?: string }> = [];
    const { client, sent } = sequenceClient([{ data: { id: DOCUMENT_ID } }]);
    const input = {
      caseId: 'case-1',
      warehouseId: 'warehouse-1',
      postIdempotencyKey: 'post-key',
      items: [
        { skuId: 'sku-component-a', codeValue: 'SERIAL-001', quantity: 1 },
      ],
    };

    await expect(
      issueWarrantyComponents(
        input,
        {
          loadDocument: async () => {
            throw new Error('GET detail tạm thời lỗi');
          },
          onProgress: value => progress.push(value),
        },
        client,
      ),
    ).rejects.toThrow('GET detail tạm thời lỗi');
    expect(sent).toHaveLength(1);
    expect(progress.at(-1)?.documentId).toBe(DOCUMENT_ID);

    const retryClient: WarrantyComponentWriteClient = {
      request: async () => {
        throw new Error('Retry không được Create phiếu mới.');
      },
    };
    await expect(
      issueWarrantyComponents(
        input,
        {
          existingDocumentId: progress.at(-1)?.documentId,
          loadDocument: async () => ({
            id: DOCUMENT_ID,
            version: 2,
            status: 'POSTED',
            lines: [LINES[0]],
          }),
        },
        retryClient,
      ),
    ).resolves.toMatchObject({ documentId: DOCUMENT_ID });
  });

  it('gate chỉ cho API gốc và chỉ Post mới được Idempotency-Key', () => {
    const createPath = '/api/v1/component-issue-documents';
    const resolvePath = COMPONENT_ISSUE_RESOLVE_CODE_PATH;
    const scanPath = componentIssueScanPath('document-1');
    const postPath = componentIssuePostPath('document-1');
    expect(approvedWriteFor('POST', createPath)).toBe('componentIssue.create');
    expect(approvedWriteFor('POST', resolvePath)).toBe(
      'componentIssue.resolveCode',
    );
    expect(approvedWriteFor('POST', scanPath)).toBe('componentIssue.scan');
    expect(approvedWriteFor('POST', postPath)).toBe('componentIssue.post');
    expect(allowsIfMatch('POST', createPath)).toBe(false);
    expect(allowsIfMatch('POST', resolvePath)).toBe(false);
    expect(allowsIfMatch('POST', scanPath)).toBe(true);
    expect(allowsIfMatch('POST', postPath)).toBe(true);
    expect(allowsIdempotencyKey('POST', scanPath)).toBe(false);
    expect(allowsIdempotencyKey('POST', resolvePath)).toBe(false);
    expect(allowsIdempotencyKey('POST', postPath)).toBe(true);
    expect(
      approvedWriteFor(
        'POST',
        '/api/v1/mini-app/warranty-component-issues/case-1/scans',
      ),
    ).toBeUndefined();
  });
});

describe('khóa kho của phiên linh kiện bảo hành', () => {
  it('giữ mốc khóa riêng cả khi nhân viên đã xóa toàn bộ dòng nháp', () => {
    const draft = createWarrantyComponentDraft('case-warehouse-lock', 'session-1');
    saveWarrantyComponentSession({
      caseId: draft.caseId,
      draft,
      warehouseId: 'warehouse-1',
      warehouseLocked: true,
      scannedCodeKeys: [],
      stage: 'local',
      updatedAt: '2026-09-10T00:00:00.000Z',
    });

    const reloaded = loadWarrantyComponentSession(draft.caseId);
    expect(reloaded?.draft.items).toHaveLength(0);
    expect(isWarrantyComponentWarehouseLocked(reloaded)).toBe(true);
  });

  it('khóa phiên cũ có dòng nháp hoặc document WMS để không mở lại đường đổi kho', () => {
    const draftWithItem = addWarrantyComponent(
      createWarrantyComponentDraft('case-legacy', 'session-1'),
      'SERIAL-001',
    );
    expect(
      isWarrantyComponentWarehouseLocked({
        caseId: draftWithItem.caseId,
        draft: draftWithItem,
        warehouseId: 'warehouse-1',
        scannedCodeKeys: [],
        stage: 'scanning',
        updatedAt: '2026-09-10T00:00:00.000Z',
      }),
    ).toBe(true);
  });
});

describe('lịch sử linh kiện đã xuất', () => {
  it('chỉ đọc phiếu POSTED của đúng hồ sơ rồi hiển thị lượng quét thực tế', async () => {
    const sent: Array<{ path: string; options?: unknown }> = [];
    const client: ReadClient = {
      async get<T>(
        path: string,
        options?: Omit<RequestOptions, 'path' | 'method'>,
      ) {
        sent.push({ path, options });
        if (path === '/api/v1/component-issue-documents') {
          return {
            status: 200,
            data: {
              success: true,
              data: [
                {
                  id: 'document-posted-1',
                  component_issue_no: 'CID-20260909144859-2EUF',
                  status: 'POSTED',
                  posted_at: '2026-09-09 14:48:59+00',
                },
              ],
            } as T,
            header: () => undefined,
          };
        }
        return {
          status: 200,
          data: {
            success: true,
            data: {
              document: {
                id: 'document-posted-1',
                component_issue_no: 'CID-20260909144859-2EUF',
                posted_at: '2026-09-09 14:48:59+00',
              },
              lines: [
                {
                  id: 'component-line-1',
                  sku_code: 'AABC',
                  sku_name: 'ABC',
                  required_qty: 1,
                  scanned_qty: 1,
                  items: [{ quantity: 1 }],
                },
              ],
            },
          } as T,
          header: () => undefined,
        };
      },
    };

    await expect(
      fetchPostedWarrantyComponentHistory('case-1', {}, client),
    ).resolves.toEqual([
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
    ]);
    expect(sent).toHaveLength(2);
    expect(sent[0]).toMatchObject({
      path: '/api/v1/component-issue-documents',
      options: {
        query: {
          warranty_case_id: 'case-1',
          status: 'POSTED',
          per_page: 10,
        },
      },
    });
    expect(sent[1]).toMatchObject({
      path: '/api/v1/component-issue-documents/document-posted-1',
    });
  });
});
