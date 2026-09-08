/**
 * Màn chẩn đoán nền móng.
 *
 * Đây KHÔNG phải màn nghiệp vụ và không thay thế tính năng nào. Mục đích duy
 * nhất: chứng minh các tầng nền của Prompt 2 chạy thật trên máy —
 * theme, navigation, cấu hình môi trường, storage, connectivity, API client.
 */

import React, { useCallback, useState } from 'react';
import { StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { Page } from '../../ui/Page';
import { Box } from '../../ui/Box';
import { Text } from '../../ui/Text';
import { Button } from '../../ui/Button';
import { BUILD_INFO, getCurrentEnvironment } from '../../config/env';
import { TIER_RESPONSE_HEADER } from '../../config/deployment';
import {
  HEALTH_PATH,
  checkDeploymentTier,
  getLastTierCheck,
  type TierCheckResult,
  type TierStatus,
} from '../../services/wms/tierCheck';

/** Nhãn tiếng Việt cho từng kết luận preflight. */
const TIER_STATUS_LABEL: Readonly<Record<TierStatus, string>> = {
  unchecked: 'chưa kiểm tra',
  matched: '✅ khớp — được phép quét và Post Receipt',
  mismatched: '🔴 SAI MÔI TRƯỜNG — đã khoá thao tác ghi',
  missing: '🔴 máy chủ không khai tier — đã khoá thao tác ghi',
  unreachable: '⚠️ chưa gọi được máy chủ',
};
import {
  canReachNetwork,
  useConnectivity,
} from '../../connectivity/connectivity';
import { apiClient } from '../../api/client';
import { USER_AGENT } from '../../api/userAgent';
import { AppError, messageForUser, toAppError } from '../../errors/AppError';
import { getDataLayer } from '../../sync/bootstrap';
import { useOutbox } from '../../sync/useOutbox';
import type { RootStackParamList } from '../../navigation/types';

type Navigation = NativeStackNavigationProp<RootStackParamList>;

const styles = StyleSheet.create({
  rowValue: {
    flexShrink: 1,
    textAlign: 'right',
  },
});

function Row({
  label,
  value,
}: {
  label: string;
  value: string;
}): React.ReactElement {
  return (
    <Box row justify="space-between" align="center" gap="md">
      <Text variant="caption" tone="muted">
        {label}
      </Text>
      <Text variant="caption" tone="strong" style={styles.rowValue}>
        {value}
      </Text>
    </Box>
  );
}

export function DiagnosticsScreen(): React.ReactElement {
  const navigation = useNavigation<Navigation>();
  const connectivity = useConnectivity();
  const dataLayer = getDataLayer();
  const outbox = useOutbox();

  /** Tóm tắt lần đồng bộ gần nhất cho người vận hành đọc. */
  const syncSummaryText = (() => {
    const run = outbox.lastRun;
    if (run === undefined) {
      return 'chưa chạy';
    }
    if (run.haltedReason !== undefined) {
      return run.haltedReason;
    }
    if (run.attempted === 0) {
      return 'không có bản ghi nào để gửi';
    }
    return (
      'gửi ' +
      String(run.attempted) +
      ', thành công ' +
      String(run.synced) +
      (run.results[0]?.reason === undefined
        ? ''
        : ' — ' + String(run.results[0].reason))
    );
  })();

  // 🔧 2026-09-06: bỏ hẳn nút đổi môi trường. Người dùng chốt mục 6 — *"Không
  // dùng menu/toggle đổi URL trong app"*. Môi trường nay là hằng số biên dịch
  // (`config/buildProfile.ts`), màn này chỉ **hiển thị**.
  const environment = getCurrentEnvironment();

  const [probeResult, setProbeResult] = useState<string>('chưa chạy');
  const [probing, setProbing] = useState(false);

  const [tier, setTier] = useState<TierCheckResult>(() => getLastTierCheck());
  const [checkingTier, setCheckingTier] = useState(false);

  const runTierCheck = useCallback(() => {
    setCheckingTier(true);
    // `checkDeploymentTier` không bao giờ ném — mọi hỏng hóc đã thành một
    // `TierCheckResult`. `catch` ở đây chỉ để chắc chắn cờ loading được gỡ.
    checkDeploymentTier()
      .then(setTier)
      .catch(() => undefined)
      .finally(() => setCheckingTier(false));
  }, []);

  /**
   * Phép thử **Cloudflare** — quản trị hạ tầng yêu cầu kiểm chứng bằng bản
   * Android thật (2026-09-05).
   *
   * Gọi một endpoint **được bảo vệ**, **không** kèm token. Kết quả phân biệt
   * dứt khoát hai thứ mà thủ kho không thể tự phân biệt:
   *
   * | Kết quả | Nghĩa là |
   * |---|---|
   * | `401` | ✅ **Qua được Cloudflare** — request tới tận ứng dụng, ứng dụng từ chối vì chưa đăng nhập. Đây là kết quả MONG ĐỢI. |
   * | `403` + `Cf-Mitigated` | ❌ **Bị Cloudflare chặn** — request chưa từng tới ứng dụng. Allowlist chưa ăn. |
   *
   * GET và không gửi credential ⇒ không chạm lệnh cấm mutation của
   * `GATE_01 §11`, và không đọc dữ liệu nghiệp vụ nào.
   */
  const runProbe = useCallback(async () => {
    setProbing(true);
    // 🔧 Sửa 2026-09-05: bản trước luôn ghi "Qua Cloudflare" bất kể môi trường
    // nào đang chọn — probe tới `127.0.0.1` cũng báo "qua được Cloudflare".
    // Sai lệch đúng loại làm mất hàng giờ dò lỗi nhầm chỗ.
    const edge = getCurrentEnvironment().behindEdgeProxy;
    const reachedApp = edge
      ? '✅ Qua được Cloudflare, tới tận ứng dụng'
      : '✅ Tới được ứng dụng (host này KHÔNG qua Cloudflare)';
    try {
      const response = await apiClient.get<unknown>(
        '/api/v1/mini-app/inbound-documents',
        { query: { per_page: 1 }, timeoutMs: 8000 },
      );
      // 200 nghĩa là còn phiên đăng nhập hợp lệ — vẫn chứng minh tới được ứng dụng.
      setProbeResult(
        reachedApp +
          ' — HTTP ' +
          String(response.status) +
          '. UA: ' +
          USER_AGENT,
      );
    } catch (error) {
      const appError = toAppError(error);
      if (appError.kind === 'auth') {
        setProbeResult(
          reachedApp +
            ' — HTTP 401 (chưa đăng nhập, đúng như mong đợi). UA: ' +
            USER_AGENT,
        );
      } else if (appError.kind === 'blocked_by_edge') {
        setProbeResult(
          '❌ BỊ CHẶN Ở LỚP BIÊN — request chưa tới ứng dụng. UA: ' + USER_AGENT,
        );
      } else {
        setProbeResult(appError.kind + ' — ' + messageForUser(appError));
      }
    } finally {
      setProbing(false);
    }
  }, []);

  /** Chứng minh chốt chặn mutation của GATE_01 §11 rule 4 đang có hiệu lực. */
  const [guardResult, setGuardResult] = useState<string>('chưa kiểm tra');
  const checkMutationGuard = useCallback(async () => {
    try {
      await apiClient.request({ method: 'POST', path: '/', body: {} });
      setGuardResult('❌ KHÔNG bị chặn — sai, phải báo ngay');
    } catch (error) {
      const appError = toAppError(error);
      setGuardResult(
        appError instanceof AppError && appError.kind === 'blocked_by_gate'
          ? '✅ Đã chặn đúng'
          : '⚠️ Chặn vì lý do khác: ' + appError.kind,
      );
    }
  }, []);

  return (
    <Page
      title="Chẩn đoán nền móng"
      subtitle="Màn kiểm tra tầng nền của Prompt 2 — không phải màn nghiệp vụ"
    >
      <Box card padding="lg" gap="md">
        <Text variant="cardTitle" tone="strong">
          Bản dựng
        </Text>
        <Row label="Application ID" value={BUILD_INFO.applicationId} />
        <Row label="Chế độ" value={BUILD_INFO.isDebug ? 'debug' : 'release'} />
      </Box>

      <Box card padding="lg" gap="md">
        <Text variant="cardTitle" tone="strong">
          Môi trường
        </Text>
        <Row label="Đang chọn" value={environment.label} />
        <Row
          label="Base URL"
          value={
            environment.apiBaseUrl === ''
              ? '(chưa cấu hình)'
              : environment.apiBaseUrl
          }
        />
        <Row
          label="Lớp môi trường đã xác minh"
          value={environment.environmentClassVerified ? 'có' : 'CHƯA'}
        />
        <Row
          label="GATE_WMS_API_INTEGRATION"
          value={environment.wmsGateApproved ? 'PASS' : 'chưa PASS'}
        />

        <Row label="Build profile" value={BUILD_INFO.profile} />
        <Text variant="caption" tone="muted">
          Môi trường cố định theo bản dựng. Muốn đổi thì dựng lại APK với build
          profile khác — không đổi được từ trong app.
        </Text>
      </Box>

      <Box card padding="lg" gap="md">
        <Text variant="cardTitle" tone="strong">
          Preflight tier
        </Text>
        <Row label="Kỳ vọng" value={environment.expectedTier} />
        <Row
          label="Máy chủ khai"
          value={tier.reported ?? '(chưa có header)'}
        />
        <Row label="Kết luận" value={TIER_STATUS_LABEL[tier.status]} />
        <Text variant="caption" tone="muted">
          Nguồn duy nhất có thẩm quyền là header {TIER_RESPONSE_HEADER} của{' '}
          {HEALTH_PATH}. Chỉ trạng thái “khớp” mới cho quét và Post Receipt.
        </Text>
        <Button
          label="Kiểm tra lại tier"
          variant="secondary"
          loading={checkingTier}
          disabled={checkingTier}
          onPress={runTierCheck}
        />
      </Box>

      <Box card padding="lg" gap="md">
        <Text variant="cardTitle" tone="strong">
          Kết nối mạng
        </Text>
        <Row label="Loại" value={connectivity.type} />
        <Row
          label="Đã kết nối"
          value={connectivity.isConnected ? 'có' : 'không'}
        />
        <Row
          label="Ra được Internet"
          value={
            connectivity.isInternetReachable === null
              ? 'chưa xác định'
              : connectivity.isInternetReachable
              ? 'có'
              : 'không'
          }
        />
        <Row
          label="Gửi được yêu cầu"
          value={canReachNetwork(connectivity) ? 'có' : 'không'}
        />
      </Box>

      <Box card padding="lg" gap="md">
        <Text variant="cardTitle" tone="strong">
          Hàng đợi offline
        </Text>
        <Row label="Schema dữ liệu" value={'v' + String(dataLayer.schemaTo)} />
        <Row
          label="Bản ghi kẹt lúc mở app"
          value={String(dataLayer.recoveredOnStart)}
        />
        <Row label="Tổng bản ghi" value={String(outbox.summary.total)} />
        <Row label="Chờ gửi" value={String(outbox.summary.pending)} />
        <Row label="Đã gửi" value={String(outbox.summary.synced)} />
        <Row label="Lỗi nghiệp vụ" value={String(outbox.summary.failed)} />
        <Row
          label="Cần người dùng xử lý"
          value={
            String(outbox.summary.needsAttention) +
            ' (xung đột ' +
            String(outbox.summary.conflict) +
            ', chưa rõ ' +
            String(outbox.summary.unknown) +
            ')'
          }
        />
        <Row label="Lần đồng bộ gần nhất" value={syncSummaryText} />

        <Button
          label="Thêm bản ghi thử vào hàng đợi"
          variant="secondary"
          onPress={() =>
            outbox.enqueue('DIAGNOSTIC_PROBE', { at: new Date().toISOString() })
          }
        />
        <Button
          label="Đồng bộ ngay"
          onPress={() => {
            // `sync()` tự bắt lỗi từng bản ghi; `catch` ở đây chỉ để không
            // tạo unhandled rejection nếu chính nó hỏng.
            outbox.sync().catch(() => undefined);
          }}
          loading={outbox.isSyncing}
        />
        <Button
          label="Xoá sạch hàng đợi thử"
          variant="secondary"
          onPress={outbox.clear}
        />
      </Box>

      <Box card padding="lg" gap="md">
        <Text variant="cardTitle" tone="strong">
          API client
        </Text>
        <Row label="Kết quả GET" value={probeResult} />
        <Button
          label="Gửi thử GET /"
          onPress={runProbe}
          loading={probing}
          variant="secondary"
        />
        <Row label="Chốt chặn mutation" value={guardResult} />
        <Button
          label="Kiểm tra chốt chặn POST"
          onPress={checkMutationGuard}
          variant="secondary"
        />
      </Box>

      <Button
        label="Kiểm tra đầu quét →"
        onPress={() => navigation.navigate('ScanTest')}
      />
      <Button
        label="Quét bằng camera →"
        onPress={() => navigation.navigate('CameraScan')}
      />
    </Page>
  );
}
