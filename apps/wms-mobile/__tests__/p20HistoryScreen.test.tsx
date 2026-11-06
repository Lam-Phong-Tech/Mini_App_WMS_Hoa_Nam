import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { P20HistoryScreen } from '../src/features/warranty/P20HistoryScreen';
import { AppProviders } from '../src/app/App';
import { Button } from '../src/ui/Button';
import { Dialog } from '../src/ui/Dialog';
import { AppError } from '../src/errors/AppError';
import { clearSession, setSession } from '../src/auth/session';
import {
  createMemoryBackend,
  createStorage,
  setAppStorageForTesting,
} from '../src/storage/storage';
import type { P09Service } from '../src/services/wms/p09Warranty';
import type { WarrantyComponentHistoryDocument } from '../src/services/wms/warrantyComponentRead';
import { ActivityIndicator, StyleSheet } from 'react-native';
import { P24ClosedCasePresentation } from '../src/features/scan/P24StatePresentation';
const id = (n: number) =>
  '20000000-0000-4000-8000-' + String(n).padStart(12, '0');
const record = {
  warranty_case_id: id(2),
  warranty_case_code: 'BH-real',
  status: 'RETURNED',
  version: 1,
  capabilities: { posted_component_issues_read: true },
};
const document = {
  id: id(3),
  documentNumber: 'XLK-real',
  postedAt: null,
  lines: [
    {
      id: id(4),
      unit: null,
      unitSource: 'NOT_RECORDED' as const,
      quantity: null,
      quantityStatus: 'INCOMPLETE' as const,
      scannedCodeCount: null,
      codes: [{ rawCode: null, status: 'UNAVAILABLE' as const }],
    },
  ],
};
let tree: Renderer.ReactTestRenderer;
const service = () =>
  ({
    contextKey: () => 'same-scope',
    detail: jest.fn(async () => record),
    execute: jest.fn(),
  } as unknown as P09Service);
const page = {
  documents: [document],
  page: 1,
  total: 8,
  hasMore: true,
  nextPage: 2,
  nextCursor: null,
};
const render = async (s: P09Service, load: any) => {
  await act(async () => {
    tree = Renderer.create(
      <AppProviders>
        <P20HistoryScreen
          caseId={id(2)}
          service={s}
          onBack={() => {}}
          historyLoad={load}
        />
      </AppProviders>,
    );
  });
};
function content(node: any): string {
  if (node === null || node === undefined) return '';
  if (Array.isArray(node)) return node.map(content).join('');
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  return content(node.children);
}
const text = () => content(tree.toJSON());
beforeEach(() => {
  setAppStorageForTesting(createStorage(createMemoryBackend()));
  clearSession();
  setSession({
    accessToken: 'offline',
    userId: id(10),
    authSessionId: id(11),
    activeWarehouseId: id(12),
  });
});
afterEach(async () => {
  if (tree) await act(async () => tree.unmount());
  clearSession();
});
test('case preflight then P20 reads; closed case stays read-only and missing evidence is not zero', async () => {
  const s = service(),
    load = jest.fn(async () => page);
  await render(s, load);
  expect(s.detail).toHaveBeenCalledWith(id(2));
  expect(load).toHaveBeenCalledTimes(1);
  expect(text()).toContain('Tổng 8');
  expect(text()).toContain('Chưa xác minh');
  expect(text()).not.toContain('Xuất linh kiện');
  expect(text()).not.toContain('Số lượng: 0');
  expect(tree.root.findByProps({ testID: 'p20-S01' })).toBeTruthy();
});
test('a child detail failure keeps link rather than verified-empty panel', async () => {
  await render(service(), async () => ({
    ...page,
    hasMore: false,
    nextPage: null,
    documents: [
      {
        id: id(3),
        documentNumber: 'XLK-link',
        postedAt: null,
        lines: [],
        detailUnavailable: true,
      },
    ],
  }));
  expect(text()).toContain('XLK-link');
  expect(text()).toContain('Chưa tải được chi tiết');
  expect(text()).not.toContain('Chưa có phiếu');
});
test('list read error is not S04 empty', async () => {
  await render(service(), async () => {
    throw Error('source unavailable');
  });
  expect(text()).not.toContain('Chưa có phiếu linh kiện đã xuất');
  expect(text()).toContain('Tải lại lịch sử');
});
test('empty page with positive total is a paging state, not S04', async () => {
  await render(service(), async () => ({
    ...page,
    documents: [],
    total: 4,
    hasMore: false,
    nextPage: null,
  }));
  expect(text()).not.toContain('Chưa có phiếu linh kiện đã xuất');
  expect(text()).toContain('Đọc lại trang đầu');
});
test('wrong case or unverified capability never reads history', async () => {
  const s = service(),
    load = jest.fn();
  (s.detail as jest.Mock).mockResolvedValue({
    ...record,
    warranty_case_id: id(77),
  });
  await render(s, load);
  expect(load).not.toHaveBeenCalled();
});
test('append retry stays on exact server nextPage, keeps links and does not post', async () => {
  const load = jest.fn(async (_case: string, o: any) => {
    if (o.query.page === 1) return page;
    throw Error('read error');
  });
  await render(service(), load);
  const more = tree.root
    .findAllByType(Button)
    .find(b => b.props.label === 'Tải thêm')!;
  await act(async () => more.props.onPress());
  expect(tree.root.findByProps({ testID: 'p20-S03' })).toBeTruthy();
  expect(text()).toContain('XLK-real');
  const retry = tree.root
    .findAllByType(Button)
    .find(b => b.props.label === 'Thử lại tải thêm')!;
  await act(async () => retry.props.onPress());
  expect(load.mock.calls.map(c => c[1].query)).toEqual([
    { page: 1 },
    { page: 2 },
    { page: 2 },
  ]);
});
test('reader shows source statuses and closes when login family changes', async () => {
  await render(service(), async () => ({
    ...page,
    hasMore: false,
    nextPage: null,
  }));
  await act(async () =>
    tree.root
      .findAllByType(Button)
      .find(b => b.props.label === 'Xem mã đã xuất')!
      .props.onPress(),
  );
  expect(tree.root.findByType(Dialog).props.visible).toBe(true);
  await act(async () =>
    setSession({
      accessToken: 'new',
      userId: id(10),
      authSessionId: id(99),
      activeWarehouseId: id(12),
    }),
  );
  expect(tree.root.findByType(Dialog).props.visible).toBe(false);
});
test('a permission/context change during history read never publishes its protected rows', async () => {
  let key = 'old',
    finish!: (v: any) => void;
  const s = { ...service(), contextKey: () => key };
  const load = jest.fn(
    () =>
      new Promise<any>(r => {
        finish = r;
      }),
  );
  await render(s, load);
  key = 'new';
  await act(async () => finish(page));
  expect(text()).not.toContain('XLK-real');
});

test('selected immutable phiếu outside page is loaded by exact ID and shown first', async () => {
  const direct = jest.fn(async () => ({
    ...document,
    id: id(88),
    documentNumber: 'XLK-selected',
  }));
  await act(async () => {
    tree = Renderer.create(
      <AppProviders>
        <P20HistoryScreen
          caseId={id(2)}
          selectedDocumentId={id(88)}
          selectedLoad={direct}
          historyLoad={async () => page}
          service={service()}
          onBack={() => {}}
        />
      </AppProviders>,
    );
  });
  expect(direct).toHaveBeenCalledWith(
    id(2),
    id(88),
    expect.objectContaining({ signal: expect.anything() }),
  );
  expect(text()).toContain('XLK-selected');
  expect(text().indexOf('XLK-selected')).toBeLessThan(
    text().indexOf('XLK-real'),
  );
});
test('selected detail denied retains explicit selected link and never uses first result instead', async () => {
  const direct = jest.fn(async () => {
    throw Error('detail denied');
  });
  await act(async () => {
    tree = Renderer.create(
      <AppProviders>
        <P20HistoryScreen
          caseId={id(2)}
          selectedDocumentId={id(88)}
          selectedLoad={direct}
          historyLoad={async () => page}
          service={service()}
          onBack={() => {}}
        />
      </AppProviders>,
    );
  });
  expect(text()).toContain(id(88));
  expect(text()).toContain('Tải lại đúng phiếu đã chọn');
  expect(text()).toContain('XLK-real');
  expect(text()).not.toContain('Chưa có phiếu');
});

test('owner list denial hides selected direct proof and discards a late direct read', async () => {
  let finish!: (v: any) => void;
  const direct = jest.fn(() => new Promise<any>(resolve => (finish = resolve)));
  const load = jest
    .fn()
    .mockResolvedValueOnce(page)
    .mockRejectedValueOnce(
      new AppError({
        kind: 'http',
        status: 403,
        code: 'ACCESS_DENIED',
        message: 'denied',
      }),
    );
  await act(async () => {
    tree = Renderer.create(
      <AppProviders>
        <P20HistoryScreen
          caseId={id(2)}
          selectedDocumentId={id(88)}
          selectedLoad={direct}
          historyLoad={load}
          service={service()}
          onBack={() => {}}
        />
      </AppProviders>,
    );
  });
  const more = tree.root
    .findAllByType(Button)
    .find(b => b.props.label === 'Tải thêm');
  expect(more).toBeDefined();
  await act(async () => more!.props.onPress());
  await act(async () =>
    finish({ ...document, id: id(88), documentNumber: 'PROTECTED-LATE' }),
  );
  expect(text()).not.toContain('PROTECTED-LATE');
  expect(text()).not.toContain('XLK-real');
  expect(text()).not.toContain('Đang đọc đúng phiếu đã chọn…');
  expect(text()).toContain('Chi tiết phiếu đã được ẩn');
});

function confirmedDocument(): WarrantyComponentHistoryDocument {
  return {
    id: id(3),
    documentNumber: 'XLK-confirmed',
    postedAt: '2026-10-28T02:15:00Z',
    quantityTotal: 7,
    quantityStatus: 'CONFIRMED',
    totalsByUnit: { cái: 7 },
    lines: [
      {
        id: id(4),
        skuCode: 'LK-01',
        skuName: 'Bo mạch',
        unit: 'cái',
        unitSource: 'CURRENT_SKU_CATALOG',
        quantity: 2,
        quantityStatus: 'CONFIRMED',
        scannedCodeCount: 1,
        codes: [{ rawCode: 'BOX-A', status: 'RECORDED' }],
      },
      {
        id: id(5),
        skuCode: 'LK-02',
        skuName: 'Đầu nối',
        unit: 'cái',
        unitSource: 'CURRENT_SKU_CATALOG',
        quantity: 5,
        quantityStatus: 'CONFIRMED',
        scannedCodeCount: 2,
        codes: [
          { rawCode: 'SN-B', status: 'RECORDED' },
          { rawCode: 'SN-C', status: 'RECORDED' },
        ],
      },
    ],
  };
}
function loaded(d: WarrantyComponentHistoryDocument) {
  return { ...page, documents: [d], total: 1, hasMore: false, nextPage: null };
}
function button(label: string) {
  return tree.root.findAllByType(Button).find(b => b.props.label === label)!;
}

test('parity: case context uses source product, serial, masked customer and Vietnamese status', async () => {
  const s = service();
  (s.detail as jest.Mock).mockResolvedValue({
    ...record,
    sku_name: 'Sản phẩm thật',
    serial_number: 'SN-real',
    customer_name: 'N*** V*** A***',
  });
  await render(s, async () => loaded(confirmedDocument()));
  expect(
    tree.root.findByType(P24ClosedCasePresentation).props.context,
  ).toMatchObject({
    caseId: id(2),
    productName: 'Sản phẩm thật',
    serial: 'SN-real',
    customerName: 'N*** V*** A***',
    status: 'RETURNED',
  });
  expect(tree.root.findAllByProps({ testID: 'p20-case-context' })).toHaveLength(
    0,
  );
  expect(tree.root.findByProps({ testID: 'p20-history-card' })).toBeTruthy();
  expect(text()).toContain('Sản phẩm thật');
  expect(text()).toContain('SN-real');
  expect(text()).toContain('N*** V*** A***');
  expect(text()).toContain('Đã trả khách');
  expect(text()).not.toContain('RETURNED');
});

test('parity: document count, distinct SKU types, raw code count and issued quantity stay separate', async () => {
  await render(service(), async () => loaded(confirmedDocument()));
  expect(text()).toContain('Đã tải 1 phiếu · Tổng 1 phiếu');
  expect(text()).toContain('2 loại linh kiện · Tổng số lượng 7 cái');
  expect(text()).toContain('1 mã/hộp');
  expect(text()).toContain('2 mã/hộp');
  expect(text()).not.toContain('Tổng số lượng 3');
  expect(text()).toContain('28/10/2026 09:15');
  expect(
    tree.root
      .findAllByType(Button)
      .filter(b => b.props.label === 'Xem mã đã xuất'),
  ).toHaveLength(1);
});

test('parity: repeated SKU does not become another type and mixed units are never silently added', async () => {
  const d = confirmedDocument();
  await render(service(), async () =>
    loaded({
      ...d,
      lines: d.lines.map((l, i) => ({
        ...l,
        skuCode: 'LK-same',
        unit: i ? 'bộ' : 'cái',
      })),
    }),
  );
  expect(text()).toContain('1 loại linh kiện · Tổng số lượng 2 cái · 5 bộ');
  expect(text()).not.toContain('Tổng số lượng 7 cái');
});

test('parity: missing/incomplete proof and SKU cannot become zero or a raw-count quantity', async () => {
  const d = confirmedDocument();
  await render(service(), async () =>
    loaded({
      ...d,
      quantityStatus: 'INCOMPLETE',
      quantityTotal: null,
      lines: [
        {
          ...d.lines[0],
          skuCode: '  ',
          quantity: null,
          quantityStatus: 'INCOMPLETE',
          scannedCodeCount: null,
        },
      ],
    }),
  );
  expect(text()).toContain(
    'Loại linh kiện: Chưa xác minh · Tổng số lượng: Chưa xác minh',
  );
  expect(text()).toContain('Số lượng: Chưa xác minh');
  expect(text()).toContain('Mã quét: Chưa xác minh');
  expect(text()).not.toContain('0 loại');
  expect(text()).not.toContain('0 mã/hộp');
  expect(text()).not.toContain('Số lượng: 0');
});

test('parity: known quantity without unit keeps unknown provenance, no default unit', async () => {
  const d = confirmedDocument();
  await render(service(), async () =>
    loaded({
      ...d,
      lines: d.lines.map(l => ({
        ...l,
        unit: null,
        unitSource: 'NOT_RECORDED',
      })),
    }),
  );
  expect(text()).toContain('Tổng số lượng 7 (đơn vị chưa xác minh)');
  expect(text()).not.toContain('Tổng số lượng 7 cái');
});

test('parity: blank raw proof cannot certify a code count or become issued quantity', async () => {
  const d = confirmedDocument();
  await render(service(), async () =>
    loaded({
      ...d,
      lines: [
        {
          ...d.lines[0],
          quantity: 7,
          scannedCodeCount: 1,
          codes: [{ rawCode: '   ', status: 'RECORDED' }],
        },
      ],
    }),
  );
  expect(text()).toContain('Tổng số lượng 7 cái');
  expect(text()).toContain('Mã quét: Chưa xác minh');
  expect(text()).not.toContain('1 mã/hộp');
});

test('parity: contradictory total is not presented as verified summary', async () => {
  await render(service(), async () =>
    loaded({ ...confirmedDocument(), quantityTotal: 90 }),
  );
  expect(text()).toContain('Tổng số lượng: Chưa xác minh');
  expect(text()).not.toContain('Tổng số lượng 90');
});

test('parity: initial loading shows a real indicator and never an empty/zero badge', async () => {
  let finish!: (v: any) => void;
  await render(
    service(),
    () =>
      new Promise(r => {
        finish = r;
      }),
  );
  expect(tree.root.findByProps({ testID: 'p20-initial-loading' })).toBeTruthy();
  expect(tree.root.findAllByType(ActivityIndicator).length).toBeGreaterThan(0);
  expect(text()).not.toContain('0 phiếu');
  expect(text()).not.toContain('Chưa có linh kiện đã xuất');
  await act(async () => finish(loaded(confirmedDocument())));
});

test('parity: S02 keeps card identity and single-flight page2; S03 error follows retained cards', async () => {
  let rejectMore!: (cause: unknown) => void;
  const load = jest.fn(async (_id: string, options: any) =>
    options.query.page === 1
      ? { ...loaded(confirmedDocument()), total: 2, hasMore: true, nextPage: 2 }
      : new Promise((_resolve, reject) => {
          rejectMore = reject;
        }),
  );
  await render(service(), load);
  const card = tree.root.findByProps({ testID: 'p20-receipt-' + id(3) });
  await act(async () => {
    button('Tải thêm').props.onPress();
    button('Tải thêm').props.onPress();
  });
  expect(tree.root.findByProps({ testID: 'p20-S02' })).toBeTruthy();
  expect(tree.root.findByProps({ testID: 'p20-loading-more' })).toBeTruthy();
  expect(tree.root.findByProps({ testID: 'p20-receipt-' + id(3) })).toBe(card);
  expect(load).toHaveBeenCalledTimes(2);
  await act(async () =>
    rejectMore(new AppError({ kind: 'network', message: 'offline' })),
  );
  expect(tree.root.findByProps({ testID: 'p20-S03' })).toBeTruthy();
  expect(text().indexOf('XLK-confirmed')).toBeLessThan(
    text().indexOf('Không tải thêm được'),
  );
  expect(button('Thử lại tải thêm')).toBeDefined();
  expect(button('Tải thêm')).toBeUndefined();
});

test('parity: verified empty is a proper S04 card, not unavailable or a fabricated document', async () => {
  await render(service(), async () => ({
    ...page,
    documents: [],
    total: 0,
    hasMore: false,
    nextPage: null,
  }));
  expect(tree.root.findByProps({ testID: 'p20-S04' })).toBeTruthy();
  expect(tree.root.findByProps({ testID: 'p20-verified-empty' })).toBeTruthy();
  expect(text()).toContain('0 phiếu đã tải');
  expect(text()).toContain('Chưa có linh kiện đã xuất');
  expect(text()).not.toContain('Số lượng: 0');
});

test('parity: one full document reader exposes all original codes and nullable provenance', async () => {
  await render(service(), async () => loaded(confirmedDocument()));
  await act(async () => button('Xem mã đã xuất').props.onPress());
  expect(tree.root.findByType(Dialog).props.visible).toBe(true);
  expect(tree.root.findByType(Dialog).props.dismissOnBackdrop).toBe(false);
  expect(text()).toContain('BOX-A');
  expect(text()).toContain('SN-B');
  expect(text()).toContain('SN-C');
  expect(text()).toContain(id(3));
  await act(async () => tree.root.findByType(Dialog).props.onDismiss());
  expect(tree.root.findByType(Dialog).props.visible).toBe(false);
});

test('parity: long metadata keeps exact text through the single case reader', async () => {
  const long = 'Sản phẩm\nUnicode Ă🌺 <tag>& ' + 'X'.repeat(2000);
  const s = service();
  (s.detail as jest.Mock).mockResolvedValue({
    ...record,
    sku_name: long,
    serial_number: 'SN-' + 'Y'.repeat(250),
  });
  await render(s, async () => loaded(confirmedDocument()));
  const trigger = tree.root.findByProps({
    accessibilityLabel: 'Xem thông tin hồ sơ',
  });
  await act(async () => trigger.props.onPress());
  expect(tree.root.findByType(Dialog).props.visible).toBe(true);
  expect(text()).toContain(long);
  expect(tree.root.findAllByType(Dialog)).toHaveLength(1);
  await act(async () =>
    setSession({
      accessToken: 'new',
      userId: id(10),
      authSessionId: id(99),
      activeWarehouseId: id(12),
    }),
  );
  expect(tree.root.findByType(Dialog).props.visible).toBe(false);
});

test('parity: larger receipts expand/collapse locally without loading again or changing quantity', async () => {
  const d = confirmedDocument();
  const lines = Array.from({ length: 5 }, (_, i) => ({
    ...d.lines[0],
    id: id(40 + i),
    skuCode: 'LK-' + i,
    skuName: 'Linh kiện ' + i,
  }));
  const load = jest.fn(async () => loaded({ ...d, lines, quantityTotal: 10 }));
  await render(service(), load);
  const dialogless = () =>
    content(tree.root.findByProps({ testID: 'p20-history-card' }));
  expect(dialogless()).not.toContain('LK-4');
  await act(async () => button('Xem tất cả 5 dòng linh kiện').props.onPress());
  expect(dialogless()).toContain('LK-4');
  expect(text()).toContain('5 loại linh kiện · Tổng số lượng 10 cái');
  await act(async () => button('Thu gọn linh kiện').props.onPress());
  expect(dialogless()).not.toContain('LK-4');
  expect(load).toHaveBeenCalledTimes(1);
});

test('parity: primary case action is fixed outside scroll and preserves the exact record callback', async () => {
  const s = service(),
    issue = jest.fn();
  (s.detail as jest.Mock).mockResolvedValue({ ...record, status: 'REPAIRING' });
  await act(async () => {
    tree = Renderer.create(
      <AppProviders>
        <P20HistoryScreen
          caseId={id(2)}
          service={s}
          historyLoad={async () => loaded(confirmedDocument())}
          onBack={() => {}}
          onIssueNew={issue}
        />
      </AppProviders>,
    );
  });
  const footer = tree.root.findByProps({ testID: 'p20-footer' });
  expect(StyleSheet.flatten(footer.props.style).flexShrink).toBe(0);
  await act(async () => button('Xuất linh kiện mới').props.onPress());
  expect(issue).toHaveBeenCalledWith(
    expect.objectContaining({ warranty_case_id: id(2), status: 'REPAIRING' }),
  );
  expect(issue).toHaveBeenCalledTimes(1);
});

test.each(['RECEIVED', 'CHECKING', 'REPAIRING', 'COMPLETED', 'CANCELLED'])(
  'P24 integration: %s retains the P20 frame, not the RETURNED presenter',
  async status => {
    const s = service();
    (s.detail as jest.Mock).mockResolvedValue({ ...record, status });
    await render(s, async () => loaded(confirmedDocument()));
    expect(tree.root.findAllByType(P24ClosedCasePresentation)).toHaveLength(0);
    expect(tree.root.findByProps({ testID: 'p20-case-context' })).toBeTruthy();
    expect(tree.root.findByProps({ testID: 'p20-footer' })).toBeTruthy();
  },
);

test('P24 integration: verified RETURNED selects one presenter/frame and exact-case read callbacks', async () => {
  const s = service(),
    load = jest.fn(async () => page),
    onOpenCase = jest.fn(),
    onTimeline = jest.fn(),
    onBack = jest.fn(),
    onResume = jest.fn(),
    onIssueNew = jest.fn();
  await act(async () => {
    tree = Renderer.create(
      <AppProviders>
        <P20HistoryScreen
          caseId={id(2)}
          service={s}
          historyLoad={load}
          onBack={onBack}
          onOpenCase={onOpenCase}
          onTimeline={onTimeline}
          onResume={onResume}
          onIssueNew={onIssueNew}
        />
      </AppProviders>,
    );
  });
  const p = tree.root.findByType(P24ClosedCasePresentation);
  expect(p.props.context).toMatchObject({
    caseId: id(2),
    status: 'RETURNED',
    productName: null,
    serial: null,
    customerName: null,
  });
  expect(p.props.loadedDocumentCount).toBe(1);
  expect(p.props.loadedDocumentCount).not.toBe(page.total);
  expect(p.props.originalRequestCheck).toBeUndefined();
  expect(
    tree.root.findAllByProps({ testID: 'P24.S04' }).length,
  ).toBeGreaterThan(0);
  expect(tree.root.findAllByProps({ testID: 'p20-footer' })).toHaveLength(0);
  expect(tree.root.findAllByProps({ testID: 'p20-case-context' })).toHaveLength(
    0,
  );
  expect(text().split('Hồ sơ bảo hành').length - 1).toBe(1);
  expect(text()).not.toContain('Xuất linh kiện mới');
  expect(text()).not.toContain('Tiếp tục phiếu linh kiện');
  await act(async () => {
    p.props.onOpenCase();
    p.props.onTimeline();
    p.props.onBack();
  });
  expect(onOpenCase).toHaveBeenCalledWith(id(2));
  expect(onTimeline).toHaveBeenCalledWith(id(2));
  expect(onBack).toHaveBeenCalledTimes(1);
  expect(onResume).not.toHaveBeenCalled();
  expect(onIssueNew).not.toHaveBeenCalled();
  expect(load).toHaveBeenCalledTimes(1);
});

test('P24 integration: read hook remains live through initial, more, error and retry without another store', async () => {
  let first!: (value: any) => void,
    more!: (value: any) => void,
    reject!: (cause: any) => void;
  let secondReads = 0;
  const load = jest.fn((_id: string, options: any) =>
    options.query.page === 1
      ? new Promise(r => {
          first = r;
        })
      : ++secondReads === 1
      ? new Promise((_r, fail) => {
          reject = fail;
        })
      : new Promise(r => {
          more = r;
        }),
  );
  await render(service(), load);
  expect(
    tree.root.findByType(P24ClosedCasePresentation).props.loadedDocumentCount,
  ).toBeNull();
  expect(tree.root.findByProps({ testID: 'p20-initial-loading' })).toBeTruthy();
  await act(async () => first(page));
  await act(async () => button('Tải thêm').props.onPress());
  expect(tree.root.findByProps({ testID: 'p20-S02' })).toBeTruthy();
  expect(
    tree.root.findByType(P24ClosedCasePresentation).props.loadedDocumentCount,
  ).toBe(1);
  await act(async () =>
    reject(new AppError({ kind: 'network', message: 'read fail' })),
  );
  expect(tree.root.findByProps({ testID: 'p20-S03' })).toBeTruthy();
  expect(text()).toContain('XLK-real');
  await act(async () => button('Thử lại tải thêm').props.onPress());
  await act(async () =>
    more({
      documents: [{ ...document, id: id(66), documentNumber: 'XLK-next' }],
      page: 2,
      total: 2,
      hasMore: false,
      nextPage: null,
      nextCursor: null,
    }),
  );
  expect(tree.root.findByProps({ testID: 'p20-S01' })).toBeTruthy();
  expect(
    tree.root.findByType(P24ClosedCasePresentation).props.loadedDocumentCount,
  ).toBe(2);
  expect(load.mock.calls.map(call => call[1].query)).toEqual([
    { page: 1 },
    { page: 2 },
    { page: 2 },
  ]);
});

test('P24 integration: exact selected document outside page is retained and counted distinctly', async () => {
  const direct = jest.fn(async () => ({ ...confirmedDocument(), id: id(88) }));
  await act(async () => {
    tree = Renderer.create(
      <AppProviders>
        <P20HistoryScreen
          caseId={id(2)}
          selectedDocumentId={id(88)}
          selectedLoad={direct}
          historyLoad={async () => page}
          service={service()}
          onBack={() => {}}
        />
      </AppProviders>,
    );
  });
  expect(direct).toHaveBeenCalledWith(
    id(2),
    id(88),
    expect.objectContaining({ signal: expect.anything() }),
  );
  expect(
    tree.root.findByType(P24ClosedCasePresentation).props.loadedDocumentCount,
  ).toBe(2);
  expect(
    tree.root.findByProps({ testID: 'p20-receipt-' + id(88) }),
  ).toBeTruthy();
  expect(
    tree.root.findByProps({ testID: 'p20-receipt-' + id(3) }),
  ).toBeTruthy();
});

test('P24 integration: same-case original UNKNOWN check is opt-in, read-only handoff and stale-family safe', async () => {
  const onCheck = jest.fn();
  await act(async () => {
    tree = Renderer.create(
      <AppProviders>
        <P20HistoryScreen
          caseId={id(2)}
          service={service()}
          historyLoad={async () => page}
          onBack={() => {}}
          originalRequestCheck={{
            caseId: id(2),
            requestId: id(90),
            state: 'UNKNOWN',
            onCheck,
          }}
        />
      </AppProviders>,
    );
  });
  const action = tree.root.findByType(P24ClosedCasePresentation).props
    .originalRequestCheck;
  expect(action.label).toBe('Đối chiếu yêu cầu gốc');
  await act(async () => action.onPress());
  expect(onCheck).toHaveBeenCalledTimes(1);
  await act(async () =>
    setSession({
      accessToken: 'new',
      userId: id(10),
      authSessionId: id(99),
      activeWarehouseId: id(12),
    }),
  );
  await act(async () => action.onPress());
  expect(onCheck).toHaveBeenCalledTimes(1);
  expect(
    tree.root.findByType(P24ClosedCasePresentation).props.originalRequestCheck,
  ).toBeUndefined();
});

test.each([
  { caseId: id(77), requestId: id(90), state: 'UNKNOWN' },
  { caseId: id(2), requestId: 'XLK-display-code', state: 'UNKNOWN' },
  { caseId: id(2), requestId: id(90), state: 'SUCCEEDED' },
])(
  'P24 integration: mismatched/non-original check is omitted: %j',
  async check => {
    await act(async () => {
      tree = Renderer.create(
        <AppProviders>
          <P20HistoryScreen
            caseId={id(2)}
            service={service()}
            historyLoad={async () => page}
            onBack={() => {}}
            originalRequestCheck={{ ...check, onCheck: jest.fn() } as any}
          />
        </AppProviders>,
      );
    });
    expect(
      tree.root.findByType(P24ClosedCasePresentation).props
        .originalRequestCheck,
    ).toBeUndefined();
  },
);

test('P24 integration: full-value reader shares one dialog and rejects stale read callbacks', async () => {
  await render(service(), async () => page);
  const read = tree.root.findByType(P24ClosedCasePresentation).props.onReadFull;
  const original = '  UID\n<>&🌺' + 'X'.repeat(2000);
  await act(async () => read('Định danh đầy đủ', original));
  expect(tree.root.findAllByType(Dialog)).toHaveLength(1);
  expect(tree.root.findByType(Dialog).props.visible).toBe(true);
  expect(text()).toContain(original);
  await act(async () =>
    setSession({
      accessToken: 'new',
      userId: id(10),
      authSessionId: id(99),
      activeWarehouseId: id(12),
    }),
  );
  expect(tree.root.findByType(Dialog).props.visible).toBe(false);
  await act(async () => read('Stale', original));
  expect(tree.root.findByType(Dialog).props.visible).toBe(false);
});

test('P24 integration: scroll props forwarded, no extra read or reinterpretation of null', async () => {
  const onScroll = jest.fn(),
    load = jest.fn(async () => loaded(document));
  await act(async () => {
    tree = Renderer.create(
      <AppProviders>
        <P20HistoryScreen
          caseId={id(2)}
          service={service()}
          historyLoad={load}
          onBack={() => {}}
          initialScrollY={275}
          onScrollPositionChange={onScroll}
        />
      </AppProviders>,
    );
  });
  const p = tree.root.findByType(P24ClosedCasePresentation);
  expect(p.props.initialScrollY).toBe(275);
  p.props.onScrollPositionChange(310);
  expect(onScroll).toHaveBeenCalledWith(310);
  expect(text()).toContain('Số lượng: Chưa xác minh');
  expect(text()).not.toContain('Số lượng: 0');
  expect(load).toHaveBeenCalledTimes(1);
});

test('P24 integration: a non-verified returned case never mounts P24 or reads its history', async () => {
  const s = service(),
    load = jest.fn();
  (s.detail as jest.Mock).mockResolvedValue({
    ...record,
    capabilities: { posted_component_issues_read: false },
  });
  await render(s, load);
  expect(tree.root.findAllByType(P24ClosedCasePresentation)).toHaveLength(0);
  expect(load).not.toHaveBeenCalled();
});

test('P24 integration: list access denial disables the original check including a retained stale handler', async () => {
  const onCheck = jest.fn();
  const load = jest
    .fn()
    .mockResolvedValueOnce(page)
    .mockRejectedValueOnce(
      new AppError({
        kind: 'http',
        status: 403,
        code: 'ACCESS_DENIED',
        message: 'denied',
      }),
    );
  await act(async () => {
    tree = Renderer.create(
      <AppProviders>
        <P20HistoryScreen
          caseId={id(2)}
          service={service()}
          historyLoad={load}
          onBack={() => {}}
          originalRequestCheck={{
            caseId: id(2),
            requestId: id(90),
            state: 'UNKNOWN',
            onCheck,
          }}
        />
      </AppProviders>,
    );
  });
  const action = tree.root.findByType(P24ClosedCasePresentation).props
    .originalRequestCheck;
  await act(async () => button('Tải thêm').props.onPress());
  expect(
    tree.root.findByType(P24ClosedCasePresentation).props.loadedDocumentCount,
  ).toBeNull();
  expect(
    tree.root.findByType(P24ClosedCasePresentation).props.originalRequestCheck
      .disabled,
  ).toBe(true);
  await act(async () => action.onPress());
  expect(onCheck).not.toHaveBeenCalled();
});
