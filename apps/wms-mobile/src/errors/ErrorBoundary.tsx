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
}

interface State {
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = {};

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    logger.error('Lỗi không bắt được ở tầng React', {
      message: error.message,
      componentStack: info.componentStack,
    });
  }

  private handleRetry = (): void => {
    this.setState({});
  };

  render(): ReactNode {
    const { error } = this.state;
    if (error === undefined) {
      return this.props.children;
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
