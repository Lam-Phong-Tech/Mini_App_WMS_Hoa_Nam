<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Tests\TestCase;

class RetentionMigrationTest extends TestCase
{
    use RefreshDatabase;

    private const MIGRATION = __DIR__.'/../../database/migrations/2026_09_04_000002_add_retention_indexes.php';

    public function test_webhook_payload_columns_are_nullable(): void
    {
        $id = DB::table('zalo_webhook_events')->insertGetId([
            'event_key' => substr(hash('sha256', 'nullable-check'), 0, 64),
            'status' => 'delivered',
            'raw_payload' => json_encode(['a' => 1]),
            'normalized_payload' => json_encode(['b' => 2]),
            'duplicate_count' => 0,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        // Trước hotfix, câu lệnh này ném NOT NULL constraint violation.
        DB::table('zalo_webhook_events')
            ->where('id', $id)
            ->update(['raw_payload' => null, 'normalized_payload' => null]);

        $row = DB::table('zalo_webhook_events')->find($id);

        $this->assertNull($row->raw_payload);
        $this->assertNull($row->normalized_payload);
        $this->assertSame('delivered', $row->status, 'Metadata phải được giữ nguyên.');
    }

    public function test_retention_indexes_exist_after_migration(): void
    {
        $this->assertTrue(Schema::hasTable('zalo_webhook_events'));
        $this->assertTrue(Schema::hasTable('warehouse_scans'));

        $this->assertTrue(
            Schema::hasIndex('zalo_webhook_events', 'zwe_status_created_at_id_index'),
            'Thiếu index retention trên zalo_webhook_events.'
        );
        $this->assertTrue(
            Schema::hasIndex('warehouse_scans', 'ws_approval_created_at_id_index'),
            'Thiếu index retention trên warehouse_scans.'
        );
    }

    public function test_migration_down_then_up_works(): void
    {
        $migration = require self::MIGRATION;

        $migration->down();

        $this->assertFalse(Schema::hasIndex('zalo_webhook_events', 'zwe_status_created_at_id_index'));
        $this->assertFalse(Schema::hasIndex('warehouse_scans', 'ws_approval_created_at_id_index'));

        $migration->up();

        $this->assertTrue(Schema::hasIndex('zalo_webhook_events', 'zwe_status_created_at_id_index'));
        $this->assertTrue(Schema::hasIndex('warehouse_scans', 'ws_approval_created_at_id_index'));
    }

    public function test_migration_is_idempotent(): void
    {
        $migration = require self::MIGRATION;

        // Chạy up lần hai trên schema đã có index — không được ném lỗi.
        $migration->up();

        $this->assertTrue(Schema::hasIndex('zalo_webhook_events', 'zwe_status_created_at_id_index'));
    }

    public function test_migration_does_not_alter_existing_data(): void
    {
        $id = DB::table('warehouse_scans')->insertGetId([
            'client_scan_id' => Str::uuid()->toString(),
            'code' => 'KEEP-ME',
            'normalized_code' => 'KEEPME',
            'quantity' => 3,
            'scan_method' => 'MANUAL',
            'scan_context' => 'RECEIPT',
            'approval_status' => 'APPROVED',
            'response_payload' => json_encode(['keep' => true]),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $migration = require self::MIGRATION;
        $migration->down();
        $migration->up();

        $row = DB::table('warehouse_scans')->find($id);

        $this->assertSame('KEEP-ME', $row->code);
        $this->assertSame(3, (int) $row->quantity);
        $this->assertNotNull($row->response_payload);
    }
}
