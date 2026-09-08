/**
 * App bootstrap — gốc cây React.
 *
 * Thứ tự bọc có chủ đích:
 *   SafeAreaProvider  → cung cấp insets cho `Page`
 *   ErrorBoundary     → bắt lỗi của mọi thứ bên trong, kể cả navigator
 *   ThemeProvider     → token cho toàn bộ UI
 *   RootNavigator     → điều hướng
 */

import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ErrorBoundary } from '../errors/ErrorBoundary';
import { ThemeProvider } from '../theme/ThemeProvider';
import { RootNavigator } from '../navigation/RootNavigator';
import { initDataLayer } from '../sync/bootstrap';

/**
 * Cây provider, tách khỏi `App` để test dựng được **một** màn với đúng ngữ cảnh
 * thật (theme, safe area, error boundary) mà không phải kéo theo navigator.
 *
 * Dùng lại cây thật thay vì dựng provider giả trong test: provider giả sẽ trôi
 * xa dần bản thật, và test sẽ xanh trong khi app hỏng.
 */
export function AppProviders({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <ThemeProvider>{children}</ThemeProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}

export default function App(): React.ReactElement {
  // Chạy đúng một lần, trước khi màn đầu tiên đọc dữ liệu:
  // migration schema, rồi dọn bản ghi kẹt ở `syncing` do app bị đóng đột ngột.
  React.useState(initDataLayer);

  return (
    <AppProviders>
      <RootNavigator />
    </AppProviders>
  );
}
