/**
 * Khung ứng dụng — quyết định hiện màn đăng nhập hay khung có thanh tab.
 *
 * ## Bốn tab cho nhân viên quét
 *
 * App chỉ quét và gửi phiếu. Duyệt/Ghi sổ tồn kho thuộc Web WMS, nên App không
 * có tab thao tác Post trên thiết bị quét. Chứng từ mở từ Trang chủ hoặc Lịch
 * sử, chỉ để xem danh sách/chi tiết có thật, không duyệt hoặc ghi sổ.
 *
 * Suốt đợt 1–4 thanh tab chỉ hiện tab đã dựng, vì nguyên tắc #4 của Prompt 4 cấm
 * *"màn hình demo để thay thế"* — một tab bấm vào ra màn trống đúng là thứ đó,
 * và tệ hơn: thủ kho tưởng chức năng **hỏng** chứ không phải **chưa làm**.
 *
 * Tab *Quét mã* mở màn **Tra cứu**, đúng như ảnh 13–17: quét ở đây chỉ để tra
 * cứu, **không** ghi gì. Quét để nhập/xuất đi qua ô tương ứng ở trang chủ.
 *
 * ## Preflight môi trường khi mở app
 *
 * 🔒 Mục 2 của luồng bắt buộc (2026-09-06): gọi `GET /api/v1/health` và chỉ bật
 * quét khi header `X-WMS-Deployment-Tier` khớp bản dựng. Chạy ở đây — **một
 * lần, sớm nhất có thể** — thay vì để từng màn tự hỏi: nhiều request có thể
 * đi tới nhiều kết luận khác nhau.
 *
 * ## Khôi phục phiên khi mở app
 *
 * `recoverAfterRestart()` chạy **trước** khi quyết định hiện màn nào: nếu app bị
 * kill giữa lúc đang gia hạn token, phiên cũ không dùng lại được và người dùng
 * phải đăng nhập lại một lần (xem `auth/tokenRefresh.ts`).
 */

import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { BottomNav, type BottomNavItem } from '../ui/BottomNav';
import { LoginScreen } from '../features/auth/LoginScreen';
import { SessionConfirmationScreen } from '../features/auth/SessionConfirmationScreen';
import {
  LogoutProgressScreen,
  SessionExpiredScreen,
} from '../features/auth/StatusScreen';
import { HomeScreen, type HomeTaskKey } from '../features/home/HomeScreen';
import { InboundFlow } from '../features/inbound/InboundFlow';
import { OutboundFlow } from '../features/outbound/OutboundFlow';
import { WarrantyListScreen } from '../features/warranty/WarrantyListScreen';
import { WarrantyIntakeScreen } from '../features/warranty/WarrantyIntakeScreen';
import { WarrantyCaseDetail } from '../features/warranty/WarrantyCaseDetail';
import { WarrantyComponentIssueFlow } from '../features/warranty/WarrantyComponentIssueFlow';
import { useHardwareBack } from './useHardwareBack';
import type { WarrantyCase } from '../services/wms/types';
import { BusinessScanScreen } from '../features/scan/BusinessScanScreen';
import { DocumentDetailScreen } from '../features/documents/DocumentDetailScreen';
import { HistoryScreen } from '../features/history/HistoryScreen';
import { LookupScreen } from '../features/lookup/LookupScreen';
import { NfcAssignmentScreen } from '../features/nfc/NfcAssignmentScreen';
import { NfcLookupScreen } from '../features/nfc/NfcLookupScreen';
import { NfcTagListScreen } from '../features/nfc/NfcTagListScreen';
import { NotFoundScreen } from '../features/auth/StatusScreen';
import { ProfileScreen } from '../features/profile/ProfileScreen';
import { getSession, subscribeSession, type Session } from '../auth/session';
import { recoverAfterRestart } from '../auth/tokenRefresh';
import {
  checkDeploymentTier,
  getLastTierCheck,
} from '../services/wms/tierCheck';

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  body: {
    flex: 1,
  },
});

/** Bốn tab đã chốt: chứng từ được mở từ Trang chủ hoặc Lịch sử. */
const IMPLEMENTED_TABS: readonly BottomNavItem[] = [
  { key: 'home', label: 'Trang chủ', icon: 'home' },
  { key: 'scan', label: 'Quét mã', icon: 'scan' },
  { key: 'history', label: 'Lịch sử', icon: 'history' },
  { key: 'profile', label: 'Cá nhân', icon: 'profile' },
];

/** Nội dung từng tab. Tab lạ rơi vào màn fallback của ảnh 47, không màn trắng. */
function renderTab(
  key: string,
  handlers: {
    onLoggedOut: () => void;
    onLogoutStarted: () => void;
    onSelectTask: (task: HomeTaskKey) => void;
    onHome: () => void;
    onOpenDocuments: () => void;
    onOpenDocument: (kind: 'inbound' | 'outbound', documentId: string) => void;
    onLookupNfc: () => void;
    onScanLookup: () => void;
    userName?: string;
  },
): React.ReactElement {
  switch (key) {
    case 'scan':
      return (
        <LookupScreen
          onHome={handlers.onHome}
          onScan={handlers.onScanLookup}
          onScanAgain={handlers.onScanLookup}
          onLookupNfc={handlers.onLookupNfc}
        />
      );
    case 'history':
      return (
        <HistoryScreen
          onOpen={row => handlers.onOpenDocument(row.kind, row.id)}
        />
      );
    case 'profile':
      return (
        <ProfileScreen
          onBack={handlers.onHome}
          onLogoutStarted={handlers.onLogoutStarted}
          onLoggedOut={handlers.onLoggedOut}
        />
      );
    case 'home':
      return (
        <HomeScreen
          userName={handlers.userName}
          onSelectTask={handlers.onSelectTask}
          onSeeAll={handlers.onOpenDocuments}
          onOpenDocument={handlers.onOpenDocument}
        />
      );
    default:
      // Ảnh 47 — không bao giờ để màn trắng.
      return <NotFoundScreen onHome={handlers.onHome} />;
  }
}

export function AppShell(): React.ReactElement {
  const [session, setSessionState] = useState<Session | undefined>(() =>
    getSession(),
  );
  const [tab, setTab] = useState('home');
  /** Luồng nghiệp vụ đang mở chồng lên tab. `undefined` = đang ở tab. */
  const [flow, setFlow] = useState<
    | 'inbound'
    | 'outbound'
    | 'warranty'
    | 'warranty-scan'
    | 'warranty-intake'
    | 'warranty-case'
    | 'warranty-components'
    | 'nfc-assign'
    | 'nfc-scan'
    | 'nfc-lookup'
    | 'nfc-tags'
    | 'inventory-scan'
    | 'inventory-lookup'
    | 'session-confirmation'
    | undefined
  >();
  /**
   * Mã đang chờ tiếp nhận bảo hành.
   *
   * Máy quét / màn nhập tay **chỉ chuyển mã** — `resolve-code` do luồng tiếp
   * nhận gọi (mô tả 2026-09-06). Giữ ở đây để chuyển giữa hai màn.
   */
  const [warrantyCode, setWarrantyCode] = useState<
    { rawCode: string; tempOnly?: boolean } | undefined
  >();
  const [nfcAssignmentCode, setNfcAssignmentCode] = useState<string | undefined>();
  /** QR/Barcode vừa quét cho luồng kiểm tra tồn, không ghi vào WMS. */
  const [inventoryLookupCode, setInventoryLookupCode] = useState<string | undefined>();
  /**
   * Hồ sơ bảo hành đang mở chi tiết.
   *
   * 🔴 Thêm 2026-09-06: bấm một hồ sơ ở danh sách trước đây **không làm gì** —
   * `onOpenCase` chưa được nối. Nghĩa là toàn bộ màn chi tiết (chuyển trạng
   * thái, timeline, ảnh/video) **không tới được từ trong app**.
   */
  const [openCase, setOpenCase] = useState<WarrantyCase | undefined>();
  const [warrantyCaseCreated, setWarrantyCaseCreated] = useState(false);
  const [forcedRelogin, setForcedRelogin] = useState<string | undefined>();
  const [logoutInProgress, setLogoutInProgress] = useState(false);
  /**
   * Chứng từ đang mở chi tiết, chồng lên tab.
   *
   * 🔴 Thêm 2026-09-06 vì người dùng chỉ ra *"bên duyệt không xem được chi tiết
   * phiếu"*. Mở chồng chứ không đổi tab: bấm Quay lại phải về đúng chỗ đang
   * đứng, không phải về Trang chủ.
   */
  const [openDocument, setOpenDocument] = useState<
    { kind: 'inbound' | 'outbound'; id: string } | undefined
  >();

  /**
   * Nút Quay lại của Android — lùi **một lớp**, không đóng app.
   *
   * Trước 2026-09-06 không có handler nào nên Back **đóng hẳn app** ở mọi màn
   * (đo thật: đang xem danh sách bảo hành, bấm Back → về màn hình điện thoại).
   * Xem `useHardwareBack.ts` để biết hậu quả với phiếu đang điền dở.
   *
   * Thứ tự lùi khớp đúng với nút "Quay lại" trên màn hình. Chỉ ở tab gốc mới
   * trả `false` để Android đóng app như bình thường.
   */
  useHardwareBack(() => {
    // Trong 800ms xoá phiên, Back không được quay lại trang có dữ liệu cũ.
    if (logoutInProgress) {
      return true;
    }
    if (openDocument !== undefined) {
      setOpenDocument(undefined);
      return true;
    }
    // Xác nhận phiên chỉ được rời bằng hai CTA có chủ đích. Back không được
    // bỏ qua nó để nhảy thẳng vào Home sau một đăng nhập mới.
    if (flow === 'session-confirmation') {
      return true;
    }
    if (flow === 'warranty-components') {
      setFlow('warranty-case');
      return true;
    }
    if (flow === 'warranty-case') {
      setOpenCase(undefined);
      setWarrantyCaseCreated(false);
      setFlow('warranty');
      return true;
    }
    if (
      flow === 'warranty-scan' ||
      flow === 'warranty-intake'
    ) {
      setWarrantyCode(undefined);
      setFlow('warranty');
      return true;
    }
    if (flow === 'nfc-scan') {
      setFlow('nfc-assign');
      return true;
    }
    if (flow === 'inventory-scan' || flow === 'inventory-lookup') {
      setInventoryLookupCode(undefined);
      setFlow(undefined);
      return true;
    }
    if (flow !== undefined) {
      setFlow(undefined);
      return true;
    }
    if (tab !== 'home') {
      setTab('home');
      return true;
    }
    return false;
  });

  // 🔒 Mục 2 (2026-09-06): preflight tier NGAY khi app mở, không đợi tới lúc
  // vào màn quét. Hỏi sớm thì thủ kho biết ngay là bản cài sai, thay vì phát
  // hiện sau khi đã đi bộ tới kệ hàng và mở camera.
  useEffect(() => {
    if (getLastTierCheck().status === 'unchecked') {
      // Không bao giờ ném — mọi hỏng hóc đã thành một `TierCheckResult`.
      checkDeploymentTier().catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    const outcome = recoverAfterRestart();
    if (outcome.outcome === 'forced_relogin') {
      setForcedRelogin(outcome.reason);
      setSessionState(undefined);
    } else {
      setSessionState(getSession());
    }
    return subscribeSession(setSessionState);
  }, []);

  const handleLoggedIn = useCallback(() => {
    setForcedRelogin(undefined);
    setSessionState(getSession());
    setTab('home');
    setFlow('session-confirmation');
  }, []);

  const handleTask = useCallback((key: HomeTaskKey) => {
    if (key === 'lookup') {
      setInventoryLookupCode(undefined);
      setFlow('inventory-scan');
    } else if (key === 'inbound' || key === 'outbound' || key === 'warranty') {
      setFlow(key);
    } else if (key === 'nfc') {
      setNfcAssignmentCode(undefined);
      setFlow('nfc-assign');
    }
  }, []);

  const handleLoggedOut = useCallback(() => {
    setLogoutInProgress(false);
    setSessionState(undefined);
    setTab('home');
    setFlow(undefined);
    setOpenDocument(undefined);
    setOpenCase(undefined);
  }, []);

  const handleLogoutStarted = useCallback(() => {
    setLogoutInProgress(true);
  }, []);

  // Mở chi tiết hồ sơ ngay khi chọn — không đợi một bước bấm nữa.
  useEffect(() => {
    if (openCase !== undefined) {
      setFlow('warranty-case');
    }
  }, [openCase]);

  const handleOpenDocument = useCallback(
    (kind: 'inbound' | 'outbound', documentId: string) => {
      setOpenDocument({ kind, id: documentId });
    },
    [],
  );

  if (logoutInProgress) {
    return <LogoutProgressScreen />;
  }

  // Phiên dở dang: nói rõ vì sao phải đăng nhập lại thay vì ném thẳng vào form.
  if (session === undefined && forcedRelogin !== undefined) {
    return (
      <SessionExpiredScreen onRelogin={() => setForcedRelogin(undefined)} />
    );
  }

  if (session === undefined) {
    return <LoginScreen onSuccess={handleLoggedIn} />;
  }

  // Chi tiết chứng từ chồng lên tab — kiểm TRƯỚC luồng nghiệp vụ vì người dùng
  // mở nó từ tab Duyệt/Lịch sử, không phải từ giữa một phiên quét.
  if (openDocument !== undefined) {
    return (
      <DocumentDetailScreen
        kind={openDocument.kind}
        documentId={openDocument.id}
        onBack={() => setOpenDocument(undefined)}
      />
    );
  }

  if (flow === 'session-confirmation') {
    return (
      <SessionConfirmationScreen
        onContinue={() => setFlow(undefined)}
        onLoggedOut={handleLoggedOut}
      />
    );
  }

  // Luồng nghiệp vụ chiếm toàn màn: thanh tab bị ẩn để không ai bấm nhầm sang
  // tab khác giữa lúc đang quét dở một phiếu.
  if (flow === 'inbound') {
    return <InboundFlow onExit={() => setFlow(undefined)} />;
  }
  if (flow === 'outbound') {
    return <OutboundFlow onExit={() => setFlow(undefined)} />;
  }
  if (flow === 'nfc-assign') {
    return (
      <NfcAssignmentScreen
        initialCode={nfcAssignmentCode}
        onBack={() => {
          setNfcAssignmentCode(undefined);
          setFlow(undefined);
        }}
        onScanCode={() => setFlow('nfc-scan')}
        onManageTags={() => setFlow('nfc-tags')}
      />
    );
  }
  if (flow === 'nfc-scan') {
    return (
      <BusinessScanScreen
        title="Quét QR/SKU để gán NFC"
        documentName="Gán NFC"
        sessionLabel="Nhận diện hiện vật"
        scannedCount={0}
        doneLabel="Nhập mã"
        onScan={raw => {
          setNfcAssignmentCode(raw);
          setFlow('nfc-assign');
        }}
        onBack={() => setFlow('nfc-assign')}
        onDone={() => setFlow('nfc-assign')}
      />
    );
  }
  if (flow === 'nfc-lookup') {
    return <NfcLookupScreen onBack={() => setFlow(undefined)} />;
  }
  if (flow === 'nfc-tags') {
    return <NfcTagListScreen onBack={() => setFlow('nfc-assign')} />;
  }
  if (flow === 'inventory-scan') {
    return (
      <BusinessScanScreen
        title="Kiểm tra tồn"
        documentName="Tra cứu QR/Barcode"
        sessionLabel="Phiên tra cứu tồn"
        scannedCount={0}
        doneLabel="Nhập mã"
        onScan={raw => {
          // Không gọi WMS trên khung camera. Chuyển mã sang màn tra cứu để
          // camera tắt ngay, rồi cùng một lookup xử lý cả QR lẫn nhập tay.
          setInventoryLookupCode(raw);
          setFlow('inventory-lookup');
        }}
        onBack={() => setFlow(undefined)}
        onDone={() => setFlow('inventory-lookup')}
      />
    );
  }
  if (flow === 'inventory-lookup') {
    return (
      <LookupScreen
        initialCode={inventoryLookupCode}
        onHome={() => {
          setInventoryLookupCode(undefined);
          setFlow(undefined);
          setTab('home');
        }}
        onScan={() => setFlow('inventory-scan')}
        onScanAgain={() => setFlow('inventory-scan')}
        onLookupNfc={() => setFlow('nfc-lookup')}
      />
    );
  }
  if (flow === 'warranty') {
    return (
      <WarrantyListScreen
        // Mini App đưa cả nhập tay lẫn mất mã về cùng một form tiếp nhận.
        onBack={() => setFlow(undefined)}
        onScan={() => setFlow('warranty-scan')}
        onManualEntry={() => {
          setWarrantyCode({ rawCode: '', tempOnly: false });
          setFlow('warranty-intake');
        }}
        onCreateWithoutCode={() => {
          // "Mất tem/mã": KHÔNG gọi resolve, vào thẳng hồ sơ tạm.
          setWarrantyCode({ rawCode: '', tempOnly: true });
          setFlow('warranty-intake');
        }}
        onOpenCase={warrantyCase => {
          setWarrantyCaseCreated(false);
          setOpenCase(warrantyCase);
        }}
      />
    );
  }
  if (flow === 'warranty-case' && openCase !== undefined) {
    return (
      <WarrantyCaseDetail
        warrantyCase={openCase}
        created={warrantyCaseCreated}
        onIssueComponents={warrantyCase => {
          setOpenCase(warrantyCase);
          setWarrantyCaseCreated(false);
          setFlow('warranty-components');
        }}
        onBack={() => {
          setOpenCase(undefined);
          setWarrantyCaseCreated(false);
          setFlow('warranty');
        }}
      />
    );
  }
  if (flow === 'warranty-components' && openCase !== undefined) {
    return (
      <WarrantyComponentIssueFlow
        warrantyCase={openCase}
        onBack={() => setFlow('warranty-case')}
        onComplete={updatedCase => {
          setOpenCase(updatedCase);
          setFlow('warranty-case');
        }}
      />
    );
  }
  if (flow === 'warranty-scan') {
    return (
      <BusinessScanScreen
        title="Quét mã bảo hành"
        documentName="Tiếp nhận bảo hành"
        sessionLabel="Quét mã sản phẩm"
        scannedCount={0}
        doneLabel="Nhập tay"
        onScan={raw => {
          // Máy quét chỉ chuyển mã, KHÔNG gọi mạng — một lượt round-trip giữa
          // lúc quét sẽ làm nó khựng, và mất mạng thì mất luôn mã vừa quét.
          setWarrantyCode({ rawCode: raw, tempOnly: false });
          setFlow('warranty-intake');
        }}
        onBack={() => setFlow('warranty')}
        onDone={() => {
          setWarrantyCode({ rawCode: '', tempOnly: false });
          setFlow('warranty-intake');
        }}
      />
    );
  }
  if (flow === 'warranty-intake') {
    return (
      <WarrantyIntakeScreen
        initialCode={warrantyCode?.rawCode}
        initialTempOnly={warrantyCode?.tempOnly}
        onBack={() => setFlow('warranty')}
        onScan={() => setFlow('warranty-scan')}
        // 🔴 Sửa 2026-09-06. Bản trước **vứt bỏ** hồ sơ vừa tạo và quay về
        // màn hub. Chạy thật cho thấy hậu quả: danh sách chỉ lấy 25 hồ sơ đầu
        // (`per_page=25`, không có tham số sắp xếp) nên hồ sơ vừa tạo **không
        // xuất hiện** — thủ kho không còn đường nào mở lại thứ mình vừa lập,
        // không đính kèm ảnh được, không chuyển trạng thái được.
        //
        // Mini App gốc mở thẳng chi tiết:
        // `navigate('/warranty/' + response.case.id + '?created=1')`
        // (`src/pages/WarrantyReceivePage/index.tsx:239`). Làm y như vậy.
        onCreated={created => {
          setWarrantyCode(undefined);
          setWarrantyCaseCreated(true);
          setOpenCase(created);
        }}
      />
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.body}>
        {renderTab(tab, {
          onLoggedOut: handleLoggedOut,
          onLogoutStarted: handleLogoutStarted,
          onSelectTask: handleTask,
          onHome: () => setTab('home'),
          onOpenDocuments: () => setTab('history'),
          onOpenDocument: handleOpenDocument,
          onLookupNfc: () => setFlow('nfc-lookup'),
          onScanLookup: () => {
            setInventoryLookupCode(undefined);
            setFlow('inventory-scan');
          },
          userName: session.userId,
        })}
      </View>
      <BottomNav items={IMPLEMENTED_TABS} activeKey={tab} onSelect={setTab} />
    </View>
  );
}
