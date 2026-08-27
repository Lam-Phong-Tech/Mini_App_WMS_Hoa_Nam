<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ZaloWebhookEvent extends Model
{
    protected $fillable = [
        'event_key',
        'app_id',
        'event_name',
        'event_scope',
        'payload_variant',
        'status',
        'msg_id',
        'tracking_id',
        'user_id',
        'user_id_by_app',
        'phone_id',
        'raw_payload',
        'normalized_payload',
        'duplicate_count',
        'received_at',
        'last_received_at',
        'occurred_at',
    ];

    protected $casts = [
        'raw_payload' => 'array',
        'normalized_payload' => 'array',
        'duplicate_count' => 'integer',
        'received_at' => 'datetime',
        'last_received_at' => 'datetime',
        'occurred_at' => 'datetime',
    ];
}
