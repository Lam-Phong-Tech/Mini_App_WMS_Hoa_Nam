<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class WarehouseScan extends Model
{
    public const STATUS_PENDING_APPROVAL = 'PENDING_APPROVAL';
    public const STATUS_APPROVED = 'APPROVED';

    protected $fillable = [
        'client_scan_id',
        'code',
        'normalized_code',
        'quantity',
        'scan_method',
        'scan_context',
        'document_id',
        'warehouse_staff_id',
        'zalo_user_id',
        'scanned_by_name',
        'scanned_at',
        'approval_status',
        'approved_at',
        'approved_by',
        'product_id',
        'sku_code',
        'product_name',
        'item_id',
        'item_code',
        'serial_no',
        'warehouse_name',
        'response_payload',
    ];

    protected $casts = [
        'quantity' => 'integer',
        'scanned_at' => 'datetime',
        'approved_at' => 'datetime',
        'response_payload' => 'array',
    ];
}
