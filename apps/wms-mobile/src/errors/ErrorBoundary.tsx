/**
 * Error boundary ở gốc cây React.
 *
 * Máy PDA trong kho không có ai debug tại chỗ: crash trắng màn hình đồng nghĩa
 * dừng việc. Boundary này giữ app sống và cho thao tác viên thử lại.
 */

import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { logger } from '../logging/logger';
import { messageForUser, toAppError } from './AppError';
import { Button } from '../ui/Button';
import { Text } from '../ui/Text';
import { tokens } from '../theme/tokens';
import { ScreenRetryContext } from './recoverableLazy';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: tokens.spacing.xl,
    gap: tokens.spacing.lg,
    backgroundColor: tokens.colors.surfaceCanvas,
  },
});

interface Props {
  children: ReactNode;
  /** A deliberate route change can recover a failed route independently. */
  resetKey?: unknown;
}

interface State {
  error?: Error;
  retryEpoch: number;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = {retryEpoch:0};

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    logger.error('Lỗi không bắt được ở tầng React', {
      message: error.message,
      componentStack: info.componentStack,
    });
  }

  private handleRetry = (): void => {
    // setState merges: an empty object left the original error latched.
    this.setState(state=>({error:undefined,retryEpoch:state.retryEpoch+1}));
  };

  componentDidUpdate(previous:Props):void {
    if(previous.resetKey!==this.props.resetKey&&this.state.error!==undefined)
      this.setState(state=>({error:undefined,retryEpoch:state.retryEpoch+1}));
  }

  render(): ReactNode {
    const { error } = this.state;
    if (error === undefined) {
      return <ScreenRetryContext.Provider value={this.state.retryEpoch}>{this.props.children}</ScreenRetryContext.Provider>;
    }

    return (
      <View style={styles.container}>
        <Text variant="cardTitle" tone="strong">
          Ứng dụng gặp sự cố
        </Text>
        <Text variant="body">{messageForUser(toAppError(error))}</Text>
        <Button label="Thử lại" onPress={this.handleRetry} />
      </View>
    );
  }
}
