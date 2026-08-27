<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('warehouse_staff', function (Blueprint $table): void {
            if (! Schema::hasColumn('warehouse_staff', 'api_token_hash')) {
                $table->string('api_token_hash', 128)->nullable()->after('zalo_verified')->index();
            }

            if (! Schema::hasColumn('warehouse_staff', 'api_token_expires_at')) {
                $table->timestamp('api_token_expires_at')->nullable()->after('api_token_hash');
            }
        });
    }

    public function down(): void
    {
        Schema::table('warehouse_staff', function (Blueprint $table): void {
            if (Schema::hasColumn('warehouse_staff', 'api_token_hash')) {
                $table->dropColumn('api_token_hash');
            }

            if (Schema::hasColumn('warehouse_staff', 'api_token_expires_at')) {
                $table->dropColumn('api_token_expires_at');
            }
        });
    }
};
