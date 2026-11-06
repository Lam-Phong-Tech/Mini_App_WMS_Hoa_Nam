import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { Image, StyleSheet } from 'react-native';
import {
  P01ConfirmationBackdrop,
  confirmationArtworkLayout,
} from '../src/features/auth/P01ConfirmationBackdrop';
import { scannerAssets } from '../src/theme/scannerAssets';

test.each([320, 360, 390, 411, 494])(
  'TC_UAT_04 staff preserves the source photo aspect at %i px',
  width => {
    const p = confirmationArtworkLayout(width, (276 * width) / 438);
    expect(p.width / p.height).toBeCloseTo(3840 / 2160);
    expect(p.left).toBe(0);
    expect(p.width).toBe(width);
    expect(p.top + p.height).toBeCloseTo((276 * width) / 438);
  },
);
test('TC_UAT_04 fits exactly one original photograph, not a composite or fixture screenshot', async () => {
  let tree!: Renderer.ReactTestRenderer;
  await act(async () => {
    tree = Renderer.create(
      <P01ConfirmationBackdrop width={390} height={361} heroHeight={246} />,
    );
  });
  expect(tree.root.findAllByType(Image)).toHaveLength(1);
  const staff = tree.root.findByType(Image);
  expect(staff.props.source).toBe(scannerAssets.staffWarehouse);
  expect(staff.props.resizeMode).toBe('contain');
  expect(StyleSheet.flatten(staff.props.style)).toMatchObject({
    width: 390,
    height: 219.375,
    left: 0,
    top: 26.625,
  });
  expect(
    tree.root
      .findAllByType(Image)
      .some(n => n.props.source === scannerAssets.warehouseMain),
  ).toBe(false);
  await act(async () => tree.unmount());
});

test('a taller greeting or safe area moves the source down without enlarging it', () => {
  const compact = confirmationArtworkLayout(390, 246);
  const tall = confirmationArtworkLayout(390, 360);
  expect(tall.width).toBe(compact.width);
  expect(tall.height).toBe(compact.height);
  expect(tall.top - compact.top).toBe(114);
});
