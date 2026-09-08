/**
 * Khoá lại cách chặn bộ gõ tiếng Việt ăn ký tự trong ô nhập mã.
 *
 * Bối cảnh đo được trên máy thật (Xiaomi 12 Pro, Gboard Telex, 2026-09-06):
 * ô nhập mã thường → gõ `TEST` nhận `TÉT`; sau khi đặt
 * `keyboardType="visible-password"` → gõ `TEST` nhận `TEST`.
 *
 * Test này không dựng lại được bàn phím Android, nên nó khoá **hai điều kiện
 * cần**: component gửi đúng `keyboardType`, và mọi màn nhập mã đều đi qua
 * `CodeInput` chứ không tự dựng `Input` rồi quên.
 */

import React from 'react';
import renderer from 'react-test-renderer';
import { TextInput } from 'react-native';
import { CodeInput } from '../src/ui/CodeInput';
import { Input } from '../src/ui/Input';
import { ThemeProvider } from '../src/theme/ThemeProvider';

declare const __dirname: string;

function read(relative: string): string {
  const fs = require('fs');
  const path = require('path');
  return fs.readFileSync(
    path.join(__dirname, '..', ...relative.split('/')),
    'utf8',
  );
}

/** Ô nhập mã trong app: nội dung là mã do máy sinh, không phải tiếng Việt. */
const CODE_SCREENS = [
  'src/features/scan/ManualCodeScreen.tsx',
  'src/features/scan/BusinessScanScreen.tsx',
  'src/features/lookup/LookupScreen.tsx',
  'src/features/diagnostics/ScanTestScreen.tsx',
];

function render(element: React.ReactElement): ReturnType<typeof renderer.create> {
  let tree: ReturnType<typeof renderer.create> | undefined;
  renderer.act(() => {
    tree = renderer.create(element);
  });
  if (tree === undefined) throw new Error('Không dựng được test renderer.');
  return tree;
}

function unmount(tree: ReturnType<typeof renderer.create>): void {
  renderer.act(() => {
    tree.unmount();
  });
}

describe('CodeInput — chặn Telex ăn ký tự của mã', () => {
  it('gửi keyboardType="visible-password" xuống TextInput', () => {
    const tree = render(
      <ThemeProvider>
        <CodeInput value="ABC" onChangeText={() => undefined} />
      </ThemeProvider>,
    );
    const input = tree.root.findByType(TextInput);
    expect(input.props.keyboardType).toBe('visible-password');
    expect(input.props.autoCorrect).toBe(false);
    expect(input.props.autoCapitalize).toBe('characters');
    unmount(tree);
  });

  it('bên gọi KHÔNG ghi đè được keyboardType', () => {
    const tree = render(
      <ThemeProvider>
        {/* @ts-expect-error cố tình truyền prop đã bị Omit khỏi kiểu */}
        <CodeInput value="ABC" keyboardType="default" />
      </ThemeProvider>,
    );
    expect(tree.root.findByType(TextInput).props.keyboardType).toBe(
      'visible-password',
    );
    unmount(tree);
  });

  it.each(CODE_SCREENS)('%s dùng CodeInput cho ô mã', file => {
    expect(read(file)).toContain('<CodeInput');
  });

  it('🔒 màn nhập mã không tự đặt lại keyboardType cho ô mã', () => {
    for (const file of CODE_SCREENS) {
      // Nếu ai đó quay lại dùng <Input ... autoCapitalize="characters"> thì
      // ô đó lại dính Telex mà không ai biết.
      const source = read(file);
      // `[^>]*` quét từng thẻ tuyến tính. Regex cũ lặp `\s+` lồng nhau trên
      // JSX nhiều dòng và làm Jest backtracking rất lâu trên Windows.
      const inputTags = source.match(/<Input\b[^>]*>/g) ?? [];
      expect(
        inputTags.some(tag => tag.includes('autoCapitalize="characters"')),
      ).toBe(false);
    }
  });

  it('ô tiếng Việt thật vẫn để nguyên bộ gõ', () => {
    // Tìm kiếm theo tên phiếu/tên kho là tiếng Việt — bỏ Telex ở đây là hại.
    expect(read('src/features/history/HistoryScreen.tsx')).not.toContain(
      'CodeInput',
    );
  });
});

describe('Input — không rủ Google lưu dữ liệu khách hàng', () => {
  // Chạy thật 2026-09-06: tạo xong hồ sơ bảo hành, Android hiện "Lưu mật khẩu
  // vào Google?" với tên người dùng là SỐ ĐIỆN THOẠI KHÁCH.
  it('mặc định tắt autofill', () => {
    const tree = render(
      <ThemeProvider>
        <Input value="0987001122" onChangeText={() => undefined} />
      </ThemeProvider>,
    );
    const input = tree.root.findByType(TextInput);
    expect(input.props.autoComplete).toBe('off');
    expect(input.props.importantForAutofill).toBe('no');
    unmount(tree);
  });

  it('bên gọi vẫn bật lại được cho tài khoản của chính người dùng', () => {
    const tree = render(
      <ThemeProvider>
        <Input
          value="a@b.c"
          onChangeText={() => undefined}
          autoComplete="username"
          importantForAutofill="yes"
        />
      </ThemeProvider>,
    );
    expect(tree.root.findByType(TextInput).props.autoComplete).toBe('username');
    unmount(tree);
  });

  it('🔒 chỉ màn đăng nhập được phép bật autofill', () => {
    const fs = require('fs');
    const path = require('path');
    const offenders: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
          if (
            fs.readFileSync(full, 'utf8').includes('importantForAutofill="yes"')
          ) {
            offenders.push(entry.name);
          }
        }
      }
    };
    walk(path.join(__dirname, '..', 'src'));
    expect(offenders).toEqual(['LoginScreen.tsx']);
  });
});
