import { useCallback, useEffect, useRef, useState } from 'react';
import type { CameraPermissionState } from './cameraPermission';

export interface CameraPermissionView {
  readonly state: CameraPermissionState;
  request(): Promise<void>;
  recheck(): Promise<void>;
}

async function permissionState(): Promise<CameraPermissionState> {
  if (!navigator.mediaDevices?.getUserMedia) return 'unavailable';
  const permissions = navigator.permissions as Permissions & {
    query?: (descriptor: PermissionDescriptor) => Promise<PermissionStatus>;
  };
  if (permissions.query === undefined) return 'denied';
  try {
    const permission = await permissions.query({
      name: 'camera' as PermissionName,
    });
    return permission.state === 'granted' ? 'granted' : 'denied';
  } catch {
    return 'denied';
  }
}

export function useCameraPermission(): CameraPermissionView {
  const [state, setState] = useState<CameraPermissionState>('checking');
  const mounted = useRef(true);
  const recheck = useCallback(async () => {
    const next = await permissionState();
    if (mounted.current) setState(next);
  }, []);
  const request = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      if (mounted.current) setState('unavailable');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      stream.getTracks().forEach(track => track.stop());
      if (mounted.current) setState('granted');
    } catch {
      if (mounted.current) setState('denied');
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    recheck().catch(() => undefined);
    return () => {
      mounted.current = false;
    };
  }, [recheck]);
  return { state, request, recheck };
}

export type { CameraPermissionState };
