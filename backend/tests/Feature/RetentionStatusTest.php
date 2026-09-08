<?php

namespace Tests\Feature;

use App\Console\Commands\RetentionStatus;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Tests\TestCase;

class RetentionStatusTest extends TestCase
{
    use RefreshDatabase;

    public function test_status_is_ok_when_retention_disabled(): void
    {
        config()->set('retention.enabled', false);

        $this->artisan('retention:status')->assertExitCode(0);
    }

    public function test_status_fails_when_enabled_but_never_ran(): void
    {
        config()->set('retention.enabled', true);
        Cache::forget(RetentionStatus::LAST_RUN_CACHE_KEY);

        $this->artisan('retention:status')->assertExitCode(1);
    }

    public function test_status_fails_when_last_run_is_stale(): void
    {
        config()->set('retention.enabled', true);
        Cache::forever(RetentionStatus::LAST_RUN_CACHE_KEY, Carbon::now()->subDays(10)->toIso8601String());

        $this->artisan('retention:status --max-age-hours=48')->assertExitCode(1);
    }

    public function test_status_is_ok_when_recently_ran(): void
    {
        config()->set('retention.enabled', true);
        Cache::forever(RetentionStatus::LAST_RUN_CACHE_KEY, Carbon::now()->subHour()->toIso8601String());

        $this->artisan('retention:status --max-age-hours=48')->assertExitCode(0);
    }

    public function test_status_fails_when_configuration_invalid(): void
    {
        config()->set('retention.enabled', true);
        config()->set('retention.chunk_size', 0);
        Cache::forever(RetentionStatus::LAST_RUN_CACHE_KEY, Carbon::now()->toIso8601String());

        $this->artisan('retention:status')->assertExitCode(1);
    }

    public function test_execute_run_records_last_run_but_dry_run_does_not(): void
    {
        Cache::forget(RetentionStatus::LAST_RUN_CACHE_KEY);

        $this->artisan('retention:prune')->assertExitCode(0);
        $this->assertNull(Cache::get(RetentionStatus::LAST_RUN_CACHE_KEY), 'Dry-run không được ghi dấu vết.');

        $this->artisan('retention:prune --execute')->assertExitCode(0);
        $this->assertNotNull(Cache::get(RetentionStatus::LAST_RUN_CACHE_KEY));
    }
}
