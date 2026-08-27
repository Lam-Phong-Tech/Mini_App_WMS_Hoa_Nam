<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('zalo_webhook_events', function (Blueprint $table): void {
            $table->id();
            $table->char('event_key', 64)->unique();
            $table->string('app_id')->nullable()->index();
            $table->string('event_name')->nullable()->index();
            $table->string('event_scope', 32)->nullable()->index();
            $table->string('payload_variant', 32)->nullable()->index();
            $table->string('status', 48)->nullable()->index();
            $table->string('msg_id')->nullable()->index();
            $table->string('tracking_id')->nullable()->index();
            $table->string('user_id')->nullable()->index();
            $table->string('user_id_by_app')->nullable()->index();
            $table->string('phone_id')->nullable()->index();
            $table->json('raw_payload');
            $table->json('normalized_payload');
            $table->unsignedInteger('duplicate_count')->default(0);
            $table->timestamp('received_at')->nullable()->index();
            $table->timestamp('last_received_at')->nullable();
            $table->timestamp('occurred_at')->nullable()->index();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('zalo_webhook_events');
    }
};
