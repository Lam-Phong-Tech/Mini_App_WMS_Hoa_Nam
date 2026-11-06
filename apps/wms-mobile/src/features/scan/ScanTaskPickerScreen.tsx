/** P03.S01: four locked routes; READY and an ACTIVE profile gate writes. */
import React, { useEffect, useRef, useState } from 'react';
import {
  getP03Context,
  type P03Context,
  type P03Operation,
} from '../../services/wms/p03Drafts';
import { fetchHomeWarehouse } from '../../services/wms/home';
import { messageForUser, toAppError } from '../../errors/AppError';
import { P03Surface, type P03Choice } from './P03Dialog';
export type ScanTaskChoice = P03Choice;
export interface ScanTaskPickerScreenProps {
  onSelect: (choice: ScanTaskChoice) => void;
  onHome: () => void;
  onLookupNfc: () => void;
  onSelectTab?: (key: string) => void;
  onConfirmSession?: () => void;
}
export function ScanTaskPickerScreen({
  onSelect,
  onHome,
  onConfirmSession,
}: ScanTaskPickerScreenProps): React.ReactElement {
  const [context, setContext] = useState<P03Context>(),
    [profile, setProfile] = useState<string>(),
    [error, setError] = useState<string>();
  const routed = useRef(false);
  const [revision, setRevision] = useState(0),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    setContext(undefined);
    setProfile(undefined);
    setError(undefined);
    setLoading(true);
    routed.current = false;
    getP03Context()
      .then(async value => {
        if (!active) return;
        setContext(value);
        if (
          value.warehouse_context.status === 'READY' &&
          value.active_warehouse_id &&
          value.warehouse_profile.allowed
        ) {
          const warehouse = await fetchHomeWarehouse(value.active_warehouse_id);
          if (active) setProfile(warehouse.status);
        }
      })
      .catch(e => {
        if (active) setError(messageForUser(toAppError(e)));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [revision]);
  const operationFor = (choice: P03Choice): P03Operation | undefined =>
    choice === 'inbound'
      ? 'INBOUND'
      : choice === 'outbound'
      ? 'OUTBOUND'
      : choice === 'warranty'
      ? 'WARRANTY'
      : undefined;
  const canChoose = (choice: P03Choice) => {
    const op = operationFor(choice);
    return (
      !op ||
      (context?.warehouse_context.status === 'READY' &&
        profile === 'ACTIVE' &&
        context.permissions[op]?.save === true)
    );
  };
  const stopped =
    profile === 'INACTIVE' ||
    context?.warehouse_context.error_code === 'WAREHOUSE_INACTIVE';
  return (
    <P03Surface
      panel={stopped ? 'S03' : 'S01'}
      onBack={onHome}
      message={
        error ??
        (context?.warehouse_context.status === 'REQUIRED'
          ? 'Cần xác nhận lại phiên và kho trước khi thao tác.'
          : undefined)
      }
      actions={
        stopped
          ? [{ label: 'Về Trang chủ', kind: 'primary', onPress: onHome }]
          : !loading && (error || context?.warehouse_context.status !== 'READY')
          ? [
              {
                label: 'Đọc lại phiên và kho',
                onPress: () => setRevision(value => value + 1),
              },
              ...(onConfirmSession
                ? [{ label: 'Xác nhận phiên', onPress: onConfirmSession }]
                : []),
            ]
          : undefined
      }
      onChoose={choice => {
        if (routed.current || !canChoose(choice)) return;
        routed.current = true;
        onSelect(choice);
      }}
      disabledChoices={(['inbound', 'outbound', 'warranty'] as const).filter(
        choice => !canChoose(choice),
      )}
    />
  );
}
