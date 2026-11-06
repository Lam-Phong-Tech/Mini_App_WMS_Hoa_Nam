import React, { useEffect, useState } from 'react';
import Renderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import type { Document, Source } from '../src/features/documents/p12/contract';
import {
  canonicalStatusPresentation,
  documentStatusPresentation,
} from '../src/features/documents/p12/presentation';
import { homeRecentRecord } from '../src/features/home/homeDocuments';
import { documentTime } from '../src/features/documents/p12/P12Screen';
import { greetingName } from '../src/ui/hnHomeTokens';
import { OwnerHandoffHost } from '../src/app/OwnerHandoffHost';

const doc = (canonical: string | null = 'SCANNING', type: Source = 'inbound') =>
  ({
    type,
    id: '11111111-1111-4111-8111-111111111111',
    number: 'PN-OFFLINE',
    warehouseId: '22222222-2222-4222-8222-222222222222',
    p12: {
      identity: {
        source: type.toUpperCase(),
        resource_type: type === 'warranty' ? 'WARRANTY_CASE' : 'STOCK_DOCUMENT',
        id: '11111111-1111-4111-8111-111111111111',
        warehouse_id: '22222222-2222-4222-8222-222222222222',
      },
      read_target: {
        method: 'GET',
        path: '/api/v1/mini-app/inbound-documents/11111111-1111-4111-8111-111111111111',
        query: { warehouse_id: '22222222-2222-4222-8222-222222222222' },
      },
      status: {
        canonical,
        mini_app: 'WAITING_APPROVAL',
        waiting_for_web: null,
        readiness: { state: 'READY' },
      },
    },
    source: {},
    createdAt: '2026-10-14T20:45:56.000000Z',
  } as Document);

test.each(['Quản trị viên', 'Nguyễn Minh Anh', '  Nguyễn   Văn  An  '])(
  'greeting retains every word: %s',
  name => {
    expect(greetingName(name)).toBe(name.trim().replace(/\s+/g, ' '));
  },
);

test.each([
  ['inbound', 'POSTED', 'Đã ghi sổ'],
  ['outbound', 'SCANNING', 'Đang quét'],
  ['warranty', 'CHECKING', 'Đang kiểm tra'],
  ['warranty', 'COMPLETED', 'Chờ bàn giao'],
  ['warranty', 'RETURNED', 'Đã trả khách'],
  ['outbound', 'unexpected', 'Chưa xác minh trạng thái'],
])('%s canonical %s gets a display-only label', (type, status, label) => {
  expect(canonicalStatusPresentation(type as Source, status).label).toBe(label);
});

test('readiness is not Web handoff and an unvalidated detail label is ignored', () => {
  const d = doc();
  d.source.display_status = { label: 'Đã gửi Web' };
  expect(documentStatusPresentation(d).label).toBe('Chờ xử lý trên Web');
  expect(documentStatusPresentation(d).label).not.toBe('Đã gửi Web');
  expect(d.webHandoff).toBeUndefined();
  expect(d.p12.status.waiting_for_web).toBeNull();
  expect(d.p12.status.canonical).toBe('SCANNING');
});

test('verified aggregate projection reaches Home without leaking canonical enum or losing ID/time', () => {
  const d = doc();
  d.displayStatus = {
    availability: 'MAPPED',
    value: 'WAITING_APPROVAL',
    label: 'Chờ duyệt nhập kho',
  };
  const recent = homeRecentRecord(d);
  expect(recent.statusPresentation?.label).toBe('Chờ xử lý trên Web');
  expect(recent.status).toBe('SCANNING');
  expect(recent.displayMappingPending).toBe(false);
  expect(recent.id).toBe(d.id);
  expect(recent.timestamp?.raw).toBe(d.createdAt);
});

test('pending label is not replaced with raw enum or invented success; current detail is independent', () => {
  const d = doc();
  d.displayStatus = {
    availability: 'PENDING_BA_MAPPING',
    label: null,
    value: null,
  };
  expect(documentStatusPresentation(d).label).toBe('Chờ xác minh trạng thái');
  expect(homeRecentRecord(d).displayMappingPending).toBe(true);
  expect(documentStatusPresentation(doc('CANCELLED')).label).toBe('Đã hủy');
});

test('locked date-first display preserves RFC3339 instant with no manual +7', () => {
  expect(documentTime('2026-10-14T20:45:56.000000Z')).toBe('15/10/2026 03:45');
  expect(documentTime('2026-10-15T03:45:56+07:00')).toBe('15/10/2026 03:45');
  expect(documentTime(null)).toBe('Chưa có thời điểm ghi nhận');
});

test('NFC child handoff retains exact caller state/controller and only hides it from accessibility', async () => {
  const mounted = jest.fn(),
    disposed = jest.fn();
  function Owner() {
    const [value] = useState('P05.S03 scroll=413 original-UNKNOWN-key');
    useEffect(() => {
      mounted();
      return disposed;
    }, []);
    return <Text>{value}</Text>;
  }
  let tree!: Renderer.ReactTestRenderer;
  await act(async () => {
    tree = Renderer.create(<OwnerHandoffHost owner={<Owner />} />);
  });
  await act(async () => {
    tree.update(
      <OwnerHandoffHost owner={<Owner />} handoff={<Text>P07</Text>} />,
    );
  });
  const hidden = tree.root
    .findAllByProps({ testID: 'retained-owner' })
    .find(n => n.props.importantForAccessibility === 'no-hide-descendants');
  expect(hidden).toBeDefined();
  expect(mounted).toHaveBeenCalledTimes(1);
  expect(disposed).not.toHaveBeenCalled();
  await act(async () => {
    tree.update(<OwnerHandoffHost owner={<Owner />} />);
  });
  expect(JSON.stringify(tree.toJSON())).toContain(
    'P05.S03 scroll=413 original-UNKNOWN-key',
  );
  expect(mounted).toHaveBeenCalledTimes(1);
  await act(async () => tree.unmount());
  expect(disposed).toHaveBeenCalledTimes(1);
});
