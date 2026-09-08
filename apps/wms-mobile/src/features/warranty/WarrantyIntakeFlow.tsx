/**
 * Luồng tiếp nhận bảo hành — nối ba màn ảnh **41, 42, 43** và gọi WMS thật.
 *
 * 🔓 `GATE_WMS §2i`: **G** (`resolve-code`) và **H** (`warranty-cases`) đã duyệt.
 *
 * ```
 * Nhập/quét mã (41) → Chọn bệnh lỗi (42) → Mô tả (43) → chi tiết hồ sơ
 * ```
 *
 * ## Ba lối vào, và ai gọi `resolve-code`
 *
 * Mô tả luồng bảo hành 2026-09-06 nói rõ: *"Scanner chỉ chuyển mã sang
 * `/warranty/receive?code=…`. **Trang tiếp nhận mới gọi API resolve-code**."*
 *
 * ⇒ Máy quét **không** gọi mạng. Luồng này nhận `rawCode` rồi tự hỏi WMS. Tách
 * như vậy có lý: máy quét phải phản hồi tức thì, còn một lượt round-trip giữa
 * lúc quét sẽ làm nó khựng lại — và nếu mạng hỏng thì mất luôn mã vừa quét.
 *
 * | Lối vào | Kết quả |
 * |---|---|
 * | Quét camera → `rawCode` | resolve; đủ điều kiện ⇒ hồ sơ thường |
 * | Nhập tay → `rawCode` | như trên |
 * | *"Mất tem/mã"* | vào thẳng hồ sơ tạm, không gọi resolve |
 *
 * **Mã không đủ điều kiện KHÔNG phải ngõ cụt** — nó chuyển sang hồ sơ tạm với
 * lý do tương ứng, và nói rõ vì sao. Chặn hẳn ở đây nghĩa là khách mang máy
 * hỏng tới mà không mở được hồ sơ nào.
 *
 * ## 🔴 Danh mục lỗi: hai lần đo, hai kết quả khác nhau
 *
 * | Ngày | `GET /api/v1/defects?status=ACTIVE` | Hệ quả |
 * |---|---|---|
 * | 2026-09-05 | **403 ACCESS_DENIED** với vai Thủ kho | coi là trạng thái quyền hợp lệ, nói rõ ra màn hình |
 * | 2026-09-06 | **200**, danh sách **rỗng** | quyền đã được cấp, nhưng WMS chưa khai bệnh lỗi nào |
 *
 * Cả hai vẫn được xử lý: 403 hiện banner "chưa có quyền", 200-rỗng hiện trạng
 * thái rỗng có chỉ lối đi tiếp.
 *
 * **Điểm sửa quan trọng ngày 2026-09-06:** trước đó bước chọn bệnh lỗi là
 * **bắt buộc**, nên cả hai kết quả trên đều thành ngõ cụt — không hồ sơ nào
 * tạo được. Nay bước này **không chặn** (xem {@link validateStep2} trong
 * `warrantyIntake.ts` để biết bằng chứng lấy từ Mini App gốc).
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { toAppError, type AppError } from '../../errors/AppError';
import { messageForUser, serverAnswered } from '../../errors/AppError';
import { readPage } from '../../services/wms/readOnlyClient';
import { useHardwareBack } from '../../app/useHardwareBack';
import { WMS_READ_PATHS } from '../../services/wms/queries';
import {
  createWarrantyCase,
  isEligibleForWarranty,
  resolveWarrantyCode,
} from '../../services/wms/warrantyWrite';
import { Page } from '../../ui/Page';
import { Box } from '../../ui/Box';
import { Text } from '../../ui/Text';
import { useProvinces, useWards } from '../../services/geo/useGeo';
import { isDefectPermissionDenied } from './warrantyPolicy';
import {
  WarrantyCodeStep,
  WarrantyDefectStep,
  WarrantyDescriptionStep,
} from './WarrantyIntakeScreens';
import {
  canSubmit,
  initialIntakeDraft,
  intakeIdempotencyKey,
  nextStep,
  previousStep,
  toCreateInput,
  updateIntake,
  type DefectOption,
  type WarrantyIntakeDraft,
} from './warrantyIntake';
import type { WarrantyCase } from '../../services/wms/types';

interface RawDefect {
  readonly id?: string;
  readonly code?: string;
  readonly name?: string;
  readonly title?: string;
}

/** Danh mục lỗi active. Query lấy từ mô tả luồng bảo hành 2026-09-06. */
export function fetchDefects(): Promise<{ items: readonly RawDefect[] }> {
  return readPage<RawDefect>(WMS_READ_PATHS.defects, {
    query: { status: 'ACTIVE', page: 1, per_page: 100 },
  });
}

export function toDefectOptions(
  raw: readonly RawDefect[],
): readonly DefectOption[] {
  const options: DefectOption[] = [];
  for (const item of raw) {
    const id = item.id ?? item.code;
    const name = item.name ?? item.title ?? item.code;
    // Bỏ bản ghi thiếu id hoặc tên — đẩy rác vào danh sách checkbox thì người
    // dùng tick vào một dòng trống rồi gửi lên một `defect_id` không tồn tại.
    if (id !== undefined && name !== undefined) {
      options.push({ id, code: item.code, name });
    }
  }
  return options;
}

export interface WarrantyIntakeFlowProps {
  /**
   * Mã thô vừa quét hoặc gõ tay. Luồng này sẽ tự gọi `resolve-code`.
   * Bỏ trống ⇒ vào thẳng nhánh **hồ sơ tạm** (lối *"Mất tem/mã"*).
   */
  rawCode?: string;
  /** Ghi chú kèm theo khi nhập tay — đưa vào mô tả yêu cầu. */
  initialNote?: string;
  onExit: () => void;
  onCreated?: (warrantyCase: WarrantyCase) => void;
  /** Tiêm để test không cần mạng. */
  loadDefects?: typeof fetchDefects;
  submitCase?: typeof createWarrantyCase;
  resolveCode?: typeof resolveWarrantyCode;
}

export function WarrantyIntakeFlow({
  rawCode,
  initialNote,
  onExit,
  onCreated,
  loadDefects = fetchDefects,
  submitCase = createWarrantyCase,
  resolveCode = resolveWarrantyCode,
}: WarrantyIntakeFlowProps): React.ReactElement {
  const hasCode = (rawCode ?? '').trim() !== '';

  const [draft, setDraft] = useState<WarrantyIntakeDraft>(() =>
    updateIntake(initialIntakeDraft, {
      // Không có mã ⇒ nhánh tạm ngay. Có mã thì chờ `resolve-code` trả lời đã.
      missingCodeReason: hasCode ? '' : 'LOST_LABEL',
      description: initialNote ?? '',
    }),
  );

  /** Trạng thái hỏi WMS về mã vừa quét. */
  const [resolving, setResolving] = useState(hasCode);
  /** Vì sao mã không dùng được — hiện cho người dùng, không nuốt. */
  const [resolveNote, setResolveNote] = useState<string | undefined>();

  const [defects, setDefects] = useState<readonly DefectOption[]>([]);
  const [defectsPhase, setDefectsPhase] = useState<
    'loading' | 'ready' | 'error' | 'forbidden'
  >('loading');
  const [defectsError, setDefectsError] = useState<AppError | undefined>();

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<AppError | undefined>();

  const provinceState = useProvinces();
  const wardState = useWards(draft.province);

  /**
   * Hỏi WMS về mã vừa quét — **một lần**, lúc vào luồng.
   *
   * Ba kết quả, và **không kết quả nào là ngõ cụt**:
   *
   * | Kết quả | Nhánh | Vì sao không chặn |
   * |---|---|---|
   * | đủ điều kiện | hồ sơ thường | — |
   * | không đủ điều kiện | hồ sơ tạm, lý do `NOT_ELIGIBLE` | khách đã mang máy tới rồi |
   * | gọi mạng hỏng | hồ sơ tạm, lý do `UNREADABLE` | mất mạng không phải lỗi của khách |
   *
   * Cả ba đều **nói rõ lý do** ở màn tiếp theo. Im lặng chuyển nhánh sẽ khiến
   * thủ kho tưởng máy tự ý bỏ qua mã họ vừa quét.
   */
  useEffect(() => {
    const code = (rawCode ?? '').trim();
    if (code === '') {
      return;
    }
    let cancelled = false;
    setResolving(true);

    resolveCode(code)
      .then(resolved => {
        if (cancelled) {
          return;
        }
        if (isEligibleForWarranty(resolved)) {
          setDraft(current =>
            updateIntake(current, {
              itemCode: resolved.item_code ?? code,
              resolvedProductName:
                resolved.sku_name ?? resolved.product_name ?? undefined,
              missingCodeReason: '',
            }),
          );
          setResolveNote(undefined);
          return;
        }
        // Không đủ điều kiện ⇒ hồ sơ tạm, và nói RÕ vì sao.
        setDraft(current =>
          updateIntake(current, {
            itemCode: '',
            missingCodeReason: 'NOT_ELIGIBLE',
            manualProductDescription:
              resolved.sku_name ?? resolved.product_name ?? '',
          }),
        );
        setResolveNote(
          'WMS xác định mã "' +
            code +
            '" không đủ điều kiện bảo hành' +
            (resolved.eligibility_code === undefined
              ? ''
              : ' (' + resolved.eligibility_code + ')') +
            '. Hồ sơ chuyển sang dạng tạm — kiểm tra lại mô tả sản phẩm bên dưới.',
        );
      })
      .catch(cause => {
        if (cancelled) {
          return;
        }
        const error = toAppError(cause);

        // 🔧 Sửa 2026-09-06 sau khi đo thật: `resolve-code` trả **422
        // SKU_NOT_FOUND** cho một mã lạ. Đó là WMS **đã trả lời** — chỉ là trả
        // lời "không biết mã này". Bản trước gộp nó chung với mất mạng và báo
        // *"Chưa hỏi được WMS"*, tức là nói sai sự thật với thủ kho: họ sẽ đi
        // kiểm tra mạng trong khi vấn đề nằm ở cái tem.
        //
        // Ranh giới: máy chủ trả lời rõ ràng (4xx) là **câu trả lời**; mất
        // mạng, hết giờ chờ, bị chặn ở biên là **chưa hỏi được**.
        // Dùng hàm chung với luồng xuất kho — điều kiện này từng bị viết lại
        // ở hai chỗ và lệch nhau.
        const answered = serverAnswered(error);

        setDraft(current =>
          updateIntake(current, {
            itemCode: '',
            // Đã trả lời "không biết" ⇒ mã không dùng được cho hồ sơ thường.
            // Chưa hỏi được ⇒ chưa kết luận gì về mã, chỉ là chưa đọc ra.
            missingCodeReason: answered ? 'NOT_ELIGIBLE' : 'UNREADABLE',
          }),
        );

        setResolveNote(
          answered
            ? 'WMS không nhận ra mã "' +
              code +
              '"' +
              (error.code === undefined ? '' : ' (' + error.code + ')') +
              '. Hồ sơ chuyển sang dạng tạm — mô tả sản phẩm bên dưới để vẫn tiếp nhận được.'
            : 'Chưa hỏi được WMS về mã "' +
              code +
              '": ' +
              messageForUser(error) +
              ' Hồ sơ chuyển sang dạng tạm; điền mô tả sản phẩm để không phải chờ mạng.',
        );
      })
      .finally(() => {
        if (!cancelled) {
          setResolving(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [rawCode, resolveCode]);

  const loadDefectList = useCallback(() => {
    setDefectsPhase('loading');
    setDefectsError(undefined);
    loadDefects()
      .then(page => {
        setDefects(toDefectOptions(page.items));
        setDefectsPhase('ready');
      })
      .catch(cause => {
        // 403 là trạng thái HỢP LỆ với vai Thủ kho, không phải sự cố.
        if (isDefectPermissionDenied(cause)) {
          setDefectsPhase('forbidden');
          return;
        }
        setDefectsError(toAppError(cause));
        setDefectsPhase('error');
      });
  }, [loadDefects]);

  useEffect(loadDefectList, [loadDefectList]);

  // Back của Android lùi **từng bước** như nút "Quay lại" trên màn, thay vì
  // nhảy thẳng ra ngoài và mất hết tên/SĐT/địa chỉ đã điền. Ở bước 1 thì nhường
  // cho `AppShell` xử lý (thoát luồng).
  useHardwareBack(() => {
    if (draft.step === 0) {
      return false;
    }
    setDraft(current => previousStep(current));
    return true;
  });

  const selectedDefects = useMemo(
    () => defects.filter(defect => draft.defectIds.includes(defect.id)),
    [defects, draft.defectIds],
  );

  const handleSubmit = useCallback(async () => {
    // Chống bấm hai lần: `Idempotency-Key` chặn hồ sơ trùng, nhưng vẫn là một
    // request thừa và một lần chờ.
    if (submitting) {
      return;
    }
    const validated = nextStep(draft);
    if (!canSubmit(draft)) {
      setDraft(validated);
      return;
    }

    setSubmitting(true);
    setSubmitError(undefined);
    try {
      // Dựng payload MỘT lần rồi băm chính nó — khoá và thân yêu cầu luôn
      // khớp nhau, không có đường nào lệch.
      const payload = toCreateInput(draft);
      const created = await submitCase(payload, intakeIdempotencyKey(payload));
      onCreated?.(created);
    } catch (cause) {
      setSubmitError(toAppError(cause));
    } finally {
      setSubmitting(false);
    }
  }, [draft, onCreated, submitCase, submitting]);

  if (resolving) {
    // Màn chờ riêng thay vì để form nhấp nháy đổi nhánh giữa chừng: người dùng
    // vừa quét xong, họ cần biết máy đang hỏi WMS chứ không phải đang treo.
    return (
      <Page title="Tiếp nhận bảo hành" subtitle="Đang kiểm tra mã">
        <Box card padding="lg" gap="md">
          <Text variant="cardTitle" tone="strong">
            Đang hỏi WMS về mã vừa quét…
          </Text>
          <Text variant="caption" tone="muted">
            {rawCode}
          </Text>
        </Box>
      </Page>
    );
  }

  if (draft.step === 0) {
    return (
      <WarrantyCodeStep
        draft={draft}
        onChange={setDraft}
        onNext={() => setDraft(current => nextStep(current))}
        onBack={onExit}
        provinceState={provinceState}
        wardState={wardState}
        resolveNote={resolveNote}
      />
    );
  }

  if (draft.step === 1) {
    return (
      <WarrantyDefectStep
        draft={draft}
        onChange={setDraft}
        onNext={() => setDraft(current => nextStep(current))}
        onBack={() => setDraft(current => previousStep(current))}
        defects={defects}
        loading={defectsPhase === 'loading'}
        forbidden={defectsPhase === 'forbidden'}
        error={
          defectsError === undefined ? undefined : messageForUser(defectsError)
        }
        onRetry={loadDefectList}
      />
    );
  }

  return (
    <WarrantyDescriptionStep
      draft={
        submitError === undefined
          ? draft
          : // Lỗi gửi hiện ngay dưới ô mô tả — chỗ người dùng đang nhìn.
            updateIntake(draft, {
              errors: { ...draft.errors, description: messageForUser(submitError) },
            })
      }
      onChange={setDraft}
      onNext={() => {
        handleSubmit().catch(() => undefined);
      }}
      onBack={() => setDraft(current => previousStep(current))}
      submitting={submitting}
      selectedDefects={selectedDefects}
    />
  );
}
