import React from 'react';
import { View, StyleSheet } from 'react-native';
import { P04Action } from './P04Frame';
import { P04Icon } from './P04Icon';
import { HN_UI } from '../../theme/uiKitV3';
const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8 },
  half: { flex: 1, minWidth: 0, paddingHorizontal: 8 },
});
/** Shared current scanner controls. The owner supplies the guarded resume action. */
export function P04ScanFooter({
  operation,
  busy,
  canReview,
  onReview,
  onContinue,
}: {
  operation: 'inbound' | 'outbound';
  busy: boolean;
  canReview: boolean;
  onReview(): void;
  onContinue(): void;
}) {
  const outbound = operation === 'outbound';
  return (
    <View style={styles.row}>
      <P04Action
        label="Kiểm tra phiếu"
        compact
        secondary={outbound}
        disabled={!canReview || busy}
        onPress={onReview}
        style={styles.half}
        trailing={
          outbound ? undefined : (
            <P04Icon name="arrow" size={20} color={HN_UI.onBrand} />
          )
        }
      />
      <P04Action
        label={outbound ? 'Tiếp tục soạn' : 'Tiếp tục quét'}
        compact
        secondary={!outbound}
        disabled={busy}
        onPress={onContinue}
        style={styles.half}
        trailing={
          outbound ? (
            <P04Icon name="arrow" size={20} color={HN_UI.onBrand} />
          ) : undefined
        }
      />
    </View>
  );
}
