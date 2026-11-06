import React, {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import {
  captureSessionScope,
  isSessionScopeCurrent,
  subscribeSession,
} from '../../auth/session';
import { getNfcAvailability, type NfcAvailability } from '../../native/nfc';
import type { CameraPermissionView } from '../../scanner/useCameraPermission';
import { P15DeviceScreen, type P15DeviceState } from './P15Screen';
import { Button } from '../../ui/Button';
import { View } from 'react-native';

type Scope = ReturnType<typeof captureSessionScope>;
type Entry = { scope: Scope; epoch: number };
const complete = (s: Scope) => !!(s.userId && s.authSessionId && s.warehouseId);
const scopeSnapshot = () => JSON.stringify(captureSessionScope());
export interface P15ScannerGuideOptions {
  permission: CameraPermissionView;
  active: boolean;
  busy: () => boolean;
  /** Caller-supplied route callback must perform its own permission guard. */
  onOpenNfc?: (isCurrent: () => boolean) => void | Promise<void>;
}

/** Owner-local UI lifecycle. Only getStatus is read, on an explicit action. */
export function useP15ScannerDeviceGuide(options: P15ScannerGuideOptions) {
  const latest = useRef(options);
  latest.current = options;
  const mountScope = useRef(captureSessionScope());
  // Warehouse may change without incrementing auth generation. Observe all
  // captured identity fields, not generation alone.
  const scopeVersion = useSyncExternalStore(
    subscribeSession,
    scopeSnapshot,
    scopeSnapshot,
  );
  const mounted = useRef(true),
    entryRef = useRef<Entry | undefined>(undefined);
  const epoch = useRef(0),
    paused = useRef(false),
    task = useRef<symbol | undefined>(undefined);
  const [entry, setEntry] = useState<Entry>();
  const [suspended, setSuspended] = useState(false);
  const [nfc, setNfc] =
    useState<Exclude<P15DeviceState, 'granted'>>('unavailable');
  const [working, setWorking] = useState(false);
  const scopeCurrent = () =>
    complete(mountScope.current) && isSessionScopeCurrent(mountScope.current);
  const scannerCurrent = () =>
    mounted.current &&
    latest.current.active &&
    (!complete(mountScope.current) ||
      isSessionScopeCurrent(mountScope.current));
  const current = (e: Entry) =>
    mounted.current &&
    latest.current.active &&
    entryRef.current === e &&
    e.epoch === epoch.current &&
    scopeCurrent() &&
    isSessionScopeCurrent(e.scope);
  const sameEntry = (e: Entry) =>
    mounted.current &&
    entryRef.current === e &&
    e.epoch === epoch.current &&
    scopeCurrent() &&
    isSessionScopeCurrent(e.scope);

  useEffect(() => {
    const operationEpoch = epoch;
    mounted.current = true;
    return () => {
      mounted.current = false;
      operationEpoch.current++;
      entryRef.current = undefined;
      task.current = undefined;
    };
  }, []);
  useEffect(() => {
    if (entryRef.current && !scopeCurrent()) {
      epoch.current++;
      paused.current = true;
      entryRef.current = undefined;
      task.current = undefined;
      setEntry(undefined);
      setWorking(false);
      setSuspended(true);
    }
    // A revoked family is never reattached to a new actor/session/warehouse.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeVersion]);

  const checkNfc = async (e = entryRef.current) => {
    if (!e || !current(e) || latest.current.busy() || task.current) return;
    const token = Symbol('nfc-status');
    task.current = token;
    setWorking(true);
    setNfc('checking');
    try {
      const state: NfcAvailability = await getNfcAvailability();
      if (current(e) && !latest.current.busy())
        setNfc(
          ['available', 'disabled', 'unsupported', 'unavailable'].includes(
            state,
          )
            ? state
            : 'unavailable',
        );
      else if (sameEntry(e)) setNfc('unavailable');
    } catch {
      if (sameEntry(e)) setNfc('unavailable');
    } finally {
      if (task.current === token) {
        task.current = undefined;
        if (sameEntry(e)) setWorking(false);
      }
    }
  };
  const open = () => {
    if (
      !mounted.current ||
      !latest.current.active ||
      !scopeCurrent() ||
      latest.current.busy() ||
      entryRef.current
    )
      return;
    const e = { scope: captureSessionScope(), epoch: ++epoch.current };
    paused.current = true;
    entryRef.current = e;
    setSuspended(true);
    setEntry(e);
    void checkNfc(e);
  };
  const close = (e = entryRef.current) => {
    if (!mounted.current || !e || entryRef.current !== e) return;
    epoch.current++;
    entryRef.current = undefined;
    task.current = undefined;
    setEntry(undefined);
    setWorking(false);
    // No raw/manual/filter/accepted state is changed. Explicit enable resumes.
  };
  const resume = () => {
    if (!scannerCurrent() || latest.current.busy() || entryRef.current)
      return false;
    paused.current = false;
    setSuspended(false);
    return true;
  };
  const canDecode = (capturedEpoch: number) =>
    scannerCurrent() &&
    capturedEpoch === epoch.current &&
    !paused.current &&
    !entryRef.current;
  const canUseCamera = (capturedEpoch: number) =>
    canDecode(capturedEpoch) && latest.current.permission.state === 'granted';
  const canRunOwner = (capturedEpoch: number) =>
    scannerCurrent() && capturedEpoch === epoch.current && !entryRef.current;
  const isOwnerCurrent = (capturedEpoch: number) =>
    mounted.current &&
    capturedEpoch === epoch.current &&
    (!complete(mountScope.current) ||
      isSessionScopeCurrent(mountScope.current));
  const runCamera = async (request: boolean, e = entryRef.current) => {
    if (!e || !current(e) || latest.current.busy() || task.current) return;
    // This path can only be called by an explicit user permission action.
    // Checking/blocked/unavailable/granted must never request permission.
    if (request && latest.current.permission.state !== 'denied') return;
    const token = Symbol('camera');
    task.current = token;
    setWorking(true);
    try {
      if (request) await latest.current.permission.request();
      else await latest.current.permission.recheck();
    } finally {
      if (task.current === token) {
        task.current = undefined;
        if (sameEntry(e)) setWorking(false);
      }
    }
  };
  const visible = !!entry && current(entry);
  const ownerKey = entry ? JSON.stringify(entry.scope) : undefined;
  const screen =
    visible && entry ? (
      <P15DeviceScreen
        camera={latest.current.permission.state}
        nfc={nfc}
        ownerKey={ownerKey}
        active={visible}
        isCurrent={() => current(entry) && !latest.current.busy()}
        busy={working || latest.current.busy()}
        onBack={() => close(entry)}
        onCheckCamera={() => runCamera(false, entry)}
        // The actual permission hook reports denied, not proof of never-requested.
        // Parent UI therefore keeps its approved guide/recheck branch; scanner's
        // existing explicit permission CTA remains the request entry.
        onRequestCamera={() => runCamera(true, entry)}
        onOpenNfc={
          options.onOpenNfc
            ? async () => {
                if (!current(entry) || latest.current.busy() || task.current)
                  return;
                const callback = latest.current.onOpenNfc;
                if (!callback) return;
                const token = Symbol('nfc-route');
                task.current = token;
                setWorking(true);
                try {
                  await callback(
                    () => current(entry) && !latest.current.busy(),
                  );
                  // Caller owns navigation and must guard its own asynchronous work.
                  // We never invent a route or close a replacement scope afterward.
                  if (current(entry) && !latest.current.busy()) close(entry);
                } finally {
                  if (task.current === token) {
                    task.current = undefined;
                    if (current(entry)) setWorking(false);
                  }
                }
              }
            : undefined
        }
        footer={
          <View style={{ gap: 8, paddingHorizontal: 24, paddingBottom: 12 }}>
            <Button
              label="Kiểm tra lại NFC"
              disabled={working || latest.current.busy()}
              onPress={() => {
                void checkNfc(entry);
              }}
            />
            <Button
              label="Đóng hướng dẫn"
              variant="secondary"
              onPress={() => close(entry)}
            />
          </View>
        }
      />
    ) : null;
  return {
    open,
    close: () => close(entry),
    resume,
    canDecode,
    canUseCamera,
    canRunOwner,
    isOwnerCurrent,
    screen,
    visible,
    epoch: epoch.current,
    cameraSuspended:
      suspended ||
      paused.current ||
      (complete(mountScope.current) && !scopeCurrent()),
    blocksScanner: () =>
      !scannerCurrent() || paused.current || !!entryRef.current,
  };
}
