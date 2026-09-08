/**
 * Nguồn quét Keyboard Wedge — hiện thực `ScanSource`.
 *
 * Đầu quét kiểu Keyboard Wedge gửi mã như thể người dùng gõ bàn phím. Trên
 * React Native, ký tự đến qua ô nhập đang giữ focus; vì vậy nguồn này nhận ký
 * tự bằng `feedText()` do tầng UI gọi (xem `useKeyboardWedge`), không tự hook
 * vào tầng native của bất kỳ hãng nào.
 *
 * ❌ Không có native module của hãng nào ở đây. GATE_01 §11 rule 2 cấm việc đó
 * khi chưa có thiết bị và tài liệu.
 */

import { KeyboardWedgeParser, type WedgeParserConfig } from './keyboardWedge';
import type { ScanDetectedResult, ScanSource, ScanSourceKind } from './types';

type SourceState = 'idle' | 'ready' | 'running' | 'paused';

export class KeyboardWedgeSource implements ScanSource {
  private readonly parser: KeyboardWedgeParser;
  private state: SourceState = 'idle';
  private unsubscribe?: () => void;

  constructor(config: Partial<WedgeParserConfig> = {}) {
    this.parser = new KeyboardWedgeParser(config);
  }

  getName(): string {
    return 'KeyboardWedgeSource';
  }

  getKind(): ScanSourceKind {
    return 'KEYBOARD_WEDGE';
  }

  /**
   * Luôn khả dụng: nguồn này chỉ cần ký tự đến từ ô nhập, không cần quyền hay
   * phần cứng riêng. Máy không có đầu quét thì đơn giản là không có ký tự.
   */
  isSupported(): boolean {
    return true;
  }

  /** Wedge bắn từng lần, không phát liên tục như camera. */
  isContinuous(): boolean {
    return false;
  }

  getState(): SourceState {
    return this.state;
  }

  async initialize(): Promise<void> {
    if (this.state !== 'idle') {
      return;
    }
    this.state = 'ready';
  }

  async start(onDetected: (result: ScanDetectedResult) => void): Promise<void> {
    if (this.state === 'idle') {
      throw new Error(
        'KeyboardWedgeSource: phải gọi initialize() trước start().',
      );
    }
    this.unsubscribe?.();
    this.unsubscribe = this.parser.onScan(onDetected);
    this.parser.setEnabled(true);
    this.state = 'running';
  }

  async pause(): Promise<void> {
    if (this.state !== 'running') {
      return;
    }
    this.parser.setEnabled(false);
    this.state = 'paused';
  }

  async resume(): Promise<void> {
    if (this.state !== 'paused') {
      return;
    }
    this.parser.setEnabled(true);
    this.state = 'running';
  }

  async stop(): Promise<void> {
    this.parser.setEnabled(false);
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    this.state = 'ready';
  }

  /** Nạp ký tự nhận được từ ô nhập đang giữ focus. */
  feedText(text: string): void {
    this.parser.pushText(text);
  }

  /** Kết thúc chuỗi ngay (ví dụ khi ô nhập báo sự kiện submit). */
  flush(): void {
    this.parser.flush();
  }
}
