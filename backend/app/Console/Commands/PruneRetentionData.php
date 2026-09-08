<?php

namespace App\Console\Commands;

use App\Support\RetentionPolicy;
use App\Support\RetentionReport;
use Illuminate\Console\Command;
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Dọn dữ liệu quá hạn cho `zalo_webhook_events` và `warehouse_scans`.
 *
 * MẶC ĐỊNH CHẠY DRY-RUN. Chỉ thay đổi dữ liệu khi truyền `--execute`.
 *
 * Nguyên tắc an toàn:
 *  - Xử lý theo chunk dựa trên khoá chính, transaction ở phạm vi từng chunk.
 *  - Không bao giờ chạm dòng chưa ở trạng thái kết thúc.
 *  - Không bao giờ xoá dòng khỏi `warehouse_scans`.
 *  - Không log payload, token hay dữ liệu nhạy cảm.
 */
class PruneRetentionData extends Command
{
    protected $signature = 'retention:prune
        {--execute : Thực sự thay đổi dữ liệu. Bỏ qua cờ này = dry-run.}
        {--target=all : all|zalo-payloads|zalo-rows|warehouse-payloads}
        {--limit= : Ghi đè số bản ghi tối đa cho lượt chạy này.}';

    protected $description = 'Dọn dữ liệu quá hạn theo chính sách retention (mặc định dry-run).';

    private const TARGETS = ['all', 'zalo-payloads', 'zalo-rows', 'warehouse-payloads'];

    public function handle(RetentionPolicy $policy): int
    {
        $dryRun = ! $this->option('execute');
        $target = (string) $this->option('target');

        if (! in_array($target, self::TARGETS, true)) {
            $this->error(sprintf('--target không hợp lệ: "%s". Cho phép: %s', $target, implode(', ', self::TARGETS)));

            return self::FAILURE;
        }

        $configErrors = $policy->validate();

        if ($configErrors !== []) {
            $this->error('Cấu hình retention không hợp lệ — từ chối chạy:');
            foreach ($configErrors as $error) {
                $this->line('  - '.$error);
            }

            return self::FAILURE;
        }

        $budget = $this->resolveBudget($policy);

        if ($budget === null) {
            return self::FAILURE;
        }

        $this->line($dryRun
            ? '<comment>DRY-RUN</comment> — không có thay đổi nào được ghi. Dùng --execute để áp dụng.'
            : '<info>EXECUTE</info> — dữ liệu SẼ bị thay đổi.');

        $report = new RetentionReport;
        $remaining = $budget;

        foreach ($this->tasksFor($target, $policy) as $task) {
            if ($remaining <= 0) {
                $report->noteBudgetExhausted($task['name']);

                continue;
            }

            try {
                $processed = $this->runTask($task, $policy, $dryRun, $remaining, $report);
                $remaining -= $processed;
            } catch (Throwable $error) {
                $report->recordFailure($task['name'], $error->getMessage());
                $this->error(sprintf('Tác vụ "%s" thất bại: %s', $task['name'], $error->getMessage()));
            }
        }

        $this->renderReport($report, $dryRun);
        $this->logReport($report, $dryRun);

        if ($report->hasFailures()) {
            return self::FAILURE;
        }

        if (! $dryRun) {
            // Dấu vết cho retention:status biết scheduler còn sống.
            Cache::forever(RetentionStatus::LAST_RUN_CACHE_KEY, now()->toIso8601String());
        }

        return self::SUCCESS;
    }

    /**
     * @return array<int, array{name: string, table: string, mode: string, days: int|null, apply: callable}>
     */
    private function tasksFor(string $target, RetentionPolicy $policy): array
    {
        $tasks = [];

        if (in_array($target, ['all', 'zalo-payloads'], true)) {
            $tasks[] = [
                'name' => 'zalo-payloads',
                'table' => 'zalo_webhook_events',
                'mode' => 'compact',
                'days' => $policy->zaloPayloadRetentionDays(),
                'filter' => fn (Builder $query) => $this->zaloTerminalScope($query, $policy)
                    ->where(function (Builder $inner): void {
                        $inner->whereNotNull('raw_payload')->orWhereNotNull('normalized_payload');
                    }),
                'apply' => fn (array $ids) => DB::table('zalo_webhook_events')
                    ->whereIn('id', $ids)
                    ->update(['raw_payload' => null, 'normalized_payload' => null]),
            ];
        }

        if (in_array($target, ['all', 'zalo-rows'], true)) {
            $tasks[] = [
                'name' => 'zalo-rows',
                'table' => 'zalo_webhook_events',
                'mode' => 'delete',
                'days' => $policy->zaloRowRetentionDays(),
                'filter' => fn (Builder $query) => $this->zaloTerminalScope($query, $policy),
                'apply' => fn (array $ids) => DB::table('zalo_webhook_events')->whereIn('id', $ids)->delete(),
            ];
        }

        if (in_array($target, ['all', 'warehouse-payloads'], true)) {
            $tasks[] = [
                'name' => 'warehouse-payloads',
                'table' => 'warehouse_scans',
                'mode' => 'compact',
                'days' => $policy->warehouseScanPayloadRetentionDays(),
                'filter' => fn (Builder $query) => $query
                    ->whereIn('approval_status', $policy->warehouseCompactableStatuses())
                    ->whereNotNull('response_payload'),
                'apply' => fn (array $ids) => DB::table('warehouse_scans')
                    ->whereIn('id', $ids)
                    ->update(['response_payload' => null]),
            ];
        }

        return $tasks;
    }

    private function zaloTerminalScope(Builder $query, RetentionPolicy $policy): Builder
    {
        // whereIn tự loại NULL, nhưng viết tường minh để ý định rõ ràng:
        // dòng chưa xác định trạng thái KHÔNG BAO GIỜ đủ điều kiện.
        return $query
            ->whereNotNull('status')
            ->whereIn('status', $policy->zaloTerminalStatuses());
    }

    /**
     * @param  array{name: string, table: string, mode: string, days: int|null, filter: callable, apply: callable}  $task
     */
    private function runTask(array $task, RetentionPolicy $policy, bool $dryRun, int $remaining, RetentionReport $report): int
    {
        if ($task['days'] === null) {
            $report->noteDisabled($task['name']);

            return 0;
        }

        $cutoff = Carbon::now()->subDays($task['days']);
        $chunkSize = $policy->chunkSize();

        // Đếm tổng số đủ điều kiện để báo cáo (không giới hạn theo budget).
        $eligible = (int) $this->eligibleQuery($task, $cutoff)->count();
        $report->noteEligible($task['name'], $eligible, $cutoff, $task['days'], $task['mode']);

        if ($eligible === 0) {
            return 0;
        }

        $processed = 0;
        $lastId = 0;

        while ($processed < $remaining) {
            $take = min($chunkSize, $remaining - $processed);

            $ids = $this->eligibleQuery($task, $cutoff)
                ->where('id', '>', $lastId)
                ->orderBy('id')
                ->limit($take)
                ->pluck('id')
                ->all();

            if ($ids === []) {
                break;
            }

            $lastId = (int) end($ids);

            if ($dryRun) {
                $processed += count($ids);

                continue;
            }

            // Transaction ở phạm vi CHUNK, không phải toàn bảng.
            DB::transaction(function () use ($task, $ids): void {
                ($task['apply'])($ids);
            });

            $processed += count($ids);
        }

        $report->noteProcessed($task['name'], $processed, max(0, $eligible - $processed));

        return $processed;
    }

    /**
     * @param  array{table: string, mode: string, filter: callable}  $task
     */
    private function eligibleQuery(array $task, Carbon $cutoff): Builder
    {
        $query = DB::table($task['table'])->where('created_at', '<', $cutoff);

        return ($task['filter'])($query);
    }

    private function resolveBudget(RetentionPolicy $policy): ?int
    {
        $limitOption = $this->option('limit');

        if ($limitOption === null) {
            return $policy->maxRowsPerRun();
        }

        if (! ctype_digit((string) $limitOption) || (int) $limitOption < 1) {
            $this->error('--limit phải là số nguyên dương.');

            return null;
        }

        return min((int) $limitOption, $policy->maxRowsPerRun());
    }

    private function renderReport(RetentionReport $report, bool $dryRun): void
    {
        $rows = $report->toTableRows();

        if ($rows === []) {
            $this->line('Không có tác vụ nào được bật.');

            return;
        }

        $this->table(
            ['Tác vụ', 'Chế độ', 'Ngày giữ', 'Đủ điều kiện', 'Đã xử lý', 'Bỏ qua', 'Thất bại'],
            $rows
        );

        if ($dryRun) {
            $this->line('<comment>Dry-run: 0 dòng bị thay đổi.</comment>');
        }
    }

    private function logReport(RetentionReport $report, bool $dryRun): void
    {
        // Chỉ log số liệu tổng hợp — KHÔNG log payload, token, id người dùng
        // hay bất kỳ nội dung bản ghi nào.
        Log::info('Retention prune finished.', [
            'dry_run' => $dryRun,
            'stats' => $report->toLogContext(),
        ]);
    }
}
