/** Nháp linh kiện bảo hành — quét chỉ lưu trên máy, chưa gọi API. */

import { AppError } from '../../errors/AppError';
import { normalizeScanCode } from '../../scanner/scanPayload';
import {
  parseComponentBoxCode,
  parseComponentBoxQuantity,
} from '../inbound/inboundDraft';

export type WarrantyComponentKind = 'ITEM' | 'BOX';

export interface WarrantyComponentDraftItem {
  readonly key: string;
  readonly rawCode: string;
  readonly quantity: number;
  readonly kind: WarrantyComponentKind;
  /** ID SKU WMS dùng khi tạo line của phiếu xuất linh kiện. */
  readonly skuId?: string;
  /** Mã/tên chỉ phục vụ đối soát và hiển thị cho nhân viên. */
  readonly skuCode?: string;
  readonly skuName?: string;
  readonly sku?: string;
  readonly boxNumber?: string;
  /** Sinh một lần lúc thêm dòng và giữ nguyên khi người dùng bấm thử lại. */
  readonly idempotencyKey: string;
}

export interface WarrantyComponentDraft {
  readonly caseId: string;
  readonly sessionId: string;
  readonly items: readonly WarrantyComponentDraftItem[];
}

export function createWarrantyComponentSessionId(
  now: () => number = Date.now,
  random: () => number = Math.random,
): string {
  return now().toString(36) + '-' + random().toString(36).slice(2, 10);
}

export function createWarrantyComponentDraft(
  caseId: string,
  sessionId = createWarrantyComponentSessionId(),
): WarrantyComponentDraft {
  return { caseId, sessionId, items: [] };
}

function stableHash(value: string): string {
  let hash = 17;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) % 2_147_483_647;
  }
  return hash.toString(36);
}

export function warrantyComponentIdempotencyKey(
  caseId: string,
  sessionId: string,
  normalizedCode: string,
): string {
  return (
    'wmshn-wcomponent-' +
    stableHash(caseId + '|' + sessionId + '|' + normalizedCode)
  );
}

/**
 * `post` là lệnh duy nhất nhận Idempotency-Key. Khoá gắn với cả phiên nháp,
 * không gắn từng mã quét, nên bấm thử lại vẫn là cùng một lần xác nhận.
 */
export function warrantyComponentPostIdempotencyKey(
  caseId: string,
  sessionId: string,
): string {
  return 'wmshn-wcomponent-post-' + stableHash(caseId + '|' + sessionId);
}

export interface ResolvedWarrantyComponentSku {
  readonly skuId: string;
  readonly skuCode?: string;
  readonly skuName?: string;
  /** WMS xác nhận đây là mã hộp và nhân viên phải nhập số lượng. */
  readonly requiresQuantity?: boolean;
  /** Tồn khả dụng của chính mã/hộp WMS vừa đối soát, nếu WMS trả về. */
  readonly availableQuantity?: number;
}

export function hasWarrantyComponentCode(
  draft: WarrantyComponentDraft,
  rawCode: string,
): boolean {
  const key = normalizeScanCode(rawCode);
  return draft.items.some(item => item.key === key);
}

/**
 * Thêm một mã vào nháp. Tem linh kiện luôn là 1; mã hộp bắt buộc có số lượng
 * nguyên dương do nhân viên kiểm đếm và nhập.
 */
export function addWarrantyComponent(
  draft: WarrantyComponentDraft,
  rawCode: string,
  boxQuantity?: string | number,
  resolvedSku?: ResolvedWarrantyComponentSku,
): WarrantyComponentDraft {
  const code = rawCode.trim();
  const key = normalizeScanCode(code);
  if (key === '') {
    throw new AppError({ kind: 'config', message: 'Mã linh kiện không được rỗng.' });
  }
  if (hasWarrantyComponentCode(draft, code)) {
    throw new AppError({
      kind: 'config',
      message: 'Mã này đã có trong danh sách xuất linh kiện.',
    });
  }

  const parsedBox = parseComponentBoxCode(code);
  // Dùng cờ do resolver trả về làm nguồn chính. Parser chỉ là tương thích cho
  // nháp/test cũ; nó không được dùng để tự kết luận mã có được xuất hay không.
  const isBox = resolvedSku?.requiresQuantity === true || parsedBox !== undefined;
  let quantity = 1;
  if (isBox) {
    const parsedQuantity = parseComponentBoxQuantity(String(boxQuantity ?? ''));
    if (parsedQuantity === undefined) {
      throw new AppError({
        kind: 'config',
        message: 'Số lượng trong hộp phải là số nguyên dương.',
      });
    }
    if (
      resolvedSku?.availableQuantity !== undefined &&
      parsedQuantity > resolvedSku.availableQuantity
    ) {
      throw new AppError({
        kind: 'config',
        message:
          'Số lượng cần xuất vượt tồn khả dụng của hộp (' +
          String(resolvedSku.availableQuantity) +
          ').',
      });
    }
    quantity = parsedQuantity;
  }

  return {
    ...draft,
    items: [
      ...draft.items,
      {
        key,
        rawCode: code,
        quantity,
        kind: isBox ? 'BOX' : 'ITEM',
        skuId: resolvedSku?.skuId,
        skuCode: resolvedSku?.skuCode ?? parsedBox?.sku,
        skuName: resolvedSku?.skuName,
        sku: parsedBox?.sku ?? resolvedSku?.skuCode,
        boxNumber: parsedBox?.boxNumber,
        idempotencyKey: warrantyComponentIdempotencyKey(
          draft.caseId,
          draft.sessionId,
          key,
        ),
      },
    ],
  };
}

export function removeWarrantyComponent(
  draft: WarrantyComponentDraft,
  key: string,
): WarrantyComponentDraft {
  return { ...draft, items: draft.items.filter(item => item.key !== key) };
}

export function warrantyComponentTotal(draft: WarrantyComponentDraft): number {
  return draft.items.reduce((sum, item) => sum + item.quantity, 0);
}
