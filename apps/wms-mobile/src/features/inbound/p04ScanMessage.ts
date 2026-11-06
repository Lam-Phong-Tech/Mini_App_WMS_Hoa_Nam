import type { P04Row } from '../../services/wms/p04Inbound';
import { skuInactiveMessage } from '../../errors/skuInactiveMessage';
import { parseScanPayload } from '../../scanner/scanPayload';

/** Display copy only. The authoritative outcome/reason/raw remain in the journal. */
export function p04ScanMessage(row: P04Row, raw: string): string {
  const messages: Record<string, string> = {
    DUPLICATE_ITEM_IN_BATCH: 'Mã đã có trong phiếu. Không cộng thêm số lượng.',
    CODE_REJECTED: 'Mã chưa hợp lệ cho nhập kho. Kiểm tra và nhập lại.',
    NEW_SKU_TYPE_REQUIRED: 'Chọn sản phẩm hoặc linh kiện cho SKU mới.',
  };
  return skuInactiveMessage(
    row.reason_code,
    messages[row.reason_code ?? ''] ?? row.message ?? 'Mã chưa hợp lệ cho phiếu này.',
    row.resolved?.sku_code ?? parseScanPayload(raw).sku,
  );
}
