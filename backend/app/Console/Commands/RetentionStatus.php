<?php

namespace App\Console\Commands;

use App\Support\RetentionPolicy;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

/**
 * Health-check cho cơ chế retention.
 *
 * Trả exit code khác 0 khi có vấn đề, để hệ thống giám sát (cron wrapper,
 * Nagios, Zabbix, uptime check…) bắt được và cảnh báo:
 *   - retention đang bật nhưng scheduler chưa từng chạy
 *   - lần chạy gần nhất quá cũ (scheduler chết)
 *   - tồn đọng (backlog) vượt ngưỡng => dung lượng vẫn đang tăng
 */
class RetentionStatus extends Command
{
    public const LAST_RUN_CACHE_KEY = 'retention:last_successful_run_at';

    protected $signature = 'retention:status
        {--max-age-hours=48 : Cảnh báo nếu lần chạy gần nhất cũ hơn ngưỡng này.}
        {--max-backlog=50000 : Cảnh báo nếu số bản ghi đủ điều kiện vượt ngưỡng.}';

    protected $description = 'Kiểm tra sức khoẻ retention: scheduler có chạy không, backlog có tăng không.';

    public function handle(RetentionPolicy $policy): int
    {
        $problems = [];

        $zaloRows = (int) DB::table('zalo_webhook_events')->count();
        $zaloWithPayload = (int) DB::table('zalo_webhook_events')->whereNotNull('raw_payload')->count();
        $scanRows = (int) DB::table('warehouse_scans')->count();
        $scanWithPayload = (int) DB::table('warehouse_scans')->whereNotNull('response_payload')->count();

        $this->table(['Chỉ số', 'Giá trị'], [
            ['retention.enabled', $policy->enabled() ? 'true' : 'false'],
            ['zalo_webhook_events — tổng dòng', $zaloRows],
            ['zalo_webhook_events — còn payload', $zaloWithPayload],
            ['warehouse_scans — tổng dòng', $scanRows],
            ['warehouse_scans — còn payload', $scanWithPayload],
        ]);

        $configErrors = $policy->validate();

        if ($configErrors !== []) {
            foreach ($configErrors as $error) {
                $problems[] = 'Cấu hình: '.$error;
            }
        }

        if (! $policy->enabled()) {
            $this->warn('retention.enabled = false — chưa có cơ chế dọn nào đang chạy.');
            $this->line('Đây là trạng thái mong đợi cho tới khi chính sách retention được phê duyệt.');

            return $this->finish($problems);
        }

        $lastRun = Cache::get(self::LAST_RUN_CACHE_KEY);
        $maxAgeHours = (int) $this->option('max-age-hours');

        if ($lastRun === null) {
            $problems[] = 'Retention đang BẬT nhưng chưa ghi nhận lần chạy thành công nào.';
        } else {
            $lastRunAt = Carbon::parse($lastRun);
            $this->line('Lần chạy thành công gần nhất: '.$lastRunAt->toIso8601String());

            if ($lastRunAt->lt(Carbon::now()->subHours($maxAgeHours))) {
                $problems[] = sprintf(
                    'Lần chạy gần nhất đã %d giờ trước (ngưỡng %d giờ) — scheduler có thể đã chết.',
                    (int) $lastRunAt->diffInHours(Carbon::now()),
                    $maxAgeHours
                );
            }
        }

        $backlog = $this->backlog($policy);
        $maxBacklog = (int) $this->option('max-backlog');

        $this->line('Backlog đủ điều kiện xử lý: '.$backlog);

        if ($backlog > $maxBacklog) {
            $problems[] = sprintf(
                'Backlog %d vượt ngưỡng %d — dung lượng vẫn đang tăng nhanh hơn tốc độ dọn.',
                $backlog,
                $maxBacklog
            );
        }

        return $this->finish($problems);
    }

    private function backlog(RetentionPolicy $policy): int
    {
        $total = 0;

        if (($days = $policy->zaloPayloadRetentionDays()) !== null) {
            $total += (int) DB::table('zalo_webhook_events')
                ->where('created_at', '<', Carbon::now()->subDays($days))
                ->whereNotNull('status')
                ->whereIn('status', $policy->zaloTerminalStatuses())
                ->whereNotNull('raw_payload')
                ->count();
        }

        if (($days = $policy->warehouseScanPayloadRetentionDays()) !== null) {
            $total += (int) DB::table('warehouse_scans')
                ->where('created_at', '<', Carbon::now()->subDays($days))
                ->whereIn('approval_status', $policy->warehouseCompactableStatuses())
                ->whereNotNull('response_payload')
                ->count();
        }

        return $total;
    }

    /**
     * @param  array<int, string>  $problems
     */
    private function finish(array $problems): int
    {
        if ($problems === []) {
            $this->info('Retention OK.');

            return self::SUCCESS;
        }

        foreach ($problems as $problem) {
            $this->error($problem);
        }

        return self::FAILURE;
    }
}
