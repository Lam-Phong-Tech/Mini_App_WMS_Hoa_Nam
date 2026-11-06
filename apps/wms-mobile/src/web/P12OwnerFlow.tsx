/** P12 acceptance navigation only; never changes the P01 owner or its writers. */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { LoginScreen } from '../features/auth/LoginScreen';
import { SessionConfirmationScreen } from '../features/auth/SessionConfirmationScreen';
import { AppError } from '../errors/AppError';
import {
  captureSessionScope,
  getActiveSession,
  getSession,
  getSessionGeneration,
  subscribeSession,
  updateSessionIdentity,
} from '../auth/session';
import { fetchCurrentUser, fetchWarehouses } from '../services/wms/queries';
import {
  fetchCurrentWorkShift,
  isPreviewReadyShift,
  type WorkShift,
} from '../services/wms/workShift';
import type { CurrentUser } from '../services/wms/types';

export interface P12OwnerFlowProps {
  fetchUser?: typeof fetchCurrentUser;
  fetchShift?: typeof fetchCurrentWorkShift;
  fetchWarehouseList?: typeof fetchWarehouses;
  onReady: (user: CurrentUser) => void;
  onState?: (status: string, message?: string) => void;
  /** Isolated acceptance tool only; no P01 START/context operation. */
  onReadContextReady?: (openRead: (() => void) | undefined) => void;
  renderDocuments: () => React.ReactNode;
}

const denyStart = async (): Promise<never> => {
  throw new AppError({
    kind: 'config',
    message: 'Trang P12 này chỉ đọc; không gửi START.',
  });
};
const denyContext = async (): Promise<never> => {
  throw new AppError({
    kind: 'config',
    message: 'Trang P12 này không chọn hoặc đổi kho.',
  });
};

export function P12OwnerFlow({
  fetchUser = fetchCurrentUser,
  fetchShift = fetchCurrentWorkShift,
  fetchWarehouseList = fetchWarehouses,
  onReady,
  onState,
  onReadContextReady,
  renderDocuments,
}: P12OwnerFlowProps): React.ReactElement {
  const [stage, setStage] = useState<'login' | 'confirmation' | 'documents'>(
    () => (getActiveSession() ? 'confirmation' : 'login'),
  );
  const identity = useRef<
    { user: CurrentUser; generation: number } | undefined
  >(undefined);
  const observedGeneration = useRef(getSessionGeneration());
  const callbacks = useRef({ onReady, onState, onReadContextReady });
  callbacks.current = { onReady, onState, onReadContextReady };
  const readEntryOpened = useRef(false);
  const mounted = useRef(true);
  const readSequence = useRef(0);

  useEffect(() => {
    mounted.current = true;
    const sequenceRef = readSequence;
    const off = subscribeSession(session => {
      const changed = observedGeneration.current !== getSessionGeneration();
      observedGeneration.current = getSessionGeneration();
      if (!session) {
        readSequence.current++;
        callbacks.current.onReadContextReady?.(undefined);
        readEntryOpened.current = false;
        identity.current = undefined;
        setStage('login');
        callbacks.current.onState?.('LOGIN_REQUIRED');
      } else if (changed) {
        readSequence.current++;
        callbacks.current.onReadContextReady?.(undefined);
        readEntryOpened.current = false;
        identity.current = undefined;
        setStage('confirmation');
        callbacks.current.onState?.('CONFIRMING_SESSION');
      }
    });
    return () => {
      mounted.current = false;
      sequenceRef.current++;
      off();
    };
  }, []);

  const readUser = useCallback(async () => {
    const scope = captureSessionScope();
    const sequence = ++readSequence.current;
    identity.current = undefined;
    callbacks.current.onReadContextReady?.(undefined);
    readEntryOpened.current = false;
    try {
      const user = await fetchUser();
      const current = getSession();
      if (
        !mounted.current ||
        sequence !== readSequence.current ||
        !current ||
        scope.generation !== getSessionGeneration()
      ) {
        throw new AppError({
          kind: 'cancelled',
          message: 'Phiên đã thay đổi; không nhận kết quả cũ.',
        });
      }
      if (
        (scope.userId && scope.userId !== user.id) ||
        (scope.authSessionId && scope.authSessionId !== user.auth_session_id)
      ) {
        throw new AppError({
          kind: 'parse',
          route: '/api/v1/auth/me',
          message: 'Danh tính /auth/me không khớp phiên đăng nhập.',
        });
      }
      if (
        user.warehouse_context?.status === 'READY' &&
        user.active_warehouse_id &&
        user.id &&
        user.auth_session_id
      ) {
        updateSessionIdentity({
          userId: user.id,
          authSessionId: user.auth_session_id,
          activeWarehouseId: user.active_warehouse_id,
          userName: user.name,
        });
        callbacks.current.onState?.('CONFIRMING_SESSION');
      } else {
        callbacks.current.onState?.(
          'BLOCKED',
          'Phiên chưa có kho READY. Trang kiểm thử P12 không chọn kho hoặc gửi START.',
        );
      }
      identity.current = { user, generation: getSessionGeneration() };
      if (
        user.warehouse_context?.status === 'READY' &&
        user.id &&
        user.auth_session_id &&
        user.active_warehouse_id
      ) {
        const proof = identity.current;
        const proofSequence = readSequence.current;
        callbacks.current.onReadContextReady?.(() => {
          const currentSession = getSession();
          if (
            !mounted.current ||
            proofSequence !== readSequence.current ||
            !currentSession ||
            identity.current !== proof ||
            proof.generation !== getSessionGeneration() ||
            currentSession.userId !== user.id ||
            currentSession.authSessionId !== user.auth_session_id ||
            currentSession.activeWarehouseId !== user.active_warehouse_id
          ) {
            throw new AppError({
              kind: 'auth',
              message: 'Phiên/kho đã thay đổi; cần đọc lại owner.',
            });
          }
          if (readEntryOpened.current) return;
          callbacks.current.onReady(user);
          readEntryOpened.current = true;
          callbacks.current.onReadContextReady?.(undefined);
          callbacks.current.onState?.('READY');
          setStage('documents');
        });
      }
      return user;
    } catch (cause) {
      // A late failure must not replace the state of a new login.
      if (
        mounted.current &&
        sequence === readSequence.current &&
        scope.generation === getSessionGeneration()
      ) {
        identity.current = undefined;
        callbacks.current.onReadContextReady?.(undefined);
        callbacks.current.onState?.('BLOCKED', (cause as Error).message);
      }
      throw cause;
    }
  }, [fetchUser]);

  const readShift = useCallback(async () => {
    const resolved = identity.current;
    const shift = await fetchShift();
    if (
      !resolved ||
      identity.current !== resolved ||
      resolved.generation !== getSessionGeneration()
    ) {
      throw new AppError({
        kind: 'cancelled',
        message: 'Phiên đã thay đổi; không nhận ca cũ.',
      });
    }
    if (shift === null) {
      const error = new AppError({
        kind: 'config',
        route: '/api/v1/mini-app/work-shifts/current',
        message:
          'Chưa có ca ACTIVE được xác nhận. Trang kiểm thử P12 chỉ đọc và không gửi START; hãy xác nhận ca qua owner P01 được phép.',
      });
      callbacks.current.onState?.('BLOCKED', error.message);
      // Reject before P01 enables START or creates any local START intent.
      throw error;
    }
    return shift;
  }, [fetchShift]);

  const continueRead = useCallback((shift: WorkShift) => {
    const resolved = identity.current;
    const user = resolved?.user;
    if (
      !user?.id ||
      !user.auth_session_id ||
      !user.active_warehouse_id ||
      user.warehouse_context?.status !== 'READY' ||
      resolved?.generation !== getSessionGeneration() ||
      !isPreviewReadyShift(shift, {
        actorId: user.id,
        authSessionId: user.auth_session_id,
        warehouseId: user.active_warehouse_id,
      })
    ) {
      throw new AppError({
        kind: 'config',
        message: 'Chưa xác nhận được đúng phiên/kho/ca ACTIVE.',
      });
    }
    if (readEntryOpened.current) return;
    callbacks.current.onReady(user);
    readEntryOpened.current = true;
    callbacks.current.onReadContextReady?.(undefined);
    callbacks.current.onState?.('READY');
    setStage('documents');
  }, []);

  const loggedIn = useCallback(() => {
    identity.current = undefined;
    readEntryOpened.current = false;
    callbacks.current.onReadContextReady?.(undefined);
    callbacks.current.onState?.('CONFIRMING_SESSION');
    // Mount confirmation immediately. GET failures stay on that screen.
    setStage('confirmation');
  }, []);
  const loggedOut = useCallback(() => {
    identity.current = undefined;
    readEntryOpened.current = false;
    callbacks.current.onReadContextReady?.(undefined);
    callbacks.current.onState?.('LOGIN_REQUIRED');
    setStage('login');
  }, []);

  if (stage === 'login') return <LoginScreen onSuccess={loggedIn} />;
  if (stage === 'confirmation')
    return (
      <SessionConfirmationScreen
        fetchUser={readUser}
        fetchShift={readShift}
        fetchWarehouses={fetchWarehouseList}
        contextEnabled={false}
        switchContext={denyContext}
        startShift={denyStart}
        onContinue={continueRead}
        onLoggedOut={loggedOut}
      />
    );
  return <>{renderDocuments()}</>;
}
