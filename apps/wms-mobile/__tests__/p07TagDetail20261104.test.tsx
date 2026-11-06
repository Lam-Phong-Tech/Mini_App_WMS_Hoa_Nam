import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { AppProviders } from '../src/app/App';
import { P07TagDetail } from '../src/features/nfc/P07TagDetail';
import { Dialog } from '../src/ui/Dialog';
test('tag dialog uses current projection, retains nullable updated time and provides separate Back, Copy and Close without write', () => {
  const close = jest.fn(),
    copy = jest.fn();
  let tree!: Renderer.ReactTestRenderer;
  act(() => {
    tree = Renderer.create(
      <AppProviders>
        <P07TagDetail
          tag={
            {
              code_value: 'TAG-TEST-001',
              hardware_uid: 'UID-TEST',
              status_label: 'Đã liên kết',
              tab_status: 'ASSIGNED',
              sku_name: 'Sản phẩm TEST',
              sku_code: 'SKU-TEST',
              serial_number: 'SER-TEST',
              assigned_at: '2026-09-09T07:32:00Z',
            } as any
          }
          onClose={close}
          onCopy={copy}
        />
      </AppProviders>,
    );
  });
  expect(tree.root.findByType(Dialog).props).toMatchObject({
    visible: true,
    showHeader: false,
    animationType: 'none',
  });
  expect(JSON.stringify(tree.toJSON())).toContain('TAG-TEST-001');
  expect(JSON.stringify(tree.toJSON())).not.toContain('09/09/2026');
  const row = tree.root.findAll(
    n => n.props.testID === 'P07.tag-detail-row-5',
  )[0];
  expect(row.findAll(n => n.props.children === '—').length).toBeGreaterThan(0);
  const press = (label: string) =>
    act(() =>
      tree.root
        .findAll(
          n => n.props.accessibilityLabel === label && n.props.onPress,
        )[0]
        .props.onPress(),
    );
  press('Sao chép UID');
  expect(copy).toHaveBeenCalledWith('UID-TEST');
  press('Quay lại danh sách thẻ');
  expect(close).toHaveBeenCalledTimes(1);
  act(() => tree.unmount());
});
