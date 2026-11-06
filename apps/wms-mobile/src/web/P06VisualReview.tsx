// Separate review entry: never imported by AppShell/Android or the regular web entry.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  SafeAreaProvider,
  SafeAreaInsetsContext,
} from 'react-native-safe-area-context';
import { ThemeProvider } from '../theme/ThemeProvider';
import { ErrorBoundary } from '../errors/ErrorBoundary';
import { P06LookupScreen } from '../features/lookup/P06LookupScreen';
import { p06ScopeKey } from '../services/wms/p06Catalog';
import type { P06ViewState } from '../features/lookup/p06LookupFlow';
import {
  createMemoryBackend,
  createStorage,
  setAppStorageForTesting,
} from '../storage/storage';
import { setSession, clearSession } from '../auth/session';
import {
  mockId,
  p06MockHarness,
  p06MockSession,
  type P06MockScenario,
} from './p06ReviewFixtures';
import './global.css';
import { p06LockedVisualFixture } from './p06LockedVisualFixtures';
import type { P06ReviewPresentation } from '../features/lookup/P06Presentation';
setAppStorageForTesting(createStorage(createMemoryBackend()));
setSession(p06MockSession);
function Review() {
  const [width, setWidth] = useState(494),
    [panel, setPanel] = useState<P06ViewState['panel']>(1),
    [scenario, setScenario] = useState<P06MockScenario>('ready'),
    [revision, setRevision] = useState(0);
  const [harness, setHarness] = useState(() => p06MockHarness()),
    [locked, setLocked] = useState(false),
    [review, setReview] = useState<P06ReviewPresentation | undefined>();
  const [message, setMessage] = useState('');
  const reset = (
    nextPanel: P06ViewState['panel'],
    nextScenario: P06MockScenario = scenario,
  ) => {
    setPanel(nextPanel);
    setScenario(nextScenario);
    if (locked && nextScenario === 'ready') {
      const value = p06LockedVisualFixture();
      setHarness(value.harness);
      setReview(value.review);
    } else {
      setHarness(p06MockHarness(nextScenario));
      setReview(undefined);
    }
    setRevision(n => n + 1);
  };
  return (
    <>
      <div
        style={{
          padding: 14,
          background: '#fff',
          fontFamily: 'Arial',
          lineHeight: '24px',
        }}
      >
        <strong>
          P06 Android components — MOCK ĐỘC LẬP. Không API live, không camera/in
          tem; dữ liệu trong trang này chỉ là mock local.
        </strong>
        <br />
        <button
          onClick={() => {
            setLocked(true);
            const value = p06LockedVisualFixture();
            setHarness(value.harness);
            setReview(value.review);
            setScenario('ready');
            setPanel(1);
            setRevision(n => n + 1);
          }}
        >
          Mẫu lock (demo)
        </button>
        <button
          onClick={() => {
            setLocked(false);
            setHarness(p06MockHarness());
            setReview(undefined);
            setScenario('ready');
            setPanel(1);
            setRevision(n => n + 1);
          }}
        >
          API contract (mock)
        </button>
        {([1, 2, 3, 4] as const).map(p => (
          <button key={p} onClick={() => reset(p)}>
            S0{p}
          </button>
        ))}{' '}
        {[360, 390, 430, 494].map(w => (
          <button key={w} onClick={() => setWidth(w)}>
            {w}px
          </button>
        ))}{' '}
        <select
          aria-label="Kịch bản mock"
          value={scenario}
          onChange={e => reset(panel, e.target.value as P06MockScenario)}
        >
          {(
            [
              'ready',
              'empty',
              'forbidden',
              'unavailable',
              'incomplete',
              'mismatch',
              'warehouse-required',
              'warehouse-inactive',
              'limited-rights',
              'loading',
              'list-loading',
              'detail-loading',
              'stock-loading',
              'gallery-loading',
              'timeline-loading',
              'not-found',
              'auth-error',
              'schema-error',
              'stock-forbidden',
              'ledger-only',
              'warranty-only',
              'no-timeline',
              'timeline-empty',
              'long-content',
            ] as const
          ).map(value => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>{' '}
        <button onClick={() => clearSession()}>Logout mock</button>
        <button
          onClick={() => {
            setSession(p06MockSession);
            reset(1);
          }}
        >
          Reset mock
        </button>{' '}
        {message}
      </div>
      <div
        id="p06-review-frame"
        style={{
          width,
          maxWidth: '100%',
          height: 950,
          margin: '16px auto',
          display: 'flex',
          borderRadius: 0,
          overflow: 'hidden',
          boxShadow: '0 8px 28px #c8dce8',
        }}
      >
        <SafeAreaProvider
          initialMetrics={{
            frame: { x: 0, y: 0, width: 494, height: 950 },
            insets: { top: 0, right: 0, bottom: 0, left: 0 },
          }}
        >
          <SafeAreaInsetsContext.Provider
            value={{ top: 0, right: 0, bottom: 0, left: 0 }}
          >
            <ErrorBoundary>
              <ThemeProvider>
                <P06LookupScreen
                  key={revision}
                  service={harness.service}
                  reviewPresentation={review}
                  initialViewState={{
                    scopeKey: p06ScopeKey(p06MockSession),
                    query: '',
                    mode: 'keyword',
                    category: 'PRODUCT',
                    status: 'ACTIVE',
                    panel,
                    identity:
                      panel > 1 ? { type: 'SKU', id: mockId(100) } : undefined,
                    source: 'ALL',
                    scroll: { 1: 0, 2: 0, 3: 0, 4: 0 },
                  }}
                  onHome={() => reset(1)}
                  onScan={() =>
                    setMessage('Shortcut quét mock; chưa mở camera.')
                  }
                  onSelectTab={key =>
                    setMessage(`Điều hướng ${key} — mock riêng`)
                  }
                  onConfirmSession={() =>
                    setMessage('Owner phiên — mock riêng')
                  }
                />
              </ThemeProvider>
            </ErrorBoundary>
          </SafeAreaInsetsContext.Provider>
        </SafeAreaProvider>
      </div>
    </>
  );
}
createRoot(document.getElementById('root')!).render(<Review />);
