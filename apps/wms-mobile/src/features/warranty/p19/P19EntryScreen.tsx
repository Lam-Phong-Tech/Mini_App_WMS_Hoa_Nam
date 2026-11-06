import {HN_UI} from '../../../theme/uiKitV3';
import {ScannerNativeText as Text} from '../../../ui/ScannerNativeText';
import React, { useMemo } from 'react';
import {View} from 'react-native';
import type { P09Service } from '../../../services/wms/p09Warranty';
import type { WarrantyCase } from '../../../services/wms/types';
import { P09Action } from '../P09Presentation';
import { createP19EntryController, canEnterP19 } from './p19Entry';
import { P19NativeFlow } from './P19NativeFlow';
import { BUILD_PROFILE } from '../../../config/buildProfile';
import { retainedP19Owner, retainP19Owner } from './p19OwnerRegistry';
import type { P19VerifiedResult } from './p19Types';
export function P19EntryScreen({
  service,
  warrantyCase,
  onBack,
  onVerifiedResult,
}: {
  service: P09Service;
  warrantyCase: WarrantyCase;
  onBack(): void;
  onVerifiedResult?(target: P19VerifiedResult): void;
}) {
  const context = service.contextKey();
  const controller = useMemo(() => {
    try {
      let entry = retainedP19Owner(service, warrantyCase.warranty_case_id);
      if (!entry) {
        entry = createP19EntryController(service, warrantyCase);
        retainP19Owner(service, warrantyCase.warranty_case_id, entry);
      }
      return entry;
    } catch {
      return undefined;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [service, context, warrantyCase.warranty_case_id]);
  if (!controller)
    return (
      <View
        style={{ flex: 1, padding: 24, gap: 20, backgroundColor: HN_UI.canvas }}
      >
        <Text accessibilityRole="alert">
          Chưa được phép xuất linh kiện cho hồ sơ này. Kiểm tra lại phiên, kho,
          quyền và trạng thái hồ sơ.
        </Text>
        <P09Action label="Quay lại hồ sơ bảo hành" onPress={onBack} />
      </View>
    );
  return (
    <P19NativeFlow
      key={context + '/' + warrantyCase.warranty_case_id}
      controller={controller}
      onBack={onBack}
      onVerifiedResult={
        onVerifiedResult
          ? target => {
              if (
                service.contextKey() !== context ||
                target.caseId !== warrantyCase.warranty_case_id
              )
                return;
              onVerifiedResult(target);
            }
          : undefined
      }
      canCaptureReadOnly={() =>
        BUILD_PROFILE === 'dev-test' &&
        service.contextKey() === context &&
        canEnterP19(service, warrantyCase)
      }
    />
  );
}
