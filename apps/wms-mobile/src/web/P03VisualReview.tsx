/** Isolated local review of the REAL native P03 component, no API/session/camera. */
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useWindowDimensions } from 'react-native';
import { AppProviders } from '../app/App';
import { P03Surface, type P03Panel } from '../features/scan/P03Dialog';
import { BottomNav } from '../ui/BottomNav';
import './global.css';
const css: React.CSSProperties = { margin: '0 auto', display: 'flex', maxWidth: '100%', background: '#e6f5fa' };
function Review() {
  const [panel, setPanel] = useState<P03Panel>('S01'), [outcome, setOutcome] = useState('ready'), [linked, setLinked] = useState(false), [last, setLast] = useState('');
  const { width } = useWindowDimensions(), w = Math.min(494, width);
  const busy = outcome === 'busy', unknown = outcome === 'unknown';
  const message = outcome === 'failed' ? 'Chưa lưu được nháp. Nội dung phiếu được giữ nguyên.' : unknown ? 'Chưa xác định kết quả. Giữ nguyên phiếu, phiên quét và mã yêu cầu để đối chiếu.' : undefined;
  return <>
    <div id="p03-review-controls" style={{ padding: 12, fontFamily: 'Arial', background: '#fff', lineHeight: 1.6 }}>
      <strong>P03 Mini App · QA local · không API/camera/dữ liệu thật.</strong><br />
      <label>Panel <select aria-label="Panel" value={panel} onChange={e => { setPanel(e.target.value as P03Panel); setOutcome('ready'); }}><option>S01</option><option>S02</option><option>S03</option><option>S04</option></select></label>{' '}
      <label>Trạng thái <select aria-label="Trạng thái" value={outcome} onChange={e => setOutcome(e.target.value)}><option value="ready">Sẵn sàng</option><option value="busy">Đang xử lý</option><option value="failed">Thất bại</option><option value="unknown">UNKNOWN</option></select></label>{' '}
      <label><input aria-label="Nháp server" type="checkbox" checked={linked} onChange={e => setLinked(e.target.checked)} />Nháp server</label>
      <p id="p03-review-event">{last || 'Nút chỉ ghi sự kiện QA; không gửi hoặc xóa dữ liệu.'}</p>
    </div>
    <div id="p03-review-app" style={{ ...css, width: w, height: 950 * w / 494 }}>
      <AppProviders>
        <P03Surface panel={panel} busy={busy} serverLinked={linked} message={message}
          onBack={() => { if (panel === 'S04') setPanel('S02'); else setLast('QA: Back'); }}
          onChoose={choice => setLast('QA: route ' + choice)}
          actions={panel === 'S02' ? [
            { label: 'Tiếp tục phiếu', kind: 'primary', disabled: unknown, onPress: () => setLast('QA: tiếp tục') },
            { label: 'Lưu nháp và thoát', disabled: unknown, onPress: () => setLast('QA: lưu') },
            { label: 'Bỏ phiếu', kind: 'danger-outline', disabled: unknown, onPress: () => setPanel('S04') },
            { label: 'Hủy', kind: 'text', onPress: () => setLast('QA: hủy mở dialog, giữ dữ liệu') },
          ] : panel === 'S03' ? [
            { label: 'Về Trang chủ', kind: 'primary', onPress: () => setLast('QA: Home') },
          ] : [
            { label: 'Quay lại', onPress: () => setPanel('S02') },
            { label: 'Bỏ phiếu', kind: 'danger', disabled: unknown, onPress: () => setLast('QA: xác nhận bỏ') },
          ]}
          footer={<BottomNav activeKey="home" disabled={busy || panel === 'S04'} onSelect={key => setLast('QA: tab ' + key)} />}
        />
      </AppProviders>
    </div>
  </>;
}
createRoot(document.getElementById('root')!).render(<Review />);
