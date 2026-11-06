import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AppProviders } from '../app/App';
import { P04NativeFlow } from '../features/inbound/P04NativeFlow';
import { createStorage, createMemoryBackend } from '../storage/storage';
import { createP04ReviewService, P04_REVIEW_SESSION, type P04ReviewScenario } from './p04ReviewService';
import type { RequestOptions } from '../api/client';
import { AppError } from '../errors/AppError';
import { fetchP04Suppliers } from '../features/inbound/p04Directory';
import { setTierCheckForTesting } from '../services/wms/tierCheck';
import './global.css';

// No production request can escape this entry (static assets remain browser-loaded).
window.fetch = async () => { throw new Error('P04 local review blocks all live requests.'); };
setTierCheckForTesting({ status: 'matched', expected: 'dev-test' });
const seed = { supplierId: null, note: 'Dữ liệu fixture chỉ dùng đối chiếu S01–S04.' };
const scenarioChoices: [P04ReviewScenario, string][] = [
  ['normal', 'Luồng đầy đủ'], ['context-error', 'Lỗi tải ngữ cảnh'],
  ['warehouse-inactive', 'Kho tạm dừng'], ['denied', 'Không đủ quyền'],
  ['context-required', 'Chưa xác nhận kho'], ['revalidation', 'SKU bị khóa khi review'],
  ['record-reject', 'RECORD bị từ chối'], ['record-timeout', 'RECORD mất phản hồi sau commit'],
  ['save-timeout', 'SAVE mất phản hồi sau commit'], ['record-not-sent', 'UNKNOWN → retry cùng yêu cầu'],
  ['supplier-empty', 'NCC rỗng'], ['supplier-error', 'NCC lỗi quyền'],
];
const supplierRows = (query: string) => Array.from({ length: 25 }, (_, i) => ({
  id: `12345678-1234-4234-8234-${String(i + 1).padStart(12, '0')}`,
  name: `NCC local ${String(i + 1).padStart(2, '0')} — Hoa Nam`,
  status: 'ACTIVE' as const, version: 1, updated_at: '2026-10-13T03:20:00Z',
})).filter(row => row.name.toLocaleLowerCase('vi').includes(query.toLocaleLowerCase('vi')));
const session = () => P04_REVIEW_SESSION;
const params = new URLSearchParams(location.search);
const scenario = (scenarioChoices.find(([value]) => value === params.get('scenario'))?.[0] ?? 'normal');

function AppFrame() {
  const environment = useMemo(() => {
    const calls: RequestOptions[] = [];
    return { calls, service: createP04ReviewService({ scenario, calls }), storage: createStorage(createMemoryBackend()) };
  }, []);
  const suppliers = useMemo<typeof fetchP04Suppliers>(() => (warehouse, query, page, signal) => fetchP04Suppliers(warehouse, query, page, signal, {
    getSession: session,
    client: { async get<T>(_path: string, options: unknown) {
      if (scenario === 'supplier-error') throw new AppError({ kind: 'http', status: 403, code: 'P04_OPERATION_DENIED', message: 'Local: lỗi quyền NCC.' });
      const q = (options as { query: { q: string; page: number } }).query;
      const rows = scenario === 'supplier-empty' ? [] : supplierRows(q.q);
      return { status: 200, data: { success: true, data: rows.slice((q.page - 1) * 20, q.page * 20), meta: { contract: 'mini-app-p04-v1', scope: 'GLOBAL', source: 'inbound_suppliers', page: q.page, per_page: 20, total: rows.length, last_page: Math.max(1, Math.ceil(rows.length / 20)) } } as T };
    } },
  }), []);
  const report = (message: string) => parent.postMessage({ p04Review: true, message }, location.origin);
  useEffect(() => {
    const readAudit = (event: MessageEvent) => {
      if (event.origin === location.origin && event.source === parent && event.data?.p04Audit === true)
        parent.postMessage({ p04Review: true, audit: environment.calls }, location.origin);
    };
    window.addEventListener('message', readAudit);
    return () => window.removeEventListener('message', readAudit);
  }, [environment]);
  return <div style={{ display: 'flex', height: '100vh', width: '100%' }}>
    <AppProviders><P04NativeFlow service={environment.service} storage={environment.storage} getSession={session} supplierLoader={suppliers} initialSeed={seed}
      onExit={() => report('Owner đã yêu cầu Trang chủ; P02 không được tích hợp trong review P04.')}
      onViewDocument={() => report('Đích chứng từ chưa tích hợp trong review local.')}
      onHistory={() => report('Đích lịch sử chưa tích hợp trong review local.')}
    /></AppProviders>
  </div>;
}

function Review() {
  const [width, setWidth] = useState(494);
  const [runKey, setRunKey] = useState(0);
  const [selected, setSelected] = useState<P04ReviewScenario>('normal');
  const [viewport, setViewport] = useState(window.innerWidth);
  const [message, setMessage] = useState('');
  const [audit, setAudit] = useState('');
  useEffect(() => {
    const resize = () => setViewport(window.innerWidth);
    const receive = (event: MessageEvent) => {
      const frame = document.getElementById('p04-preview') as HTMLIFrameElement | null;
      if (event.origin !== location.origin || event.source !== frame?.contentWindow || !event.data?.p04Review) return;
      if (event.data.message) setMessage(String(event.data.message));
      if (event.data.audit) setAudit(JSON.stringify(event.data.audit, null, 2));
    };
    window.addEventListener('resize', resize); window.addEventListener('message', receive);
    return () => { window.removeEventListener('resize', resize); window.removeEventListener('message', receive); };
  }, []);
  const scale = Math.min(1, Math.max(0.1, (viewport - 24) / width));
  const childUrl = `?embedded=1&scenario=${selected}&run=${runKey}`;
  return <>
    <div className="p04-review-tools">
      <strong>P04 local E2E — S01 → S02 → S03 → S04</strong>
      <span>Fixture cô lập: không API thật, không camera thật, không Post/tăng tồn.</span>
      <label>Kịch bản <select aria-label="Kịch bản local" value={selected} onChange={event => { setSelected(event.target.value as P04ReviewScenario); setMessage(''); setAudit(''); }}>{scenarioChoices.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      {[360, 390, 430, 494].map(size => <button key={size} onClick={() => setWidth(size)}>{size}px</button>)}
      <button onClick={() => { setMessage('Đã reset phiên review'); setRunKey(k => k + 1); }}>Reset S01</button>
      <button onClick={() => (document.getElementById('p04-preview') as HTMLIFrameElement)?.contentWindow?.postMessage({ p04Audit: true }, location.origin)}>Kiểm tra request local</button>
      {message && <span role="status">{message}</span>}
    </div>
    <div className="p04-review-frame" style={{ width: width * scale, height: 950 * scale }}>
      <iframe id="p04-preview" title="Luồng P04 local" key={childUrl} src={childUrl} allow="camera 'none'; microphone 'none'" style={{ width, height: 950, border: 0, transform: `scale(${scale})`, transformOrigin: 'top left', flexShrink: 0 }} />
    </div>
    {audit && <pre aria-label="Request fixture P04">{audit}</pre>}
  </>;
}
createRoot(document.getElementById('root')!).render(params.get('embedded') === '1' ? <AppFrame /> : <Review />);
