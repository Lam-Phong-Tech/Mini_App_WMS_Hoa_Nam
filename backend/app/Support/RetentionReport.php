<?php

namespace App\Support;

use Illuminate\Support\Carbon;

/**
 * Gom số liệu của một lượt chạy retention.
 *
 * CHỈ chứa số đếm và tên tác vụ — không bao giờ chứa nội dung bản ghi,
 * payload, token hay định danh người dùng.
 */
class RetentionReport
{
    /** @var array<string, array{mode: string, days: int|null, cutoff: string|null, eligible: int, processed: int, skipped: int, failed: int, note: string|null}> */
    private array $tasks = [];

    public function noteEligible(string $task, int $eligible, Carbon $cutoff, int $days, string $mode): void
    {
        $entry = $this->entry($task);
        $entry['eligible'] = $eligible;
        $entry['cutoff'] = $cutoff->toIso8601String();
        $entry['days'] = $days;
        $entry['mode'] = $mode;
        $this->tasks[$task] = $entry;
    }

    public function noteProcessed(string $task, int $processed, int $skipped): void
    {
        $entry = $this->entry($task);
        $entry['processed'] = $processed;
        $entry['skipped'] = $skipped;
        $this->tasks[$task] = $entry;
    }

    public function noteDisabled(string $task): void
    {
        $entry = $this->entry($task);
        $entry['note'] = 'disabled';
        $this->tasks[$task] = $entry;
    }

    public function noteBudgetExhausted(string $task): void
    {
        $entry = $this->entry($task);
        $entry['note'] = 'budget-exhausted';
        $this->tasks[$task] = $entry;
    }

    public function recordFailure(string $task, string $message): void
    {
        $entry = $this->entry($task);
        $entry['failed']++;
        // Chỉ giữ lớp ngoại lệ/thông điệp ngắn, không giữ dữ liệu bản ghi.
        $entry['note'] = 'failed: '.mb_substr($message, 0, 120);
        $this->tasks[$task] = $entry;
    }

    public function hasFailures(): bool
    {
        foreach ($this->tasks as $entry) {
            if ($entry['failed'] > 0) {
                return true;
            }
        }

        return false;
    }

    /**
     * @return array<int, array<int, string|int>>
     */
    public function toTableRows(): array
    {
        $rows = [];

        foreach ($this->tasks as $name => $entry) {
            $rows[] = [
                $name.($entry['note'] !== null ? ' ('.$entry['note'].')' : ''),
                $entry['mode'],
                $entry['days'] ?? '—',
                $entry['eligible'],
                $entry['processed'],
                $entry['skipped'],
                $entry['failed'],
            ];
        }

        return $rows;
    }

    /**
     * @return array<string, array<string, mixed>>
     */
    public function toLogContext(): array
    {
        return $this->tasks;
    }

    /**
     * @return array{mode: string, days: int|null, cutoff: string|null, eligible: int, processed: int, skipped: int, failed: int, note: string|null}
     */
    private function entry(string $task): array
    {
        return $this->tasks[$task] ?? [
            'mode' => '—',
            'days' => null,
            'cutoff' => null,
            'eligible' => 0,
            'processed' => 0,
            'skipped' => 0,
            'failed' => 0,
            'note' => null,
        ];
    }
}
