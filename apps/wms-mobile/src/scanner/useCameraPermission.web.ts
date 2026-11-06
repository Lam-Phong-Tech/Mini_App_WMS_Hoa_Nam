import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import type { CameraPermissionState } from './cameraPermission';

export interface CameraPermissionView {
  readonly state: CameraPermissionState;
  request(): Promise<void>;
  recheck(): Promise<void>;
}

async function permissionState(): Promise<CameraPermissionState | undefined> {
  if (!navigator.mediaDevices?.getUserMedia) return 'unavailable';
  const permissions = navigator.permissions as Permissions & {
    query?: (descriptor: PermissionDescriptor) => Promise<PermissionStatus>;
  };
  if (permissions?.query === undefined) return undefined;
  try {
    const permission = await permissions.query({
      name: 'camera' as PermissionName,
    });
    return permission.state === 'granted' ? 'granted' : 'denied';
  } catch {
    return undefined;
  }
}

export function useCameraPermission(): CameraPermissionView {
  const [state, setState] = useState<CameraPermissionState>('checking');
  const mounted = useRef(true);
  const sequence = useRef(0);
  const pending = useRef<Promise<void> | undefined>(undefined);
  const recheck = useCallback(async () => {
    if (pending.current) return pending.current;
    const ticket = ++sequence.current;
    const next = await permissionState();
    if (mounted.current && ticket === sequence.current)
      setState(current => next ?? (current === 'checking' ? 'denied' : current));
  }, []);
  const request = useCallback(() => {
    if (pending.current) return pending.current;
    const ticket = ++sequence.current;
    const operation = (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        if (mounted.current && ticket === sequence.current) setState('unavailable');
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
        // The Camera component owns its preview stream; always release this
        // short permission probe, including when navigation wins the race.
        stream.getTracks().forEach(track => track.stop());
        if (mounted.current && ticket === sequence.current) setState('granted');
      } catch (error) {
        if (mounted.current && ticket === sequence.current)
          setState(error instanceof Error && error.name === 'NotFoundError' ? 'unavailable' : 'denied');
      }
    })().finally(() => {
      if (pending.current === operation) pending.current = undefined;
    });
    pending.current = operation;
    return operation;
  }, []);
  useEffect(() => {
    mounted.current = true;
    recheck().catch(() => undefined);
    const subscription = AppState.addEventListener('change', status => {
      if (status === 'active') recheck().catch(() => undefined);
    });
    return () => {
      mounted.current = false;
      sequence.current++;
      subscription.remove();
    };
  }, [recheck]);
  return { state, request, recheck };
}

export type { CameraPermissionState };
