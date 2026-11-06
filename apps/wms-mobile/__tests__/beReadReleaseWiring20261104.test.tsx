import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { AppProviders } from '../src/app/App';
import { parseStockDetail } from '../src/features/documents/p12/contract';
import { parseMixed } from '../src/features/documents/p12/mixed';
import {
  documentPartnerLabel,
  documentStatusPresentation,
  documentOwnerStatusPresentation,
} from '../src/features/documents/p12/presentation';
import { parseWebQueue, webQueueQuery } from '../src/services/wms/p13WebQueue';
import { P13WebQueueDetail } from '../src/features/notifications/P13WebQueuePresentation';
import * as m from './fixtures/p12Protocol';
import * as mix from './fixtures/p12Mixed';
import { queueBody, queueRow, scope } from './fixtures/beReleasedReads20261024';
import {
  releasePartner,
  releaseHandoff,
} from './fixtures/beReadRelease20261104';
const target = { id: m.business, warehouseId: m.warehouse };
test('posted timestamp uses document-timestamps-v1 offsets without conversion or inferred dates', () => {
  const stamp = '2026-11-04T12:00:00+07:00',
    h: any = releaseHandoff(target);
  Object.assign(h, {
    state: 'POSTED',
    canonical_status: 'POSTED',
    current_waiting_for_web: false,
    posted_at: stamp,
  });
  h.display_status.value = 'POSTED';
  h.display_status.label = 'Đã nhập kho';
  const owner: any = m.detail();
  owner.data.status = 'POSTED';
  owner.data.p12.status.canonical = 'POSTED';
  owner.data.p13 = { current_handoff: h };
  expect(
    parseStockDetail(owner, 'inbound', m.business, m.warehouse, {
      origin: 'https://p12.invalid',
    }).webHandoff?.postedAt,
  ).toBe(stamp);
  const row: any = queueRow('INBOUND', 10, 'POSTED');
  row.web_post_handoff = h;
  const decoded = parseWebQueue(
    queueBody({ web_queue: 'ALL' }, [row]),
    scope(),
    webQueueQuery({ web_queue: 'ALL' }),
  ).items[0];
  expect(decoded.handoff.supplied && decoded.handoff.value.posted).toEqual({
    supplied: true,
    value: stamp,
  });
  expect(
    decoded.handoff.supplied && decoded.handoff.value.current?.postedAt,
  ).toBe(stamp);
});
test('missing optional queue projection cannot promote a contradictory owner root or supplier version', () => {
  for (const mutate of [
    (body: any) => {
      body.data.status = 'POSTED';
      body.data.p12.status.canonical = 'POSTED';
    },
    (body: any) => {
      body.data.p13.current_handoff.current_document_version = 2;
      body.data.p13.current_handoff.document_version_match = true;
    },
    (body: any) => {
      body.data.partner.provenance.document_version = 2;
    },
  ]) {
    const body: any = m.detail();
    Object.assign(body.data, {
      partner: releasePartner(target),
      p13: { current_handoff: releaseHandoff(target) },
    });
    mutate(body);
    expect(() =>
      parseStockDetail(body, 'inbound', m.business, m.warehouse, {
        origin: 'https://p12.invalid',
      }),
    ).toThrow();
  }
});
test('aggregate without optional queue still binds handoff canonical state and supplier current version', () => {
  const row: any = mix.row();
  row.partner = releasePartner(target);
  row.web_post_handoff = releaseHandoff(target);
  const b: any = mix.response({}, [row]);
  row.source_status = 'POSTED';
  row.status = 'POSTED';
  row.status_key = 'INBOUND:POSTED';
  row.p12.status.canonical = 'POSTED';
  expect(() => parseMixed(b, {}, m.context(), 'https://p12.invalid')).toThrow();
  row.source_status = 'SCANNING';
  row.status = 'SCANNING';
  row.status_key = 'INBOUND:SCANNING';
  row.p12.status.canonical = 'SCANNING';
  row.web_post_handoff.current_document_version = 2;
  row.web_post_handoff.document_version_match = true;
  expect(() => parseMixed(b, {}, m.context(), 'https://p12.invalid')).toThrow();
});
test('actual aggregate and typed owner decoders retain the same supplier, original timestamp and separate handoff axis', () => {
  const row: any = mix.row();
  row.partner = releasePartner(target);
  row.web_post_handoff = releaseHandoff(target);
  const b = mix.response({}, [row]) as any;
  Object.assign(b.meta, {
    partner_contract: 'p12-partner-snapshot-v1',
    partner_revision: 'p12-partner-snapshot-r1-20261104',
  });
  const list = parseMixed(b, {}, m.context(), 'https://p12.invalid').items[0];
  const owner: any = m.detail();
  Object.assign(owner.data, {
    partner: releasePartner(target),
    p13: { current_handoff: releaseHandoff(target) },
  });
  const detail = parseStockDetail(owner, 'inbound', m.business, m.warehouse, {
    origin: 'https://p12.invalid',
  });
  for (const d of [list, detail]) {
    expect(documentPartnerLabel(d)).toBe('NCC TEST snapshot');
    expect(documentStatusPresentation(d).label).toBe('Chờ xử lý trên Web');
    expect(d.p12.status.canonical).toBe('SCANNING');
    expect(d.p12.status.waiting_for_web).toBeNull();
    expect(d.webHandoff?.versionMatch).toBe(false);
    expect(d.partnerSnapshot?.supplier?.recorded_at).toBe(
      '2026-11-04T05:00:00+00:00',
    );
  }
  expect(detail.source.version).toBe(3);
});
test('P13 strict explicit decoder retains r2 proof and detail explains submitted/current version discrepancy', async () => {
  const row: any = queueRow();
  row.web_post_handoff = releaseHandoff({
    id: row.id,
    warehouseId: scope().warehouseId,
  });
  const result = parseWebQueue(queueBody({}, [row]), scope(), webQueueQuery());
  const decoded = result.items[0];
  expect(
    decoded.handoff.supplied && decoded.handoff.value.current?.versionMatch,
  ).toBe(false);
  let tree!: Renderer.ReactTestRenderer;
  await act(async () => {
    tree = Renderer.create(
      <AppProviders>
        <P13WebQueueDetail row={decoded} statusLabel="Đang quét" />
      </AppProviders>,
    );
  });
  const text = (node: any): string =>
    Array.isArray(node)
      ? node.map(text).join('')
      : typeof node === 'string' || typeof node === 'number'
      ? String(node)
      : node
      ? text(node.children)
      : '';
  const output = text(tree.toJSON());
  expect(decoded.handoff.supplied && decoded.handoff.value.current?.submittedVersion).toBe(2);
  expect(decoded.handoff.supplied && decoded.handoff.value.current?.currentVersion).toBe(3);
  expect(output).toContain('Phiên bản hiện tại chưa được xác nhận đã gửi');
  expect(output).not.toContain('Web đã nhận thành công');
  await act(async () => tree.unmount());
});
test('P13 rejects an r2 handoff from another owner instead of treating the extension as legacy', () => {
  const row: any = queueRow();
  row.web_post_handoff = releaseHandoff({
    id: m.id(999),
    warehouseId: scope().warehouseId,
  });
  expect(() =>
    parseWebQueue(queueBody({}, [row]), scope(), webQueueQuery()),
  ).toThrow();
});
