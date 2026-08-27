<?php

use App\Http\Controllers\WarehouseScanController;
use App\Http\Controllers\ZaloAuthController;
use Illuminate\Support\Facades\Route;

Route::options('/{any}', [WarehouseScanController::class, 'options'])->where('any', '.*');

Route::post('/zalo/login', [ZaloAuthController::class, 'login']);

Route::middleware('warehouse.session')->group(function (): void {
    Route::get('/warehouse-scans/dashboard', [WarehouseScanController::class, 'dashboard']);
    Route::get('/warehouse-scans/history', [WarehouseScanController::class, 'history']);
    Route::delete('/warehouse-scans/history', [WarehouseScanController::class, 'clearHistory']);
    Route::get('/warehouse-scans/approved-products', [WarehouseScanController::class, 'approvedProducts']);
    Route::patch('/warehouse-scans/{warehouseScan}/approve', [WarehouseScanController::class, 'approve']);

    Route::post('/receipts/{documentId}/scans', fn (
        WarehouseScanController $controller,
        string $documentId
    ) => $controller->store(request(), 'RECEIPT', $documentId));

    Route::post('/outbounds/{documentId}/scans', fn (
        WarehouseScanController $controller,
        string $documentId
    ) => $controller->store(request(), 'OUTBOUND', $documentId));

    Route::post('/warranty/item-lookup', fn (
        WarehouseScanController $controller
    ) => $controller->store(request(), 'WARRANTY_ITEM'));

    Route::post('/component-issues/{documentId}/scans', fn (
        WarehouseScanController $controller,
        string $documentId
    ) => $controller->store(request(), 'WARRANTY_COMPONENT', $documentId));

    Route::post('/inventory/lookup-by-code', fn (
        WarehouseScanController $controller
    ) => $controller->store(request(), 'INVENTORY_LOOKUP'));
});
