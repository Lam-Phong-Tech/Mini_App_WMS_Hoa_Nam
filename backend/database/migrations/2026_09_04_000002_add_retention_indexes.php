<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Index phục vụ truy vấn retention (BACKEND_RETENTION_HOTFIX).
 *
 * Chỉ THÊM index. Không xoá, không biến đổi dữ liệu hiện có.
 *
 * ─────────────────────────────────────────────────────────────────────────
 *  CĂN CỨ (không phỏng đoán) — truy vấn thực tế trong PruneRetentionData:
 *
 *  zalo_webhook_events:
 *      WHERE created_at < ?  AND status IS NOT NULL
 *        AND status IN (<terminal>)  AND id > ?
 *      ORDER BY id LIMIT ?
 *
 *  warehouse_scans:
 *      WHERE created_at < ?  AND approval_status IN ('APPROVED')
 *        AND response_payload IS NOT NULL  AND id > ?
 *      ORDER BY id LIMIT ?
 *
 *  INDEX HIỆN CÓ (đã đọc migration gốc):
 *    zalo_webhook_events : status, received_at, occurred_at (đều là index ĐƠN)
 *                          => KHÔNG có index nào trên created_at
 *    warehouse_scans     : approval_status (đơn)
 *                          => KHÔNG có index nào trên created_at
 *
 *  Cả hai truy vấn lọc bằng (status ≡) + (created_at range) rồi duyệt theo id.
 *  Composite (status, created_at, id) phục vụ trọn cả ba mệnh đề; index đơn
 *  hiện có chỉ phục vụ được mệnh đề đầu và vẫn phải quét theo created_at.
 * ─────────────────────────────────────────────────────────────────────────
 */
return new class extends Migration
{
    /** CREATE INDEX CONCURRENTLY (PostgreSQL) không chạy được trong transaction. */
    public $withinTransaction = false;

    private const INDEXES = [
        'zalo_webhook_events' => [
            'name' => 'zwe_status_created_at_id_index',
            'columns' => ['status', 'created_at', 'id'],
        ],
        'warehouse_scans' => [
            'name' => 'ws_approval_created_at_id_index',
            'columns' => ['approval_status', 'created_at', 'id'],
        ],
    ];

    public function up(): void
    {
        foreach (self::INDEXES as $table => $index) {
            if (! Schema::hasTable($table) || $this->indexExists($table, $index['name'])) {
                continue;
            }

            if ($this->isPostgres()) {
                // CONCURRENTLY: không khoá ghi trên bảng đang phục vụ production.
                DB::statement(sprintf(
                    'CREATE INDEX CONCURRENTLY IF NOT EXISTS %s ON %s (%s)',
                    $index['name'],
                    $table,
                    implode(', ', $index['columns'])
                ));

                continue;
            }

            Schema::table($table, function (Blueprint $blueprint) use ($index): void {
                $blueprint->index($index['columns'], $index['name']);
            });
        }
    }

    public function down(): void
    {
        foreach (self::INDEXES as $table => $index) {
            if (! Schema::hasTable($table) || ! $this->indexExists($table, $index['name'])) {
                continue;
            }

            if ($this->isPostgres()) {
                DB::statement(sprintf('DROP INDEX CONCURRENTLY IF EXISTS %s', $index['name']));

                continue;
            }

            Schema::table($table, function (Blueprint $blueprint) use ($index): void {
                $blueprint->dropIndex($index['name']);
            });
        }
    }

    private function isPostgres(): bool
    {
        return DB::connection()->getDriverName() === 'pgsql';
    }

    private function indexExists(string $table, string $name): bool
    {
        try {
            return Schema::hasIndex($table, $name);
        } catch (Throwable) {
            return false;
        }
    }
};
