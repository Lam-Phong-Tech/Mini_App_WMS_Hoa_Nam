/** Offline-only native component evidence. This entry is not imported by AppShell. */
import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AppProviders } from '../app/App';
import { P13WebQueueScreen } from '../features/notifications/P13WebQueueScreen';
import { P18BoxesScreen } from '../features/warehouse/P18BoxesScreen';
import { parseBoxes, boxQuery } from '../services/wms/p18Boxes';
import { parseWebQueue, webQueueQuery } from '../services/wms/p13WebQueue';
import type { BeReleasedReads } from '../services/wms/beReleasedReads';
import { AppError } from '../errors/AppError';
import { setSession } from '../auth/session';
import {
  createStorage,
  createMemoryBackend,
  setAppStorageForTesting,
} from '../storage/storage';
import {
  boxBody,
  boxRow,
  queueBody,
  queueRow,
  scope,
  user,
  actor,
  session,
  warehouse,
} from '../../__tests__/fixtures/beReleasedReads20261024';
import './global.css';

setAppStorageForTesting(createStorage(createMemoryBackend()));
setSession({
  accessToken: 'offline-only',
  userId: actor,
  authSessionId: session,
  activeWarehouseId: warehouse,
});
window.fetch = async () => {
  throw Error('Offline review forbids business HTTP');
};
function Review() {
  const [panel, setPanel] = useState('P13'),
    [scenario, setScenario] = useState('ready'),
    [opened, setOpened] = useState('');
  const service = useMemo<BeReleasedReads>(() => {
    const rows = () =>
      scenario === 'empty'
        ? []
        : [
            {
              ...boxRow(),
              ...(scenario === 'missing'
                ? {
                    contained_qty: null,
                    quantity_status: 'SOURCE_INCONSISTENT',
                  }
                : {}),
            },
          ];
    const allow = () => {
      if (scenario === 'denied')
        throw new AppError({
          kind: 'http',
          status: 403,
          message: 'Không có quyền đọc nguồn này.',
        });
      if (scenario === 'source-error')
        throw new AppError({
          kind: 'http',
          status: 503,
          message:
            'Nguồn dữ liệu tạm thời chưa sẵn sàng. Không trả tổng một phần.',
        });
    };
    return {
      scopeKey: () => 'offline-scope',
      webQueue: async input => {
        allow();
        const q = webQueueQuery(input);
        return parseWebQueue(
          queueBody(q, scenario === 'empty' ? [] : [queueRow()]),
          scope(),
          q,
        );
      },
      boxes: async input => {
        allow();
        const q = boxQuery(input);
        return parseBoxes(boxBody(rows() as never, q), scope(), q);
      },
      box: async value => {
        allow();
        return parseBoxes(
          boxBody(rows() as never, {}, true),
          scope(),
          boxQuery(),
          value,
        ).items[0];
      },
    };
  }, [scenario]);
  return (
    <>
      <aside
        style={{
          padding: 8,
          height: 44,
          boxSizing: 'border-box',
          background: '#eee',
        }}
      >
        <select
          aria-label="Panel"
          value={panel}
          onChange={e => {
            setPanel(e.target.value);
            setOpened('');
          }}
        >
          <option>P13</option>
          <option>P18</option>
        </select>{' '}
        <select
          aria-label="Scenario"
          value={scenario}
          onChange={e => setScenario(e.target.value)}
        >
          {['ready', 'missing', 'empty', 'denied', 'source-error'].map(s => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <output aria-label="Opened target">{opened}</output>
      </aside>
      <main
        id="r7-review-app"
        style={{
          width: 494,
          maxWidth: '100%',
          height: 'calc(100dvh - 44px)',
          maxHeight: 950,
          margin: 'auto',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
        }}
      >
        <AppProviders>
          {panel === 'P13' ? (
            <P13WebQueueScreen
              key={panel + scenario}
              context={{ user: user() }}
              service={service}
              onBack={() => setOpened('BACK')}
              onOpenDocument={target =>
                setOpened(target.kind + ':' + target.id)
              }
            />
          ) : (
            <P18BoxesScreen
              key={panel + scenario}
              context={{ user: user() }}
              service={service}
              onBack={() => setOpened('BACK')}
            />
          )}
        </AppProviders>
      </main>
    </>
  );
}
createRoot(document.getElementById('root')!).render(<Review />);
