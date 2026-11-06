import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { View, StyleSheet } from 'react-native';
import { AppProviders } from '../src/app/App';
import { P03Surface } from '../src/features/scan/P03Dialog';
import { P04Frame } from '../src/features/inbound/P04Frame';
import { P07VerificationContent } from '../src/features/nfc/P07VerificationContent';
import { ScannerIcon } from '../src/ui/ScannerIcon';
import { HN_OPERATIONS } from '../src/ui/hnHomeTokens';
import { HN_UI } from '../src/theme/uiKitV3';
async function render(node: React.ReactNode) {
  let tree!: Renderer.ReactTestRenderer;
  await act(async () => {
    tree = Renderer.create(<AppProviders>{node}</AppProviders>);
  });
  return tree;
}
test('P03 task picker uses the same dimmed-stage semantic role as blocking dialogs; discard confirmation retains the approved light stage', async () => {
  for (const panel of ['S01', 'S04'] as const) {
    const tree = await render(<P03Surface panel={panel} onBack={() => {}} />);
    const bg = StyleSheet.flatten(
      tree.root.findByProps({ testID: 'p03-backdrop' }).props.style,
    ).backgroundColor;
    expect(bg).toBe(panel === 'S04' ? HN_UI.canvas : HN_UI.scrim);
    await act(async () => tree.unmount());
  }
});
test('P07 verification uses the NFC operation color, consistently with the list and hub', async () => {
  const tree = await render(
    <P07VerificationContent
      uid="TEST-UI-UID"
      verified
      tagDetails={<View />}
      product={<View />}
      warehouse={<View />}
      statusLabel="Chờ xác nhận"
      message="TEST UI, không ghi NFC"
    />,
  );
  const glyph = tree.root
    .findAllByType(ScannerIcon)
    .find(n => n.props.name === 'nfc')!;
  expect(glyph.props.color).toBe(HN_OPERATIONS.nfc.ink);
  await act(async () => tree.unmount());
});
test.each(['Nhập kho', 'Xuất kho'])(
  '%s information stage exposes the three-step progress shown in the approved first-step screen',
  async title => {
    const tree = await render(
      <P04Frame title={title} step={1} footer={<View />}>
        <View />
      </P04Frame>,
    );
    expect(
      tree.root.findAllByProps({
        accessibilityLabel: `Tiến độ ${title.toLowerCase()}, bước 1 trên 3`,
      }).length,
    ).toBeGreaterThan(0);
    await act(async () => tree.unmount());
  },
);
// Current TC04/v5 requires progress through the review stage and supersedes
// the earlier public-sample assertion that hid inbound step 3.
test('TC04 v5 review retains the common three-step progress before RECORD', async () => {
  const tree = await render(
    <P04Frame step={3} footer={<View />}>
      <View />
    </P04Frame>,
  );
  expect(
    tree.root.findAllByProps({
      accessibilityLabel: 'Tiến độ nhập kho, bước 3 trên 3',
    }).length,
  ).toBeGreaterThan(0);
  await act(async () => tree.unmount());
});
