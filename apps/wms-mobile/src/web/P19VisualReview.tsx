// Offline review only. Never imported by AppShell/Metro; no HTTP transport.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '../theme/ThemeProvider';
import { P19NativeFlow } from '../features/warranty/p19/P19NativeFlow';
import { createP19NativeController } from '../features/warranty/p19/p19NativeController';
// @ts-expect-error Isolated JavaScript test fixture; native does not import it.
import {
  linkedServer,
  scope,
  id,
} from '../../__tests__/fixtures/p19LinkedServer';
import type { P19NativeController } from '../features/warranty/p19/p19NativeController';
import {
  createMemoryBackend,
  createStorage,
  setAppStorageForTesting,
} from '../storage/storage';
setAppStorageForTesting(createStorage(createMemoryBackend()));
const scenarios = [
  'S01',
  'S02',
  'S03',
  'S04',
  'empty',
  'UNKNOWN_SAVE',
  'UNKNOWN_RECORD',
  'dirty',
  'closed',
  'unavailable',
  'long',
];
async function setup(scenario: string) {
  const server = linkedServer();
  let sequence = 20;
  server.options.resolvers = {
    'LK0001-HN001': {
      resolved: true,
      eligible_for_issue: true,
      eligible_for_component_issue: true,
      case_allows_issue: true,
      item_type: 'ITEM',
      requires_quantity: false,
      sku_id: id(11),
      sku_code: 'LK-0001',
      sku_name: 'Đầu in nhiệt XP-420B',
      item_id: id(101),
      container_id: null,
      available_qty: null,
    },
    'BOX-LK-0002-01': { sku_code: 'LK-0002', sku_name: 'Adapter nguồn 24V' },
  };
  server.options.documentNo = 'XLK-DEMO-0001';
  const controller = createP19NativeController({
    getScope: () => scope,
    caseId: id(4),
    presentation: {
      caseLabel: 'BH-001',
      productName: 'Máy in nhiệt XP-420B',
      warehouseName: 'Kho Hoa Nam',
      status: scenario === 'closed' ? 'RETURNED' : 'CHECKING',
    },
    offlineRequest: scenario === 'unavailable' ? undefined : server.request,
    uuid: () => id(++sequence),
  });
  await controller.initialize();
  if (!['empty', 'unavailable', 'closed'].includes(scenario)) {
    await controller.flow.scan('LK0001-HN001', 'CAMERA');
    if (scenario !== 'S01')
      await controller.flow.scan('BOX-LK-0002-01', 'MANUAL');
    if (!['S01', 'S02'].includes(scenario)) controller.flow.quantity(2);
    if (
      [
        'S03',
        'S04',
        'UNKNOWN_SAVE',
        'UNKNOWN_RECORD',
        'dirty',
        'long',
      ].includes(scenario)
    ) {
      if (scenario === 'UNKNOWN_SAVE') server.options.lose = 'SAVE';
      await controller.flow.prepareReview();
      if (['S04', 'UNKNOWN_RECORD'].includes(scenario)) {
        if (scenario === 'UNKNOWN_RECORD') server.options.lose = 'RECORD';
        await controller.flow.post();
      }
      if (scenario === 'dirty') {
        controller.flow.editQuantity('BOX-LK-0002-01');
        controller.flow.quantity(4);
      }
    }
  }
  if (scenario === 'long') {
    controller.presentation.caseLabel = 'Hồ sơ bảo hành có mã rất dài '.repeat(
      4,
    );
    controller.presentation.productName =
      'Tên thiết bị và đặc điểm nhận dạng '.repeat(7);
  }
  return { controller, server };
}
function App() {
  const [flow, setFlow] = useState<P19NativeController>(),
    [scenario, setScenario] = useState('S01'),
    [revision, setRevision] = useState(0),
    [width, setWidth] = useState(494),
    [back, setBack] = useState(false);
  const reset = React.useCallback(async function reset(name = 'S01') {
    const next = await setup(name);
    setScenario(name);
    setFlow(next.controller);
    setBack(false);
    setRevision(r => r + 1);
    Object.assign(window, {
      __p19Local: { reset, controller: next.controller, server: next.server },
    });
  }, []);
  React.useEffect(() => {
    reset().catch(() => undefined);
  }, [reset]);
  return (
    <div
      style={{
        display: 'flex',
        gap: 28,
        padding: 20,
        background: '#e8f0f6',
        minHeight: '100vh',
        fontFamily: 'Arial',
      }}
    >
      <aside style={{ width: 210 }}>
        <h2>P19 native · local</h2>
        <p>Fixture tách riêng; WMS và phần cứng OFF.</p>
        <select
          aria-label="Trạng thái kiểm tra"
          value={scenario}
          onChange={e => reset(e.target.value)}
        >
          {scenarios.map(name => (
            <option key={name}>{name}</option>
          ))}
        </select>
        <p>
          {[494, 433, 360].map(size => (
            <button key={size} onClick={() => setWidth(size)}>
              {size}px
            </button>
          ))}
        </p>
        {back && <p>Đã về đúng hồ sơ BH-001.</p>}
      </aside>
      <div
        data-p19-frame
        style={{
          width,
          height: 950,
          overflow: 'hidden',
          flexShrink: 0,
          boxShadow: '0 3px 18px #abc',
        }}
      >
        <SafeAreaProvider
          initialMetrics={{
            frame: { x: 0, y: 0, width, height: 950 },
            insets: { top: 0, right: 0, bottom: 0, left: 0 },
          }}
        >
          <ThemeProvider>
            {flow && (
              <P19NativeFlow
                key={revision}
                controller={flow}
                initialPanel={
                  [
                    'S03',
                    'S04',
                    'UNKNOWN_SAVE',
                    'UNKNOWN_RECORD',
                    'dirty',
                    'long',
                  ].includes(scenario)
                    ? 3
                    : 1
                }
                scanAvailable={false}
                onBack={() => setBack(true)}
              />
            )}
          </ThemeProvider>
        </SafeAreaProvider>
      </div>
    </div>
  );
}
createRoot(document.getElementById('root')!).render(<App />);
