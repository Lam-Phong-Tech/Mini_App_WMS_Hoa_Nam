/**
 * Dialog chọn ngữ cảnh khi người dùng mở tab Quét mã.
 *
 * Các lối vào từ Home vẫn đi thẳng tới luồng tương ứng. Dialog này chỉ là
 * điểm chọn bổ sung của tab trung tâm theo board 03; mọi lựa chọn đều gọi
 * callback route thật, không tự tạo phiếu hay thay đổi tồn kho.
 */

import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Dialog } from '../../ui/Dialog';
import { Button } from '../../ui/Button';
import { LookupScreen } from '../lookup/LookupScreen';

const styles = StyleSheet.create({
  actions: { gap: 8 },
});

export type ScanTaskChoice = 'inbound' | 'outbound' | 'warranty' | 'lookup' | 'nfc';

export interface ScanTaskPickerScreenProps {
  onSelect: (choice: ScanTaskChoice) => void;
  onHome: () => void;
  onLookupNfc: () => void;
}

export function ScanTaskPickerScreen({
  onSelect,
  onHome,
  onLookupNfc,
}: ScanTaskPickerScreenProps): React.ReactElement {
  const [open, setOpen] = useState(true);

  const choose = (choice: ScanTaskChoice): void => {
    setOpen(false);
    onSelect(choice);
  };

  return (
    <>
      <LookupScreen
        onHome={onHome}
        onScan={() => choose('lookup')}
        onScanAgain={() => choose('lookup')}
        onLookupNfc={onLookupNfc}
      />
      <Dialog
        visible={open}
        title="Chọn tác vụ quét"
        message="Mã sẽ được kiểm tra theo nghiệp vụ bạn chọn."
        onDismiss={() => setOpen(false)}
      >
        <View style={styles.actions}>
          <Button label="Nhập kho" onPress={() => choose('inbound')} />
          <Button label="Xuất kho" variant="secondary" onPress={() => choose('outbound')} />
          <Button label="Bảo hành" variant="secondary" onPress={() => choose('warranty')} />
          <Button label="Tra cứu sản phẩm" variant="secondary" onPress={() => choose('lookup')} />
          <Button label="Tra cứu bằng NFC" variant="secondary" onPress={() => { setOpen(false); onLookupNfc(); }} />
        </View>
      </Dialog>
    </>
  );
}
