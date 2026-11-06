import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Dialog } from '../../../ui/Dialog';
import { Button } from '../../../ui/Button';
import { Text } from '../../../ui/Text';
import { HN_UI } from '../../../theme/uiKitV3';
import type { NotificationDeliveryModel } from './useNotificationDelivery';
export function NotificationDeliverySettings({
  model,
}: {
  model: NotificationDeliveryModel;
}) {
  const [visible, setVisible] = useState(false),
    s = model.state,
    busy =
      s.phase === 'checking' ||
      s.phase === 'busy' ||
      model.diagnosticBusy === true;
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Thông báo thiết bị"
        onPress={() => setVisible(true)}
        style={{
          minWidth: 48,
          minHeight: 48,
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <Text style={{ color: HN_UI.onBrand, fontSize: 14 }}>Thiết bị</Text>
      </Pressable>
      <Dialog
        visible={visible}
        title="Thông báo thiết bị"
        onDismiss={() => setVisible(false)}
      >
        <View style={{ gap: 12 }}>
          <Text accessibilityLiveRegion="polite">{s.message}</Text>
          {s.receipt && <Text>Mã đối chiếu: {s.receipt.requestKey}</Text>}
          {s.canDisable ? (
            <>
              <Button
                label="Tắt trên thiết bị này"
                variant="secondary"
                onPress={model.disable}
              />
              {(s.selfTestEnabled || s.canReconcile) && (
                <Button
                  label={
                    s.receipt || s.canReconcile
                      ? 'Đối chiếu lần gửi thử'
                      : 'Gửi thử đến thiết bị này'
                  }
                  onPress={model.selfTest}
                />
              )}
            </>
          ) : (
            <Button
              label="Bật thông báo"
              onPress={model.enable}
              disabled={busy || s.phase === 'unavailable'}
            />
          )}
          <Button
            label="Kiểm tra lại"
            variant="secondary"
            onPress={model.refresh}
            disabled={busy}
          />
          {model.diagnose && (
            <Button
              label="Chẩn đoán FCM (chỉ đọc)"
              variant="secondary"
              onPress={model.diagnose}
              disabled={busy}
            />
          )}
          {model.diagnosticMessage && (
            <Text accessibilityLiveRegion="polite">
              {model.diagnosticMessage}
            </Text>
          )}
          <Button
            label="Đóng"
            variant="secondary"
            onPress={() => setVisible(false)}
          />
        </View>
      </Dialog>
    </>
  );
}
