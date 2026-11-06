import {HN_UI} from '../../theme/uiKitV3';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';
import { Text } from '../../ui/Text';
import { Button } from '../../ui/Button';
import { Dialog } from '../../ui/Dialog';
import { HnHomeIcon } from '../../ui/HnHomeIcon';
import { useHardwareBack } from '../../app/useHardwareBack';
import type { OwnerDocumentTarget } from '../../app/ownerNavigation';
import type { Context } from '../documents/p12/service';
import {
  createBeReleasedReads,
  type BeReleasedReads,
} from '../../services/wms/beReleasedReads';
import {
  webQueueQuery,
  type WebQueuePage,
  type WebQueueQuery,
} from '../../services/wms/p13WebQueue';
import { readAssert } from '../../services/wms/explicitReadFields';
import { useBeRead } from '../releasedReads/useBeRead';
import { availabilityText, fieldText } from '../releasedReads/ReadValue';
import { captureSessionScope, isSessionScopeCurrent } from '../../auth/session';
import { P13NotificationFrame, type P13ScrollSnapshot } from './P13NotificationFrame';
import {
  P13WebBanner,
  P13QueueSourceTabs,
  P13WebQueueRow,
  P13WebQueueDetail,
} from './P13WebQueuePresentation';

const styles = StyleSheet.create({
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingTop: 4,
  },
  toolbarText: { fontSize: 15, lineHeight: 22.5, color: HN_UI.textMuted, flex: 1 },
  textButton: {
    borderWidth: 0,
    backgroundColor: 'transparent',
    paddingHorizontal: 8,
  },
  primary: { minHeight: 54, borderRadius: 11, backgroundColor: HN_UI.primary },
  primaryText: { fontSize: 14, lineHeight: 20 },
  secondary: { minHeight: 54, borderRadius: 11, borderColor: HN_UI.border },
  secondaryText: { fontSize: 16, lineHeight: 24, color: HN_UI.textLink },
  end: {
    fontSize: 15,
    lineHeight: 22.5,
    textAlign: 'center',
    color: HN_UI.textMuted,
    marginVertical: 20,
  },
  empty: {
    fontSize: 18,
    lineHeight: 27,
    textAlign: 'center',
    paddingVertical: 32,
    color: HN_UI.textMuted,
  },
  coverage: { fontSize: 14, lineHeight: 21, color: HN_UI.textMuted, marginTop: 16 },
  form: { gap: 10 },
});
export function P13WebQueueScreen({
  context,
  onBack,
  onOpenDocument,
  service: injected,
  footer,
}: {
  context: Context;
  onBack(): void;
  onOpenDocument(target: OwnerDocumentTarget): void;
  service?: BeReleasedReads;
  footer?: React.ReactNode;
}) {
  const current = useRef(context);
  current.current = context;
  const service = useMemo(
    () => injected ?? createBeReleasedReads(() => current.current),
    [injected],
  );
  const [applied, setApplied] = useState<WebQueueQuery>(() => webQueueQuery()),
    [selection, setSelection] = useState<{ scope: string; key: string }>();
  const [webGuidance, setWebGuidance] = useState(false);
  const filterScope = useRef(captureSessionScope());
  const read = useBeRead<WebQueuePage>(service, signal =>
    service.webQueue(
      isSessionScopeCurrent(filterScope.current) ? applied : webQueueQuery(),
      signal,
    ),
  );
  useEffect(() => {
    if (isSessionScopeCurrent(filterScope.current)) return;
    filterScope.current = captureSessionScope();
    setApplied(webQueueQuery());
    setSelection(undefined);
    setWebGuidance(false);
  }, [read.scope]);
  const data = read.data,
    selected =
      selection?.scope === read.scope
        ? data?.items.find(i => i.key === selection.key)
        : undefined;
  const listScroll = useRef(0);
  const frameScroll = useRef<P13ScrollSnapshot>(null);
  const back = () => {
    if (webGuidance) setWebGuidance(false);
    else if (selection) setSelection(undefined);
    else {
      read.cancel();
      onBack();
    }
  };
  useHardwareBack(() => {
    back();
    return true;
  });
  function load(more = false, input = applied) {
    if (read.busy) return;
    void read.run(async signal => {
      const q = webQueueQuery({
        ...input,
        cursor: more ? data?.nextCursor : 'start',
      });
      const next = await service.webQueue(q, signal);
      if (!more || !data) return next;
      readAssert(
        !next.items.some(i => data.items.some(old => old.key === i.key)) &&
          data.items.length + next.items.length <= next.total,
        'WEB_QUEUE_RESTART_REQUIRED',
      );
      return { ...next, items: [...data.items, ...next.items] };
    });
  }
  function apply(input: Partial<WebQueueQuery>) {
    if (read.busy) return;
    void read.run(async signal => {
      const normalized = webQueueQuery(input);
      const page = await service.webQueue(normalized, signal);
      setApplied(normalized);
      listScroll.current = 0;
      return page;
    });
  }
  const restart = [
    'DOCUMENTS_CURSOR_CONTEXT_CHANGED',
    'DOCUMENTS_CURSOR_EXPIRED',
    'DOCUMENTS_CURSOR_INVALID',
    'WEB_QUEUE_RESTART_REQUIRED',
  ].includes(read.error?.code ?? '');
  const warehouseName = selected
    ? context.user?.available_warehouses?.find(
        w => w.warehouse_id === selected.target.warehouseId,
      )?.name
    : undefined;
  const statusField = selected?.status;
  const statusKey =
    selected && statusField?.supplied
      ? selected.target.kind.toUpperCase() + ':' + statusField.value
      : undefined;
  const selectedStatus = statusKey
    ? data?.statuses.find(s => s.value === statusKey)?.label ??
      'Chưa xác minh nhãn trạng thái'
    : statusField && !statusField.supplied
    ? availabilityText(statusField.status)
    : '';
  return (
    <>
      <P13NotificationFrame
        scrollSnapshot={frameScroll}
        detail={!!selected}
        title={selected ? 'Chi tiết chờ xử lý Web' : 'Chờ xử lý trên Web'}
        panelId={selected ? 'P13.S04' : 'P13.S03'}
        restoreKey={
          read.scope +
          (selected
            ? ':detail:' + selected.key
            : ':list:' + JSON.stringify(applied))
        }
        initialScrollY={selected ? 0 : listScroll.current}
        onScrollPositionChange={y => {
          if (!selected) listScroll.current = y;
        }}
        onBack={back}
        busy={false}
        footer={footer}
        actions={
          selected ? (
            <>
              <Button
                label="Xem chứng từ"
                accessibilityLabel="Xem chứng từ liên quan"
                leading={<HnHomeIcon name="document" size={24} color={HN_UI.onBrand} />}
                style={styles.primary}
                labelStyle={styles.primaryText}
                onPress={() => {
                  if (
                    selection?.scope === service.scopeKey() &&
                    isSessionScopeCurrent(filterScope.current)
                  )
                    onOpenDocument(selected.target);
                }}
              />
              <Button
                label="Hướng dẫn xử lý trên Web"
                variant="secondary"
                style={styles.secondary}
                labelStyle={styles.secondaryText}
                onPress={() => setWebGuidance(true)}
              />
            </>
          ) : undefined
        }
      >
        {selected ? (
          <>
            <P13WebQueueDetail
              row={selected}
              warehouseName={warehouseName}
              statusLabel={selectedStatus}
              onOpenProducts={()=>{if(selection?.scope===service.scopeKey()&&isSessionScopeCurrent(filterScope.current))onOpenDocument(selected.target);}}
            />
          </>
        ) : (
          <>
            <P13WebBanner />
            <P13QueueSourceTabs
              source={String(applied.source)}
              page={data}
              busy={read.busy}
              onSelect={value => {
                if (value !== applied.source)
                  apply({ ...applied, source: value, status: 'ALL', cursor: 'start' });
              }}
            />
            {data?.items.map(row => (
              <P13WebQueueRow
                key={row.key}
                row={row}
                busy={read.busy}
                onPress={() => {
                  listScroll.current = frameScroll.current?.read() ?? listScroll.current;
                  setSelection({ scope: read.scope, key: row.key });
                }}
              />
            ))}
            {data?.total === 0 && !read.busy ? (
              <Text style={styles.empty}>
                Không có chứng từ trong bộ lọc này.
              </Text>
            ) : null}
            {data?.nextCursor ? (
              <Button
                label="Tải thêm chứng từ"
                disabled={read.busy}
                onPress={() => load(true)}
              />
            ) : null}
            {read.error ? (
              <Button
                label={restart ? 'Đọc lại từ đầu, giữ bộ lọc' : 'Thử lại'}
                disabled={read.busy}
                variant="secondary"
                onPress={() => load()}
              />
            ) : null}
          </>
        )}
        {read.busy ? (
          <Text accessibilityLiveRegion="polite" style={styles.end}>
            Đang đọc dữ liệu…
          </Text>
        ) : null}
        {read.error ? (
          <Text tone="danger" accessibilityLiveRegion="polite">
            {read.error.message}
          </Text>
        ) : null}
      </P13NotificationFrame>
      {webGuidance ? (
        <Dialog
          visible
          title="Xử lý chứng từ trên Web"
          message={
            'Mở hệ thống Web được đơn vị cấp và tìm chứng từ ' +
            (selected ? fieldText(selected.number) : '') +
            '. Kiểm tra trạng thái và quyền xử lý tại đó. Chưa có URL Web được cấu hình để mở từ App.'
          }
          dismissOnBackdrop={false}
          onDismiss={() => setWebGuidance(false)}
          footer={<Button label="Đóng" onPress={() => setWebGuidance(false)} />}
        />
      ) : null}
    </>
  );
}
