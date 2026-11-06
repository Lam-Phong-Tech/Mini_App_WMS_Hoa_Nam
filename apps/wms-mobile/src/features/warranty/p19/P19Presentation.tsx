import {HN_UI} from '../../../theme/uiKitV3';
import {ScannerNativeText as Text} from '../../../ui/ScannerNativeText';
import React from 'react';
import {StyleSheet, View} from 'react-native';
import { SvgXml } from 'react-native-svg';
import { P04Icon } from '../../inbound/P04Icon';
import { HN_OPERATIONS } from '../../../ui/hnHomeTokens';

// Approved B19/r03 paths from warranty-components/issue-icons.mjs.
// P04Icon intentionally has no `check` or `barcode`; its fallback is a document.
const paths = {
  check: '<path d="m5 12 4 4L19 6"/>',
  scan: '<path d="M8 3H4a1 1 0 0 0-1 1v4m13-5h4a1 1 0 0 1 1 1v4M3 16v4a1 1 0 0 0 1 1h4m8 0h4a1 1 0 0 0 1-1v-4M3 12h18M8 7v3m3-3v3m3-3v3m3-3v3m-9 5v2m3-2v2m3-2v2m3-2v2"/>',
};
export function P19Icon({
  name,
  size = 24,
  color = HN_UI.textPrimary,
}: {
  name: keyof typeof paths;
  size?: number;
  color?: string;
}) {
  return (
    <SvgXml
      width={size}
      height={size}
      xml={`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths[name]}</svg>`}
    />
  );
}

export function P19Tile({
  name,
  scale,
  large = false,
}: {
  name: 'tool' | 'box' | 'scan';
  scale: number;
  large?: boolean;
}) {
  const size = (large ? 56 : 44) * scale;
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: 12 * scale,
        backgroundColor: HN_OPERATIONS.warranty.soft,
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      {name === 'scan' ? (
        <P19Icon
          name="scan"
          size={30 * scale}
          color={HN_OPERATIONS.warranty.ink}
        />
      ) : (
        <P04Icon
          name={name}
          size={24 * scale}
          color={HN_OPERATIONS.warranty.ink}
        />
      )}
    </View>
  );
}

/** P19-only aligned result rows; values come from the verified owner receipt. */
export function P19ResultSummary({
  rows,
  scale,
}: {
  rows: { label: string; value: string }[];
  scale: number;
}) {
  return (
    <View testID="P19.result-summary">
      {rows.map((row, index) => (
        <View
          key={row.label}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12 * scale,
            minHeight: 48 * scale,
            paddingVertical: 10 * scale,
            borderBottomWidth:
              index === rows.length - 1 ? 0 : StyleSheet.hairlineWidth,
            borderColor: HN_UI.border,
          }}
        >
          <Text
            style={{
              color: HN_UI.textMuted,
              fontSize: 15 * scale,
              lineHeight: 23 * scale,
              flex: 1,
            }}
          >
            {row.label}
          </Text>
          <Text
            selectable
            testID={'P19.result-value.' + index}
            style={{
              color: HN_UI.textPrimary,
              fontSize: 15 * scale,
              lineHeight: 23 * scale,
              fontWeight: '600',
              textAlign: 'right',
              flex: 1,
              minWidth: 0,
            }}
          >
            {row.value}
          </Text>
        </View>
      ))}
    </View>
  );
}
