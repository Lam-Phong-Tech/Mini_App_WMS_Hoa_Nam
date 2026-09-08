/**
 * Danh sách kho nhận cho màn tạo phiếu.
 *
 * 🔓 Đọc thật qua `GATE_WMS §2d` — `GET /api/v1/warehouses`. Không mock.
 *
 * ## Vì sao lọc `status=ACTIVE`
 *
 * Lấy đúng query Mini App đang chạy dùng (`03-api-mapping.md`, hàng *"Lấy kho
 * nhận"*): `?status=ACTIVE&per_page=50`. Kho đã ngừng hoạt động vẫn còn trong
 * WMS; đưa nó vào danh sách chọn là mời thủ kho nhập hàng vào một kho đã đóng,
 * và lỗi đó chỉ lộ ra ở bước cuối khi máy chủ từ chối cả phiếu.
 *
 * ## Vì sao tự chọn kho đầu tiên
 *
 * Mini App đang chạy làm đúng vậy (`pages/ReceiptCreatePage/index.tsx:41`).
 * Phần lớn thủ kho chỉ làm việc với **một** kho, nên bắt họ mở hộp chọn mỗi
 * lần tạo phiếu là thêm một thao tác không mang thông tin gì. Vẫn đổi được.
 *
 * ⚠️ Chọn sẵn **không** có nghĩa là bỏ qua lỗi: khi WMS không trả kho nào,
 * `warehouseId` để trống và `continueToScan` chặn lại kèm lý do *"Chưa lấy được
 * kho nhận từ WMS"* — vì đó là sự cố mạng/quyền, không phải người dùng quên.
 */

import { useCallback, useEffect, useState } from 'react';
import { toAppError, type AppError } from '../../errors/AppError';
import { fetchWarehouses } from '../../services/wms/queries';
import type { Warehouse } from '../../services/wms/types';

/** Chỉ lấy kho đang hoạt động — xem chú thích đầu tệp. */
export const WAREHOUSE_STATUS_ACTIVE = 'ACTIVE';

export type WarehousePhase = 'loading' | 'ready' | 'error';

export interface WarehouseState {
  readonly phase: WarehousePhase;
  readonly warehouses: readonly Warehouse[];
  readonly error?: AppError;
}

export interface UseWarehousesDeps {
  readonly fetch?: typeof fetchWarehouses;
}

/**
 * Nhãn hiển thị một kho.
 *
 * Ghép mã với tên khi có cả hai: hai kho trùng tên khác mã là chuyện thường, và
 * chọn nhầm kho thì cả phiếu vào sai chỗ. Không có gì để hiện thì trả về `id` —
 * xấu, nhưng vẫn phân biệt được, hơn là một dòng trống.
 */
export function warehouseLabel(warehouse: Warehouse): string {
  const name = warehouse.name?.trim() ?? '';
  const code = warehouse.code?.trim() ?? '';
  if (code !== '' && name !== '') {
    return code + ' — ' + name;
  }
  return name !== '' ? name : code !== '' ? code : warehouse.id;
}

export function useWarehouses(deps: UseWarehousesDeps = {}): WarehouseState & {
  reload: () => void;
} {
  const load = deps.fetch ?? fetchWarehouses;

  const [state, setState] = useState<WarehouseState>({
    phase: 'loading',
    warehouses: [],
  });

  const run = useCallback(async () => {
    setState({ phase: 'loading', warehouses: [] });
    try {
      const page = await load({ query: { status: WAREHOUSE_STATUS_ACTIVE } });
      setState({ phase: 'ready', warehouses: page.items });
    } catch (error) {
      setState({ phase: 'error', warehouses: [], error: toAppError(error) });
    }
  }, [load]);

  useEffect(() => {
    // `catch` rỗng có chủ đích: `run` đã tự bắt lỗi và đưa vào state. Ở đây chỉ
    // cần chặn unhandled rejection — cùng quy ước với `useHomeSummary`.
    run().catch(() => undefined);
  }, [run]);

  const reload = useCallback(() => {
    run().catch(() => undefined);
  }, [run]);

  return { ...state, reload };
}
