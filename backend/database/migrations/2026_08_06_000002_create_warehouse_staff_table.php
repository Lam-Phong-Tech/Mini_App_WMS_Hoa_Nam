<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('warehouse_staff')) {
            Schema::create('warehouse_staff', function (Blueprint $table): void {
                $table->id();
                $table->string('zalo_user_id')->unique();
                $table->string('name');
                $table->string('avatar_url')->nullable();
                $table->string('role')->default('Warehouse Operator');
                $table->boolean('zalo_verified')->default(false);
                $table->timestamp('last_login_at')->nullable();
                $table->timestamps();
            });
        }

        Schema::table('warehouse_scans', function (Blueprint $table): void {
            if (! Schema::hasColumn('warehouse_scans', 'warehouse_staff_id')) {
                $table->foreignId('warehouse_staff_id')
                    ->nullable()
                    ->after('document_id')
                    ->constrained('warehouse_staff')
                    ->nullOnDelete();
            }

            if (! Schema::hasColumn('warehouse_scans', 'zalo_user_id')) {
                $table->string('zalo_user_id')->nullable()->after('warehouse_staff_id')->index();
            }

            if (! Schema::hasColumn('warehouse_scans', 'scanned_by_name')) {
                $table->string('scanned_by_name')->nullable()->after('zalo_user_id');
            }
        });
    }

    public function down(): void
    {
        Schema::table('warehouse_scans', function (Blueprint $table): void {
            if (Schema::hasColumn('warehouse_scans', 'warehouse_staff_id')) {
                $table->dropConstrainedForeignId('warehouse_staff_id');
            }

            if (Schema::hasColumn('warehouse_scans', 'zalo_user_id')) {
                $table->dropColumn('zalo_user_id');
            }

            if (Schema::hasColumn('warehouse_scans', 'scanned_by_name')) {
                $table->dropColumn('scanned_by_name');
            }
        });

        Schema::dropIfExists('warehouse_staff');
    }
};
