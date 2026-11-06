import React from 'react';
import { P07NativeFlow } from './P07NativeFlow';
export interface NfcTagListScreenProps {
  onBack: () => void;
}
// Management reuses the same read/assignment owner. No deactivate action in P07.
export function NfcTagListScreen({
  onBack,
}: NfcTagListScreenProps): React.ReactElement {
  return <P07NativeFlow onBack={onBack} />;
}
