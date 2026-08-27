<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class WarehouseStaff extends Model
{
    protected $table = 'warehouse_staff';

    protected $fillable = [
        'zalo_user_id',
        'name',
        'avatar_url',
        'role',
        'zalo_verified',
        'api_token_hash',
        'api_token_expires_at',
        'last_login_at',
    ];

    protected $casts = [
        'zalo_verified' => 'boolean',
        'api_token_expires_at' => 'datetime',
        'last_login_at' => 'datetime',
    ];
}
