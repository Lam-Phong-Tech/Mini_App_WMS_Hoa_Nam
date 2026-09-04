import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import EmptyState from "@/components/EmptyState";
import LoadingState from "@/components/LoadingState";
import { AppButton } from "@/components/ui/Button";
import { WmsFlowSteps } from "@/components/ui/FlowSteps";
import { PageContainer, SectionHeader } from "@/components/ui/Page";
import {
  WmsCard,
  WmsField,
  WmsInput,
  WmsNotice,
  WmsPageHeader,
  WmsSelect,
  WmsTextArea,
} from "@/components/ui/WmsRuntime";
import {
  deleteWarrantyAttachment,
  downloadWarrantyAttachmentBlob,
  getWarrantyCaseAttachments,
  getWarrantyCaseDetail,
  getWarrantyCaseEvents,
  getWarrantyErrorMessage,
  uploadWarrantyCaseAttachment,
  updateWarrantyCaseStatus,
  type WarrantyAttachment,
  type WarrantyAttachmentType,
  type WarrantyCaseStatus,
  type WarrantyCaseSummary,
  type WarrantyEvent,
} from "@/services/warranty-flow.service";

type PendingWarrantyMedia = {
  id: string;
  file: File;
  mediaKind: "IMAGE" | "VIDEO";
  previewUrl: string;
  durationSeconds?: number;
};

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm"];
const IMAGE_MAX_BYTES = 10 * 1024 * 1024;
const VIDEO_MAX_BYTES = 300 * 1024 * 1024;
const VIDEO_MAX_SECONDS = 5 * 60;

const nextStatusByCurrent: Record<string, WarrantyCaseStatus[]> = {
  RECEIVED: ["CHECKING", "CANCELLED"],
  CHECKING: ["REPAIRING", "COMPLETED", "CANCELLED"],
  REPAIRING: ["COMPLETED", "CANCELLED"],
  COMPLETED: ["RETURNED"],
  RETURNED: [],
  CANCELLED: [],
};

export default function WarrantyDetailPage() {
  const { caseId = "" } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [warrantyCase, setWarrantyCase] = useState<WarrantyCaseSummary>();
  const [ifMatch, setIfMatch] = useState<string>();
  const [events, setEvents] = useState<WarrantyEvent[]>([]);
  const [attachments, setAttachments] = useState<WarrantyAttachment[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState<string>();
  const [statusNote, setStatusNote] = useState("");
  const [confirmedDefect, setConfirmedDefect] = useState("");
  const [error, setError] = useState<string>();
  const [attachmentType, setAttachmentType] =
    useState<WarrantyAttachmentType>("INTAKE");
  const [pendingMedia, setPendingMedia] = useState<PendingWarrantyMedia[]>([]);
  const [isUploadingMedia, setIsUploadingMedia] = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");
  const [attachmentNotice, setAttachmentNotice] = useState<string>();
  const [deletingAttachmentId, setDeletingAttachmentId] = useState<string>();
  const [loadingPreviewId, setLoadingPreviewId] = useState<string>();
  const [attachmentPreviewUrls, setAttachmentPreviewUrls] = useState<
    Record<string, string>
  >({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const objectUrlsRef = useRef(new Set<string>());
  const uploadLockRef = useRef(false);
  const loadedCaseIdRef = useRef<string>();
  const created = searchParams.get("created") === "1";

  useEffect(
    () => () => {
      objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      objectUrlsRef.current.clear();
    },
    [],
  );

  const loadDetail = async () => {
    if (!caseId) return;
    setIsLoading(true);
    setError(undefined);

    try {
      const [detail, eventItems, attachmentItems] = await Promise.all([
        getWarrantyCaseDetail(caseId),
        getWarrantyCaseEvents(caseId).catch(() => []),
        getWarrantyCaseAttachments(caseId).catch(() => []),
      ]);
      setWarrantyCase(detail.case);
      setIfMatch(detail.ifMatch);
      setEvents(eventItems);
      setAttachments(attachmentItems);
    } catch (requestError) {
      setError(getWarrantyErrorMessage(requestError));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!caseId || loadedCaseIdRef.current === caseId) return;
    loadedCaseIdRef.current = caseId;
    void loadDetail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId]);

  const nextStatuses = useMemo(
    () =>
      nextStatusByCurrent[
        String(warrantyCase?.status || "RECEIVED").toUpperCase()
      ] || [],
    [warrantyCase?.status],
  );
  const currentStatus = String(
    warrantyCase?.status || "RECEIVED",
  ).toUpperCase();
  const requiresConfirmedDefect =
    currentStatus === "CHECKING" &&
    nextStatuses.some((status) =>
      ["REPAIRING", "COMPLETED"].includes(String(status).toUpperCase()),
    );

  const changeStatus = async (status: WarrantyCaseStatus) => {
    if (!caseId) return;
    const targetStatus = String(status).toUpperCase();
    const nextConfirmedDefect = confirmedDefect.trim();
    const needsExplicitNote = requiresExplicitStatusNote(
      currentStatus,
      targetStatus,
    );
    const nextNote =
      statusNote.trim() ||
      (needsExplicitNote
        ? ""
        : defaultWarrantyStatusNote(status, warrantyCase));

    if (
      currentStatus === "CHECKING" &&
      ["REPAIRING", "COMPLETED"].includes(targetStatus) &&
      !nextConfirmedDefect
    ) {
      setError("Vui lòng nhập Kết quả kiểm tra trước khi chuyển trạng thái.");
      return;
    }

    if (needsExplicitNote && !nextNote) {
      setError(requiredStatusNoteMessage(targetStatus));
      return;
    }

    setUpdatingStatus(targetStatus);
    setError(undefined);

    try {
      const response = await updateWarrantyCaseStatus({
        caseId,
        status,
        ifMatch,
        note: nextNote,
        confirmedDefect:
          currentStatus === "CHECKING" &&
          ["REPAIRING", "COMPLETED"].includes(targetStatus)
            ? nextConfirmedDefect
            : undefined,
      });
      if (response.case) setWarrantyCase(response.case);
      if (response.ifMatch) setIfMatch(response.ifMatch);
      setStatusNote("");
      if (["REPAIRING", "COMPLETED", "CANCELLED"].includes(targetStatus)) {
        setConfirmedDefect("");
      }
      await loadDetail();
    } catch (requestError) {
      setError(getWarrantyErrorMessage(requestError));
    } finally {
      setUpdatingStatus(undefined);
    }
  };

  const selectMediaFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (files.length === 0) return;

    setAttachmentNotice(undefined);
    setError(undefined);

    const activeAttachments = attachments.filter(
      (attachment) => !attachment.status || attachment.status === "ACTIVE",
    );
    let imageCount =
      activeAttachments.filter(
        (attachment) => attachmentMediaKind(attachment) === "IMAGE",
      ).length +
      pendingMedia.filter((item) => item.mediaKind === "IMAGE").length;
    let videoCount =
      activeAttachments.filter(
        (attachment) => attachmentMediaKind(attachment) === "VIDEO",
      ).length +
      pendingMedia.filter((item) => item.mediaKind === "VIDEO").length;
    const accepted: PendingWarrantyMedia[] = [];
    const rejected: string[] = [];
    const selectedFileKeys = new Set(
      pendingMedia.map((item) => fileIdentity(item.file)),
    );

    for (const file of files) {
      const identity = fileIdentity(file);
      if (selectedFileKeys.has(identity)) {
        rejected.push(`${file.name}: file này đã có trong danh sách chờ.`);
        continue;
      }

      try {
        const inspected = await inspectWarrantyMedia(file);
        if (inspected.mediaKind === "IMAGE" && imageCount >= 10) {
          rejected.push(`${file.name}: hồ sơ đã đủ tối đa 10 ảnh.`);
          continue;
        }
        if (inspected.mediaKind === "VIDEO" && videoCount >= 2) {
          rejected.push(`${file.name}: hồ sơ đã đủ tối đa 2 video.`);
          continue;
        }

        const previewUrl = URL.createObjectURL(file);
        objectUrlsRef.current.add(previewUrl);
        accepted.push({
          id: `${file.name}-${file.size}-${file.lastModified}-${Math.random()}`,
          file,
          mediaKind: inspected.mediaKind,
          previewUrl,
          durationSeconds: inspected.durationSeconds,
        });
        selectedFileKeys.add(identity);

        if (inspected.mediaKind === "IMAGE") imageCount += 1;
        if (inspected.mediaKind === "VIDEO") videoCount += 1;
      } catch (selectionError) {
        rejected.push(
          `${file.name}: ${getWarrantyErrorMessage(selectionError)}`,
        );
      }
    }

    if (accepted.length > 0) {
      setPendingMedia((current) => [...current, ...accepted]);
    }
    if (rejected.length > 0) setError(rejected.join("\n"));
  };

  const removePendingMedia = (mediaId: string) => {
    setPendingMedia((current) => {
      const removed = current.find((item) => item.id === mediaId);
      if (removed) releaseObjectUrl(removed.previewUrl, objectUrlsRef.current);
      return current.filter((item) => item.id !== mediaId);
    });
  };

  const uploadPendingMedia = async () => {
    if (!caseId || pendingMedia.length === 0 || uploadLockRef.current) {
      return;
    }
    uploadLockRef.current = true;
    setIsUploadingMedia(true);
    setError(undefined);
    setAttachmentNotice(undefined);
    const uploadedIds: string[] = [];
    const uploadErrors: string[] = [];

    for (let index = 0; index < pendingMedia.length; index += 1) {
      const media = pendingMedia[index];
      setUploadProgress(
        `Đang tải ${index + 1}/${pendingMedia.length}: ${media.file.name}`,
      );
      try {
        await uploadWarrantyCaseAttachment({
          caseId,
          file: media.file,
          attachmentType,
        });
        uploadedIds.push(media.id);
      } catch (uploadError) {
        uploadErrors.push(
          `${media.file.name}: ${getWarrantyErrorMessage(uploadError)}`,
        );
      }
    }

    setPendingMedia((current) => {
      current
        .filter((item) => uploadedIds.includes(item.id))
        .forEach((item) =>
          releaseObjectUrl(item.previewUrl, objectUrlsRef.current),
        );
      return current.filter((item) => !uploadedIds.includes(item.id));
    });

    try {
      if (uploadedIds.length > 0) {
        const refreshed = await getWarrantyCaseAttachments(caseId);
        setAttachments(refreshed);
        setAttachmentNotice(
          `Backend đã nhận thành công ${uploadedIds.length} file.`,
        );
      }
    } catch (refreshError) {
      uploadErrors.push(getWarrantyErrorMessage(refreshError));
    } finally {
      uploadLockRef.current = false;
      setIsUploadingMedia(false);
      setUploadProgress("");
    }

    if (uploadErrors.length > 0) setError(uploadErrors.join("\n"));
  };

  const loadAttachmentPreview = async (attachment: WarrantyAttachment) => {
    if (attachmentPreviewUrls[attachment.id]) return;
    setLoadingPreviewId(attachment.id);
    setError(undefined);
    try {
      const blob = await downloadWarrantyAttachmentBlob(attachment.id);
      const previewUrl = URL.createObjectURL(blob);
      objectUrlsRef.current.add(previewUrl);
      setAttachmentPreviewUrls((current) => ({
        ...current,
        [attachment.id]: previewUrl,
      }));
    } catch (previewError) {
      setError(getWarrantyErrorMessage(previewError));
    } finally {
      setLoadingPreviewId(undefined);
    }
  };

  const removeAttachment = async (attachment: WarrantyAttachment) => {
    const confirmed = window.confirm(
      `Xóa file “${attachment.file_name || attachment.name || attachment.id}”?`,
    );
    if (!confirmed) return;

    setDeletingAttachmentId(attachment.id);
    setError(undefined);
    setAttachmentNotice(undefined);
    try {
      await deleteWarrantyAttachment(attachment.id);
      setAttachments((current) =>
        current.filter((item) => item.id !== attachment.id),
      );
      const previewUrl = attachmentPreviewUrls[attachment.id];
      if (previewUrl) {
        releaseObjectUrl(previewUrl, objectUrlsRef.current);
        setAttachmentPreviewUrls((current) => {
          const next = { ...current };
          delete next[attachment.id];
          return next;
        });
      }
      setAttachmentNotice("Đã xóa file đính kèm khỏi hồ sơ.");
    } catch (deleteError) {
      setError(getWarrantyErrorMessage(deleteError));
    } finally {
      setDeletingAttachmentId(undefined);
    }
  };

  if (isLoading && !warrantyCase) {
    return (
      <PageContainer>
        <LoadingState label="Đang tải hồ sơ bảo hành..." />
      </PageContainer>
    );
  }

  return (
    <PageContainer className="space-y-4">
      <WmsPageHeader
        eyebrow="Chi tiết bảo hành"
        title={warrantyCase?.case_no || "Hồ sơ bảo hành"}
        onBack={() => navigate("/warranty")}
      />

      <WmsFlowSteps
        current={warrantyFlowStep(warrantyCase?.status)}
        labels={["Tiếp nhận", "Kiểm tra", "Xử lý", "Trả khách"]}
      />

      {created && (
        <WmsNotice
          tone="success"
          title="Đã tạo hồ sơ bảo hành"
          description="Hồ sơ ở trạng thái RECEIVED, chưa làm thay đổi tồn kho."
        />
      )}

      {error && (
        <WmsNotice
          tone="danger"
          title="Không xử lý được hồ sơ"
          description={error}
        />
      )}

      {warrantyCase ? (
        <>
          <WmsCard className="space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-black uppercase tracking-[0.08em] text-[#69758A]">
                  {warrantyCase.item_code || warrantyCase.id}
                </p>
                <h1 className="mt-1 break-words text-[20px] font-black tracking-[-0.05em] text-[#06142A]">
                  {warrantyCase.product_name ||
                    warrantyCase.manual_product_description ||
                    "Sản phẩm bảo hành"}
                </h1>
              </div>
              <span
                className={`wms-status shrink-0 ${warrantyStatusTone(warrantyCase.status)}`}
              >
                {statusLabel(
                  (warrantyCase.status || "RECEIVED") as WarrantyCaseStatus,
                )}
              </span>
            </div>

            <div className="divide-y divide-[#E6ECF3] text-[12px]">
              <InfoRow
                label="Khách hàng"
                value={warrantyCase.customer_name || "--"}
              />
              <InfoRow
                label="Số điện thoại"
                value={warrantyCase.customer_phone || "--"}
              />
              <InfoRow label="Mô tả" value={warrantyCase.description || "--"} />
              <InfoRow
                label="Lỗi báo"
                value={warrantyCase.reported_defect || "--"}
              />
              <InfoRow
                label="Phụ kiện"
                value={warrantyCase.accessories_received || "--"}
              />
            </div>
          </WmsCard>

          <WmsCard className="space-y-3">
            <SectionHeader title="Chuyển trạng thái" />
            {nextStatuses.length === 0 ? (
              <WmsNotice
                tone="info"
                title="Không còn trạng thái tiếp theo"
                description="Hồ sơ đã hoàn tất hoặc đã hủy theo state flow hiện tại."
              />
            ) : (
              <>
                {requiresConfirmedDefect && (
                  <WmsField
                    label="Kết quả kiểm tra"
                    helper="Bắt buộc nhập để chuyển sang sửa chữa hoặc hoàn tất sau kiểm tra."
                  >
                    <WmsTextArea
                      className="min-h-24"
                      value={confirmedDefect}
                      placeholder="VD: Hỏng bo mạch nguồn, cần thay linh kiện"
                      onChange={(event) =>
                        setConfirmedDefect(event.target.value)
                      }
                    />
                  </WmsField>
                )}
                <WmsField label="Ghi chú chuyển trạng thái">
                  <WmsInput
                    value={statusNote}
                    placeholder={statusNotePlaceholder(currentStatus)}
                    onChange={(event) => setStatusNote(event.target.value)}
                  />
                </WmsField>
                {nextStatuses.some((status) =>
                  requiresExplicitStatusNote(
                    currentStatus,
                    String(status).toUpperCase(),
                  ),
                ) && (
                  <p className="text-[11px] font-medium leading-4 text-[#69758A]">
                    Ghi chú bắt buộc khi Hoàn tất, Trả khách hoặc Hủy hồ sơ.
                  </p>
                )}
                <div className="grid grid-cols-2 gap-2">
                  {nextStatuses.map((status) => (
                    <AppButton
                      fullWidth
                      key={status}
                      loading={updatingStatus === String(status).toUpperCase()}
                      variant={status === "CANCELLED" ? "danger" : "secondary"}
                      disabled={
                        Boolean(updatingStatus) ||
                        (currentStatus === "CHECKING" &&
                          ["REPAIRING", "COMPLETED"].includes(
                            String(status).toUpperCase(),
                          ) &&
                          !confirmedDefect.trim())
                      }
                      onClick={() => void changeStatus(status)}
                    >
                      {statusLabel(status)}
                    </AppButton>
                  ))}
                </div>
              </>
            )}
          </WmsCard>

          <WmsCard className="space-y-3">
            <SectionHeader title="Timeline" />
            {events.length === 0 ? (
              <EmptyState
                icon="clock"
                title="Chưa có sự kiện"
                description="Timeline sẽ được lấy từ backend khi có phát sinh."
              />
            ) : (
              <div className="space-y-2">
                {events.map((event, index) => (
                  <div
                    className="rounded-[var(--wms-radius-card)] border border-[var(--wms-divider)] bg-[var(--wms-surface-subtle)] p-3"
                    key={String(event.id || index)}
                  >
                    <p className="text-[13px] font-black text-[#06142A]">
                      {event.event_type || event.status || "Sự kiện"}
                    </p>
                    <p className="mt-1 text-[12px] font-medium text-[#69758A]">
                      {event.message || event.note || event.actor_name || "--"}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </WmsCard>

          <WmsCard className="space-y-3">
            <SectionHeader
              title="Ảnh & video bảo hành"
              action={
                <span className="wms-status wms-status--pending-approval px-2.5 py-1">
                  {
                    attachments.filter(
                      (item) => attachmentMediaKind(item) === "IMAGE",
                    ).length
                  }
                  /10 ảnh ·{" "}
                  {
                    attachments.filter(
                      (item) => attachmentMediaKind(item) === "VIDEO",
                    ).length
                  }
                  /2 video
                </span>
              }
            />

            <WmsNotice
              tone="info"
              title="File được gửi tới backend WMS"
              description="Backend chịu trách nhiệm lưu vào storage đã cấu hình. Ảnh JPG/PNG/WEBP tối đa 10MB; video MP4/MOV/WEBM tối đa 300MB và 5 phút."
            />

            {attachmentNotice && (
              <WmsNotice
                tone="success"
                title="Đã cập nhật file đính kèm"
                description={attachmentNotice}
              />
            )}

            <WmsField label="Nhóm hình ảnh/video">
              <WmsSelect
                value={attachmentType}
                disabled={isUploadingMedia || currentStatus === "CANCELLED"}
                onChange={(event) =>
                  setAttachmentType(
                    event.target.value as WarrantyAttachmentType,
                  )
                }
              >
                <option value="INTAKE">Lúc tiếp nhận</option>
                <option value="DIAGNOSTIC">Kiểm tra/chẩn đoán</option>
                <option value="RETURN">Bàn giao/trả khách</option>
                <option value="OTHER">Khác</option>
              </WmsSelect>
            </WmsField>

            <input
              ref={fileInputRef}
              className="hidden"
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm,.mov"
              onChange={(event) => void selectMediaFiles(event)}
            />

            <AppButton
              fullWidth
              variant="secondary"
              icon="image"
              disabled={isUploadingMedia || currentStatus === "CANCELLED"}
              onClick={() => fileInputRef.current?.click()}
            >
              Chọn ảnh hoặc video
            </AppButton>

            {currentStatus === "CANCELLED" && (
              <WmsNotice
                tone="warning"
                title="Hồ sơ đã hủy"
                description="Backend không cho tải thêm file vào hồ sơ CANCELLED."
              />
            )}

            {pendingMedia.length > 0 && (
              <section className="space-y-2">
                <p className="text-[12px] font-black text-[#06142A]">
                  File chờ tải lên ({pendingMedia.length})
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {pendingMedia.map((media) => (
                    <div
                      className="min-w-0 overflow-hidden rounded-[var(--wms-radius-card)] border border-[var(--wms-divider)] bg-[var(--wms-surface-subtle)]"
                      key={media.id}
                    >
                      <div className="relative aspect-[4/3] w-full touch-pan-y overflow-hidden bg-[#E9EFF6]">
                        {media.mediaKind === "IMAGE" ? (
                          <img
                            className="block h-full max-h-full w-full max-w-full object-cover"
                            decoding="async"
                            height={180}
                            loading="lazy"
                            src={media.previewUrl}
                            alt={media.file.name}
                            width={240}
                          />
                        ) : (
                          <video
                            className="block h-full max-h-full w-full max-w-full touch-pan-y bg-black object-contain"
                            src={media.previewUrl}
                            controls
                            preload="metadata"
                          />
                        )}
                      </div>
                      <div className="space-y-1 p-2">
                        <p className="line-clamp-1 text-[11px] font-black text-[#06142A]">
                          {media.file.name}
                        </p>
                        <p className="text-[10px] font-medium text-[#69758A]">
                          {media.mediaKind === "VIDEO" ? "Video" : "Ảnh"} ·{" "}
                          {formatFileSize(media.file.size)}
                          {media.durationSeconds
                            ? ` · ${formatDuration(media.durationSeconds)}`
                            : ""}
                        </p>
                        <button
                          className="min-h-8 w-full rounded-xl border border-red-200 bg-white text-[11px] font-black text-[#CF2E14]"
                          type="button"
                          disabled={isUploadingMedia}
                          onClick={() => removePendingMedia(media.id)}
                        >
                          Bỏ file
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <AppButton
                  fullWidth
                  icon="image"
                  loading={isUploadingMedia}
                  onClick={() => void uploadPendingMedia()}
                >
                  Tải {pendingMedia.length} file lên
                </AppButton>
                {uploadProgress && (
                  <p className="text-center text-[11px] font-semibold text-[#69758A]">
                    {uploadProgress}
                  </p>
                )}
              </section>
            )}

            {attachments.length === 0 ? (
              <p className="rounded-[var(--wms-radius-card)] border border-dashed border-[var(--wms-divider)] bg-[var(--wms-surface-subtle)] p-4 text-center text-[12px] font-medium text-[var(--wms-text-muted)]">
                Chưa có ảnh hoặc video trong hồ sơ.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {attachments.map((attachment) => {
                  const previewUrl = attachmentPreviewUrls[attachment.id];
                  const mediaKind = attachmentMediaKind(attachment);
                  return (
                    <div
                      className="min-w-0 overflow-hidden rounded-[var(--wms-radius-card)] border border-[var(--wms-divider)] bg-[var(--wms-surface-subtle)]"
                      key={attachment.id}
                    >
                      <div className="relative grid aspect-[4/3] w-full touch-pan-y place-items-center overflow-hidden bg-[#E9EFF6]">
                        {previewUrl && mediaKind === "IMAGE" ? (
                          <img
                            className="block h-full max-h-full w-full max-w-full object-cover"
                            decoding="async"
                            height={180}
                            loading="lazy"
                            src={previewUrl}
                            alt={attachment.file_name || "Ảnh bảo hành"}
                            width={240}
                          />
                        ) : previewUrl && mediaKind === "VIDEO" ? (
                          <video
                            className="block h-full max-h-full w-full max-w-full touch-pan-y bg-black object-contain"
                            src={previewUrl}
                            controls
                            preload="metadata"
                          />
                        ) : (
                          <button
                            className="flex h-full w-full flex-col items-center justify-center gap-2 px-3 text-center text-[#69758A]"
                            type="button"
                            disabled={loadingPreviewId === attachment.id}
                            onClick={() =>
                              void loadAttachmentPreview(attachment)
                            }
                          >
                            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-white text-xl shadow-sm">
                              {mediaKind === "VIDEO" ? "▶" : "▧"}
                            </span>
                            <span className="text-[11px] font-black">
                              {loadingPreviewId === attachment.id
                                ? "Đang tải..."
                                : mediaKind === "VIDEO"
                                  ? "Tải và xem video"
                                  : "Tải và xem ảnh"}
                            </span>
                          </button>
                        )}
                      </div>
                      <div className="space-y-1 p-2">
                        <p className="line-clamp-1 text-[11px] font-black text-[#06142A]">
                          {attachment.file_name ||
                            attachment.name ||
                            attachment.id}
                        </p>
                        <p className="text-[10px] font-medium text-[#69758A]">
                          {mediaKind === "VIDEO" ? "Video" : "Ảnh"} ·{" "}
                          {formatFileSize(
                            attachment.file_size_bytes || attachment.size || 0,
                          )}
                          {attachment.duration_seconds
                            ? ` · ${formatDuration(attachment.duration_seconds)}`
                            : ""}
                        </p>
                        {previewUrl && (
                          <a
                            className="flex min-h-8 items-center justify-center rounded-xl border border-[#D6E0EC] bg-white text-[11px] font-black text-[#0F73DC]"
                            href={previewUrl}
                            download={
                              attachment.file_name ||
                              attachment.name ||
                              "warranty-media"
                            }
                          >
                            Tải xuống
                          </a>
                        )}
                        <AppButton
                          fullWidth
                          className="min-h-8 rounded-xl px-2 text-[11px]"
                          variant="danger"
                          loading={deletingAttachmentId === attachment.id}
                          disabled={
                            Boolean(deletingAttachmentId) || isUploadingMedia
                          }
                          onClick={() => void removeAttachment(attachment)}
                        >
                          Xóa
                        </AppButton>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </WmsCard>
        </>
      ) : (
        <WmsCard className="py-8">
          <EmptyState
            icon="alert-triangle"
            title="Không có dữ liệu hồ sơ"
            description="Vui lòng quay lại danh sách và đồng bộ lại."
          />
        </WmsCard>
      )}
    </PageContainer>
  );
}

async function inspectWarrantyMedia(file: File) {
  const mediaKind = fileMediaKind(file);

  if (mediaKind === "IMAGE") {
    if (file.size > IMAGE_MAX_BYTES) {
      throw new Error("Ảnh vượt quá dung lượng tối đa 10MB.");
    }
    return { mediaKind } as const;
  }

  if (file.size > VIDEO_MAX_BYTES) {
    throw new Error("Video vượt quá dung lượng tối đa 300MB.");
  }

  const durationSeconds = await readVideoDuration(file);
  if (durationSeconds && durationSeconds > VIDEO_MAX_SECONDS) {
    throw new Error("Video dài quá 5 phút.");
  }

  return { mediaKind, durationSeconds } as const;
}

function fileMediaKind(file: File): "IMAGE" | "VIDEO" {
  const contentType = file.type.toLowerCase();
  const extension = file.name.toLowerCase().split(".").pop() || "";

  if (
    IMAGE_TYPES.includes(contentType) ||
    ["jpg", "jpeg", "png", "webp"].includes(extension)
  ) {
    return "IMAGE";
  }

  if (
    VIDEO_TYPES.includes(contentType) ||
    ["mp4", "mov", "webm"].includes(extension)
  ) {
    return "VIDEO";
  }

  throw new Error("Chỉ nhận ảnh JPG/PNG/WEBP hoặc video MP4/MOV/WEBM.");
}

function fileIdentity(file: File) {
  return `${file.name}|${file.size}|${file.lastModified}`;
}

function readVideoDuration(file: File): Promise<number | undefined> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    const sourceUrl = URL.createObjectURL(file);
    let completed = false;
    const finish = (duration?: number) => {
      if (completed) return;
      completed = true;
      window.clearTimeout(timeout);
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(sourceUrl);
      resolve(duration);
    };
    const timeout = window.setTimeout(() => finish(), 8_000);

    video.preload = "metadata";
    video.onloadedmetadata = () =>
      finish(
        Number.isFinite(video.duration) && video.duration > 0
          ? video.duration
          : undefined,
      );
    video.onerror = () => finish();
    video.src = sourceUrl;
  });
}

function attachmentMediaKind(attachment: WarrantyAttachment) {
  const explicitKind = String(attachment.media_kind || "").toUpperCase();
  if (explicitKind === "VIDEO" || explicitKind === "IMAGE") {
    return explicitKind as "IMAGE" | "VIDEO";
  }

  const contentType = String(
    attachment.content_type || attachment.mime_type || "",
  ).toLowerCase();
  const fileName = String(attachment.file_name || attachment.name || "")
    .toLowerCase()
    .split(".")
    .pop();

  if (
    contentType.startsWith("video/") ||
    ["mp4", "mov", "webm"].includes(fileName || "")
  ) {
    return "VIDEO" as const;
  }
  return "IMAGE" as const;
}

function releaseObjectUrl(url: string, urls: Set<string>) {
  URL.revokeObjectURL(url);
  urls.delete(url);
}

function formatFileSize(bytes: number) {
  if (!bytes) return "--";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
}

function formatDuration(seconds: number) {
  const rounded = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(rounded / 60);
  const remainingSeconds = String(rounded % 60).padStart(2, "0");
  return `${minutes}:${remainingSeconds}`;
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2">
      <span className="shrink-0 text-[#8C98AA]">{label}</span>
      <span className="min-w-0 break-words text-right font-black text-[#06142A]">
        {value}
      </span>
    </div>
  );
}

function statusLabel(status: WarrantyCaseStatus) {
  const labels: Record<string, string> = {
    CHECKING: "Kiểm tra",
    REPAIRING: "Sửa chữa",
    COMPLETED: "Hoàn tất",
    RETURNED: "Đã trả khách",
    CANCELLED: "Hủy",
  };

  return labels[String(status).toUpperCase()] || status;
}

function warrantyFlowStep(status?: string) {
  const normalized = String(status || "RECEIVED").toUpperCase();
  if (normalized === "CHECKING") return 2;
  if (["REPAIRING", "COMPLETED", "CANCELLED"].includes(normalized)) return 3;
  if (normalized === "RETURNED") return 4;
  return 1;
}

function warrantyStatusTone(status?: string) {
  const normalized = String(status || "RECEIVED").toUpperCase();
  if (["COMPLETED", "RETURNED"].includes(normalized))
    return "wms-status--success";
  if (normalized === "CANCELLED") return "wms-status--error";
  if (normalized === "REPAIRING") return "wms-status--pending-approval";
  return "wms-status--pending";
}

function statusNotePlaceholder(currentStatus: string) {
  const placeholders: Record<string, string> = {
    RECEIVED: "VD: Bắt đầu kiểm tra sản phẩm",
    CHECKING: "VD: Chuyển sang bước sửa chữa",
    REPAIRING: "VD: Đã thay linh kiện, test OK",
    COMPLETED: "VD: Đã bàn giao cho khách",
  };

  return placeholders[currentStatus] || "Ghi chú chuyển trạng thái";
}

function requiresExplicitStatusNote(
  currentStatus: string,
  targetStatus: string,
) {
  if (["RETURNED", "CANCELLED"].includes(targetStatus)) return true;
  if (targetStatus === "COMPLETED") {
    return ["CHECKING", "REPAIRING"].includes(currentStatus);
  }
  return false;
}

function requiredStatusNoteMessage(targetStatus: string) {
  const messages: Record<string, string> = {
    COMPLETED: "Vui lòng nhập ghi chú kết quả xử lý trước khi hoàn tất.",
    RETURNED: "Vui lòng nhập biên bản/ghi chú bàn giao trước khi trả khách.",
    CANCELLED: "Vui lòng nhập lý do hủy hồ sơ bảo hành.",
  };

  return messages[targetStatus] || "Vui lòng nhập ghi chú chuyển trạng thái.";
}

function defaultWarrantyStatusNote(
  status: WarrantyCaseStatus,
  warrantyCase?: WarrantyCaseSummary,
) {
  const labels: Record<string, string> = {
    CHECKING: "Bắt đầu kiểm tra sản phẩm",
    REPAIRING: "Chuyển sang bước sửa chữa",
    COMPLETED:
      String(warrantyCase?.status || "").toUpperCase() === "CHECKING"
        ? "Đã kiểm tra, vệ sinh và bàn giao được"
        : "Đã thay linh kiện, test OK",
    RETURNED:
      `Đã bàn giao cho khách ${warrantyCase?.customer_name || ""}`.trim(),
    CANCELLED: "Hủy hồ sơ bảo hành",
  };

  return labels[String(status).toUpperCase()] || "Cập nhật trạng thái bảo hành";
}
