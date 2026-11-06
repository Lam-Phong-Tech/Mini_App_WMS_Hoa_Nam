/** Unrouted technical candidate, not a LOCKED P14 panel.
 * User confirmed removing it from Home on 2026-10-13. Kept only for offline
 * adapter review; AppShell must not import or route to this candidate. */
import React, { useMemo, useSyncExternalStore, useState } from 'react';
import { Page } from '../../ui/Page';
import { Text } from '../../ui/Text';
import { Button } from '../../ui/Button';
import {
  getShiftState,
  subscribeShiftState,
  protocolEndSupported,
} from '../../shift/shiftState';
import {
  createP14ShiftService,
  P14_SHIFT_GATE,
} from '../../shift/p14ShiftService';
import { readShiftLocalOwners } from '../../shift/localOwners';
import { createWorkShiftIdempotencyKey } from '../../services/wms/workShift';
import { AppError } from '../../errors/AppError';

export function ShiftLifecycleScreen({
  onBack,
  onNewShift,
}: {
  onBack: () => void;
  onNewShift: () => void;
}): React.ReactElement {
  const state = useSyncExternalStore(
    subscribeShiftState,
    getShiftState,
    getShiftState,
  );
  const service = useMemo(
    () => createP14ShiftService({ readLocal: readShiftLocalOwners }),
    [],
  );
  const [message, setMessage] = useState(''),
    [canEnd, setCanEnd] = useState(false),
    [busy, setBusy] = useState(false);
  const local = readShiftLocalOwners();
  async function check() {
    setBusy(true);
    try {
      const c = await service.closeCheck();
      setCanEnd(c.can_end);
      setMessage(c.blockers.join('\n'));
    } catch (e) {
      setCanEnd(false);
      setMessage(e instanceof AppError ? e.message : 'Chưa xác minh được ca.');
    } finally {
      setBusy(false);
    }
  }
  async function end() {
    setBusy(true);
    try {
      await service.end(createWorkShiftIdempotencyKey());
      setCanEnd(false);
      setMessage('Ca đã kết thúc theo receipt WMS. Đăng nhập được giữ nguyên.');
    } catch (e) {
      setMessage(
        e instanceof AppError
          ? e.message
          : 'END chưa rõ kết quả; chỉ đối chiếu.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Page title="Trạng thái ca làm việc" onBack={onBack}>
      <Text>
        {state.phase === 'UNVERIFIED'
          ? 'Ca chưa xác minh'
          : state.phase === 'NO_SHIFT'
          ? 'Chưa có ca'
          : state.phase === 'ENDED'
          ? 'Ca đã kết thúc'
          : 'Ca đang hoạt động'}
      </Text>
      {service.blocker ? (
        <Text accessibilityRole="alert">{service.blocker}</Text>
      ) : null}
      <Text>
        {state.shift?.lifecycle?.mode ?? 'Lifecycle chưa được WMS cung cấp'}
      </Text>
      <Text>
        {state.shift?.tracking_contract ?? 'Legacy/chưa có bằng chứng tracking'}
      </Text>
      <Text>
        {P14_SHIFT_GATE.enabled
          ? 'P14 đã được cấp phép ở client'
          : 'P14 gate OFF — không gửi END hoặc recovery'}
      </Text>
      <Text>
        {local.coverageComplete
          ? `Local ${local.state}`
          : 'Owner local chưa đăng ký đủ coverage; không suy CLEAN'}
      </Text>
      {message ? <Text accessibilityRole="alert">{message}</Text> : null}
      <Button
        label="Kiểm tra điều kiện kết thúc ca"
        onPress={() => {
          check().catch(() => undefined);
        }}
        disabled={
          !P14_SHIFT_GATE.enabled ||
          !protocolEndSupported(state.shift) ||
          busy ||
          !!service.pending
        }
      />
      <Button
        label="Kết thúc ca"
        onPress={() => {
          end().catch(() => undefined);
        }}
        disabled={
          !P14_SHIFT_GATE.enabled ||
          !canEnd ||
          local.state !== 'CLEAN' ||
          !local.coverageComplete ||
          busy ||
          !!service.pending
        }
      />
      {service.pending ? (
        <Button
          label="Đối chiếu END cũ"
          onPress={() => {
            service
              .reconcile()
              .then(() => setMessage('END đã xác minh'))
              .catch(e => setMessage(e.message));
          }}
          disabled={!P14_SHIFT_GATE.enabled || busy}
        />
      ) : null}
      {state.phase === 'ENDED' || state.phase === 'NO_SHIFT' ? (
        <Button
          label="Xác nhận ca tiếp theo"
          onPress={onNewShift}
          disabled={!!service.pending || !!service.blocker || busy}
        />
      ) : null}
    </Page>
  );
}
