/** Explicit UI review entry; never imported by the application bootstrap. */
import React, { useMemo, useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '../theme/ThemeProvider';
import { BottomNav } from '../ui/BottomNav';
import {
  createMemoryBackend,
  createStorage,
  setAppStorageForTesting,
} from '../storage/storage';
import { P08HistoryScreen } from '../features/history/P08HistoryScreen';
import {
  createP08Fixture,
  p08PanelIds,
  isP08PanelId,
  type P08PanelId,
} from './P08ReviewFixtures';
import './global.css';

setAppStorageForTesting(createStorage(createMemoryBackend()));
globalThis.fetch = async () => {
  throw new Error('P08_UI_REVIEW_NETWORK_DISABLED');
};
const params = new URLSearchParams(location.search);
const raw = params.get('panel') ?? 'P08.S01';
const panel = isP08PanelId(raw) ? raw : 'P08.S01';

function Panel() {
  const fixture = useMemo(() => createP08Fixture(panel), []);
  return (
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 494, height: 950 },
        insets: { top: 0, bottom: 0, left: 0, right: 0 },
      }}
    >
      <ThemeProvider>
        <View style={{ flex: 1, minHeight: 0 }}>
          <P08HistoryScreen {...fixture} />
        </View>
        <BottomNav activeKey="history" layoutWidth={494} onSelect={() => {}} />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
function Review() {
  const toolsRef = useRef<HTMLElement | null>(null);
  const [selected, setSelected] = useState<P08PanelId>(panel);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const resize = () =>
      setScale(
        Math.min(
          1,
          window.innerWidth / 494,
          Math.max(
            100,
            window.innerHeight -
              (toolsRef.current?.getBoundingClientRect().height ?? 110) -
              32,
          ) / 950,
        ),
      );
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);
  return (
    <>
      <header ref={toolsRef}>
        <strong>P08 · Lịch sử</strong>
        {p08PanelIds.map((id, i) => (
          <button
            key={id}
            aria-pressed={id === selected}
            onClick={() => setSelected(id)}
          >
            {['Danh sách', 'Chi tiết', 'Phiên quét', 'Theo ngày'][i]}
          </button>
        ))}
        <a href="http://127.0.0.1:5176/">App đang chạy</a>
        <small>
          UI_RENDER_ONLY · component hiện hành · dữ liệu kiểm tra trong bộ nhớ
        </small>
      </header>
      <div id="stage" style={{ width: 494 * scale, height: 950 * scale }}>
        <div id="phone" style={{ transform: `scale(${scale})` }}>
          <iframe
            key={selected}
            title="Màn hình Lịch sử Hoa Nam"
            src={`?inner=1&panel=${selected}`}
          />
        </div>
      </div>
    </>
  );
}
if (params.get('inner') === '1') {
  document.body.style.width = '494px';
  document.body.style.height = '950px';
  const root = document.getElementById('root')!;
  root.style.display = 'flex';
  root.style.height = '950px';
  createRoot(root).render(<Panel />);
} else createRoot(document.getElementById('root')!).render(<Review />);
