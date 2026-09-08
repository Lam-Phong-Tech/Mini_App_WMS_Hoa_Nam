/**
 * Nút Quay lại của Android.
 *
 * Đo trên máy thật 2026-09-06: đang ở danh sách hồ sơ bảo hành, bấm Back →
 * **app đóng hẳn**. Không có `BackHandler` nào trong toàn bộ mã nguồn.
 *
 * Test này khoá hai điều: có đăng ký với `BackHandler` thật, và **màn trong
 * cùng được xử lý trước** — nếu sai thứ tự thì Back ở bước 3 phiếu bảo hành sẽ
 * nhảy thẳng ra ngoài, mất hết dữ liệu đã điền.
 */

import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { BackHandler, View } from 'react-native';
import {
  useHardwareBack,
  resetHardwareBackForTest,
} from '../src/app/useHardwareBack';

// React Native's TypeScript preset does not include Node globals, while Jest
// provides this CommonJS value when the source-level regression guard runs.
declare const __dirname: string;

function Screen({ action }: { action: () => boolean }): React.ReactElement {
  useHardwareBack(action);
  return <View />;
}

/** Bấm Back như hệ điều hành làm: gọi mọi listener đã đăng ký. */
function pressBack(): boolean {
  const calls = (BackHandler.addEventListener as jest.Mock).mock.calls;
  let handled = false;
  for (const [event, handler] of calls) {
    if (event === 'hardwareBackPress' && handler() === true) {
      handled = true;
    }
  }
  return handled;
}

describe('useHardwareBack', () => {
  beforeEach(() => {
    resetHardwareBackForTest();
    jest.spyOn(BackHandler, 'addEventListener').mockReturnValue({
      remove: () => undefined,
    } as never);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    resetHardwareBackForTest();
  });

  it('đăng ký với BackHandler của hệ điều hành', () => {
    act(() => {
      renderer.create(<Screen action={() => true} />);
    });
    expect(BackHandler.addEventListener).toHaveBeenCalledWith(
      'hardwareBackPress',
      expect.any(Function),
    );
  });

  it('🔴 màn TRONG CÙNG xử lý trước — không nhảy thẳng ra ngoài', () => {
    const order: string[] = [];
    act(() => {
      renderer.create(
        <View>
          <Screen
            action={() => {
              order.push('ngoài');
              return true;
            }}
          />
          <Screen
            action={() => {
              order.push('trong');
              return true;
            }}
          />
        </View>,
      );
    });
    expect(pressBack()).toBe(true);
    expect(order).toEqual(['trong']);
  });

  it('trả false thì nhường cho lớp ngoài', () => {
    const order: string[] = [];
    act(() => {
      renderer.create(
        <View>
          <Screen
            action={() => {
              order.push('ngoài');
              return true;
            }}
          />
          <Screen
            action={() => {
              order.push('trong');
              return false;
            }}
          />
        </View>,
      );
    });
    expect(pressBack()).toBe(true);
    expect(order).toEqual(['trong', 'ngoài']);
  });

  it('không ai nhận thì trả false — Android đóng app như thường', () => {
    act(() => {
      renderer.create(<Screen action={() => false} />);
    });
    expect(pressBack()).toBe(false);
  });

  it('gỡ màn thì gỡ luôn handler của nó', () => {
    const outer = jest.fn(() => true);
    const inner = jest.fn(() => true);
    let tree: renderer.ReactTestRenderer | undefined;
    act(() => {
      tree = renderer.create(
        <View>
          <Screen action={outer} />
          <Screen action={inner} />
        </View>,
      );
    });
    act(() => {
      tree?.update(
        <View>
          <Screen action={outer} />
        </View>,
      );
    });
    pressBack();
    expect(inner).not.toHaveBeenCalled();
    expect(outer).toHaveBeenCalled();
  });

  it('🔒 AppShell phải có handler — nếu không, Back đóng app', () => {
    const fs = require('fs');
    const path = require('path');
    const source = fs.readFileSync(
      path.join(__dirname, '..', 'src', 'app', 'AppShell.tsx'),
      'utf8',
    );
    expect(source).toContain('useHardwareBack(');
  });
});
