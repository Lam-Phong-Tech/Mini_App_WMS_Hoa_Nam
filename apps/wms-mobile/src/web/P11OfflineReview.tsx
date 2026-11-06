/** Opt-in offline audit entry, never imported by Android/AppShell. */
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AppProviders } from '../app/App';
import {
  P11PasswordScreen,
  P11PasswordResultScreen,
  P11SessionsScreen,
} from '../features/profile/P11SecurityScreens';
import { decodeProfile } from '../services/wms/profile';
import {
  captureSecurityOwner,
  decodeSecuritySessions,
  decodePasswordChangeResult,
} from '../services/wms/security';
import { setSession } from '../auth/session';
import {
  createMemoryBackend,
  createStorage,
  setAppStorageForTesting,
} from '../storage/storage';
import {
  USER_ID,
  FAMILY,
  profileResponse,
  authResponse,
  sessionsResponse,
  revokeResponse,
} from '../../__tests__/fixtures/p10Contract';
import { AppError } from '../errors/AppError';
import './global.css';
setAppStorageForTesting(createStorage(createMemoryBackend()));
setSession({ accessToken: 'offline', userId: USER_ID, authSessionId: FAMILY });
window.fetch = async () => {
  throw new Error('Offline P11 audit forbids HTTP');
};
function Review() {
  const [panel, setPanel] = useState('S01');
  return (
    <>
      <aside style={{ padding: 12, background: '#eef4f8' }}>
        P11 offline component review · production OFF · no server commands{' '}
        <select
          aria-label="Panel"
          value={panel}
          onChange={e => setPanel(e.target.value)}
        >
          <option>S01</option>
          <option>S02</option>
          <option>S03</option>
          <option>S04</option>
        </select>
      </aside>
      <main
        id="p11-review-app"
        style={{
          width: 494,
          maxWidth: '100%',
          height: 950,
          margin: 'auto',
          position: 'relative',
          display:'flex',
          flexDirection:'column',
        }}
      >
        <AppProviders>
          {panel === 'S03' ? (
            <P11PasswordResultScreen
              result={{...decodePasswordChangeResult(authResponse('password')),displayContext:{accountName:'Tài khoản TEST',warehouseName:null}}}
              onContinue={() => setPanel('S01')}
            />
          ) : panel === 'S04' ? (
            <P11SessionsScreen
              onBack={() => setPanel('S01')}
              fetchSessionsFn={async () =>
                decodeSecuritySessions(
                  sessionsResponse(),
                  captureSecurityOwner(),
                )
              }
              revokeSessionFn={async () => revokeResponse().data.data}
            />
          ) : (
            <P11PasswordScreen
              key={panel}
              user={decodeProfile(profileResponse())}
              fetchUser={async () => decodeProfile(profileResponse())}
              onBack={() => setPanel('S01')}
              changePasswordFn={async () => {
                throw new AppError({
                  kind: 'http',
                  status: 422,
                  code: 'CURRENT_PASSWORD_INCORRECT',
                  message: 'Mật khẩu hiện tại không đúng.',
                });
              }}
            />
          )}
        </AppProviders>
      </main>
    </>
  );
}
createRoot(document.getElementById('root')!).render(<Review />);
