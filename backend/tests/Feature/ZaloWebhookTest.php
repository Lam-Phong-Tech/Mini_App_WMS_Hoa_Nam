<?php

namespace Tests\Feature;

use App\Models\ZaloWebhookEvent;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ZaloWebhookTest extends TestCase
{
    use RefreshDatabase;

    public function test_webhook_health_route_is_available_without_api_prefix(): void
    {
        $this->getJson('/zns/zalo-webhook')
            ->assertOk()
            ->assertJson(['ok' => true]);
    }

    public function test_zns_delivery_webhook_is_persisted_and_deduplicated(): void
    {
        config(['services.zalo_webhook.app_ids' => '1743556593977626805']);

        $payload = [
            'app_id' => '1743556593977626805',
            'event_name' => 'user_received_message',
            'timestamp' => '1784737462633',
            'sender' => ['id' => 'oa-id'],
            'recipient' => ['id' => '84901234567'],
            'message' => [
                'msg_id' => 'zns-message-1',
                'delivery_time' => '1784737462633',
                'tracking_id' => 'tracking-001',
            ],
        ];

        $this->postJson('/zns/zalo-webhook', $payload)
            ->assertOk()
            ->assertSee('OK');

        $this->assertDatabaseHas('zalo_webhook_events', [
            'event_name' => 'user_received_message',
            'event_scope' => 'zns',
            'payload_variant' => 'zns_delivery',
            'status' => 'delivered',
            'msg_id' => 'zns-message-1',
            'tracking_id' => 'tracking-001',
            'phone_id' => '84901234567',
            'duplicate_count' => 0,
        ]);

        $this->postJson('/zns/zalo-webhook', $payload)
            ->assertOk()
            ->assertSee('DUPLICATE');

        $this->assertSame(1, ZaloWebhookEvent::query()->count());
        $this->assertSame(1, ZaloWebhookEvent::query()->first()->duplicate_count);
    }

    public function test_unexpected_app_id_is_ignored_when_allowlist_is_configured(): void
    {
        config(['services.zalo_webhook.app_ids' => 'expected-app']);

        $this->postJson('/zns/zalo-webhook', [
            'app_id' => 'wrong-app',
            'event_name' => 'user_received_message',
        ])
            ->assertOk()
            ->assertSee('IGNORED_APP_ID');

        $this->assertDatabaseCount('zalo_webhook_events', 0);
    }
}
