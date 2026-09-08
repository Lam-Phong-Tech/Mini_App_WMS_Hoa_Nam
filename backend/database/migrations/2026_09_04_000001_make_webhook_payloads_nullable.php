<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Cho phép NULL trên hai blob payload của `zalo_webhook_events`.
 * (BACKEND_RETENTION_HOTFIX)
 *
 * ─────────────────────────────────────────────────────────────────────────
 *  VÌ SAO CẦN:
 *  Migration gốc khai báo hai cột này KHÔNG nullable:
 *      2026_08_08_000001:24  $table->json('raw_payload');
 *      2026_08_08_000001:25  $table->json('normalized_payload');
 *  Nên tác vụ dọn payload không thể ghi NULL — phát hiện qua test thực tế:
 *      SQLSTATE[23000]: NOT NULL constraint failed:
 *      zalo_webhook_events.raw_payload
 *
 *  Đối chiếu: `warehouse_scans.response_payload` ĐÃ nullable sẵn
 *  (2026_08_06_000001:33) nên không cần đổi.
 *
 *  VÌ SAO DÙNG NULL (không dùng '{}'):
 *  NULL phân biệt rõ "payload đã bị dọn" với "payload vốn rỗng", giữ được
 *  khả năng truy vết. Bộ ghi luôn ghi mảng khác rỗng, nên NULL chỉ có thể
 *  đến từ việc dọn.
 *
 *  AN TOÀN DỮ LIỆU:
 *  Chỉ nới lỏng ràng buộc. KHÔNG xoá, KHÔNG biến đổi bất kỳ dữ liệu nào.
 *  Trên PostgreSQL, DROP NOT NULL chỉ sửa metadata catalog — tức thì,
 *  không rewrite bảng, không khoá lâu.
 * ─────────────────────────────────────────────────────────────────────────
 */
return new class extends Migration
{
    private const COLUMNS = ['raw_payload', 'normalized_payload'];

    public function up(): void
    {
        if (! Schema::hasTable('zalo_webhook_events')) {
            return;
        }

        if (DB::connection()->getDriverName() === 'pgsql') {
            foreach (self::COLUMNS as $column) {
                DB::statement(sprintf(
                    'ALTER TABLE zalo_webhook_events ALTER COLUMN %s DROP NOT NULL',
                    $column
                ));
            }

            return;
        }

        Schema::table('zalo_webhook_events', function (Blueprint $table): void {
            foreach (self::COLUMNS as $column) {
                $table->json($column)->nullable()->change();
            }
        });
    }

    /**
     * ⚠️ CỐ Ý KHÔNG khôi phục ràng buộc NOT NULL.
     *
     * Sau khi tác vụ dọn đã chạy, các dòng cũ hợp lệ sẽ mang giá trị NULL.
     * Đặt lại NOT NULL khi đó sẽ THẤT BẠI, hoặc buộc phải điền dữ liệu giả
     * đè lên bản ghi audit — cả hai đều không chấp nhận được.
     *
     * Nới lỏng ràng buộc là thao tác an toàn và tương thích ngược: mã hiện có
     * vẫn ghi giá trị khác NULL như trước.
     *
     * Muốn khôi phục thật sự thì phải quyết định trước sẽ làm gì với các dòng
     * đã dọn — đó là quyết định chính sách dữ liệu, không phải việc của
     * migration.
     */
    public function down(): void
    {
        // Không thao tác — xem giải thích ở trên.
    }
};
