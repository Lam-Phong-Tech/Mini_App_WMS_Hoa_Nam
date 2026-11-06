// Independent entry only: live transport and native hardware are replaced by the review config.
import React from 'react';
import { createRoot } from 'react-dom/client';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '../theme/ThemeProvider';
import { P07NativeFlow } from '../features/nfc/P07NativeFlow';
import { configureP07Review, reviewScenarios } from './p07ReviewFixtures';
import './global.css';
const params = new URLSearchParams(location.search);
const scenario = params.get('scenario') || 'ready';
if (params.has('embedded')) {
  configureP07Review(scenario);
  document.documentElement.style.height = '100%';
  document.body.style.cssText = 'margin:0;height:100%;background:#00577c';
  document.getElementById('root')!.style.cssText =
    'height:100%;display:flex;flex-direction:column';
  createRoot(document.getElementById('root')!).render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: innerWidth, height: innerHeight },
        insets: { top: 0, right: 0, bottom: 0, left: 0 },
      }}
    >
      <ThemeProvider>
        <P07NativeFlow
          onBack={() => parent.postMessage('P07 mock: Home', '*')}
          onSelectTab={tab => parent.postMessage(`P07 mock: ${tab}`, '*')}
        />
      </ThemeProvider>
    </SafeAreaProvider>,
  );
} else {
  function Review() {
    const [selected, setSelected] = React.useState(scenario),
      [width, setWidth] = React.useState(494),
      [height, setHeight] = React.useState(950),
      [revision, setRevision] = React.useState(0);
    return (
      <div style={{ fontFamily: 'Arial', padding: 16 }}>
        <p>
          <strong>
            P07 S01–S04 · Component native thật / dữ liệu & NFC giả lập local
          </strong>
          <br />
          Không API live, không ghi chip thật. Công cụ nằm ngoài app. UID mock
          không phải bằng chứng WMS.
        </p>
        <label>
          Kịch bản{' '}
          <select
            aria-label="Kịch bản"
            value={selected}
            onChange={e => setSelected(e.target.value)}
          >
            {reviewScenarios.map(value => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>{' '}
        <label>
          Rộng{' '}
          <select
            aria-label="Chiều rộng"
            value={width}
            onChange={e => setWidth(+e.target.value)}
          >
            {[320, 360, 390, 430, 494].map(w => (
              <option key={w}>{w}</option>
            ))}
          </select>
        </label>{' '}
        <label>
          Cao{' '}
          <select
            aria-label="Chiều cao"
            value={height}
            onChange={e => setHeight(+e.target.value)}
          >
            {[640, 800, 950].map(h => (
              <option key={h}>{h}</option>
            ))}
          </select>
        </label>{' '}
        <button onClick={() => setRevision(n => n + 1)}>Đặt lại</button>
        <iframe
          key={revision}
          title="P07 app"
          src={`?embedded=1&scenario=${selected}`}
          style={{
            display: 'block',
            width,
            height,
            maxWidth: '100%',
            margin: '16px auto',
            border: 0,
            borderRadius: 24,
            boxShadow: '0 8px 28px #c8dce8',
          }}
        />
      </div>
    );
  }
  createRoot(document.getElementById('root')!).render(<Review />);
}
