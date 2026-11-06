/** Offline-only UAT visual evidence. This entry is never imported by AppShell. */
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { View } from 'react-native';
import { AppProviders } from '../app/App';
import { AccountRecoverySupportFlow } from '../features/auth/AccountRecoverySupportFlow';
import { P13NotificationFrame } from '../features/notifications/P13NotificationFrame';
import { P13NotificationDetail } from '../features/notifications/P13NotificationPresentation';
import type { NotificationItem } from '../services/wms/notifications';
import {InboundReviewScreen} from '../features/inbound/InboundReviewScreen';
import {initialInboundDraft} from '../features/inbound/inboundDraft';
import './global.css';

const actor = '13000000-0000-4000-8000-000000000010';
const warehouse = '13000000-0000-4000-8000-000000000012';
const item: NotificationItem = {
  id: '13000000-0000-4000-8000-000000000001',
  title: 'Phiếu nhập kho đang chờ duyệt',
  message: 'Phiếu nhập kho đã được gửi lên Web và đang chờ xử lý.',
  severity: 'info',
  read: true,
  readAt: '2026-10-24T09:15:00+07:00',
  createdAt: '2026-10-24T09:12:00+07:00',
  type: 'INBOUND_RECORDED',
  subject: null,
  actorName: 'Thủ kho 01',
  documentNo: 'PN-TEST-0001',
  warehouseId: warehouse,
};

window.fetch = async () => {
  throw Error('UAT offline review forbids HTTP');
};

function Review() {
  const [panel, setPanel] = useState(
    new URLSearchParams(location.search).get('case') === 'TC_UAT_07'
      ? 'TC_UAT_07' : 'TC_UAT_01',
  );
  return (
    <>
      <aside
        style={{
          height: 44,
          padding: 8,
          boxSizing: 'border-box',
          background: '#e6eef2',
        }}
      >
        <select
          aria-label="Test case"
          value={panel}
          onChange={event => setPanel(event.target.value)}
        >
          <option>TC_UAT_01</option>
          <option>TC_UAT_02</option>
          <option>TC_UAT_07</option>
        </select>
      </aside>
      <main
        style={{
          width: 390,
          maxWidth: '100%',
          height: 'calc(100dvh - 44px)',
          margin: 'auto',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <AppProviders>
          {panel === 'TC_UAT_01' ? (
            <AccountRecoverySupportFlow onBack={() => {}} onDone={() => {}} />
          ) : panel === 'TC_UAT_07' ? (
            <InboundReviewScreen
              draft={{...initialInboundDraft,name:'PN-LOCAL-ONLY',
                warehouseId:warehouse,warehouseName:'Kho TEST cục bộ',
                supplierName:'NCC fixture',inboundCategory:'PRODUCT',
                codes:[{key:'local-1',raw:'LOCAL-ONLY',sku:'SKU-LOCAL',item:'ITEM-LOCAL',quantity:1,source:'MANUAL',at:1}],
              }}
              documentRef="PN-LOCAL-ONLY"
              actorName="Người TEST cục bộ"
              onRecord={()=>{}}
              onBackToScan={()=>{}}
            />
          ) : (
            <P13NotificationFrame
              detail
              restoreKey={panel + actor}
              initialScrollY={0}
              onScrollPositionChange={() => {}}
              onBack={() => {}}
              busy={false}
            >
              <View testID="TC_UAT_02.review">
                <P13NotificationDetail
                  item={item}
                  warehouseName="Kho tổng Hoa Nam"
                  actorRole={null}
                  busy={false}
                  canOpen={false}
                  unknown={false}
                  onOpen={() => {}}
                  onMark={() => {}}
                />
              </View>
            </P13NotificationFrame>
          )}
        </AppProviders>
      </main>
    </>
  );
}

createRoot(document.getElementById('root')!).render(<Review />);
