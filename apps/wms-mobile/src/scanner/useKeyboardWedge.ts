/**
 * Hook nối Keyboard Wedge vào một màn hình cụ thể.
 *
 * Spec §3 mục 8 — listener chỉ hoạt động ở màn hình cần quét. Hook tự `start()`
 * khi `enabled` bật và `stop()` khi màn hình rời đi, nên không màn nào nuốt phím
 * của màn khác.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardWedgeSource } from './KeyboardWedgeSource';
import type { WedgeParserConfig } from './keyboardWedge';
import type { ScanDetectedResult } from './types';

export interface UseKeyboardWedgeOptions {
  /** Bật/tắt theo màn hình. */
  enabled: boolean;
  onScan: (result: ScanDetectedResult) => void;
  config?: Partial<WedgeParserConfig>;
}

export interface KeyboardWedgeBinding {
  /** Giá trị hiển thị của ô nhập ẩn giữ focus để hứng ký tự từ đầu quét. */
  value: string;
  /** Gắn vào `onChangeText` của `TextInput`. */
  onChangeText: (text: string) => void;
  /** Gắn vào `onSubmitEditing` — đầu quét gửi Enter sẽ kích hoạt. */
  onSubmitEditing: () => void;
  /** Trạng thái nội bộ của nguồn, dùng cho màn chẩn đoán. */
  sourceState: string;
}

export function useKeyboardWedge(
  options: UseKeyboardWedgeOptions,
): KeyboardWedgeBinding {
  const { enabled, onScan, config } = options;

  // Giữ callback mới nhất mà không phải khởi động lại nguồn mỗi lần render.
  const onScanRef = useRef(onScan);
  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  const source = useMemo(() => new KeyboardWedgeSource(config), [config]);
  const [value, setValue] = useState('');
  const [sourceState, setSourceState] = useState<string>(source.getState());

  useEffect(() => {
    let cancelled = false;

    if (!enabled) {
      source.stop().then(() => {
        if (!cancelled) {
          setSourceState(source.getState());
        }
      });
      return () => {
        cancelled = true;
      };
    }

    source
      .initialize()
      .then(() =>
        source.start(result => {
          setValue('');
          onScanRef.current(result);
        }),
      )
      .then(() => {
        if (!cancelled) {
          setSourceState(source.getState());
        }
      });

    return () => {
      cancelled = true;
      source.stop();
    };
  }, [enabled, source]);

  const onChangeText = useCallback(
    (text: string) => {
      setValue(text);
      // Ô nhập trả về toàn bộ nội dung; chỉ nạp phần ký tự mới thêm vào.
      source.feedText(text.slice(value.length));
    },
    [source, value.length],
  );

  const onSubmitEditing = useCallback(() => {
    source.flush();
    setValue('');
  }, [source]);

  return { value, onChangeText, onSubmitEditing, sourceState };
}
