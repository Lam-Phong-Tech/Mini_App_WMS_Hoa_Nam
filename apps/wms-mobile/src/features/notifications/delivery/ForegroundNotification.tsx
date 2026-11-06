import React, { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Text } from '../../../ui/Text';
import { HN_UI } from '../../../theme/uiKitV3';
import { subscribeSession } from '../../../auth/session';
const listeners = new Set<(open: () => void) => void>();
export function publishForegroundNotification(open: () => void) {
  listeners.forEach(f => f(open));
}
export function ForegroundNotification() {
  const [open, setOpen] = useState<(() => void) | null>(null);
  useEffect(() => {
    const receive = (f: () => void) => setOpen(() => f);
    listeners.add(receive);
    const stop = subscribeSession(() => setOpen(null));
    return () => {
      listeners.delete(receive);
      stop();
    };
  }, []);
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => setOpen(null), 10000);
    return () => clearTimeout(timer);
  }, [open]);
  if (!open) return null;
  return (
    <View
      accessibilityLiveRegion="polite"
      style={{
        position: 'absolute',
        top: 48,
        left: 16,
        right: 16,
        zIndex: 1000,
        backgroundColor: HN_UI.surface,
        borderColor: HN_UI.border,
        borderWidth: 1,
        borderRadius: 12,
        padding: 16,
        gap: 8,
      }}
    >
      <Text>Bạn có thông báo nghiệp vụ mới.</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Xem thông báo mới"
        onPress={() => {
          setOpen(null);
          open();
        }}
        style={{ minHeight: 44, justifyContent: 'center' }}
      >
        <Text style={{ color: HN_UI.primary }}>Xem thông báo</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Đóng thông báo mới"
        onPress={() => setOpen(null)}
        style={{ minHeight: 44, justifyContent: 'center' }}
      >
        <Text>Đóng</Text>
      </Pressable>
    </View>
  );
}
