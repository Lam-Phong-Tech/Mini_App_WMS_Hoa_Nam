/**
 * `StatusScreen` — màn trạng thái toàn trang: một thẻ giữa màn, có icon tròn,
 * tiêu đề, câu giải thích và tối đa hai hành động.
 *
 * 🎨 Nguồn: **ba** ảnh dùng chung đúng khuôn này, nên tách ra một component
 * thay vì viết ba màn giống nhau:
 *
 * | Ảnh | Màn | Icon | Hành động |
 * |:--:|---|---|---|
 * | 06 | Phiên đăng nhập đã hết hạn | đồng hồ, nền cam | *Đăng nhập lại* |
 * | 07 | Không có quyền | khiên, nền đỏ | *Về trang chủ* + *Quay lại* |
 * | 47 | Không tìm thấy màn hình | (banner cam thay icon) | *Về trang chủ* |
 *
 * Câu chữ ở ảnh 06 đáng giữ nguyên văn: *"Dữ liệu chưa gửi không được tự động
 * gửi lại."* — đó là một **cam kết nghiệp vụ**, khớp đúng chính sách hàng đợi
 * (`syncEngine`: không tự retry). Viết lại câu này thành thứ mơ hồ hơn là làm
 * thủ kho mất niềm tin vào việc dữ liệu của họ còn hay mất.
 */

import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Page } from '../../ui/Page';
import { Box } from '../../ui/Box';
import { Text } from '../../ui/Text';
import { Button } from '../../ui/Button';
import { AppIcon, type AppIconName } from '../../ui/AppIcon';
import { useTheme } from '../../theme/ThemeProvider';
import {
  P15ExpiredScreen,
  P15PermissionScreen,
  type P15ExpiredScreenProps,
  type P15PermissionScreenProps,
} from '../system/P15Screen';

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    textAlign: 'center',
  },
  message: {
    textAlign: 'center',
  },
  secondary: {
    textAlign: 'center',
    fontWeight: '600',
  },
});

export type StatusTone = 'warning' | 'danger' | 'info';

export interface StatusScreenProps {
  title: string;
  message: string;
  tone?: StatusTone;
  /** Icon nét, không phụ thuộc font icon của thiết bị. */
  icon?: AppIconName;
  primaryLabel?: string;
  onPrimary?: () => void;
  /** Hành động phụ dạng chữ, như *Quay lại* ở ảnh 07. */
  secondaryLabel?: string;
  onSecondary?: () => void;
}

export function StatusScreen({
  title,
  message,
  tone = 'warning',
  icon = 'alert',
  primaryLabel,
  onPrimary,
  secondaryLabel,
  onSecondary,
}: StatusScreenProps): React.ReactElement {
  const theme = useTheme();

  const iconBackground: Record<StatusTone, string> = {
    warning: theme.colors.warningSoft,
    danger: theme.colors.dangerSoft,
    info: theme.colors.infoSoft,
  };
  const iconColor: Record<StatusTone, string> = {
    warning: theme.colors.warning,
    danger: theme.colors.danger,
    info: theme.colors.info,
  };

  return (
    <Page scroll={false}>
      <View style={styles.center}>
        <Box card padding="xl" gap="lg">
          <View
            style={[
              styles.iconCircle,
              { backgroundColor: iconBackground[tone] },
            ]}
          >
            <AppIcon name={icon} size={26} color={iconColor[tone]} />
          </View>

          <Text variant="cardTitle" tone="strong" style={styles.title}>
            {title}
          </Text>

          <Text variant="caption" tone="muted" style={styles.message}>
            {message}
          </Text>

          {primaryLabel === undefined || onPrimary === undefined ? null : (
            <Button label={primaryLabel} onPress={onPrimary} />
          )}

          {secondaryLabel === undefined || onSecondary === undefined ? null : (
            <Text
              variant="caption"
              accessibilityRole="button"
              onPress={onSecondary}
              style={[styles.secondary, { color: theme.colors.primary }]}
            >
              {secondaryLabel}
            </Text>
          )}
        </Box>
      </View>
    </Page>
  );
}

// ---------------------------------------------------------------------------
// Ba màn dựng sẵn — câu chữ nguyên văn từ ảnh
// ---------------------------------------------------------------------------

/** Existing auth entry; only its presentation changes, never auth ownership. */
export function SessionExpiredScreen(props: P15ExpiredScreenProps): React.ReactElement {
  return <P15ExpiredScreen {...props} />;
}

/** Caller must verify denial; HTTP status alone is not evidence of RBAC. */
export function NoPermissionScreen(props: P15PermissionScreenProps & {
  onHome: () => void;
}): React.ReactElement {
  return <P15PermissionScreen {...props} />;
}

/** Trạng thái tạm thời trước khi Mini App trả người dùng về màn đăng nhập. */
export function LogoutProgressScreen(): React.ReactElement {
  const theme = useTheme();
  return (
    <Page scroll={false}>
      <View style={styles.center}>
        <Box card padding="xl" gap="md">
          <ActivityIndicator color={theme.colors.primary} size="large" />
          <Text variant="cardTitle" tone="strong" style={styles.title}>
            Đang đăng xuất...
          </Text>
          <Text variant="caption" tone="muted" style={styles.message}>
            WMS đang kết thúc phiên và xóa dữ liệu truy cập trên thiết bị này.
          </Text>
        </Box>
      </View>
    </Page>
  );
}

/** Ảnh 47 — route không tồn tại. */
export function NotFoundScreen({
  onHome,
}: {
  onHome: () => void;
}): React.ReactElement {
  return (
    <StatusScreen
      tone="warning"
      icon="clock"
      title="Đường dẫn không hợp lệ"
      message="Màn này không còn tồn tại hoặc bản app đang mở chưa được cập nhật route."
      primaryLabel="Về trang chủ"
      onPrimary={onHome}
    />
  );
}
