<?php

namespace Tests\Feature;

use App\Support\RetentionPolicy;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Tests\TestCase;

class RetentionPruneTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        config()->set('retention.chunk_size', 2);
        config()->set('retention.max_rows_per_run', 1000);
        config()->set('retention.zalo_webhook_events.payload_retention_days', 30);
        config()->set('retention.zalo_webhook_events.row_retention_days', 90);
        config()->set('retention.warehouse_scans.payload_retention_days', 30);
    }

    // ---------------------------------------------------------------- helpers

    private function webhookEvent(string $status, int $ageDays, bool $withPayload = true): int
    {
        $at = Carbon::now()->subDays($ageDays);

        return (int) DB::table('zalo_webhook_events')->insertGetId([
            'event_key' => substr(hash('sha256', Str::uuid()->toString()), 0, 64),
            'app_id' => '123',
            'event_name' => 'user_received_message',
            'event_scope' => 'zns',
            'payload_variant' => 'zns_delivery',
            'status' => $status,
            'raw_payload' => $withPayload ? json_encode(['secret' => 'RAW_TOKEN_VALUE']) : null,
            'normalized_payload' => $withPayload ? json_encode(['n' => 1]) : null,
            'duplicate_count' => 0,
            'received_at' => $at,
            'created_at' => $at,
            'updated_at' => $at,
        ]);
    }

    private function scan(string $approvalStatus, int $ageDays, bool $withPayload = true): int
    {
        $at = Carbon::now()->subDays($ageDays);

        return (int) DB::table('warehouse_scans')->insertGetId([
            'client_scan_id' => Str::uuid()->toString(),
            'code' => 'CODE-'.Str::random(6),
            'normalized_code' => 'CODE'.Str::random(6),
            'quantity' => 1,
            'scan_method' => 'MANUAL',
            'scan_context' => 'RECEIPT',
            'approval_status' => $approvalStatus,
            'response_payload' => $withPayload ? json_encode(['data' => ['secret' => 'PAYLOAD']]) : null,
            'created_at' => $at,
            'updated_at' => $at,
        ]);
    }

    // ------------------------------------------------------------------ tests

    public function test_dry_run_changes_nothing(): void
    {
        $old = $this->webhookEvent('delivered', 200);
        $scan = $this->scan('APPROVED', 200);

        $this->artisan('retention:prune')->assertExitCode(0);

        $this->assertNotNull(DB::table('zalo_webhook_events')->find($old)->raw_payload);
        $this->assertNotNull(DB::table('warehouse_scans')->find($scan)->response_payload);
        $this->assertDatabaseCount('zalo_webhook_events', 1);
        $this->assertDatabaseCount('warehouse_scans', 1);
    }

    public function test_records_newer_than_cutoff_are_untouched(): void
    {
        $fresh = $this->webhookEvent('delivered', 5);
        $freshScan = $this->scan('APPROVED', 5);

        $this->artisan('retention:prune --execute')->assertExitCode(0);

        $this->assertNotNull(DB::table('zalo_webhook_events')->find($fresh)->raw_payload);
        $this->assertNotNull(DB::table('warehouse_scans')->find($freshScan)->response_payload);
    }

    public function test_non_terminal_webhook_statuses_are_never_processed(): void
    {
        $other = $this->webhookEvent('other_event', 200);

        DB::table('zalo_webhook_events')->where('id', $other)->update(['status' => null]);
        $nullStatus = $other;

        $unknown = $this->webhookEvent('other_event', 200);

        $this->artisan('retention:prune --execute')->assertExitCode(0);

        // status NULL và 'other_event' đều KHÔNG đủ điều kiện.
        $this->assertNotNull(DB::table('zalo_webhook_events')->find($nullStatus)->raw_payload);
        $this->assertNotNull(DB::table('zalo_webhook_events')->find($unknown)->raw_payload);
        $this->assertDatabaseCount('zalo_webhook_events', 2);
    }

    public function test_pending_warehouse_scans_are_never_processed(): void
    {
        $pending = $this->scan('PENDING_APPROVAL', 500);

        $this->artisan('retention:prune --execute')->assertExitCode(0);

        $this->assertNotNull(DB::table('warehouse_scans')->find($pending)->response_payload);
    }

    public function test_warehouse_scan_rows_are_never_deleted(): void
    {
        $this->scan('APPROVED', 5000);
        $this->scan('PENDING_APPROVAL', 5000);

        $this->artisan('retention:prune --execute')->assertExitCode(0);

        // Payload bị dọn nhưng DÒNG phải còn nguyên — audit trail bất biến.
        $this->assertDatabaseCount('warehouse_scans', 2);
    }

    public function test_eligible_records_are_processed(): void
    {
        $compactable = $this->webhookEvent('delivered', 45);   // > 30, < 90 => chỉ dọn payload
        $scan = $this->scan('APPROVED', 45);

        $this->artisan('retention:prune --execute')->assertExitCode(0);

        $this->assertNull(DB::table('zalo_webhook_events')->find($compactable)->raw_payload);
        $this->assertNull(DB::table('zalo_webhook_events')->find($compactable)->normalized_payload);
        $this->assertNull(DB::table('warehouse_scans')->find($scan)->response_payload);

        // Metadata phải được giữ nguyên.
        $row = DB::table('zalo_webhook_events')->find($compactable);
        $this->assertSame('delivered', $row->status);
        $this->assertNotNull($row->event_key);
    }

    public function test_rows_older_than_row_retention_are_deleted(): void
    {
        $veryOld = $this->webhookEvent('delivered', 200);      // > 90 => xoá dòng

        $this->artisan('retention:prune --execute')->assertExitCode(0);

        $this->assertDatabaseMissing('zalo_webhook_events', ['id' => $veryOld]);
    }

    public function test_cutoff_boundary_is_exclusive(): void
    {
        // Đúng 30 ngày: created_at < cutoff là FALSE => KHÔNG đủ điều kiện.
        $exactly = $this->webhookEvent('delivered', 30);
        DB::table('zalo_webhook_events')->where('id', $exactly)
            ->update(['created_at' => Carbon::now()->subDays(30)->addSeconds(5)]);

        $justOver = $this->webhookEvent('delivered', 30);
        DB::table('zalo_webhook_events')->where('id', $justOver)
            ->update(['created_at' => Carbon::now()->subDays(30)->subSeconds(5)]);

        $this->artisan('retention:prune --execute --target=zalo-payloads')->assertExitCode(0);

        $this->assertNotNull(DB::table('zalo_webhook_events')->find($exactly)->raw_payload);
        $this->assertNull(DB::table('zalo_webhook_events')->find($justOver)->raw_payload);
    }

    public function test_chunking_and_row_limit_are_respected(): void
    {
        for ($i = 0; $i < 6; $i++) {
            $this->webhookEvent('delivered', 45);
        }

        // chunk_size = 2, limit = 3 => xử lý đúng 3 dòng.
        $this->artisan('retention:prune --execute --target=zalo-payloads --limit=3')->assertExitCode(0);

        $compacted = DB::table('zalo_webhook_events')->whereNull('raw_payload')->count();
        $this->assertSame(3, $compacted);
    }

    public function test_running_twice_is_safe(): void
    {
        $this->webhookEvent('delivered', 45);
        $this->scan('APPROVED', 45);

        $this->artisan('retention:prune --execute')->assertExitCode(0);
        $this->artisan('retention:prune --execute')->assertExitCode(0);

        $this->assertDatabaseCount('zalo_webhook_events', 1);
        $this->assertDatabaseCount('warehouse_scans', 1);
    }

    public function test_disabled_task_does_nothing(): void
    {
        config()->set('retention.zalo_webhook_events.payload_retention_days', null);
        config()->set('retention.zalo_webhook_events.row_retention_days', null);
        config()->set('retention.warehouse_scans.payload_retention_days', null);

        $event = $this->webhookEvent('delivered', 500);
        $scan = $this->scan('APPROVED', 500);

        $this->artisan('retention:prune --execute')->assertExitCode(0);

        $this->assertNotNull(DB::table('zalo_webhook_events')->find($event)->raw_payload);
        $this->assertNotNull(DB::table('warehouse_scans')->find($scan)->response_payload);
    }

    public function test_scheduler_is_not_registered_when_disabled(): void
    {
        config()->set('retention.enabled', false);

        $events = collect(app(Schedule::class)->events())
            ->filter(fn ($event) => str_contains((string) $event->command, 'retention:prune'));

        $this->assertCount(0, $events);
    }

    public function test_invalid_configuration_is_rejected(): void
    {
        config()->set('retention.chunk_size', 0);

        $this->artisan('retention:prune')->assertExitCode(1);
    }

    public function test_row_retention_shorter_than_payload_retention_is_rejected(): void
    {
        config()->set('retention.zalo_webhook_events.payload_retention_days', 90);
        config()->set('retention.zalo_webhook_events.row_retention_days', 30);

        $this->artisan('retention:prune')->assertExitCode(1);
    }

    public function test_pending_approval_in_compactable_statuses_is_rejected(): void
    {
        config()->set('retention.warehouse_scans.compactable_statuses', ['APPROVED', 'PENDING_APPROVAL']);

        $this->artisan('retention:prune')->assertExitCode(1);
    }

    public function test_row_deletion_flag_cannot_be_enabled(): void
    {
        config()->set('retention.warehouse_scans.allow_row_deletion', true);

        $this->artisan('retention:prune')->assertExitCode(1);
    }

    public function test_invalid_target_is_rejected(): void
    {
        $this->artisan('retention:prune --target=nope')->assertExitCode(1);
    }

    public function test_invalid_limit_is_rejected(): void
    {
        $this->artisan('retention:prune --limit=0')->assertExitCode(1);
        $this->artisan('retention:prune --limit=abc')->assertExitCode(1);
    }

    public function test_logging_contains_no_payload_or_secrets(): void
    {
        $captured = [];
        Log::listen(function ($message) use (&$captured): void {
            $captured[] = json_encode($message->context);
        });

        $this->webhookEvent('delivered', 45);
        $this->scan('APPROVED', 45);

        $this->artisan('retention:prune --execute')->assertExitCode(0);

        $all = implode("\n", $captured);
        $this->assertNotSame('', $all, 'Kỳ vọng có ít nhất một log entry.');
        $this->assertStringNotContainsString('RAW_TOKEN_VALUE', $all);
        $this->assertStringNotContainsString('PAYLOAD', $all);
        $this->assertStringNotContainsString('raw_payload', $all);
        $this->assertStringNotContainsString('client_scan_id', $all);
    }

    public function test_policy_validation_accepts_null_retention_days(): void
    {
        config()->set('retention.zalo_webhook_events.payload_retention_days', null);
        config()->set('retention.zalo_webhook_events.row_retention_days', null);
        config()->set('retention.warehouse_scans.payload_retention_days', null);

        $this->assertSame([], app(RetentionPolicy::class)->validate());
    }
}
