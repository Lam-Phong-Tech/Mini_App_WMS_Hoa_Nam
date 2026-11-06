import React from 'react';
import { View, StyleSheet } from 'react-native';

const styles = StyleSheet.create({
  fill: { flex: 1 },
  hidden: { display: 'none' },
});

/** Keep the exact caller/controller/scroll mounted during a child handoff. */
export function OwnerHandoffHost({
  owner,
  handoff,
}: {
  owner: React.ReactNode;
  handoff?: React.ReactNode;
}) {
  const hidden = !!handoff;
  return (
    <View style={styles.fill}>
      <View
        testID="retained-owner"
        style={[styles.fill, hidden && styles.hidden]}
        accessibilityElementsHidden={hidden}
        importantForAccessibility={hidden ? 'no-hide-descendants' : 'auto'}
        pointerEvents={hidden ? 'none' : 'auto'}
      >
        {owner}
      </View>
      {handoff}
    </View>
  );
}
