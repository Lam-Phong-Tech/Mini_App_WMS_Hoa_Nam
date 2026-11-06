import {useCallback,useEffect,useRef,useState} from 'react';
import {AppState} from 'react-native';
import {checkCameraPermission,requestCameraPermission,type CameraPermissionState,type PermissionBackend} from './cameraPermission';

export interface CameraPermissionView {
  readonly state: CameraPermissionState;
  request(): Promise<void>;
  recheck(): Promise<void>;
}

export function useCameraPermissionBase(
  backend: PermissionBackend,
): CameraPermissionView {
  const [state, setState] = useState<CameraPermissionState>('checking');
  const mounted = useRef(true);
  const sequence = useRef(0);
  const pendingRequest = useRef<Promise<void> | undefined>(undefined);

  const recheck = useCallback(async () => {
    if (pendingRequest.current) return pendingRequest.current;
    const ticket = ++sequence.current;
    const next = await checkCameraPermission(backend);
    if (mounted.current && ticket === sequence.current) {
      // Đã bị chặn vĩnh viễn thì `check()` vẫn trả `denied`; giữ nguyên
      // `blocked` để UI không đổi sang nút "Xin quyền" vô tác dụng.
      setState(current =>
        current === 'blocked' && next === 'denied' ? 'blocked' : next,
      );
    }
  }, [backend]);

  const request = useCallback(() => {
    if (pendingRequest.current) return pendingRequest.current;
    const ticket = ++sequence.current;
    const operation = (async () => {
      const next = await requestCameraPermission(backend);
      if (mounted.current && ticket === sequence.current) setState(next);
    })().finally(() => {
      if (pendingRequest.current === operation)
        pendingRequest.current = undefined;
    });
    pendingRequest.current = operation;
    return operation;
  }, [backend]);

  useEffect(() => {
    const sequenceRef = sequence;
    mounted.current = true;
    recheck().catch(() => undefined);

    // Quyền có thể bị thu hồi khi app ở nền → kiểm tra lại lúc quay lại.
    const subscription = AppState.addEventListener('change', status => {
      if (status === 'active') {
        recheck().catch(() => undefined);
      }
    });

    return () => {
      mounted.current = false;
      sequenceRef.current++;
      subscription.remove();
    };
  }, [recheck]);

  return { state, request, recheck };
}

export type { CameraPermissionState };
