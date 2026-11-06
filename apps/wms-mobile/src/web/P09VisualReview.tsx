// Offline only: renders the native P09 components through their real adapter and command owner.
// No fixture from this entry is imported by AppShell or Metro.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '../theme/ThemeProvider';
import { WarrantyListScreen } from '../features/warranty/WarrantyListScreen';
import { WarrantyIntakeScreen } from '../features/warranty/WarrantyIntakeScreen';
import { WarrantyCaseDetail } from '../features/warranty/WarrantyCaseDetail';
import { BottomNav } from '../ui/BottomNav';
import { p09CommandOwner } from '../features/warranty/p09Controller';
import {
  harness,
  envelope,
  resolved,
  caseRow,
  pageMeta,
  receipt,
  id,
} from '../../__tests__/fixtures/p09Mock';
import { AppError } from '../errors/AppError';
import type { P09Case, P09Status, P09Event } from '../services/wms/p09Warranty';
import {
  createMemoryBackend,
  createStorage,
  setAppStorageForTesting,
} from '../storage/storage';
import locked from './p09LockedFixture.json';
import printer from '../features/warranty/assets/review-printer.png';
import './global.css';
setAppStorageForTesting(createStorage(createMemoryBackend()));
const image = { uri: printer };
const statusMap: Record<string, P09Status> = {
  'Đã tiếp nhận': 'RECEIVED',
  'Đang kiểm tra': 'CHECKING',
  'Đang sửa': 'REPAIRING',
  'Đã hủy': 'CANCELLED',
  'Chờ bàn giao': 'COMPLETED',
  'Đã trả khách': 'RETURNED',
  'Hoàn tất sửa chữa': 'COMPLETED',
};
const iso = (day: string, time: string) => `${day}T${time}:00+07:00`;
const seeds: P09Case[] = locked.cases.map((row, i) => ({
  ...caseRow(i + 4),
  item_id: id(101 + i),
  warranty_case_code: row.id,
  status: statusMap[row.status]!,
  customer_name: row.customer,
  customer_phone: row.contact,
  sku_name: row.model,
  serial_number: row.serial,
  reported_defect: row.fault,
  description: row.fault,
  confirmed_defect: row.diagnosis,
  accessories_received: row.accessories,
  received_condition: null,
  received_at: iso(row.events[0]!.day, row.events[0]!.time),
  created_at: iso(row.events[0]!.day, row.events[0]!.time),
  updated_at: iso(row.day, row.time),
}));
const componentProjection = Object.fromEntries(
  locked.ledger.map((row, i) => [
    id(200 + i),
    {
      number: row.id,
      postedAt: iso(row.day, row.time),
      lines: row.lines.map(line => ({
        code: line.sku,
        name: line.name,
        quantity: line.quantity,
      })),
    },
  ]),
);
const scenarios = [
  'camera',
  'ready',
  'loading',
  'empty',
  'network',
  '401',
  '403',
  'missing',
  'long',
  'readonly',
  'unknown',
  'failed',
  'saved-unloaded',
  'stale',
  'RECEIVED',
  'CHECKING',
  'REPAIRING',
  'COMPLETED',
  'RETURNED',
  'CANCELLED',
];
function prepare(scenario: string) {
  const rows = structuredClone(seeds);
  let last: any,
    detailFailure = scenario === 'saved-unloaded';
  const selected = rows[0]!;
  const identities = new Map([
    [id(100), { serial: 'SN-XP420B-BK-0008', model: 'Máy in nhiệt XP-420B' }],
    ...rows.map(
      (row, i) =>
        [
          id(101 + i),
          { serial: row.serial_number!, model: row.sku_name! },
        ] as const,
    ),
  ]);

  const caseEvents = new Map<string, P09Event[]>(
    locked.cases.map((source, index) => [
      rows[index]!.warranty_case_id,
      source.events.map((event, i) => ({
        event_id: id(400 + index * 30 + i),
        warranty_case_id: rows[index]!.warranty_case_id,
        actor: { user_id: id(1), display_name: event.actor },
        event_at: iso(event.day, event.time),
        from_status: null,
        to_status: statusMap[event.label] ?? null,
        message: event.description ?? null,
        message_redacted: false,
      })),
    ]),
  );
  function appendEvent(row: P09Case, message: string) {
    const entries = caseEvents.get(row.warranty_case_id) ?? [];
    entries.push({
      event_id: id(1200 + entries.length + rows.indexOf(row) * 30),
      warranty_case_id: row.warranty_case_id,
      actor: { user_id: id(1), display_name: 'Minh Anh' },
      event_at: row.updated_at ?? null,
      from_status: null,
      to_status: row.status,
      message,
      message_redacted: false,
    });
    caseEvents.set(row.warranty_case_id, entries);
  }

  if (
    [
      'RECEIVED',
      'CHECKING',
      'REPAIRING',
      'COMPLETED',
      'RETURNED',
      'CANCELLED',
    ].includes(scenario)
  )
    selected.status = scenario as P09Status;
  if (scenario === 'RECEIVED') {
    selected.updated_at = selected.received_at ?? undefined;
    caseEvents.set(
      selected.warranty_case_id,
      caseEvents.get(selected.warranty_case_id)!.slice(0, 1),
    );
  } else if (
    ['REPAIRING', 'COMPLETED', 'RETURNED', 'CANCELLED'].includes(scenario)
  ) {
    selected.updated_at = '2026-09-29T16:21:00+07:00';
    appendEvent(selected, `Trạng thái hồ sơ: ${selected.status}`);
  }
  if (scenario === 'missing') {
    selected.serial_number = null;
    selected.created_at = undefined;
    selected.updated_at = undefined;
    selected.sku_name = null;
    selected.customer_name = null;
    selected.customer_phone = null;
    selected.description = null;
    selected.reported_defect = null;
    selected.confirmed_defect = null;
  }
  if (scenario === 'long') {
    selected.warranty_case_code = 'Hồ sơ dài '.repeat(18);
    selected.customer_name = 'Tên khách hàng '.repeat(40);
    selected.description = 'Ghi chú rất dài có Unicode, xuống dòng\n'.repeat(
      90,
    );
    selected.confirmed_defect = 'Chẩn đoán '.repeat(220);
  }
  const h = harness(async options => {
    if (scenario === 'loading') return new Promise(() => {});
    if (scenario === 'network')
      throw new AppError({ kind: 'network', message: 'Không có kết nối.' });
    if (scenario === '401' || scenario === '403')
      throw new AppError({
        kind: 'http',
        status: Number(scenario),
        message: 'Offline permission response',
      });
    if (options.path.endsWith('/resolve-code')) {
      const code = String(options.body?.raw_code ?? '');
      const active = rows.find(
        row =>
          row.serial_number === code &&
          !['RETURNED', 'CANCELLED'].includes(row.status),
      );
      if (
        code !== 'SN-XP420B-BK-0008' &&
        !rows.some(row => row.serial_number === code)
      )
        throw new AppError({
          kind: 'http',
          status: 404,
          code: 'WARRANTY_ITEM_NOT_FOUND',
          message: 'Không tìm thấy hiện vật.',
        });
      return envelope({
        ...resolved,
        item_id:
          code === 'SN-XP420B-BK-0008'
            ? id(100)
            : id(101 + rows.findIndex(row => row.serial_number === code)),
        serial_number: code,
        active_warranty_exists: !!active,
        eligible_for_warranty: !active,
        eligibility_code: active ? 'ACTIVE_WARRANTY_EXISTS' : 'ELIGIBLE',
      });
    }
    if (options.method === 'POST' && options.path.endsWith('/warranty-cases')) {
      const itemId = options.body?.item_id as string | undefined,
        identity = itemId ? identities.get(itemId) : undefined;
      if (
        itemId &&
        rows.some(
          row =>
            row.item_id === itemId &&
            !['RETURNED', 'CANCELLED'].includes(row.status),
        )
      )
        return envelope({
          receipt: receipt('FAILED', {
            request_id: options.headers?.['X-Request-ID'],
            operation: 'CREATE',
            error_code: 'ACTIVE_WARRANTY_EXISTS',
            may_create_new_request: true,
            warranty_case_id: null,
          }),
        });

      const row: P09Case = {
        ...caseRow(rows.length + 4),
        version: 1,
        warranty_case_code: `BH-${String(rows.length + 1).padStart(3, '0')}`,
        status: 'RECEIVED',
        item_id: itemId ?? null,
        sku_name: identity?.model ?? null,
        serial_number: identity?.serial ?? null,
        manual_product_description: options.body?.manual_product_description as
          | string
          | undefined,
        customer_name: String(options.body?.customer_name ?? ''),
        customer_phone: String(options.body?.customer_phone ?? ''),
        description: String(options.body?.description ?? ''),
        created_at: '2026-09-29T16:21:00+07:00',
        received_at: '2026-09-29T16:21:00+07:00',
        updated_at: '2026-09-29T16:21:00+07:00',
      };
      rows.push(row);
      appendEvent(row, row.description ?? 'Đã tiếp nhận');
      return envelope({
        receipt: receipt('SUCCEEDED', {
          request_id: options.headers?.['X-Request-ID'],
          operation: 'CREATE',
          warranty_case_id: row.warranty_case_id,
          version: row.version,
          status: row.status,
        }),
      });
    }
    if (options.method === 'PATCH' || options.method === 'POST') {
      last = options;
      const row =
        rows.find(r => r.warranty_case_id === options.path.split('/').at(-1)) ??
        selected;
      const target = (options.body?.status as P09Status) ?? row.status;
      const transitions: Record<string, string[]> = {
        RECEIVED: ['CHECKING', 'CANCELLED'],
        CHECKING: ['REPAIRING', 'COMPLETED', 'CANCELLED'],
        REPAIRING: ['COMPLETED', 'CANCELLED'],
        COMPLETED: [],
        RETURNED: [],
        CANCELLED: [],
      };
      if (target !== row.status && !transitions[row.status]?.includes(target))
        return envelope({
          receipt: receipt('FAILED', {
            request_id: options.headers?.['X-Request-ID'],
            operation: 'UPDATE',
            warranty_case_id: row.warranty_case_id,
            error_code: 'INVALID_WARRANTY_TRANSITION',
            may_create_new_request: true,
          }),
        });
      if (scenario === 'unknown')
        return envelope({
          receipt: receipt('PROCESSING', {
            request_id: options.headers?.['X-Request-ID'],
            operation: 'UPDATE',
            warranty_case_id: row.warranty_case_id,
          }),
        });
      if (scenario === 'failed' || scenario === 'stale')
        return envelope({
          receipt: receipt('FAILED', {
            request_id: options.headers?.['X-Request-ID'],
            operation: 'UPDATE',
            warranty_case_id: row.warranty_case_id,
            error_code:
              scenario === 'stale' ? 'STALE_VERSION' : 'VALIDATION_FAILED',
            may_create_new_request: true,
          }),
        });
      row.version++;
      row.status = (options.body?.status as P09Status) ?? row.status;
      row.confirmed_defect = String(
        options.body?.confirmed_defect ?? row.confirmed_defect ?? '',
      );
      row.updated_at = '2026-09-29T16:21:00+07:00';
      appendEvent(row, String(options.body?.note ?? 'Cập nhật xử lý'));
      return envelope({
        receipt: receipt('SUCCEEDED', {
          request_id: options.headers?.['X-Request-ID'],
          operation: options.method === 'POST' ? 'CREATE' : 'UPDATE',
          warranty_case_id: row.warranty_case_id,
          version: row.version,
          status: row.status,
        }),
      });
    }
    if (options.path.includes('/warranty-requests/')) {
      const target = rows.find(
        row => row.warranty_case_id === last.path.split('/').at(-1),
      )!;
      target.version++;
      target.status = (last.body?.status as P09Status) ?? target.status;
      target.updated_at = '2026-09-29T16:21:00+07:00';
      appendEvent(target, String(last.body?.note ?? 'Cập nhật xử lý'));
      return envelope({
        receipt: receipt('SUCCEEDED', {
          request_id: last.headers['X-Request-ID'],
          operation: 'UPDATE',
          warranty_case_id: target.warranty_case_id,
          version: target.version,
          status: target.status,
        }),
      });
    }

    if (options.path.endsWith('/warranty-cases')) {
      let filtered =
        scenario === 'empty'
          ? []
          : rows.filter(
              r =>
                (!options.query?.status ||
                  options.query.status === 'ALL' ||
                  r.status === options.query.status) &&
                (!options.query?.search ||
                  [r.warranty_case_code, r.serial_number]
                    .join(' ')
                    .toLowerCase()
                    .includes(String(options.query.search).toLowerCase())),
            );
      filtered.sort(
        (a, b) =>
          String(a.created_at).localeCompare(String(b.created_at)) *
          (options.query?.sort === 'created_at_asc' ? 1 : -1),
      );
      const start = Number(options.query?.cursor ?? 0),
        size = Number(options.query?.per_page ?? 3),
        items = filtered.slice(start, start + size),
        more = start + size < filtered.length;
      return envelope(items, {
        ...pageMeta,
        total: filtered.length,
        hasMore: more,
        nextCursor: more ? String(start + size) : null,
      });
    }
    const parent = options.path.split('/warranty-cases/')[1]?.split('/')[0],
      index = rows.findIndex(r => r.warranty_case_id === parent),
      row = rows[index] ?? selected,
      source = locked.cases[index];
    if (options.path.endsWith('/events')) {
      const events = [...(caseEvents.get(row.warranty_case_id) ?? [])].sort(
        (a, b) =>
          String(a.event_at).localeCompare(String(b.event_at)) *
          (options.query?.sort === 'event_at_desc' ? -1 : 1),
      );
      const limit = Number(options.query?.per_page ?? 25),
        start = Number(options.query?.cursor ?? 0),
        hasMore = start + limit < events.length;
      return envelope(events.slice(start, start + limit), {
        ...pageMeta,
        total: events.length,
        hasMore,
        nextCursor: hasMore ? String(start + limit) : null,
      });
    }
    if (options.path.endsWith('/component-issues')) {
      const links = locked.ledger
        .map((doc, i) => ({ doc, i }))
        .filter(
          ({ doc }) =>
            doc.caseId === source?.id &&
            !(
              scenario === 'RECEIVED' &&
              row.warranty_case_id === selected.warranty_case_id
            ),
        )
        .map(({ i }) => ({
          component_issue_document_id: id(200 + i),
          warranty_case_id: row.warranty_case_id,
          status: 'POSTED',
          can_open: false,
          detail_url: null,
        }));
      return envelope(links, { ...pageMeta, total: links.length });
    }
    if (options.path.endsWith('/attachments'))
      return envelope([], { ...pageMeta, total: 0 });
    if (detailFailure && last)
      throw new AppError({
        kind: 'network',
        message: 'Không tải lại được hồ sơ',
      });
    return envelope(row);
  });
  if (scenario === 'readonly') {
    for (const row of rows) {
      row.customer_name = 'C***';
      row.customer_phone = '*******567';
      row.description = null;
      row.reported_defect = null;
      row.confirmed_defect = null;
      row.accessories_received = null;
      row.free_text_redacted = true;
    }
    for (const events of caseEvents.values())
      for (const event of events) {
        event.message = null;
        event.message_redacted = true;
        event.actor.display_name = null;
      }
  }
  if (scenario === 'readonly')
    h.setContext({
      ...h.context(),
      user: {
        ...h.context().user!,
        permissions: ['warranty.view', 'documents.read'],
      },
    });
  return {
    ...h,
    rows,
    recover: () => {
      detailFailure = false;
    },
  };
}
function Review() {
  const [h, setH] = useState(() => prepare('ready')),
    [panel, setPanel] = useState(1),
    [scenario, setScenario] = useState('ready'),
    [width, setWidth] = useState(494),
    [revision, setRevision] = useState(0),
    [caseId, setCaseId] = useState(id(4));
  function reset(next = scenario, p = panel) {
    const service = prepare(next);
    setScenario(next);
    setH(service);
    setPanel(p);
    setCaseId(id(4));
    setRevision(n => n + 1);
    if (p === 4)
      p09CommandOwner(service.service)
        .confirm(() =>
          service.service.prepareUpdate(service.rows[0]!, {
            status: 'COMPLETED',
            note: 'Đã sửa chữa, máy hoạt động bình thường',
            confirmed_defect: 'Đã kiểm tra nguồn và bo mạch.',
          }),
        )
        .catch(() => {});
  }
  const back = () => setPanel(1);
  (window as any).__p09Local = {
    calls: h.calls,
    rows: h.rows,
    owner: p09CommandOwner(h.service),
    recover: h.recover,
    reset,
  };
  return (
    <>
      <div style={{ fontFamily: 'Arial', padding: 12, background: '#fff' }}>
        <strong>
          LOCAL OFFLINE · fixture từ mẫu P09 đã chốt · không WMS / không ghi dữ
          liệu thật
        </strong>
        <br />
        {[1, 2, 3, 4].map(p => (
          <button key={p} onClick={() => reset(scenario, p)}>
            S0{p}
          </button>
        ))}{' '}
        <label>
          Trạng thái kiểm thử{' '}
          <select
            aria-label="Trạng thái kiểm thử"
            value={scenario}
            onChange={e => reset(e.target.value)}
          >
            {scenarios.map(s => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>{' '}
        {[360, 494].map(w => (
          <button key={w} onClick={() => setWidth(w)}>
            {w}px
          </button>
        ))}{' '}
        <button
          onClick={() => {
            h.recover();
            p09CommandOwner(h.service)
              .retryDetail()
              .catch(() => {});
          }}
        >
          Phục hồi nguồn đọc
        </button>
      </div>
      <div
        data-review-frame="P09"
        style={{
          width,
          height: 950,
          margin: '12px auto',
          display: 'flex',
          overflow: 'hidden',
          outline: '1px solid #b4c6d0',
          position: 'relative',
          fontFamily: 'Arial',
        }}
      >
        <SafeAreaProvider>
          <ThemeProvider>
            {panel === 1 ? (
              <WarrantyListScreen
                key={revision}
                service={h.service}
                productImage={() => image}
                onBack={back}
                onScan={() => setPanel(2)}
                onManualEntry={() => setPanel(2)}
                onCreateWithoutCode={() => setPanel(2)}
                onOpenCase={row => {
                  setCaseId(row.warranty_case_id);
                  setPanel(3);
                }}
                footer={<BottomNav activeKey="home" onSelect={() => {}} />}
              />
            ) : panel === 2 ? (
              <WarrantyIntakeScreen
                key={revision}
                initialCode={scenario === 'camera' ? '' : 'SN-XP420B-BK-0008'}
                scanAvailable={false}
                resolvedPresentation={
                  ['camera', 'missing', 'readonly', '401', '403'].includes(scenario)
                    ? undefined
                    : {
                        item_id: id(100),
                        serial_number: 'SN-XP420B-BK-0008',
                        product_name: 'Máy in nhiệt XP-420B',
                        customer_name: 'Công ty Minh Phát',
                        customer_phone: '0901 234 567',
                      }
                }
                service={h.service}
                onBack={back}
                onScan={() => {}}
                onOpenExisting={row => {
                  setCaseId(row.warranty_case_id);
                  setPanel(3);
                }}
                onCreated={row => {
                  setCaseId(row.warranty_case_id);
                  setPanel(3);
                }}
              />
            ) : (
              <WarrantyCaseDetail
                key={revision}
                service={h.service}
                warrantyCase={
                  h.rows.find(r => r.warranty_case_id === caseId) ?? h.rows[0]!
                }
                productImage={image}
                componentPresentation={componentProjection}
                onBack={back}
              />
            )}
          </ThemeProvider>
        </SafeAreaProvider>
      </div>
    </>
  );
}
createRoot(document.getElementById('root')!).render(<Review />);
