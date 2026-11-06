import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { AppProviders } from '../src/app/App';
import { parseWebQueue, webQueueQuery } from '../src/services/wms/p13WebQueue';
import { P13QueueMetadata } from '../src/features/notifications/P13WebQueuePresentation';
import { queueBody, queueRow, scope } from './fixtures/beReleasedReads20261024';
import { queueProjection } from './fixtures/beQueueProjection20261104';
import {
  documentStatusPresentation,
  documentSnapshotCaption,
} from '../src/features/documents/p12/presentation';
test('a cached root version is labeled as loaded data, never certified current by the actions dialog', () => {
  const doc: any = {
    source: { version: 0 },
    queueProjection: {
      available: true,
      version: 2,
      ownerComparison: 'DIFFERS',
    },
  };
  expect(documentSnapshotCaption(doc)).toContain('Phiên bản 0');
  expect(documentSnapshotCaption(doc)).toContain('đã tải');
  expect(documentSnapshotCaption(doc)).not.toContain('hiện tại');
});
test('creator SOURCE_UNAVAILABLE is not an assertion that historical evidence was never recorded', async () => {
  const row = queueRow(),
    q = queueProjection();
  q.read_target = row.read_target as any;
  Object.assign(q.creator, {
    availability: 'SOURCE_UNAVAILABLE',
    display_name_availability: 'SOURCE_UNAVAILABLE',
    job_title_availability: 'SOURCE_UNAVAILABLE',
  });
  (row as any).queue_projection = q;
  const parsed = parseWebQueue(queueBody({}, [row]), scope(), webQueueQuery());
  let tree!: Renderer.ReactTestRenderer;
  await act(async () => {
    tree = Renderer.create(
      <AppProviders>
        <P13QueueMetadata row={parsed.items[0]} />
      </AppProviders>,
    );
  });
  expect(JSON.stringify(tree.toJSON())).toContain(
    'Nguồn tạm thời chưa sẵn sàng',
  );
  expect(JSON.stringify(tree.toJSON())).not.toContain('Chưa ghi nhận');
  await act(async () => tree.unmount());
});
test('real P13 explicit-read decoder carries LINE metadata into presenter without changing totals or handoff', async () => {
  const row = queueRow(),
    q = queueProjection();
  q.read_target = row.read_target as any;
  (row as any).queue_projection = q;
  const result = parseWebQueue(queueBody({}, [row]), scope(), webQueueQuery());
  expect(result.total).toBe(1);
  expect(result.items[0].projection?.available).toBe(true);
  expect(result.items[0].handoff.supplied).toBe(true);
  let tree!: Renderer.ReactTestRenderer;
  await act(async () => {
    tree = Renderer.create(
      <AppProviders>
        <P13QueueMetadata row={result.items[0]} />
      </AppProviders>,
    );
  });
  const text = JSON.stringify(tree.toJSON());
  expect(text).toContain('2 dòng');
  expect(text).not.toContain('2 sản phẩm');
  expect(text).toContain('Chưa ghi nhận');
  await act(async () => tree.unmount());
});
test('P12 typed owner displays stale-source label instead of upgrading a cached root from fresh status', () => {
  const m = require('./fixtures/p12Protocol'),
    { parseStockDocument } = require('../src/features/documents/p12/contract');
  const row = m.stock('inbound', 10),
    q = queueProjection() as any;
  q.read_target = row.p12.read_target;
  q.document_version = row.version + 1;
  q.owner_snapshot = {
    document_version: row.version,
    canonical_status: row.status,
    comparison: 'DIFFERS',
    semantics: 'MAY_BE_CACHED_OTHER_OWNER_FIELDS_NOT_REFRESHED',
  };
  row.queue_projection = q;
  row.display_status = {
    mapping_contract: 'p12-p13-p16-status-v1',
    mapping_revision: 'be04-display-r1-20261104',
    availability: 'MAPPED',
    value: 'COMPLETED',
    label: 'Đã nhập kho',
    canonical_status: 'POSTED',
    document_version: q.document_version,
    as_of: q.as_of,
    semantics: 'STATUS_AND_READINESS_NOT_HANDOFF_OR_CHECK_EVIDENCE',
  };
  const d = parseStockDocument(row, 'inbound', null, {
    origin: 'https://p12.invalid',
  });
  expect(d.rawStatus).toBe(row.status);
  expect(d.displayStatus.availability).toBe('STALE');
  expect(documentStatusPresentation(d).label).toBe('Cần đọc lại phiên bản');
});
