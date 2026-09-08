/**
 * Keyboard Wedge parser — nguồn quét bắt buộc thứ nhất (spec §2).
 *
 * Hiện thực đủ 8 khả năng bắt buộc của 01-scanner-architecture-requirements.md §3:
 *
 *   1. `Enter`  — nhận `\n`, `\r`, `\r\n`
 *   2. `Tab`    — nhận `\t`
 *   3. Custom suffix **có cấu hình**, không hard-code
 *   4. Timeout kết thúc chuỗi **có cấu hình**
 *   5. Loại ký tự điều khiển khỏi mã kết quả
 *   6. Chống xử lý hai lần — suffix và timeout không thể cùng phát một lần quét
 *   7. Buffer tuần tự — ký tự rời rạc gom đúng thứ tự
 *   8. Bật/tắt theo màn hình — `setEnabled()`
 *
 * 🔴 `Enter` chỉ là mặc định cho local/test. Suffix thật của PDA production chưa
 * được xác nhận và phải chốt ở GATE_PDA_HARDWARE_CERTIFICATION (spec §3.1).
 */

import type { ScanDetectedResult } from './types';

export type WedgeSuffix = 'ENTER' | 'TAB' | { readonly custom: string };

export interface WedgeParserConfig {
  /** Các suffix được coi là kết thúc chuỗi. Cấu hình được — spec §3 mục 3. */
  readonly suffixes: readonly WedgeSuffix[];
  /**
   * Số mili-giây im lặng thì tự kết thúc chuỗi, cho thiết bị KHÔNG gửi suffix.
   * `0` = tắt. Spec §3 mục 4 — phải cấu hình được.
   *
   * ⚠️ Giá trị phù hợp phải đo trên thiết bị thật (spec §5 mục 4).
   */
  readonly endOfScanTimeoutMs: number;
  /** Bỏ qua chuỗi ngắn hơn mức này (nhiễu phím). */
  readonly minCodeLength: number;
  /**
   * Cửa sổ chặn mã trùng liên tiếp. Mặc định `0` = TẮT.
   *
   * ⚠️ Mini App cũ hard-code 1800 ms và tạo ra rủi ro R-06: chặn nhầm thao tác
   * quét nhiều đơn vị cùng SKU (spec §4 mục 2). Không lặp lại — giá trị đúng
   * phải do nghiệp vụ và Gate phần cứng quyết định.
   */
  readonly dedupeWindowMs: number;
  /** Loại ký tự điều khiển không in được — spec §3 mục 5. */
  readonly stripControlCharacters: boolean;
}

export const DEFAULT_WEDGE_CONFIG: WedgeParserConfig = {
  suffixes: ['ENTER'],
  endOfScanTimeoutMs: 0,
  minCodeLength: 1,
  dedupeWindowMs: 0,
  stripControlCharacters: true,
};

/** Cho phép test tiêm bộ đếm thời gian tất định. */
export interface TimerApi {
  setTimeout(handler: () => void, timeoutMs: number): unknown;
  clearTimeout(handle: unknown): void;
}

const defaultTimerApi: TimerApi = {
  setTimeout: (handler, timeoutMs) => setTimeout(handler, timeoutMs),
  clearTimeout: handle => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/** Ký tự điều khiển ASCII + DEL. Giữ nguyên ký tự in được, kể cả Unicode. */
// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTERS = /[\x00-\x1F\x7F]/g;

function suffixToString(suffix: WedgeSuffix): string[] {
  if (suffix === 'ENTER') {
    // `\r\n` được xử lý tự nhiên: `\r` kết thúc chuỗi, `\n` sau đó rơi vào
    // buffer rỗng và bị bỏ qua.
    return ['\n', '\r'];
  }
  if (suffix === 'TAB') {
    return ['\t'];
  }
  return [suffix.custom];
}

export type ScanListener = (result: ScanDetectedResult) => void;

export class KeyboardWedgeParser {
  private readonly config: WedgeParserConfig;
  private readonly timers: TimerApi;
  private readonly terminators: readonly string[];
  private readonly listeners = new Set<ScanListener>();

  private buffer = '';
  private enabled = false;
  private pendingTimeout: unknown;
  private lastEmittedCode?: string;
  private lastEmittedAtMs = 0;

  constructor(
    config: Partial<WedgeParserConfig> = {},
    timers: TimerApi = defaultTimerApi,
  ) {
    this.config = { ...DEFAULT_WEDGE_CONFIG, ...config };
    this.timers = timers;
    this.terminators = this.config.suffixes.flatMap(suffixToString);
  }

  /** Spec §3 mục 8 — bật/tắt theo màn hình. */
  setEnabled(enabled: boolean): void {
    if (this.enabled === enabled) {
      return;
    }
    this.enabled = enabled;
    // Đổi trạng thái luôn xoá buffer: ký tự còn sót của màn trước không được
    // chảy sang màn sau.
    this.reset();
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  onScan(listener: ScanListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Nạp ký tự từ sự kiện bàn phím. Xử lý tuần tự từng ký tự để chuỗi đến rời
   * rạc vẫn gom đúng thứ tự (spec §3 mục 7).
   */
  pushText(text: string, nowMs: number = Date.now()): void {
    if (!this.enabled) {
      return;
    }
    for (const character of text) {
      if (this.terminators.includes(character)) {
        this.flush(nowMs);
      } else {
        this.buffer += character;
      }
    }
    this.armTimeout(nowMs);
  }

  /**
   * Kết thúc chuỗi đang gom và phát sự kiện nếu hợp lệ.
   * Huỷ timeout đang chờ trước khi phát — đây là chốt chống xử lý hai lần
   * (spec §3 mục 6).
   */
  flush(nowMs: number = Date.now()): void {
    this.cancelTimeout();

    const raw = this.buffer;
    this.buffer = '';

    if (raw.length === 0) {
      return;
    }

    const code = this.config.stripControlCharacters
      ? raw.replace(CONTROL_CHARACTERS, '')
      : raw;

    if (code.length < this.config.minCodeLength) {
      return;
    }

    if (this.isDuplicate(code, nowMs)) {
      return;
    }

    this.lastEmittedCode = code;
    this.lastEmittedAtMs = nowMs;

    const result: ScanDetectedResult = {
      code,
      detectedAt: new Date(nowMs).toISOString(),
      source: 'KEYBOARD_WEDGE',
    };
    for (const listener of this.listeners) {
      listener(result);
    }
  }

  /** Xoá buffer và timeout mà không phát sự kiện. */
  reset(): void {
    this.cancelTimeout();
    this.buffer = '';
  }

  /** Chỉ dùng để kiểm chứng trong test. */
  peekBuffer(): string {
    return this.buffer;
  }

  private isDuplicate(code: string, nowMs: number): boolean {
    if (this.config.dedupeWindowMs <= 0) {
      return false;
    }
    return (
      code === this.lastEmittedCode &&
      nowMs - this.lastEmittedAtMs < this.config.dedupeWindowMs
    );
  }

  private armTimeout(nowMs: number): void {
    this.cancelTimeout();
    if (this.config.endOfScanTimeoutMs <= 0 || this.buffer.length === 0) {
      return;
    }
    this.pendingTimeout = this.timers.setTimeout(() => {
      this.pendingTimeout = undefined;
      this.flush(nowMs + this.config.endOfScanTimeoutMs);
    }, this.config.endOfScanTimeoutMs);
  }

  private cancelTimeout(): void {
    if (this.pendingTimeout !== undefined) {
      this.timers.clearTimeout(this.pendingTimeout);
      this.pendingTimeout = undefined;
    }
  }
}
