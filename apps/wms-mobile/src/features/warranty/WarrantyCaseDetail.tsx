import {HN_UI} from '../../theme/uiKitV3';
import { ScannerNativeText as NativeText } from '../../ui/ScannerNativeText';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { toAppError, type AppError } from '../../errors/AppError';
import {
  lockedP09Service,
  p09CommandReviewsCase,
  type P09Service,
  type P09Case,
  type P09Update,
  type P09Attachment,
  type P09Component,
  type P09Handover,
} from '../../services/wms/p09Warranty';
import type { WarrantyCase } from '../../services/wms/types';
import {
  Pressable,
  Platform,
  View,
  type ImageSourcePropType,
} from 'react-native';
import { P09Dialog as Dialog } from './P09Presentation';
import { useHardwareBack } from '../../app/useHardwareBack';
import {
  P09Frame,
  P09Action,
  P09Card,
  P09Value,
  P09Hero,
  P09Photo,
  P09Status,
  p09,
  p09Date,
  p09Status,
  p09ActorName,
} from './P09Presentation';
import { useP09Command } from './useP09Command';
import { canEnterP19 } from './p19/p19Entry';
import { useWarrantyTransition } from './useWarrantyTransition';
import { P18HandoverScreen } from './P18HandoverScreen';
import { vietnamDateKey } from '../../time/vietnamTime';
import { useAttachments } from './useAttachments';
import { createP09Pager } from './p09Controller';
import {
  saveP12Binary,
  cancelP12Save,
  p12SaveMessage,
  p12SaveTitle,
} from '../../native/p12Files';
import { captureSessionScope, isSessionScopeCurrent } from '../../auth/session';
import {
  P09Error,
  P09Recovery,
  P09PageFooter,
  useP09Pager,
} from './P09Support';

import { Box } from '../../ui/Box';
import { Text } from '../../ui/Text';
import { Button } from '../../ui/Button';
import { Input } from '../../ui/Input';
import {
  nextStatuses,
  requiresNote,
  requiresConfirmedDefect,
} from './warrantyPolicy';

export function stepForStatus(status?: string) {
  return Math.max(
    0,
    ['RECEIVED', 'CHECKING', 'REPAIRING', 'COMPLETED', 'RETURNED'].indexOf(
      status ?? '',
    ),
  ) > 2
    ? 3
    : Math.max(0, ['RECEIVED', 'CHECKING', 'REPAIRING'].indexOf(status ?? ''));
}
export interface WarrantyCaseDetailProps {
  warrantyCase: WarrantyCase;
  onBack: () => void;
  created?: boolean;
  /** Same-scope navigation intent after a verified receipt; not case data. */
  initialTab?: 'info' | 'parts' | 'events';
  service?: P09Service;
  productImage?: ImageSourcePropType;
  /** Already verified P20 owner projections, keyed by exact POSTED document ID. Absent means unknown quantity. */
  componentPresentation?: Readonly<
    Record<
      string,
      {
        number: string;
        postedAt: string;
        lines: readonly { code: string; name: string; quantity: number }[];
      }
    >
  >;
  onIssueComponents?: (c: WarrantyCase) => void;
  onOpenComponent?: (link: P09Component) => void;
  onDownloadAttachment?: (
    file: P09Attachment,
    bytes: Blob,
  ) => void | Promise<void>;
}
export function WarrantyCaseDetail({
  service = lockedP09Service,
  ...props
}: WarrantyCaseDetailProps) {
  const [current, setCurrent] = useState<P09Case>(),
    [error, setError] = useState<AppError>(),
    [reload, setReload] = useState(0);
  const recovery = useP09Command(service),
    priorPhase = useRef(recovery.phase);
  useEffect(() => {
    const was = priorPhase.current;
    priorPhase.current = recovery.phase;
    if (
      was === 'saved-unloaded' &&
      recovery.phase === 'succeeded' &&
      recovery.detail?.warranty_case_id === props.warrantyCase.warranty_case_id
    ) {
      setCurrent(recovery.detail);
      setError(undefined);
    }
  }, [recovery.phase, recovery.detail, props.warrantyCase.warranty_case_id]);
  const context = service.contextKey();
  useEffect(() => {
    let active = true;
    setCurrent(undefined);
    setError(undefined);
    service
      .detail(props.warrantyCase.warranty_case_id)
      .then(c => {
        if (active && service.contextKey() === context) setCurrent(c);
      })
      .catch(e => {
        if (active && service.contextKey() === context) setError(toAppError(e));
      });
    return () => {
      active = false;
    };
  }, [service, props.warrantyCase.warranty_case_id, reload, context]);
  if (!current)
    return (
      <P09Frame panel={3} onBack={props.onBack}>
        <P09Recovery
          service={service}
          caseId={props.warrantyCase.warranty_case_id}
          onBack={props.onBack}
          onOpen={setCurrent}
        />
        {error ? (
          <>
            <P09Error error={error} onBack={props.onBack} />
            <Button
              label="Tải lại hồ sơ"
              onPress={() => setReload(n => n + 1)}
            />
          </>
        ) : (
          <Text>Đang tải hồ sơ…</Text>
        )}
      </P09Frame>
    );
  return (
    <CanonicalDetail
      key={context + current.warranty_case_id}
      {...props}
      current={current}
      service={service}
      onReload={() => setReload(n => n + 1)}
      onCurrent={setCurrent}
    />
  );
}
function CanonicalDetail({
  current,
  service,
  onCurrent,
  onReload,
  ...props
}: WarrantyCaseDetailProps & {
  current: P09Case;
  service: P09Service;
  onCurrent: (c: P09Case) => void;
  onReload: () => void;
}) {
  const command = useWarrantyTransition(current, service);
  const retained = useMemo(
    () => detailDraft(service, current.warranty_case_id),
    [service, current.warranty_case_id],
  );
  const [tab, setTab] = useState<'info' | 'parts' | 'events'>(
      props.initialTab ?? retained.tab,
    ),
    [updateOpen, setUpdateOpen] = useState(false),
    [handoverOpen, setHandoverOpen] = useState(false),
    [showResult, setShowResult] = useState(false),
    [targetStatus, setTargetStatus] = useState<string>('');
  const [note, setNote] = useState(retained.note),
    [diagnosis, setDiagnosis] = useState(
      retained.diagnosis || current.confirmed_defect || '',
    ),
    [error, setError] = useState<AppError>();
  const [handoverDraft, setHandoverDraft] = useState<P09Handover>(
    retained.handover ?? {
      receiver: '',
      handover_date: vietnamDateKey(Date.now()) ?? '',
      handover_checked: false,
      note: '',
    },
  );
  useEffect(() => {
    retained.handover = handoverDraft;
  }, [retained, handoverDraft]);
  useEffect(() => {
    retained.note = note;
    retained.diagnosis = diagnosis;
  }, [retained, note, diagnosis]);
  useEffect(() => {
    retained.tab = tab;
  }, [retained, tab]);
  const mounted = useRef(true);
  const fileLatch = useRef(false);
  const [fileBusy, setFileBusy] = useState(false),
    [fileNotice, setFileNotice] = useState(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (fileLatch.current) cancelP12Save();
    };
  }, []);
  const pagers = useMemo(
    () => ({
      events: createP09Pager(
        p =>
          service.events(current.warranty_case_id, {
            sort: 'event_at_asc',
            ...p,
          }),
        r => r.event_id,
        service.contextKey,
      ),
      components: createP09Pager(
        p => service.components(current.warranty_case_id, p),
        r => r.component_issue_document_id,
        service.contextKey,
      ),
      files: createP09Pager(
        p => service.attachments(current.warranty_case_id, p),
        r => r.attachment_id,
        service.contextKey,
      ),
    }),
    [service, current.warranty_case_id],
  );
  const events = useP09Pager(pagers.events),
    components = useP09Pager(pagers.components),
    files = useP09Pager(pagers.files);
  const p18Attachments = useAttachments(current.warranty_case_id);
  const canUploadP18 = (() => {
    try {
      const scope = service.scope();
      return (
        !current.free_text_redacted &&
        scope.permissions.includes('documents.read') &&
        (scope.permissions.includes('warranty.view') ||
          scope.permissions.includes('warranty.manage'))
      );
    } catch {
      return false;
    }
  })();
  useEffect(() => {
    if (
      command.phase === 'succeeded' &&
      command.detail?.warranty_case_id === current.warranty_case_id &&
      command.detail.version > current.version
    ) {
      onCurrent(command.detail);
      setNote('');
      setDiagnosis('');
      pagers.events.load().catch(() => undefined);
    }
  }, [command.phase, command.detail, current, onCurrent, pagers]);
  const blocked =
    !service.canWrite() ||
    command.busy ||
    !(
      ['idle', 'succeeded'].includes(command.phase) ||
      (command.phase === 'failed' &&
        command.receipt?.may_create_new_request === true)
    ) ||
    !service.scope().permissions.includes('warranty.manage');
  const resultReady =
    command.phase === 'succeeded' &&
    command.command?.operation === 'UPDATE' &&
    command.command.target === current.warranty_case_id &&
    command.detail?.warranty_case_id === current.warranty_case_id &&
    command.receipt?.warranty_case_id === current.warranty_case_id &&
    command.receipt.version === command.detail.version &&
    command.receipt.status === command.detail.status &&
    command.detail.version === current.version;
  const issueContext = service.contextKey();
  const canOpenP19 =
    !!props.onIssueComponents &&
    canEnterP19(service, current) &&
    !command.busy &&
    !['unknown', 'saved-unloaded'].includes(command.phase);
  const issueEntry = canOpenP19 ? (
    <P09Action
      label="Xuất linh kiện →"
      variant="secondary"
      onPress={() => {
        if (
          issueContext !== service.contextKey() ||
          !canEnterP19(service, current)
        )
          return;
        props.onIssueComponents?.(current);
      }}
    />
  ) : null;
  useEffect(() => {
    if (
      resultReady &&
      command.command &&
      retained.seenResult !== command.command.requestId
    ) {
      setUpdateOpen(false);
      setHandoverOpen(false);
      setShowResult(true);
    }
  }, [resultReady, command.command, retained]);
  function leaveResult() {
    retained.seenResult = command.command?.requestId;
    setShowResult(false);
  }
  function back() {
    if (handoverOpen) {
      if (!command.busy) setHandoverOpen(false);
      return;
    }
    if (updateOpen) {
      if (!command.busy) setUpdateOpen(false);
      return;
    }
    if (showResult) {
      leaveResult();
      return;
    }
    props.onBack();
  }
  useHardwareBack(() => {
    if (updateOpen || showResult || handoverOpen) {
      back();
      return true;
    }
    return false;
  });
  function update(values: P09Update) {
    setError(undefined);
    const key = service.contextKey();
    command.run(values).catch(e => {
      if (mounted.current && key === service.contextKey())
        setError(toAppError(e));
    });
  }
  const componentQuantity =
    components.meta &&
    components.items.length > 0 &&
    !components.meta.hasMore &&
    components.items.length === components.meta.total &&
    components.items.every(
      link => props.componentPresentation?.[link.component_issue_document_id],
    )
      ? components.items.reduce(
          (total, link) =>
            total +
            props.componentPresentation![
              link.component_issue_document_id
            ]!.lines.reduce((n, line) => n + line.quantity, 0),
          0,
        )
      : null;
  const labels: Record<string, string> = {
    CHECKING: 'Kiểm tra',
    REPAIRING: 'Sửa chữa',
    COMPLETED: 'Hoàn tất',
    CANCELLED: 'Hủy hồ sơ',
  };
  useEffect(() => {
    setTargetStatus(
      nextStatuses(current.status).includes('COMPLETED') ? 'COMPLETED' : 'NOTE',
    );
  }, [current.warranty_case_id, current.status]);
  const invalidUpdate =
    !targetStatus ||
    (targetStatus === 'NOTE' && !note.trim()) ||
    (requiresNote(current.status, targetStatus) && !note.trim()) ||
    (requiresConfirmedDefect(current.status, targetStatus) &&
      !diagnosis.trim());
  const closed = ['RETURNED', 'CANCELLED'].includes(current.status);
  const sections = {
    command: (
      <View style={{ gap: 16 }}>
        <NativeText style={p09.small}>
          {current.warranty_case_code ?? current.warranty_case_id} ·{' '}
          {current.serial_number ?? 'Chưa có serial'}
        </NativeText>
        <NativeText style={p09.text}>
          {current.sku_name ??
            current.manual_product_description ??
            'Sản phẩm chưa xác định'}
        </NativeText>
        <Input
          label="Kết quả kiểm tra"
          value={diagnosis}
          onChangeText={setDiagnosis}
          multiline
          fieldHeight={100}
          helperText={`${diagnosis.length}/2000${
            requiresConfirmedDefect(current.status, targetStatus)
              ? ' · Bắt buộc để hoàn tất'
              : ''
          }`}
          inputStyle={{ textAlignVertical: 'top', paddingVertical: 12 }}
          maxLength={2000}
          editable={!blocked}
        />
        <Input
          label="Ghi chú mới / lý do hủy"
          value={note}
          onChangeText={setNote}
          multiline
          fieldHeight={100}
          helperText={`${note.length}/2000${
            targetStatus === 'NOTE' ||
            requiresNote(current.status, targetStatus)
              ? ' · Bắt buộc'
              : ''
          }`}
          inputStyle={{ textAlignVertical: 'top', paddingVertical: 12 }}
          maxLength={2000}
          editable={!blocked}
        />
        <NativeText style={p09.small}>
          Chọn bước xử lý; bàn giao khách hàng thuộc luồng P18.
        </NativeText>
        {[
          'NOTE',
          ...nextStatuses(current.status).filter(
            status => status !== 'RETURNED',
          ),
        ].map(status => (
          <Pressable
            key={status}
            accessibilityRole="radio"
            accessibilityLabel={
              status === 'NOTE' ? 'Lưu ghi chú' : labels[status]
            }
            accessibilityState={{
              checked: targetStatus === status,
              disabled: blocked,
            }}
            disabled={blocked}
            onPress={() => setTargetStatus(status)}
            style={[
              p09.card,
              { padding: 12 },
              targetStatus === status && { backgroundColor: HN_UI.canvas },
            ]}
          >
            <NativeText style={p09.text}>
              {targetStatus === status ? '◉' : '○'}{' '}
              {status === 'NOTE' ? 'Lưu ghi chú' : labels[status]}
            </NativeText>
          </Pressable>
        ))}
        {targetStatus === 'COMPLETED' && (
          <View style={[p09.card, { backgroundColor: HN_UI.canvas, gap: 6 }]}>
            <NativeText style={[p09.text, { fontWeight: '600' }]}>
              Sau khi lưu → Chờ bàn giao
            </NativeText>
            <NativeText style={p09.small}>
              Hồ sơ vẫn mở để thực hiện bàn giao cho khách hàng.
            </NativeText>
          </View>
        )}
        {error && <P09Error error={error} onBack={props.onBack} />}
        {command.phase === 'failed' &&
          command.receipt?.error_code === 'STALE_VERSION' && (
            <P09Action
              label="Đọc lại để kiểm tra phiên bản"
              variant="secondary"
              disabled={command.busy}
              onPress={onReload}
            />
          )}
        {command.phase !== 'idle' && (
          <P09Recovery
            service={service}
            caseId={current.warranty_case_id}
            onBack={props.onBack}
          />
        )}
        {current.status === 'COMPLETED' && (
          <NativeText style={p09.small}>
            Chờ bàn giao. Không chuyển thành Đã trả khách từ màn này.
          </NativeText>
        )}
      </View>
    ),
    events: (
      <P09Card
        title={`Quá trình xử lý${events.meta ? ` (${events.meta.total})` : ''}`}
      >
        {events.items.map(event => (
          <View
            key={event.event_id}
            style={[p09.row, { alignItems: 'flex-start', paddingVertical: 12 }]}
          >
            <View
              style={{
                width: 14,
                height: 14,
                borderRadius: 7,
                borderWidth: 3,
                borderColor: HN_UI.border,
                marginTop: 6,
              }}
            />
            <View style={p09.fill}>
              <NativeText style={p09.heading}>
                {event.to_status ? p09Status(event.to_status) : 'Cập nhật'}
              </NativeText>
              <NativeText style={p09.small}>
                {p09Date(event.event_at)}
              </NativeText>
              <NativeText style={p09.small}>
                {p09ActorName(event.actor.display_name)}
              </NativeText>
              <P09Value
                table
                label="Chi tiết hoạt động"
                value={
                  event.message_redacted
                    ? 'Nội dung được ẩn theo quyền'
                    : event.message
                }
                long
              />
            </View>
          </View>
        ))}
        {events.meta?.total === 0 && (
          <NativeText style={p09.small}>Chưa có sự kiện.</NativeText>
        )}
        <P09PageFooter pager={pagers.events} onBack={props.onBack} />
      </P09Card>
    ),
    components: (
      <P09Card
        title={`Linh kiện đã xuất${
          components.meta ? ` (${components.meta.total} phiếu)` : ''
        }`}
      >
        {issueEntry}
        {components.items.map(link => {
          const projection =
            props.componentPresentation?.[link.component_issue_document_id];
          return (
            <View
              key={link.component_issue_document_id}
              style={{ gap: 12, paddingVertical: 12 }}
            >
              <View style={p09.between}>
                <NativeText style={[p09.heading, p09.fill]}>
                  {projection?.number ?? link.component_issue_document_id}
                </NativeText>
                <NativeText style={p09.small}>Đã xuất</NativeText>
              </View>
              {projection && (
                <NativeText style={p09.small}>
                  {p09Date(projection.postedAt)}
                </NativeText>
              )}
              {projection?.lines.map(line => (
                <View key={line.code} style={[p09.row, p09.divider]}>
                  <View style={p09.fill}>
                    <NativeText style={p09.heading}>{line.code}</NativeText>
                    <NativeText style={p09.small}>{line.name}</NativeText>
                  </View>
                  <NativeText style={p09.text}>{line.quantity}</NativeText>
                </View>
              ))}
              {link.can_open && props.onOpenComponent ? (
                <P09Action
                  label="Mở phiếu linh kiện"
                  onPress={() => props.onOpenComponent?.(link)}
                />
              ) : (
                <NativeText style={p09.small}>
                  {link.can_open
                    ? 'Chi tiết phiếu chờ kết nối luồng linh kiện.'
                    : 'Không được phép mở phiếu này.'}
                </NativeText>
              )}
            </View>
          );
        })}
        {components.meta?.total === 0 && (
          <NativeText style={p09.small}>
            Chưa có phiếu linh kiện đã xuất.
          </NativeText>
        )}
        <P09PageFooter pager={pagers.components} onBack={props.onBack} />
      </P09Card>
    ),
    attachments: (
      <Box card padding="lg" gap="md">
        <Text variant="cardTitle">
          Tệp đính kèm {files.meta ? `(${files.meta.total})` : ''}
        </Text>
        {files.items.map(file => (
          <Box key={file.attachment_id}>
            <Text>
              {file.file_name_redacted
                ? 'Tên tệp được ẩn theo quyền'
                : file.file_name ?? '—'}
            </Text>
            <Text variant="caption">
              {[
                file.content_type,
                file.file_size_bytes == null
                  ? null
                  : `${file.file_size_bytes} bytes`,
                file.status,
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
            {file.status === 'ACTIVE' && file.can_download ? (
              <Button
                label="Tải tệp"
                disabled={fileBusy}
                onPress={() => {
                  if (fileLatch.current) return;
                  fileLatch.current = true;
                  setFileBusy(true);
                  const key = service.contextKey();
                  const scope = captureSessionScope();
                  const valid = () =>
                    mounted.current &&
                    key === service.contextKey() &&
                    isSessionScopeCurrent(scope);
                  service
                    .download(file, current.warranty_case_id)
                    .then(async bytes => {
                      if (!valid()) return;
                      if (props.onDownloadAttachment)
                        await props.onDownloadAttachment(file, bytes);
                      else {
                        await saveP12Binary(
                          bytes,
                          file.file_name ?? 'tep-' + file.attachment_id,
                          bytes.type || file.content_type || '',
                        );
                        if (valid()) setFileNotice(true);
                      }
                    })
                    .catch(e => {
                      if (mounted.current && key === service.contextKey())
                        setError(toAppError(e));
                    })
                    .finally(() => {
                      fileLatch.current = false;
                      if (valid()) setFileBusy(false);
                    });
                }}
              />
            ) : (
              <Text variant="caption">
                {file.can_download
                  ? 'Mở tệp chờ kết nối bộ xem tệp.'
                  : 'Tệp không khả dụng để tải theo quyền hiện tại.'}
              </Text>
            )}
          </Box>
        ))}
        {canUploadP18 ? (
          <Box card padding="md" gap="sm">
            <Text variant="cardTitle">Thêm ảnh và tài liệu</Text>
            <Text variant="caption" tone="muted">
              Chọn tệp liên quan đến hồ sơ. Nếu chưa rõ kết quả tải lên, hãy đối
              chiếu trước khi tiếp tục.
            </Text>
            {p18Attachments.error ? (
              <Text tone="danger">{p18Attachments.error}</Text>
            ) : null}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button
                label="Chọn ảnh/video"
                variant="secondary"
                disabled={closed || p18Attachments.uploading}
                onPress={p18Attachments.addFromLibrary}
              />
              <Button
                label="Chụp ảnh"
                variant="secondary"
                disabled={closed || p18Attachments.uploading}
                onPress={p18Attachments.addFromCamera}
              />
            </View>
            {p18Attachments.pending.map(item => (
              <View
                key={item.file.uri}
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  gap: 8,
                }}
              >
                <Text variant="caption">{item.file.name}</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {p18Attachments.unknown?.some(
                    value => value.uri === item.file.uri,
                  ) ? (
                    <Button
                      label="Đối chiếu"
                      variant="secondary"
                      onPress={() =>
                        p18Attachments
                          .reconcile(item.file.uri)
                          .catch(() => undefined)
                      }
                    />
                  ) : null}
                  <Button
                    label="Bỏ"
                    variant="secondary"
                    disabled={
                      p18Attachments.uploading ||
                      p18Attachments.unknown?.some(
                        value => value.uri === item.file.uri,
                      )
                    }
                    onPress={() => p18Attachments.removePending(item.file.uri)}
                  />
                </View>
              </View>
            ))}
            {p18Attachments.pending.length > 0 ? (
              <Button
                label={
                  p18Attachments.uploading ? 'Đang tải…' : 'Tải lên tệp đã chọn'
                }
                loading={p18Attachments.uploading}
                disabled={
                  closed ||
                  p18Attachments.uploading ||
                  !!p18Attachments.unknown?.length
                }
                onPress={() =>
                  !closed &&
                  p18Attachments.uploadAll('INTAKE').catch(() => undefined)
                }
              />
            ) : null}
            {p18Attachments.notice ? (
              <Text tone="muted">{p18Attachments.notice}</Text>
            ) : null}
          </Box>
        ) : null}
        {files.meta?.total === 0 ? <Text>Chưa có tệp.</Text> : null}
        <P09PageFooter pager={pagers.files} onBack={props.onBack} />
      </Box>
    ),
  };
  const visibleText = (value?: string | null) =>
    current.free_text_redacted ? 'Nội dung được ẩn theo quyền' : value;
  const summaryFields = (
    <>
      <P09Value table label="Khách hàng" value={current.customer_name} />
      <P09Value table label="Liên hệ" value={current.customer_phone} />
      <P09Value
        table
        label="Lỗi tiếp nhận"
        value={visibleText(current.reported_defect ?? current.description)}
        long
        inline
      />
      <P09Value
        table
        label="Phụ kiện"
        value={visibleText(current.accessories_received)}
        long
        inline
      />
      <P09Value
        table
        label="Ghi chú"
        value={
          current.reported_defect ? visibleText(current.description) : undefined
        }
        long
        inline
      />
    </>
  );
  const intakeExtras = (
    <P09Card title="Thông tin tiếp nhận khác">
      <P09Value
        table
        label="Phụ kiện"
        value={visibleText(current.accessories_received)}
        long
      />
      <P09Value
        table
        label="Tình trạng khi nhận"
        value={visibleText(current.received_condition)}
        long
      />
    </P09Card>
  );
  if (handoverOpen && current.status === 'COMPLETED')
    return (
      <P18HandoverScreen
        current={current}
        draft={handoverDraft}
        onChange={setHandoverDraft}
        onBack={back}
        blocked={
          blocked ||
          (command.phase === 'failed' &&
            command.receipt?.error_code === 'STALE_VERSION' &&
            p09CommandReviewsCase(command.command, current))
        }
        busy={command.busy}
        error={error}
        onConfirm={() => {
          setError(undefined);
          const scope = service.contextKey();
          command.handover(handoverDraft).catch(cause => {
            if (mounted.current && scope === service.contextKey())
              setError(toAppError(cause));
          });
        }}
        recovery={
          <>
            {command.phase === 'failed' &&
            command.receipt?.error_code === 'STALE_VERSION' ? (
              <P09Action
                label="Đọc lại phiên bản hồ sơ"
                variant="secondary"
                disabled={command.busy}
                onPress={onReload}
              />
            ) : null}
            <P09Recovery
              service={service}
              caseId={current.warranty_case_id}
              onBack={back}
            />
          </>
        }
      />
    );
  if (showResult && resultReady)
    return (
      <P09Frame
        panel={4}
        onBack={leaveResult}
        footer={
          <View style={{ gap: 10 }}>
            <P09Action
              label="Xem hồ sơ →"
              variant="secondary"
              style={{ minHeight: 52 }}
              onPress={leaveResult}
            />
            <P09Action
              label="Về danh sách bảo hành"
              style={{ minHeight: 52 }}
              onPress={() => {
                leaveResult();
                props.onBack();
              }}
            />
          </View>
        }
      >
        <View
          style={{
            backgroundColor: HN_UI.surface,
            borderRadius: 14,
            padding: 14,
            alignItems: 'center',
            gap: 10,
          }}
        >
          <View
            style={{
              width: 84,
              height: 84,
              borderRadius: 42,
              borderWidth: 14,
              borderColor: HN_UI.successBorder,
              backgroundColor: HN_UI.success,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <NativeText style={{ fontSize: 44, lineHeight: 54, color: HN_UI.onBrand }}>
              ✓
            </NativeText>
          </View>
          <NativeText
            style={[
              p09.heading,
              { fontSize: 20, lineHeight: 28, color: HN_UI.textPrimary },
            ]}
          >
            {current.status === 'RETURNED'
              ? 'Đã bàn giao khách hàng'
              : 'Đã cập nhật kết quả'}
          </NativeText>
          <P09Status status={current.status} />
          <NativeText
            style={[
              p09.text,
              { fontSize: 17, textAlign: 'center', color: HN_UI.textSecondary },
            ]}
          >
            {current.status === 'COMPLETED'
              ? 'Kết quả sửa chữa đã được cập nhật. Vui lòng bàn giao thiết bị cho khách hàng theo quy trình.'
              : 'Thông tin xử lý đã được lưu theo hồ sơ.'}
          </NativeText>
        </View>
        <P09Card style={{ paddingVertical: 4 }}>
          <P09Value
            table
            compact
            label="Mã hồ sơ"
            value={current.warranty_case_code ?? current.warranty_case_id}
            icon="document"
          />
          <P09Value
            table
            compact
            label="Khách hàng"
            value={current.customer_name}
            icon="user"
          />
          <P09Value
            table
            compact
            label="Sản phẩm"
            value={current.sku_name ?? current.manual_product_description}
            icon="box"
          />
          <P09Value
            table
            compact
            label="Serial"
            value={current.serial_number}
            icon="scan"
          />
          <P09Value
            table
            compact
            label={
              current.status === 'RETURNED'
                ? 'Ghi chú bàn giao'
                : 'Kết quả sửa chữa'
            }
            value={
              current.free_text_redacted
                ? 'Nội dung được ẩn theo quyền'
                : String(
                    command.command?.body.note ??
                      current.confirmed_defect ??
                      '',
                  )
            }
            icon="tool"
          />
          <P09Value
            table
            compact
            label="Linh kiện đã sử dụng"
            value={
              components.meta
                ? componentQuantity !== null
                  ? `${componentQuantity} linh kiện`
                  : `${components.meta.total} phiếu · Chưa có dữ liệu số lượng`
                : 'Chưa có dữ liệu'
            }
            icon="box"
          />
          <P09Value
            table
            compact
            label="Ngày cập nhật"
            value={p09Date(current.updated_at)}
            icon="calendar"
          />
          <P09Value
            table
            compact
            label="Người thực hiện"
            value={p09ActorName(
              events.items.find(
                event => event.actor.user_id === command.command?.scope.actorId,
              )?.actor.display_name,
            )}
            icon="user"
          />
          <P09Value
            table
            compact
            label="Trạng thái"
            value={p09Status(current.status)}
            icon="check"
          />
        </P09Card>
      </P09Frame>
    );
  return (
    <P09Frame
      panel={3}
      onBack={back}
      scrollKey={tab}
      initialScrollY={retained.positions[tab] ?? 0}
      onScrollPositionChange={y => {
        retained.positions[tab] = y;
      }}
      footer={
        <View style={p09.row}>
          <P09Action
            label={
              current.status === 'COMPLETED'
                ? 'Về danh sách bảo hành'
                : tab === 'parts'
                ? 'Thông tin hồ sơ'
                : 'Xem linh kiện'
            }
            variant="secondary"
            style={p09.fill}
            onPress={() => {
              if (current.status === 'COMPLETED') props.onBack();
              else setTab(tab === 'parts' ? 'info' : 'parts');
            }}
          />
          <P09Action
            label={
              current.status === 'COMPLETED'
                ? 'Bàn giao khách hàng'
                : 'Cập nhật xử lý'
            }
            style={p09.fill}
            disabled={closed || blocked}
            onPress={() => {
              if (closed || blocked) return;
              if (current.status === 'COMPLETED') {
                setHandoverOpen(true);
                return;
              }
              setDiagnosis(d => d || current.confirmed_defect || '');
              setUpdateOpen(true);
            }}
          />
        </View>
      }
    >
      <P09Hero row={current} image={props.productImage} />
      <View accessibilityRole="tablist" style={p09.tabs}>
        {(['info', 'parts', 'events'] as const).map((key, i) => (
          <Pressable
            key={key}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === key }}
            aria-selected={tab === key}
            accessibilityLabel={['Thông tin', 'Linh kiện', 'Lịch sử'][i]}
            {...(Platform.OS === 'web'
              ? {
                  onKeyDown: (nativeEvent: unknown) => {
                    const event = nativeEvent as {
                      key: string;
                      preventDefault: () => void;
                      currentTarget?: {
                        parentElement?: {
                          querySelectorAll: (
                            s: string,
                          ) => ArrayLike<{ focus: () => void }>;
                        };
                      };
                    };
                    const target = event.currentTarget;
                    const keys = ['info', 'parts', 'events'] as const;
                    if (
                      !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(
                        event.key,
                      )
                    )
                      return;
                    event.preventDefault();
                    const next =
                      event.key === 'Home'
                        ? 0
                        : event.key === 'End'
                        ? 2
                        : (i + (event.key === 'ArrowRight' ? 1 : 2)) % 3;
                    setTab(keys[next]!);
                    requestAnimationFrame(() =>
                      target?.parentElement
                        ?.querySelectorAll('[role=tab]')
                        [next]?.focus(),
                    );
                  },
                }
              : {})}
            onPress={() => setTab(key)}
            style={[p09.tab, tab === key && p09.tabActive]}
          >
            <NativeText
              style={[
                p09.text,
                {
                  color: tab === key ? HN_UI.textLink : HN_UI.textSecondary,
                  fontWeight: tab === key ? '600' : '400',
                },
              ]}
            >
              {['Thông tin', 'Linh kiện', 'Lịch sử'][i]}
            </NativeText>
            {key !== 'info' && (
              <NativeText style={p09.count}>
                {key === 'parts'
                  ? componentQuantity ??
                    (components.meta?.total === 0 ? 0 : '—')
                  : events.meta?.total ?? '—'}
              </NativeText>
            )}
          </Pressable>
        ))}
      </View>
      {closed && (
        <NativeText style={p09.small}>
          Hồ sơ đã đóng · Chỉ xem thông tin
        </NativeText>
      )}
      {tab === 'info' ? (
        <>
          <P09Card title="Thông tin tiếp nhận">
            {summaryFields}
          </P09Card>
          <P09Card title="Xử lý sửa chữa">
            <P09Value table label="Chẩn đoán" value={visibleText(current.confirmed_defect)} long inline />
            {/* No dedicated persisted repair-result projection in P09 yet. */}
            <P09Value table label="Kết quả sửa chữa" long inline />
          </P09Card>
          <P09Card>
            <View
              style={[p09.between, { alignItems: 'center', marginBottom: 8 }]}
            >
              <NativeText style={[p09.heading, p09.fill]}>
                {`Linh kiện đã xuất (${
                  componentQuantity ?? (components.meta?.total === 0 ? 0 : '—')
                })`}
              </NativeText>
              <P09Action
                label="Xem tất cả →"
                variant="secondary"
                onPress={() => setTab('parts')}
                style={{
                  minHeight: 44,
                  paddingHorizontal: 4,
                  paddingVertical: 4,
                  borderWidth: 0,
                  backgroundColor: 'transparent',
                }}
                labelStyle={{ fontSize: 13, lineHeight: 20, color: HN_UI.textSecondary }}
              />
            </View>
            {components.items
              .flatMap(
                link =>
                  props.componentPresentation?.[
                    link.component_issue_document_id
                  ]?.lines ?? [],
              )
              .slice(0, 2)
              .map((line, index) => (
                <View
                  key={line.code + index}
                  style={[p09.card, p09.row, { marginBottom: 8, padding: 10 }]}
                >
                  <P09Photo compact />
                  <View style={p09.fill}>
                    <NativeText style={p09.heading}>{line.code}</NativeText>
                    <NativeText style={p09.small}>{line.name}</NativeText>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <NativeText style={p09.small}>Số lượng</NativeText>
                    <NativeText style={p09.heading}>{line.quantity}</NativeText>
                  </View>
                </View>
              ))}
            {components.meta?.total === 0 ? (
              <NativeText style={p09.small}>
                Chưa có linh kiện đã xuất.
              </NativeText>
            ) : componentQuantity === null ? (
              <NativeText style={p09.small}>
                Chưa đủ dữ liệu số lượng linh kiện.
              </NativeText>
            ) : null}
          </P09Card>
          {current.handover ? (
            <P09Card title="Thông tin bàn giao">
              <P09Value
                table
                label="Người nhận"
                value={current.handover.receiver}
              />
              <P09Value
                table
                label="Ngày bàn giao"
                value={current.handover.handover_date}
              />
              <P09Value
                table
                label="Đã kiểm tra hoạt động"
                value={
                  current.handover.handover_checked
                    ? 'Đã xác nhận'
                    : 'Chưa xác nhận'
                }
              />
              <P09Value
                table
                label="Ghi chú bàn giao"
                value={
                  current.handover.note_redacted
                    ? 'Nội dung được ẩn theo quyền'
                    : current.handover.note
                }
                long
              />
              <P09Value
                table
                label="Thời điểm BE ghi nhận trả khách"
                value={p09Date(current.handover.returned_at)}
              />
            </P09Card>
          ) : null}
        </>
      ) : tab === 'parts' ? (
        <>
          {sections.components}
          <NativeText style={p09.small}>
            Chỉ hiển thị phiếu đã xác nhận xuất. Phiếu dở được theo dõi riêng.
          </NativeText>
        </>
      ) : (
        <>
          {sections.events}
          {intakeExtras}
          {sections.attachments}
        </>
      )}
      {command.phase !== 'idle' &&
        command.phase !== 'succeeded' &&
        !updateOpen && (
          <P09Recovery
            service={service}
            caseId={current.warranty_case_id}
            onBack={props.onBack}
          />
        )}
      {updateOpen && (
        <Dialog
          visible
          title="Cập nhật xử lý"
          message={current.warranty_case_code ?? current.warranty_case_id}
          dismissible={!command.busy}
          dismissOnBackdrop={false}
          onDismiss={() => setUpdateOpen(false)}
          footer={
            <View style={p09.row}>
              <P09Action
                label="Hủy"
                variant="secondary"
                disabled={command.busy}
                onPress={() => setUpdateOpen(false)}
                style={p09.fill}
              />
              <P09Action
                label={command.busy ? 'Đang cập nhật…' : 'Xác nhận cập nhật'}
                disabled={blocked || invalidUpdate}
                style={p09.fill}
                onPress={() =>
                  update(
                    targetStatus === 'NOTE'
                      ? { note }
                      : {
                          status: targetStatus as P09Update['status'],
                          note,
                          confirmed_defect: diagnosis,
                          ...(targetStatus === 'CANCELLED'
                            ? { cancel_reason: note }
                            : {}),
                        },
                  )
                }
              />
            </View>
          }
        >
          {sections.command}
        </Dialog>
      )}
      <Dialog
        visible={fileNotice}
        title={p12SaveTitle}
        message={p12SaveMessage}
        dismissOnBackdrop={false}
        onDismiss={() => setFileNotice(false)}
        footer={<P09Action label="Đóng" onPress={() => setFileNotice(false)} />}
      />
    </P09Frame>
  );
}

const detailDrafts = new WeakMap<
  P09Service,
  Map<
    string,
    {
      note: string;
      diagnosis: string;
      tab: 'info' | 'parts' | 'events';
      positions: Partial<Record<'info' | 'parts' | 'events', number>>;
      handover?: P09Handover;
      seenResult?: string;
    }
  >
>();
function detailDraft(service: P09Service, caseId: string) {
  let entries = detailDrafts.get(service);
  if (!entries) {
    entries = new Map();
    detailDrafts.set(service, entries);
  }
  const key = service.contextKey() + caseId;
  let draft = entries.get(key);
  if (!draft) {
    draft = { note: '', diagnosis: '', tab: 'info', positions: {} };
    entries.set(key, draft);
  }
  return draft;
}
