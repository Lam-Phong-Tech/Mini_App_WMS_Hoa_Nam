import { HN_UI } from '../src/theme/uiKitV3';
import { HN_OPERATIONS } from '../src/ui/hnHomeTokens';
// UI contract + scope/interaction regression. No real scan/SAVE/RECORD.
import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { StyleSheet, View } from 'react-native';
import { AppProviders } from '../src/app/App';
import { InboundReviewScreen } from '../src/features/inbound/InboundReviewScreen';
import { InboundResultScreen } from '../src/features/inbound/InboundResultScreen';
import { P04ScanPresentation } from '../src/features/inbound/P04ScanPresentation';
import { P04Frame, P04Row, P04Action } from '../src/features/inbound/P04Frame';
import { P04Icon } from '../src/features/inbound/P04Icon';
import { initialInboundDraft } from '../src/features/inbound/inboundDraft';
import { Button } from '../src/ui/Button';
const noop = () => {};
let tree: Renderer.ReactTestRenderer | undefined;
afterEach(async () => {
  if (tree) await act(() => tree!.unmount());
  tree = undefined;
});
async function mount(element: React.ReactElement) {
  await act(async () => {
    tree = Renderer.create(<AppProviders>{element}</AppProviders>);
  });
  return tree!;
}
const draft = {
  ...initialInboundDraft,
  warehouseName: 'Kho TEST',
  supplierName: 'NCC TEST',
  createdAt: '2026-11-03T01:00:00Z',
  codes: [
    {
      key: 'TEST-01',
      raw: 'ITEM-TEST',
      sku: 'SKU-TEST',
      quantity: 1,
      at: 1,
      source: 'MANUAL' as const,
    },
  ],
};
test('review and result use the same compact metadata icon paint and retain source values', async () => {
  await mount(
    <InboundReviewScreen
      draft={draft}
      documentRef="PN-TEST"
      actorName="Actor TEST"
      onRecord={noop}
    />,
  );
  const reviewIcons = tree!.root
    .findAllByType(P04Row)
    .map(r => r.findAllByType(P04Icon)[0].props);
  expect([...new Set(reviewIcons.map(r => r.color))]).toEqual([HN_UI.primary]);
  expect(reviewIcons.every(r => r.size === 20)).toBe(true);
  await act(() => tree!.unmount());
  tree = undefined;
  await mount(
    <InboundResultScreen
      documentName="TEST"
      documentRef="PN-TEST"
      quantity={8}
      outcome="posted"
      supplierName="NCC TEST"
      onHome={noop}
      onNext={noop}
    />,
  );
  const rows = tree!.root
    .findAllByType(View)
    .filter(
      r =>
        typeof r.props.testID === 'string' &&
        r.props.testID.startsWith('p04-result-row-'),
    );
  expect(rows).toHaveLength(4);
  expect(rows.flatMap(r => r.findAllByType(P04Icon))).toHaveLength(0);
  expect(JSON.stringify(tree!.toJSON())).toContain('PN-TEST');
});
test('all three inbound footer CTAs share one solid primary paint and bounded height', async () => {
  const paints = [];
  const scenes = [
    <P04ScanPresentation
      attempts={[]}
      quantity={0}
      codeCount={0}
      manual={false}
      filter="all"
      all={false}
      busy={false}
      tools={null}
      footer={<P04Action label="Kiểm tra phiếu" onPress={noop} />}
      onBack={noop}
      onFilter={noop}
      onAll={noop}
      onContext={noop}
    />,
    <InboundReviewScreen draft={draft} documentRef="PN-TEST" onRecord={noop} />,
    <InboundResultScreen
      documentName="TEST"
      documentRef="PN-TEST"
      quantity={1}
      outcome="posted"
      onHome={noop}
      onNext={noop}
    />,
  ];
  for (const [i, scene] of scenes.entries()) {
    await mount(scene);
    const label = ['Kiểm tra phiếu', 'Gửi phiếu lên Web', 'Xem phiếu PN-TEST'][i];
    const b = tree!.root
      .findAllByType(Button)
      .find(n => n.props.label === label)!;
    const s = StyleSheet.flatten(b.props.style) as any;
    paints.push(s.backgroundColor);
    expect(s.minHeight).toBe(52);
    expect(s.backgroundImage).toBe('none');
    await act(() => tree!.unmount());
    tree = undefined;
  }
  expect(paints).toEqual([HN_UI.primary, HN_UI.primary, HN_UI.primary]);
});
test('inbound scan intro uses the compact source SVG scale rather than an oversized gradient tile', async () => {
  await mount(
    <P04ScanPresentation
      attempts={[]}
      quantity={0}
      codeCount={0}
      manual={false}
      filter="all"
      all={false}
      busy={false}
      tools={null}
      footer={<P04Action label="Kiểm tra phiếu" onPress={noop} />}
      onBack={noop}
      onFilter={noop}
      onAll={noop}
      onContext={noop}
    />,
  );
  const icon = tree!.root
    .findAllByType(P04Icon)
    .find(i => i.props.name === 'scan')!;
  expect(icon.props.size).toBe(26);
  expect(icon.props.color).toBe(HN_UI.onBrand);
});
test('explicit operation tone keeps public inbound identity and bounded geometry', async () => {
  await mount(
    <P04Frame
      title="Xuất kho"
      footer={<P04Action label="P05 action" onPress={noop} />}
    >
      <P04Row label="P05 metadata" value="TEST" tone="inbound" />
    </P04Frame>,
  );
  const row = tree!.root.findByType(P04Row),
    icon = row.findAllByType(P04Icon)[0];
  expect(icon.props.color).toBe(HN_OPERATIONS.inbound.ink);
  expect(icon.props.size).toBe(24);
  expect(
    StyleSheet.flatten(tree!.root.findByType(Button).props.style)?.minHeight,
  ).toBe(57);
});
