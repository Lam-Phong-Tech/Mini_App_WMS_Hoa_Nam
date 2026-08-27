<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('warehouse_scans', function (Blueprint $table): void {
            $table->id();
            $table->uuid('client_scan_id')->unique();
            $table->string('code');
            $table->string('normalized_code')->index();
            $table->unsignedInteger('quantity')->default(1);
            $table->string('scan_method', 24);
            $table->string('scan_context', 48)->index();
            $table->string('document_id')->nullable()->index();
            $table->timestamp('scanned_at')->nullable();

            $table->string('approval_status', 32)->default('PENDING_APPROVAL')->index();
            $table->timestamp('approved_at')->nullable();
            $table->string('approved_by')->nullable();

            $table->unsignedBigInteger('product_id')->nullable();
            $table->string('sku_code')->nullable()->index();
            $table->string('product_name')->nullable();
            $table->unsignedBigInteger('item_id')->nullable();
            $table->string('item_code')->nullable();
            $table->string('serial_no')->nullable()->index();
            $table->string('warehouse_name')->nullable();
            $table->json('response_payload')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('warehouse_scans');
    }
};
