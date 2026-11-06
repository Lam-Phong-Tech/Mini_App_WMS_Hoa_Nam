/** Web P02 entry uses the current P01 owner. User-approved CTA context/START only. */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { LoginScreen } from '../features/auth/LoginScreen';
import { SessionConfirmationScreen } from '../features/auth/SessionConfirmationScreen';
import { Text } from '../ui/Text';
import { AppError } from '../errors/AppError';
import {
  captureSessionScope,
  getActiveSession,
  getSession,
  getSessionGeneration,
  hydrateSession,
  isSessionScopeCurrent,
  subscribeSession,
  updateSessionIdentity,
} from '../auth/session';
import { isPreviewReadyShift, type WorkShift } from '../services/wms/workShift';
import {
  currentShiftOwner,
  publishShiftState,
  resetShiftState,
} from '../shift/shiftState';
import type { CurrentUser } from '../services/wms/types';

export interface P02SessionFlowProps {
  onReady: (user: CurrentUser) => void;
  onState: (status: string, message?: string) => void;
  renderHome: () => React.ReactNode;
}

export function P02SessionFlow({
  onReady,
  onState,
  renderHome,
}: P02SessionFlowProps) {
  const [stage, setStage] = useState<
    'restore' | 'login' | 'confirmation' | 'home'
  >('restore');
  const mounted = useRef(true);
  const [familyVersion, setFamilyVersion] = useState(getSessionGeneration());
  const observedGeneration = useRef(getSessionGeneration());
  const identity = useRef<
    | {
        user: CurrentUser;
        scope: ReturnType<typeof captureSessionScope>;
      }
    | undefined
  >(undefined);
  const callbacks = useRef({ onReady, onState });
  callbacks.current = { onReady, onState };

  useEffect(() => {
    mounted.current = true;
    const off = subscribeSession(session => {
      const changed = observedGeneration.current !== getSessionGeneration();
      observedGeneration.current = getSessionGeneration();
      if (!session || changed) {
        setFamilyVersion(getSessionGeneration());
        identity.current = undefined;
        setStage(session ? 'confirmation' : 'login');
        callbacks.current.onState(
          session ? 'CONFIRMING_SESSION' : 'LOGIN_REQUIRED',
        );
      }
    });
    hydrateSession()
      .then(() => {
        if (!mounted.current) return;
        const session = getSession();
        setStage(session ? 'confirmation' : 'login');
        callbacks.current.onState(
          session ? 'CONFIRMING_SESSION' : 'LOGIN_REQUIRED',
        );
      })
      .catch(() => {
        if (!mounted.current) return;
        setStage('login');
        callbacks.current.onState(
          'LOGIN_REQUIRED',
          'Chưa khôi phục được phiên. Vui lòng đăng nhập.',
        );
      });
    return () => {
      mounted.current = false;
      off();
    };
  }, []);

  const identityResolved = useCallback((user: CurrentUser) => {
    const session = getSession();
    if (
      !mounted.current ||
      !session ||
      (session.userId && session.userId !== user.id) ||
      (session.authSessionId && session.authSessionId !== user.auth_session_id)
    ) {
      throw new AppError({
        kind: 'cancelled',
        message: 'Danh tính P01 không thuộc phiên hiện tại.',
      });
    }
    updateSessionIdentity({
      userId: user.id,
      authSessionId: user.auth_session_id,
      activeWarehouseId: user.active_warehouse_id ?? undefined,
      userName: user.name ?? user.email,
      avatarUrl: user.avatar_url,
    });
    identity.current = { user, scope: captureSessionScope() };
  }, []);

  const continueHome = useCallback((shift: WorkShift) => {
    const resolved = identity.current;
    const user = resolved?.user;
    const owner = currentShiftOwner();
    if (
      !mounted.current ||
      !getActiveSession() ||
      !resolved ||
      !user ||
      !owner ||
      !isSessionScopeCurrent(resolved.scope) ||
      user.id !== owner.actorId ||
      user.auth_session_id !== owner.authSessionId ||
      user.active_warehouse_id !== owner.warehouseId ||
      user.warehouse_context?.status !== 'READY' ||
      !isPreviewReadyShift(shift, owner)
    ) {
      throw new AppError({
        kind: 'cancelled',
        message: 'Chưa xác nhận đúng người/phiên/kho và ca ACTIVE cho Home.',
      });
    }
    // Same publication as AppShell; no second store or synthetic ACTIVE proof.
    publishShiftState(shift, owner, resolved.scope.generation);
    callbacks.current.onReady(user);
    callbacks.current.onState('READY');
    setStage('home');
  }, []);

  const loggedIn = useCallback(() => {
    identity.current = undefined;
    resetShiftState();
    setStage('confirmation');
    callbacks.current.onState('CONFIRMING_SESSION');
  }, []);
  const loggedOut = useCallback(() => {
    identity.current = undefined;
    resetShiftState();
    setStage('login');
    callbacks.current.onState('LOGIN_REQUIRED');
  }, []);

  if (stage === 'restore') return <Text>Đang khôi phục phiên bảo mật…</Text>;
  if (stage === 'login') return <LoginScreen onSuccess={loggedIn} />;
  if (stage === 'confirmation')
    return (
      <SessionConfirmationScreen
        key={familyVersion}
        onIdentityResolved={identityResolved}
        onContinue={continueHome}
        onLoggedOut={loggedOut}
      />
    );
  return <>{renderHome()}</>;
}
