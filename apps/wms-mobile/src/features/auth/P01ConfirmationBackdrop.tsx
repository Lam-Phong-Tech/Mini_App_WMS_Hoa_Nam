import {HN_UI} from '../../theme/uiKitV3';
/** P01.S02 presentation only. One unchanged source photograph, fitted to width.
 * Do not scale the landscape photograph to the height of a portrait screen:
 * that crops the scanner/torso and magnifies the staff member behind the title.
 * Auth, identity and shift admission stay owned by SessionConfirmationScreen.
 */
import React from 'react';
import { Image, StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { scannerAssets } from '../../theme/scannerAssets';

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    left: 0,
    top: 0,
    overflow: 'hidden',
    backgroundColor: HN_UI.shell,
  },
  layer: { position: 'absolute', left: 0, top: 0 },
});

export function confirmationArtworkLayout(width: number, heroHeight: number) {
  const photoHeight = width * (2160 / 3840);
  return {
    left: 0,
    top: Math.max(0, heroHeight - photoHeight),
    width,
    height: photoHeight,
  };
}

export function P01ConfirmationBackdrop({
  width,
  height,
  heroHeight,
}: {
  width: number;
  height: number;
  heroHeight: number;
}) {
  const photo = confirmationArtworkLayout(width, heroHeight);
  return (
    <View
      testID="P01.confirmation.artwork"
      style={[styles.root, { width, height }]}
      pointerEvents="none"
      accessible={false}
      aria-hidden
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Image
        testID="P01.confirmation.staff"
        source={scannerAssets.staffWarehouse}
        resizeMode="contain"
        style={[styles.layer, photo]}
        accessible={false}
      />
      <Svg
        style={styles.layer}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
      >
        <Defs>
          <LinearGradient id="p01CopyShade" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={HN_UI.shell} stopOpacity={0.94} />
            <Stop offset="0.42" stopColor={HN_UI.shell} stopOpacity={0.72} />
            <Stop offset="0.78" stopColor={HN_UI.shell} stopOpacity={0.25} />
            <Stop offset="1" stopColor={HN_UI.shell} stopOpacity={0.48} />
          </LinearGradient>
          <LinearGradient id="p01BrandShade" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={HN_UI.shell} stopOpacity={1} />
            <Stop offset="0.17" stopColor={HN_UI.shell} stopOpacity={0.85} />
            <Stop offset="0.4" stopColor={HN_UI.shell} stopOpacity={0.15} />
            <Stop offset="1" stopColor={HN_UI.shell} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Rect width={width} height={height} fill="url(#p01CopyShade)" />
        {/* Cover the fractional-pixel image edge on Web as well as native. */}
        <Rect width={width} height={Math.ceil(photo.top) + 1} fill={HN_UI.shell} />
        <Rect
          x={photo.left}
          y={photo.top}
          width={photo.width}
          height={photo.height}
          fill="url(#p01BrandShade)"
        />
      </Svg>
    </View>
  );
}
