import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { StyleSheet, Text, Pressable } from 'react-native';
import { AppProviders } from '../src/app/App';
import { p12Layout } from '../src/features/documents/p12/styles';
import { P12DocumentRow } from '../src/features/documents/p12/P12DocumentRow';
import { HN_OPERATIONS } from '../src/ui/hnHomeTokens';
const doc: any = {
  id: 'test-id',
  type: 'outbound',
  number: 'PX-20261103164409-OAY0QV',
  warehouseId: 'TEST',
  createdAt: '2026-11-03T09:44:00Z',
  source: { partner: { display_name: 'Đối tác TEST' } },
  p12: { status: { canonical: 'SCANNING', waiting_for_web: null } },
  displayStatus: {
    availability: 'MAPPED',
    value: 'WAITING_APPROVAL',
    label: 'Chờ duyệt xuất kho',
  },
};
test.each([320, 390, 494])(
  'list rows use the compact model padding and reserve the date/status column at width%s',
  width => {
    const scale = width / 494,
      s = p12Layout(scale);
    expect(StyleSheet.flatten(s.record)).toMatchObject({
      paddingVertical: 8 * scale,
      paddingHorizontal: 12 * scale,
    });
    expect(StyleSheet.flatten(s.recordMeta)).toMatchObject({
      width: 150 * scale,
      flexShrink: 0,
    });
  },
);
test('full long number stays available while the row stays one line; open and number reader are separate', () => {
  const open = jest.fn(),
    read = jest.fn();
  let tree!: Renderer.ReactTestRenderer;
  act(() => {
    tree = Renderer.create(
      <AppProviders>
        <P12DocumentRow
          doc={doc}
          scale={1}
          number={doc.number}
          date="03/11/2026 16:44"
          showPartner
          onOpen={open}
          onReadNumber={read}
        />
      </AppProviders>,
    );
  });
  const row = tree.root.findAll(
    n =>
      n.props.testID === 'P12.document-row' &&
      typeof n.props.onPress === 'function',
  )[0];
  expect(row.props.accessibilityLabel).toBe('Mở chứng từ ' + doc.number);
  const title = tree.root.findAll(
    n => n.props.children === doc.number && n.props.numberOfLines !== undefined,
  )[0];
  expect(title.props.numberOfLines).toBe(1);
  expect(JSON.stringify(tree.toJSON())).toContain('Chờ xử lý trên Web');
  expect(JSON.stringify(tree.toJSON())).not.toContain('Chờ duyệt xuất kho');
  act(() => row.props.onLongPress());
  expect(read).toHaveBeenCalledTimes(1);
  expect(open).not.toHaveBeenCalled();
  act(() => row.props.onPress());
  expect(open).toHaveBeenCalledTimes(1);
  expect(
    StyleSheet.flatten(
      tree.root.findAll(n => n.props.testID === 'P12.row.icon')[0].props.style,
    ).backgroundColor,
  ).toBe(HN_OPERATIONS.outbound.soft);
  act(() => tree.unmount());
});
