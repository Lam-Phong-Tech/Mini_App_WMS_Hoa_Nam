/**
 * Navigator gốc.
 *
 * Thư viện `react-navigation` — quyết định đã được người dùng chốt trong
 * phiên phê duyệt Prompt 2 (cùng với `apps/wms-mobile/` và giữ `fetch`).
 */

import React, { Suspense, lazy } from 'react';
import { StyleSheet, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AppShell } from '../app/AppShell';
import { tokens } from '../theme/tokens';
import type { RootStackParamList } from './types';
import { Text } from '../ui/Text';

const Stack = createNativeStackNavigator<RootStackParamList>();

const DiagnosticsScreen = lazy(async () => {
  const module = await import('../features/diagnostics/DiagnosticsScreen');
  return { default: module.DiagnosticsScreen };
});
const ScanTestScreen = lazy(async () => {
  const module = await import('../features/diagnostics/ScanTestScreen');
  return { default: module.ScanTestScreen };
});
const CameraScanScreen = lazy(async () => {
  const module = await import('../features/scan/CameraScanScreen');
  return { default: module.CameraScanScreen };
});

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tokens.colors.surfaceCanvas,
  },
});

function DeferredScreen({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <Suspense
      fallback={
        <View style={styles.loading} accessibilityLiveRegion="polite">
          <Text variant="caption" tone="muted">Đang mở màn hình…</Text>
        </View>
      }
    >
      {children}
    </Suspense>
  );
}

function DeferredDiagnosticsScreen(): React.ReactElement {
  return <DeferredScreen><DiagnosticsScreen /></DeferredScreen>;
}

function DeferredScanTestScreen(): React.ReactElement {
  return <DeferredScreen><ScanTestScreen /></DeferredScreen>;
}

function DeferredCameraScanScreen(): React.ReactElement {
  return <DeferredScreen><CameraScanScreen /></DeferredScreen>;
}

export function RootNavigator(): React.ReactElement {
  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="Shell"
        screenOptions={{
          headerStyle: { backgroundColor: tokens.colors.surface },
          headerTintColor: tokens.colors.textStrong,
          contentStyle: { backgroundColor: tokens.colors.surfaceCanvas },
        }}
      >
        <Stack.Screen
          name="Shell"
          component={AppShell}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="Diagnostics"
          component={DeferredDiagnosticsScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="ScanTest"
          component={DeferredScanTestScreen}
          options={{ title: 'Kiểm tra đầu quét' }}
        />
        <Stack.Screen
          name="CameraScan"
          component={DeferredCameraScanScreen}
          options={{ title: 'Quét bằng camera' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
