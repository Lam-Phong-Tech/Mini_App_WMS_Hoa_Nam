<?php

namespace App\Support;

use Illuminate\Contracts\Config\Repository as Config;

/**
 * Đọc và kiểm tra hợp lệ cấu hình retention.
 *
 * Cấu hình sai phải bị TỪ CHỐI AN TOÀN (không chạy), không được đoán giá trị.
 */
class RetentionPolicy
{
    public function __construct(private readonly Config $config) {}

    public function enabled(): bool
    {
        return (bool) $this->config->get('retention.enabled', false);
    }

    public function timezone(): string
    {
        return (string) $this->config->get('retention.timezone', 'UTC');
    }

    public function scheduleAt(): string
    {
        return (string) $this->config->get('retention.schedule_at', '02:30');
    }

    public function chunkSize(): int
    {
        return (int) $this->config->get('retention.chunk_size', 500);
    }

    public function maxRowsPerRun(): int
    {
        return (int) $this->config->get('retention.max_rows_per_run', 10000);
    }

    public function zaloPayloadRetentionDays(): ?int
    {
        return $this->days('retention.zalo_webhook_events.payload_retention_days');
    }

    public function zaloRowRetentionDays(): ?int
    {
        return $this->days('retention.zalo_webhook_events.row_retention_days');
    }

    public function warehouseScanPayloadRetentionDays(): ?int
    {
        return $this->days('retention.warehouse_scans.payload_retention_days');
    }

    /**
     * @return array<int, string>
     */
    public function zaloTerminalStatuses(): array
    {
        $statuses = $this->config->get('retention.zalo_webhook_events.terminal_statuses', []);

        return is_array($statuses) ? array_values(array_filter($statuses, 'is_string')) : [];
    }

    /**
     * @return array<int, string>
     */
    public function warehouseCompactableStatuses(): array
    {
        $statuses = $this->config->get('retention.warehouse_scans.compactable_statuses', []);

        return is_array($statuses) ? array_values(array_filter($statuses, 'is_string')) : [];
    }

    public function warehouseRowDeletionAllowed(): bool
    {
        return (bool) $this->config->get('retention.warehouse_scans.allow_row_deletion', false);
    }

    /**
     * Trả về danh sách lỗi cấu hình. Rỗng = hợp lệ.
     *
     * @return array<int, string>
     */
    public function validate(): array
    {
        $errors = [];

        if ($this->chunkSize() < 1) {
            $errors[] = 'retention.chunk_size phải >= 1.';
        }

        if ($this->maxRowsPerRun() < 1) {
            $errors[] = 'retention.max_rows_per_run phải >= 1.';
        }

        foreach ([
            'retention.zalo_webhook_events.payload_retention_days',
            'retention.zalo_webhook_events.row_retention_days',
            'retention.warehouse_scans.payload_retention_days',
        ] as $key) {
            $raw = $this->config->get($key);

            if ($raw === null || $raw === '') {
                continue; // null = tác vụ bị tắt, hợp lệ
            }

            if (! is_numeric($raw) || (int) $raw < 1) {
                $errors[] = $key.' phải là số nguyên >= 1 hoặc để trống để tắt.';
            }
        }

        $payloadDays = $this->zaloPayloadRetentionDays();
        $rowDays = $this->zaloRowRetentionDays();

        if ($payloadDays !== null && $rowDays !== null && $rowDays < $payloadDays) {
            $errors[] = 'ZALO_WEBHOOK_RETENTION_DAYS phải >= ZALO_WEBHOOK_PAYLOAD_RETENTION_DAYS '
                .'(xoá dòng phải xảy ra sau khi dọn payload).';
        }

        if ($this->zaloTerminalStatuses() === []) {
            $errors[] = 'retention.zalo_webhook_events.terminal_statuses không được rỗng.';
        }

        if ($this->warehouseCompactableStatuses() === []) {
            $errors[] = 'retention.warehouse_scans.compactable_statuses không được rỗng.';
        }

        if (in_array('PENDING_APPROVAL', $this->warehouseCompactableStatuses(), true)) {
            $errors[] = 'PENDING_APPROVAL không bao giờ được nằm trong compactable_statuses '
                .'— đó là bản ghi chưa xử lý xong.';
        }

        if ($this->warehouseRowDeletionAllowed()) {
            $errors[] = 'retention.warehouse_scans.allow_row_deletion phải là false — '
                .'xoá dòng khỏi audit trail nghiệp vụ chưa được chứng minh an toàn.';
        }

        if (! in_array($this->timezone(), timezone_identifiers_list(), true)) {
            $errors[] = 'retention.timezone không phải timezone hợp lệ: '.$this->timezone();
        }

        if (preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $this->scheduleAt()) !== 1) {
            $errors[] = 'retention.schedule_at phải theo định dạng HH:MM (24 giờ).';
        }

        return $errors;
    }

    private function days(string $key): ?int
    {
        $raw = $this->config->get($key);

        if ($raw === null || $raw === '') {
            return null;
        }

        return is_numeric($raw) && (int) $raw >= 1 ? (int) $raw : null;
    }
}
