import React from 'react';
import { Text } from '../../ui/Text';
import type { ReadField } from '../../services/wms/explicitReadFields';
import { formatVietnamDateTime } from '../../time/vietnamTime';

export function availabilityText(status: string) {
  return (
    (
      {
        NOT_RECORDED: 'Chưa ghi nhận',
        NOT_ESTABLISHED: 'Chưa có nguồn bàn giao',
        NOT_APPLICABLE: 'Không áp dụng',
        SOURCE_UNAVAILABLE: 'Nguồn tạm thời chưa sẵn sàng',
        SOURCE_INCONSISTENT: 'Nguồn dữ liệu chưa nhất quán',
        REDACTED_PERMISSION: 'Không có quyền xem thông tin này',
        NOT_CONFIGURED: 'Chưa cấu hình',
        UNSPECIFIED_BY_OWNER: 'Nguồn chưa cung cấp',
        NO_AUTHORITATIVE_CONTAINER_AVAILABILITY_MODEL:
          'Chưa có nguồn số lượng có thể xuất',
      } as Record<string, string>
    )[status] ?? 'Chưa có dữ liệu được xác nhận'
  );
}
export function fieldText(
  field: ReadField<string | number>,
  time = false,
): string {
  return field.supplied
    ? time
      ? formatVietnamDateTime(String(field.value))
      : String(field.value)
    : availabilityText(field.status);
}
export function ReadValue({
  label,
  field,
  time = false,
}: {
  label: string;
  field: ReadField<string | number>;
  time?: boolean;
}) {
  return (
    <Text>
      {label}: {fieldText(field, time)}
    </Text>
  );
}
