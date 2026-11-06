/**
 * Preflight tier cho tầng React.
 *
 * 🔒 Mục 2 của luồng bắt buộc (2026-09-06): *"Khi app mở, gọi
 * `GET /api/v1/health`; chỉ bật quét và `post-receipt` khi header đúng."*
 *
 * ## Vì sao chạy ở tầng khung ứng dụng chứ không ở từng màn
 *
 * Nếu mỗi màn tự hỏi thì mở năm màn là năm request, và mỗi màn lại có thể ở
 * một kết luận khác nhau — thủ kho thấy màn này cho quét, màn kia không.
 * `AppShell` hỏi một lần lúc mở, các màn đọc chung kết quả đó.
 *
 * ⚠️ Kết quả này **không** dùng cho `post-receipt`: mục 3 đòi kiểm **lại** ngay
 * trước lệnh ghi, và `postReceipt()` tự làm việc đó. Kết quả ở đây chỉ để quyết
 * định bật/tắt giao diện.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  checkDeploymentTier,
  getLastTierCheck,
  scanningAllowed,
  type TierCheckResult,
} from './tierCheck';

export function useDeploymentTier(): TierCheckResult & {
  readonly allowed: boolean;
  readonly checking: boolean;
  readonly recheck: () => void;
} {
  const [result, setResult] = useState<TierCheckResult>(() =>
    getLastTierCheck(),
  );
  const [checking, setChecking] = useState(false);
  const inFlight = useRef(false);
  const mounted = useRef(true);

  const run = useCallback(() => {
    if (inFlight.current) return;
    inFlight.current = true;
    setChecking(true);
    // `checkDeploymentTier` không bao giờ ném — mọi hỏng hóc đã thành một kết
    // quả có trạng thái. `catch` chỉ để chắc chắn không có unhandled rejection.
    checkDeploymentTier()
      .then(next => {
        if (mounted.current) setResult(next);
      })
      .catch(() => undefined)
      .finally(() => {
        inFlight.current = false;
        if (mounted.current) setChecking(false);
      });
  }, []);

  useEffect(() => {
    mounted.current = true;
    // Đã có kết quả từ lần kiểm trước thì không hỏi lại lúc mount — tránh mỗi
    // lần dựng lại cây React là một request thừa.
    if (getLastTierCheck().status === 'unchecked') {
      run();
    } else {
      setResult(getLastTierCheck());
    }
    return () => {
      mounted.current = false;
    };
  }, [run]);

  return {
    ...result,
    allowed: scanningAllowed(result),
    checking,
    recheck: run,
  };
}
