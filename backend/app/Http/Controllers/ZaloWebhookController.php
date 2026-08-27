<?php

namespace App\Http\Controllers;

use App\Models\ZaloWebhookEvent;
use Illuminate\Database\QueryException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class ZaloWebhookController extends Controller
{
    private const ZNS_RECEIVED_EVENT = 'user_received_message';

    private const OA_SEEN_EVENT = 'user_seen_message';

    public function show(): JsonResponse
    {
        return response()->json([
            'ok' => true,
            'message' => 'Zalo webhook endpoint is ready. Event delivery must use POST.',
        ]);
    }

    public function store(Request $request): Response
    {
        $body = $request->json()->all();
        if (! is_array($body) || $body === []) {
            $body = $request->all();
        }

        $receivedAt = now();
        $appId = trim((string) ($body['app_id'] ?? ''));
        $expectedAppIds = $this->expectedAppIds();

        if ($expectedAppIds !== [] && ! in_array($appId, $expectedAppIds, true)) {
            Log::warning('Ignored Zalo webhook with unexpected app_id.', [
                'app_id' => $appId !== '' ? $appId : null,
                'expected_app_ids' => $expectedAppIds,
            ]);

            return response('IGNORED_APP_ID', 200);
        }

        try {
            $normalized = $this->extractZaloData($body);
            $eventKey = $this->buildEventKey($body, $normalized);
            $occurredAt = $this->timestampToCarbon(
                $normalized['delivery_time_ms'] ?? $normalized['timestamp_ms'] ?? null
            );

            try {
                ZaloWebhookEvent::create([
                    'event_key' => $eventKey,
                    'app_id' => $normalized['app_id'],
                    'event_name' => $normalized['event_name'],
                    'event_scope' => $normalized['event_scope'],
                    'payload_variant' => $normalized['payload_variant'],
                    'status' => $normalized['status'],
                    'msg_id' => $normalized['msg_id'],
                    'tracking_id' => $normalized['tracking_id'],
                    'user_id' => $normalized['user_id'],
                    'user_id_by_app' => $normalized['user_id_by_app'],
                    'phone_id' => $normalized['phone_id'],
                    'raw_payload' => $body,
                    'normalized_payload' => $normalized,
                    'duplicate_count' => 0,
                    'received_at' => $receivedAt,
                    'last_received_at' => $receivedAt,
                    'occurred_at' => $occurredAt,
                ]);
            } catch (QueryException $error) {
                if (! $this->isUniqueConstraintViolation($error)) {
                    throw $error;
                }

                $this->markDuplicate($eventKey, $receivedAt);

                return response('DUPLICATE', 200);
            }

            if (config('services.zalo_webhook.log_raw', false)) {
                Log::info('Received Zalo webhook.', ['payload' => $body]);
            } else {
                Log::info('Received Zalo webhook.', [
                    'event_name' => $normalized['event_name'],
                    'payload_variant' => $normalized['payload_variant'],
                    'msg_id' => $normalized['msg_id'],
                    'tracking_id' => $normalized['tracking_id'],
                ]);
            }

            return response('OK', 200);
        } catch (\Throwable $error) {
            Log::error('Failed to persist Zalo webhook.', [
                'message' => $error->getMessage(),
                'event_name' => $body['event_name'] ?? null,
                'app_id' => $body['app_id'] ?? null,
            ]);

            return response('WEBHOOK_PROCESSING_ERROR', 500);
        }
    }

    private function extractZaloData(array $body): array
    {
        $eventName = $this->normalizeId($body['event_name'] ?? null);
        $senderId = $this->normalizeId(data_get($body, 'sender.id'));
        $recipientId = $this->normalizeId(data_get($body, 'recipient.id'));
        $deliveryTimeRaw = data_get($body, 'message.delivery_time');
        $payloadVariant = $eventName !== self::ZNS_RECEIVED_EVENT
            ? 'other_event'
            : ($deliveryTimeRaw !== null ? 'zns_delivery' : 'oa_message_delivery');
        $isOutboundOaEvent = str_starts_with((string) $eventName, 'oa_send_')
            || $payloadVariant === 'oa_message_delivery'
            || $eventName === self::OA_SEEN_EVENT;
        $derivedUserId = $isOutboundOaEvent
            ? $recipientId
            : ($this->isUserIdentityEvent($eventName) ? $senderId : null);
        $messageIds = $this->getMessageIds($body);
        $semantics = $this->getEventSemantics($eventName, $payloadVariant);
        $rawPhone = data_get($body, 'info.phone') ?: $recipientId;
        $recipientPhone = $this->isVietnamPhone($rawPhone) ? (string) $rawPhone : null;

        return [
            'app_id' => $this->normalizeId($body['app_id'] ?? null),
            'event_name' => $eventName,
            'tracked_zns_event' => $payloadVariant === 'zns_delivery',
            'event_name_supported' => $this->isOaMessageManagementEvent($eventName),
            'payload_variant' => $payloadVariant,
            ...$semantics,
            'user_id' => $this->normalizeId($body['user_id'] ?? null) ?: $derivedUserId,
            'user_id_by_app' => $this->normalizeId(
                $body['user_id_by_app']
                    ?? data_get($body, 'sender.user_id_by_app')
                    ?? data_get($body, 'recipient.user_id_by_app')
            ),
            'sender_id' => $senderId,
            'recipient_id' => $recipientId,
            'recipient_phone' => $recipientPhone,
            'recipient_phone_hash' => $this->isSha256($recipientId) ? $recipientId : null,
            'phone_id' => $recipientPhone,
            'msg_id' => $messageIds[0] ?? null,
            'msg_ids' => $messageIds,
            'correlation_msg_ids' => $this->getCorrelationMessageIds($body),
            'receiver_device' => $body['receiver_device'] ?? null,
            'tracking_id' => $this->normalizeId(data_get($body, 'message.tracking_id') ?? ($body['tracking_id'] ?? null)),
            'delivery_time_raw' => $deliveryTimeRaw,
            'delivery_time_ms' => $this->normalizeTimestampMs($deliveryTimeRaw),
            'timestamp_ms' => $this->normalizeTimestampMs($body['timestamp'] ?? null),
            'message_text' => data_get($body, 'message.text'),
            'read_warning' => $payloadVariant === 'zns_delivery'
                ? 'ZNS delivery means delivered to device, not necessarily opened or read.'
                : null,
        ];
    }

    private function getEventSemantics(?string $eventName, string $payloadVariant): array
    {
        if ($eventName === self::ZNS_RECEIVED_EVENT) {
            if ($payloadVariant === 'oa_message_delivery') {
                return [
                    'event_scope' => 'oa_messaging',
                    'status' => 'received',
                    'status_label' => 'User received OA message.',
                    'read_status' => 'not_seen_yet',
                    'read_confirmed' => false,
                    'clicked_status' => 'unknown',
                ];
            }

            return [
                'event_scope' => 'zns',
                'status' => 'delivered',
                'status_label' => 'Delivered to device.',
                'read_status' => 'unavailable',
                'read_confirmed' => false,
                'clicked_status' => 'unavailable_without_user_action',
            ];
        }

        if ($eventName === self::OA_SEEN_EVENT) {
            return [
                'event_scope' => 'oa_messaging',
                'status' => 'seen',
                'status_label' => 'User saw OA message.',
                'read_status' => 'seen',
                'read_confirmed' => true,
                'clicked_status' => 'unknown',
            ];
        }

        if ($eventName === 'user_submit_info' || str_starts_with((string) $eventName, 'user_send_')) {
            return [
                'event_scope' => 'oa_messaging',
                'status' => 'inbound_user_event',
                'status_label' => 'User interacted with OA.',
                'read_status' => 'unknown',
                'read_confirmed' => false,
                'clicked_status' => 'unknown',
            ];
        }

        if (str_starts_with((string) $eventName, 'oa_send_')) {
            return [
                'event_scope' => 'oa_messaging',
                'status' => 'oa_sent',
                'status_label' => 'OA sent message to user.',
                'read_status' => 'not_seen_yet',
                'read_confirmed' => false,
                'clicked_status' => 'unknown',
            ];
        }

        return [
            'event_scope' => 'other',
            'status' => 'other_event',
            'status_label' => 'Other event.',
            'read_status' => 'unknown',
            'read_confirmed' => false,
            'clicked_status' => 'unknown',
        ];
    }

    private function getMessageIds(array $body): array
    {
        $ids = [
            data_get($body, 'message.msg_id'),
            data_get($body, 'message.message_id'),
            $body['msg_id'] ?? null,
            $body['message_id'] ?? null,
        ];

        $messageIds = data_get($body, 'message.msg_ids');
        if (is_array($messageIds)) {
            $ids = [...$ids, ...$messageIds];
        }

        return array_values(array_unique(array_filter(array_map(
            fn ($value) => $this->normalizeId($value),
            $ids
        ))));
    }

    private function getCorrelationMessageIds(array $body): array
    {
        $eventName = (string) ($body['event_name'] ?? '');
        if ($eventName === self::OA_SEEN_EVENT ||
            $eventName === self::ZNS_RECEIVED_EVENT ||
            str_starts_with($eventName, 'oa_send_')) {
            return $this->getMessageIds($body);
        }

        $ids = [
            data_get($body, 'message.reply_to_msg_id'),
            data_get($body, 'message.reply_to_message_id'),
            data_get($body, 'message.quote_msg_id'),
            data_get($body, 'message.quote_message.msg_id'),
            data_get($body, 'message.reply_to.msg_id'),
            $body['reply_to_msg_id'] ?? null,
            data_get($body, 'quote_message.msg_id'),
        ];

        return array_values(array_unique(array_filter(array_map(
            fn ($value) => $this->normalizeId($value),
            $ids
        ))));
    }

    private function buildEventKey(array $body, array $normalized): string
    {
        $parts = [
            $normalized['app_id'],
            $normalized['event_name'],
            implode(',', $normalized['msg_ids'] ?? []),
            $normalized['tracking_id'],
            $normalized['user_id'],
            $normalized['user_id_by_app'],
            $normalized['timestamp_ms'],
            $normalized['delivery_time_ms'],
            hash('sha256', json_encode($body, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) ?: ''),
        ];

        return hash('sha256', implode('|', array_map(
            fn ($value) => $value === null ? '' : (string) $value,
            $parts
        )));
    }

    private function expectedAppIds(): array
    {
        $raw = (string) config('services.zalo_webhook.app_ids', '');

        return array_values(array_filter(array_map(
            fn ($value) => trim((string) $value),
            explode(',', $raw)
        )));
    }

    private function normalizeId(mixed $value): ?string
    {
        if ($value === null || $value === '') {
            return null;
        }

        return (string) $value;
    }

    private function normalizeTimestampMs(mixed $value): ?int
    {
        if ($value === null || $value === '') {
            return null;
        }

        if (! is_numeric($value)) {
            return null;
        }

        $timestamp = (int) $value;

        return $timestamp < 100000000000 ? $timestamp * 1000 : $timestamp;
    }

    private function timestampToCarbon(?int $timestampMs): ?Carbon
    {
        if (! $timestampMs) {
            return null;
        }

        return Carbon::createFromTimestampMs($timestampMs);
    }

    private function markDuplicate(string $eventKey, Carbon $receivedAt): void
    {
        ZaloWebhookEvent::query()
            ->where('event_key', $eventKey)
            ->update([
                'duplicate_count' => DB::raw('duplicate_count + 1'),
                'last_received_at' => $receivedAt,
                'updated_at' => $receivedAt,
            ]);
    }

    private function isUniqueConstraintViolation(QueryException $error): bool
    {
        $sqlState = (string) ($error->errorInfo[0] ?? '');
        $driverCode = (string) ($error->errorInfo[1] ?? '');

        return in_array($sqlState, ['23000', '23505'], true) ||
            in_array($driverCode, ['1062', '19'], true);
    }

    private function isUserIdentityEvent(?string $eventName): bool
    {
        return $eventName === self::OA_SEEN_EVENT ||
            $eventName === 'user_submit_info' ||
            str_starts_with((string) $eventName, 'user_send_');
    }

    private function isOaMessageManagementEvent(?string $eventName): bool
    {
        return $eventName === self::ZNS_RECEIVED_EVENT ||
            $eventName === self::OA_SEEN_EVENT ||
            $eventName === 'user_submit_info' ||
            str_starts_with((string) $eventName, 'user_send_') ||
            str_starts_with((string) $eventName, 'oa_send_');
    }

    private function isSha256(mixed $value): bool
    {
        return is_string($value) && preg_match('/^[a-f0-9]{64}$/i', $value) === 1;
    }

    private function isVietnamPhone(mixed $value): bool
    {
        return is_string($value) && preg_match('/^84\d{8,11}$/', $value) === 1;
    }
}
