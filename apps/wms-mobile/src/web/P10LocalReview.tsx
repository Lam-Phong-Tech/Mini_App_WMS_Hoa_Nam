import { ProfileScreen as BeforeScreen } from '../features/profile/local/P10BeforeSnapshot';
/** Isolated RN-web renderer of current Android P10 components. No network/account side effects. */
import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import {
  P10LocalHarness,
  P10_SCENARIOS,
  type Scenario,
  currentAudit,
} from '../features/profile/local/P10LocalHarness';
import './global.css';
let blocked = 0;
window.fetch = async () => {
  blocked++;
  throw Error('P10 offline audit blocks every HTTP call.');
};
function Review() {
  const [width, setWidth] = useState(Math.min(494, innerWidth));
  useEffect(() => {
    const resize = () => setWidth(Math.min(494, innerWidth));
    addEventListener('resize', resize);
    return () => removeEventListener('resize', resize);
  }, []);
  const [scenario, setScenario] = useState<Scenario>('default'),
    [version, setVersion] = useState(0);
  (window as any).p10Local = {
    reset: (value: Scenario = 'default') => {
      setScenario(value);
      setVersion(v => v + 1);
    },
    snapshot: () => ({ ...currentAudit, blockedHttp: blocked }),
    resolve: () => currentAudit?.pendingResolve?.(),
  };
  return (
    <>
      <aside
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          zIndex: 100,
          font: '12px Arial',
          padding: 4,
          background: '#fff',
        }}
      >
        <select
          aria-label="Local state"
          value={scenario}
          onChange={e => {
            setScenario(e.target.value as Scenario);
            setVersion(v => v + 1);
          }}
        >
          {P10_SCENARIOS.map(s => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </aside>
      <main
        id="p10-review-app"
        style={{
          width,
          maxWidth: '100%',
          height: (950 * width) / 494,
          position: 'relative',
          margin: 'auto',
          background: '#fff',
          display: 'flex',
        }}
      >
        <P10LocalHarness
          key={version}
          scenario={scenario}
          Screen={
            new URLSearchParams(location.search).get('before') === '1'
              ? BeforeScreen
              : undefined
          }
        />
      </main>
    </>
  );
}
createRoot(document.getElementById('root')!).render(<Review />);
