import {HN_UI} from '../../../theme/uiKitV3';
import React, { useEffect, useState } from 'react';
import {
  Image,
  View,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { P04Icon } from '../../inbound/P04Icon';

export function ProductPhoto({
  uri,
  style,
  size,
}: {
  uri?: string;
  style: StyleProp<ViewStyle>;
  size: number;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [uri]);
  return (
    <View
      style={style}
      accessibilityLabel={
        uri && !failed
          ? 'Ảnh danh mục SKU hiện tại, không phải ảnh lịch sử'
          : 'Chưa có ảnh SKU đã xác minh'
      }
    >
      {uri && !failed ? (
        <Image
          source={{ uri }}
          resizeMode="contain"
          style={styles.image}
          accessibilityLabel="Ảnh danh mục SKU hiện tại"
          onError={() => setFailed(true)}
        />
      ) : (
        <P04Icon name="box" size={size} color={HN_UI.textSecondary} />
      )}
    </View>
  );
}
const styles = StyleSheet.create({ image: { width: '100%', height: '100%' } });
