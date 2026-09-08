/**
 * Navigator gốc.
 *
 * Thư viện `react-navigation` — quyết định đã được người dùng chốt trong
 * phiên phê duyệt Prompt 2 (cùng với `apps/wms-mobile/` và giữ `fetch`).
 */

import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AppShell } from '../app/AppShell';
import { DiagnosticsScreen } from '../features/diagnostics/DiagnosticsScreen';
import { ScanTestScreen } from '../features/diagnostics/ScanTestScreen';
import { CameraScanScreen } from '../features/scan/CameraScanScreen';
import { tokens } from '../theme/tokens';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

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
          component={DiagnosticsScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="ScanTest"
          component={ScanTestScreen}
          options={{ title: 'Kiểm tra đầu quét' }}
        />
        <Stack.Screen
          name="CameraScan"
          component={CameraScanScreen}
          options={{ title: 'Quét bằng camera' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
