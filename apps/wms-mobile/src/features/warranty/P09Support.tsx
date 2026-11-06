import React, { useEffect, useReducer } from 'react';
import { P09_RELEASE, p09DevReadEnabled } from '../../config/p09Release';
import { messageForUser, type AppError } from '../../errors/AppError';
import { StatusScreen } from '../auth/StatusScreen';
import { Banner } from '../../ui/Banner';
import { Button } from '../../ui/Button';
import { Box } from '../../ui/Box';
import { Text } from '../../ui/Text';
import { useP09Command } from './useP09Command';
import type { P09Case, P09Service } from '../../services/wms/p09Warranty';
import type { createP09Pager } from './p09Controller';

// No child mounts (including catalogue/geo hooks) while activation is OFF.
export function P09Boundary({
  children,
  onBack,
}: {
  children: React.ReactNode;
  onBack: () => void;
}) {
  return P09_RELEASE.productionEnabled || p09DevReadEnabled() ? (
    <>{children}</>
  ) : (
    <StatusScreen
      title="Bảo hành đang chờ kích hoạt"
      message="Chức năng đang chờ kiểm thử và triển khai được xác nhận."
      primaryLabel="Quay lại"
      onPrimary={onBack}
    />
  );
}
export function P09Error({
  error,
  onBack,
  title = 'Chưa hoàn tất thao tác',
}: {
  error: AppError;
  onBack: () => void;
  title?: string;
}) {
  if (
    error.kind === 'auth' ||
    (error.kind === 'http' && [401, 403].includes(error.status ?? 0))
  )
    return (
      <StatusScreen
        title={
          error.status === 403
            ? 'Bạn không có quyền thực hiện thao tác này'
            : 'Phiên đăng nhập cần được xác nhận lại'
        }
        message="Dữ liệu chưa gửi không được tự động gửi lại."
        primaryLabel="Quay lại"
        onPrimary={onBack}
      />
    );
  return <Banner tone="danger" title={title} message={messageForUser(error)} />;
}
export function P09Recovery({
  service,
  caseId,
  onOpen,
  onBack,
}: {
  service: P09Service;
  caseId?: string;
  onOpen?: (c: P09Case) => void;
  onBack: () => void;
}) {
  const s = useP09Command(service);
  if (s.phase === 'idle') return null;
  const ownerCaseId =
    s.command?.operation === 'UPDATE'
      ? s.command.target
      : s.receipt?.warranty_case_id;
  if (
    caseId &&
    s.command &&
    String(ownerCaseId ?? '').toLowerCase() !== caseId.toLowerCase()
  ) {
    const requiresRecovery =
      ['sending', 'unknown', 'saved-unloaded'].includes(s.phase) ||
      (s.phase === 'failed' && s.receipt?.may_create_new_request !== true);
    if (!requiresRecovery) return null;
    return (
      <Box card padding="lg" gap="md">
        <Text variant="cardTitle">Có yêu cầu của hồ sơ khác cần đối chiếu</Text>
        <Text>
          Yêu cầu được giữ theo hồ sơ gốc; không dùng kết quả đó cho hồ sơ đang
          xem.
        </Text>
        {s.phase === 'unknown' ? (
          <Button
            label="Đối chiếu yêu cầu gốc"
            disabled={s.busy}
            onPress={() => {
              s.owner.reconcile().catch(() => undefined);
            }}
          />
        ) : null}
        {s.phase === 'saved-unloaded' ? (
          <Button
            label="Tải lại hồ sơ đã lưu"
            disabled={s.busy}
            onPress={() => {
              s.owner.retryDetail().catch(() => undefined);
            }}
          />
        ) : null}
      </Box>
    );
  }

  const title = {
    sending: 'Đang gửi yêu cầu',
    unknown: 'Chưa xác định kết quả',
    failed: 'Yêu cầu bị từ chối',
    'saved-unloaded': 'Đã lưu, chưa tải lại hồ sơ',
    succeeded:
      s.detail &&
      (s.detail.version !== s.receipt?.version ||
        s.detail.status !== s.receipt?.status)
        ? 'Yêu cầu đã được xác nhận; cần đối chiếu phiên bản hồ sơ'
        : s.command?.operation === 'CREATE'
        ? 'Đã tạo hồ sơ bảo hành'
        : 'Đã cập nhật kết quả',
  }[s.phase];
  return (
    <Box card padding="lg" gap="md">
      <Text variant="cardTitle">{title}</Text>
      {s.error ? <P09Error error={s.error} onBack={onBack} /> : null}
      {s.receipt?.error_code ? <Text>{s.receipt.error_code}</Text> : null}
      {s.phase === 'unknown' ? (
        <>
          <Text>
            Giữ nguyên yêu cầu. Đối chiếu kết quả trước thao tác ghi tiếp theo.
          </Text>
          <Button
            label="Đối chiếu kết quả"
            disabled={s.busy || !s.command}
            onPress={() => {
              s.owner.reconcile().catch(() => undefined);
            }}
          />
          {!s.command ? (
            <Text>
              Yêu cầu thuộc ngữ cảnh phiên trước; không thể gửi bù từ phiên hiện
              tại.
            </Text>
          ) : null}
        </>
      ) : null}
      {s.phase === 'saved-unloaded' ? (
        <Button
          label="Tải lại hồ sơ đã lưu"
          disabled={s.busy}
          onPress={() => {
            s.owner.retryDetail().catch(() => undefined);
          }}
        />
      ) : null}
      {s.phase === 'failed' ? (
        <Text>
          {s.receipt?.may_create_new_request
            ? 'Kiểm tra lại dữ liệu và phiên bản hồ sơ, sau đó xác nhận thao tác mới.'
            : 'Yêu cầu này chưa cho phép tạo thao tác mới.'}
        </Text>
      ) : null}
      {s.phase === 'succeeded' && s.detail && onOpen ? (
        <Button label="Mở hồ sơ đã lưu" onPress={() => onOpen(s.detail!)} />
      ) : null}
      <Button
        label="Về danh sách bảo hành"
        variant="secondary"
        onPress={onBack}
      />
    </Box>
  );
}
export function useP09Pager<T>(pager: ReturnType<typeof createP09Pager<T>>) {
  const [, refresh] = useReducer(n => n + 1, 0);
  useEffect(() => {
    const unsubscribe = pager.subscribe(refresh);
    if (!pager.snapshot().meta) pager.load().catch(() => undefined);
    return unsubscribe;
  }, [pager]);
  return pager.snapshot();
}
export function P09PageFooter<T>({
  pager,
  onBack,
  showError = true,
}: {
  pager: ReturnType<typeof createP09Pager<T>>;
  onBack: () => void;
  showError?: boolean;
}) {
  const s = useP09Pager(pager);
  return (
    <>
      {s.loading ? <Text>Đang tải…</Text> : null}
      {s.error && showError ? (
        <>
          <P09Error error={s.error} onBack={onBack} />
          <Button
            label="Thử tải lại"
            disabled={s.loading}
            onPress={() => {
              pager.load(!!s.meta).catch(() => undefined);
            }}
          />
        </>
      ) : null}
      {s.meta?.hasMore ? (
        <Button
          label="Tải thêm"
          variant="secondary"
          disabled={s.loading}
          onPress={() => {
            pager.load(true).catch(() => undefined);
          }}
        />
      ) : null}
    </>
  );
}
