<?php

use App\Http\Controllers\ZaloWebhookController;
use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return view('welcome');
});

Route::get('/zns/zalo-webhook', [ZaloWebhookController::class, 'show']);
Route::post('/zns/zalo-webhook', [ZaloWebhookController::class, 'store']);
