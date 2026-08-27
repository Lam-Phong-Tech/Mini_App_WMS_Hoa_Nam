<?php

namespace App\Http\Controllers;

use App\Models\WarehouseScan;
use App\Models\WarehouseStaff;
use App\Support\WarehouseScanCache;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;

class WarehouseScanController extends Controller
{
    private const ERROR_CODES = [
        'NOT-FOUND' => ['BARCODE_NOT_FOUND', 'Không tìm thấy mã trong dữ liệu kho.'],
        'DUPLICATE' => ['ITEM_ALREADY_SCANNED', 'Mã này đã được quét trước đó.'],
        'WRONG-SKU' => ['SKU_NOT_REQUIRED', 'SKU không thuộc danh sách cần xử lý.'],
        'LINE-FULL' => ['LINE_ALREADY_FULL', 'Dòng hàng đã đủ số lượng.'],
        'NETWORK-ERROR' => ['NETWORK_ERROR', 'Không thể kết nối máy chủ.'],
        'TIMEOUT' => ['REQUEST_TIMEOUT', 'Máy chủ phản hồi quá lâu.'],
    ];

    public function store(Request $request, string $scanContext, ?string $documentId = null): JsonResponse
    {
        $payload = $request->validate([
            'client_scan_id' => ['required', 'uuid'],
            'code' => ['required', 'string', 'max:255'],
            'quantity' => ['nullable', 'integer', 'min:1'],
            'scan_method' => ['required', 'string', 'max:24'],
            'scan_context' => ['required', 'string', 'max:48'],
            'warehouse_staff_id' => ['nullable', 'integer', 'exists:warehouse_staff,id'],
            'zalo_user_id' => ['nullable', 'string', 'max:255'],
            'scanned_by_name' => ['nullable', 'string', 'max:255'],
            'scanned_at' => ['nullable', 'date'],
        ]);

        $normalizedCode = $this->normalizeCode($payload['code']);
        $error = self::ERROR_CODES[$normalizedCode] ?? null;
        $staff = $this->resolveWarehouseStaff($payload);

        if (! $error && WarehouseScan::query()->where('normalized_code', $normalizedCode)->exists()) {
            $error = ['ITEM_ALREADY_SCANNED', 'Mã này đã được quét trước đó.'];
        }

        if ($error) {
            return $this->withCors(response()->json([
                'success' => false,
                'message' => $error[1],
                'error_code' => $error[0],
            ], 422));
        }

        $product = $this->buildProductInfo($normalizedCode);

        $responsePayload = [
            'success' => true,
            'message' => 'Đã lưu mã quét vào danh sách chờ duyệt.',
            'data' => [
                'approval_status' => WarehouseScan::STATUS_PENDING_APPROVAL,
                'product' => $product,
                'required_qty' => 1,
                'scanned_qty' => (int) ($payload['quantity'] ?? 1),
                'remaining_qty' => 0,
                'matched' => true,
                'warehouse_staff' => $staff ? $this->staffPayload($staff) : null,
            ],
        ];

        $scan = WarehouseScan::create([
            'client_scan_id' => $payload['client_scan_id'],
            'code' => $payload['code'],
            'normalized_code' => $normalizedCode,
            'quantity' => (int) ($payload['quantity'] ?? 1),
            'scan_method' => $payload['scan_method'],
            'scan_context' => $scanContext,
            'document_id' => $documentId,
            'warehouse_staff_id' => $staff?->id,
            'zalo_user_id' => $staff?->zalo_user_id ?? ($payload['zalo_user_id'] ?? null),
            'scanned_by_name' => $staff?->name ?? ($payload['scanned_by_name'] ?? null),
            'scanned_at' => isset($payload['scanned_at'])
                ? Carbon::parse($payload['scanned_at'])
                : now(),
            'approval_status' => WarehouseScan::STATUS_PENDING_APPROVAL,
            'product_id' => $product['product_id'],
            'sku_code' => $product['sku_code'],
            'product_name' => $product['product_name'],
            'item_id' => $product['item_id'],
            'item_code' => $product['item_code'],
            'serial_no' => $product['serial_no'],
            'warehouse_name' => $product['warehouse_name'],
            'response_payload' => $responsePayload,
        ]);

        $responsePayload['data']['scan_record_id'] = $scan->id;
        WarehouseScanCache::invalidate();

        return $this->withCors(response()->json($responsePayload, 201));
    }

    public function dashboard(Request $request): JsonResponse
    {
        $zaloUserId = $request->query('zalo_user_id');
        $cacheKey = WarehouseScanCache::dashboardKey(is_string($zaloUserId) ? $zaloUserId : null);

        $payload = Cache::remember($cacheKey, WarehouseScanCache::ttl(), function () use ($zaloUserId): array {
            $staff = null;

            if (is_string($zaloUserId) && $zaloUserId !== '') {
                $staff = WarehouseStaff::query()
                    ->where('zalo_user_id', $zaloUserId)
                    ->first();
            }

            return [
                'pending_approval_count' => WarehouseScan::query()
                    ->where('approval_status', WarehouseScan::STATUS_PENDING_APPROVAL)
                    ->count(),
                'approved_count' => WarehouseScan::query()
                    ->where('approval_status', WarehouseScan::STATUS_APPROVED)
                    ->count(),
                'warehouse_staff' => $staff
                    ? $this->staffPayload($staff)
                    : [
                        'name' => 'Nhân viên kho',
                        'role' => 'Warehouse Operator',
                    ],
            ];
        });

        return $this->withCors(response()->json($payload));
    }

    public function history(Request $request): JsonResponse
    {
        $zaloUserId = $request->query('zalo_user_id');
        $limit = max(1, min((int) $request->query('limit', 50), 100));

        $query = WarehouseScan::query()
            ->latest('scanned_at')
            ->latest('id')
            ->limit($limit);

        if (is_string($zaloUserId) && $zaloUserId !== '') {
            $query->where('zalo_user_id', $zaloUserId);
        }

        $items = $query
            ->get()
            ->map(fn (WarehouseScan $scan): array => $this->historyPayload($scan))
            ->values()
            ->all();

        return $this->withCors(response()->json(['items' => $items]));
    }

    public function clearHistory(): JsonResponse
    {
        return $this->withCors(response()->json([
            'success' => false,
            'message' => 'Chức năng xóa lịch sử backend đang bị khóa để bảo toàn audit kho.',
            'error_code' => 'AUDIT_DELETE_REVIEW_REQUIRED',
        ], 403));
    }

    public function approvedProducts(): JsonResponse
    {
        $items = Cache::remember(
            WarehouseScanCache::approvedProductsKey(),
            WarehouseScanCache::ttl(),
            fn () => WarehouseScan::query()
                ->where('approval_status', WarehouseScan::STATUS_APPROVED)
                ->latest('approved_at')
                ->limit(50)
                ->get()
                ->map(fn (WarehouseScan $scan): array => [
                    'id' => $scan->id,
                    'code' => $scan->code,
                    'sku_code' => $scan->sku_code,
                    'product_name' => $scan->product_name,
                    'item_code' => $scan->item_code,
                    'serial_no' => $scan->serial_no,
                    'warehouse_name' => $scan->warehouse_name,
                    'scanned_by_name' => $scan->scanned_by_name,
                    'approved_at' => $scan->approved_at?->toISOString(),
                ])
                ->values()
                ->all()
        );

        return $this->withCors(response()->json(['items' => $items]));
    }

    public function approve(Request $request, WarehouseScan $warehouseScan): JsonResponse
    {
        $warehouseScan->update([
            'approval_status' => WarehouseScan::STATUS_APPROVED,
            'approved_at' => now(),
            'approved_by' => $request->input('approved_by', 'warehouse_admin'),
        ]);

        WarehouseScanCache::invalidate();

        return $this->withCors(response()->json([
            'success' => true,
            'message' => 'Đã duyệt sản phẩm.',
            'data' => ['scan_record_id' => $warehouseScan->id],
        ]));
    }

    public function options(): JsonResponse
    {
        return $this->withCors(response()->json(null, 204));
    }

    private function normalizeCode(string $code): string
    {
        return Str::upper(preg_replace('/\s+/', '', trim($code)) ?? '');
    }

    private function resolveWarehouseStaff(array $payload): ?WarehouseStaff
    {
        if (! empty($payload['warehouse_staff_id'])) {
            return WarehouseStaff::query()->find((int) $payload['warehouse_staff_id']);
        }

        if (! empty($payload['zalo_user_id'])) {
            return WarehouseStaff::query()
                ->where('zalo_user_id', (string) $payload['zalo_user_id'])
                ->first();
        }

        return null;
    }

    private function staffPayload(WarehouseStaff $staff): array
    {
        return [
            'id' => $staff->id,
            'zalo_user_id' => $staff->zalo_user_id,
            'name' => $staff->name,
            'avatar_url' => $staff->avatar_url,
            'role' => $staff->role,
            'zalo_verified' => $staff->zalo_verified,
        ];
    }

    /**
     * Adapter dữ liệu tạm để chuẩn bị nối ERP/backend thật.
     */
    private function buildProductInfo(string $normalizedCode): array
    {
        $suffix = substr(hash('crc32b', $normalizedCode), 0, 6);

        return [
            'product_id' => hexdec(substr($suffix, 0, 4)),
            'sku_code' => 'SKU-'.$suffix,
            'product_name' => 'Sản phẩm '.$normalizedCode,
            'item_id' => hexdec(substr($suffix, 2, 4)),
            'item_code' => $normalizedCode,
            'serial_no' => 'SN-'.$normalizedCode,
            'warehouse_name' => 'Kho trung tâm',
        ];
    }

    private function historyPayload(WarehouseScan $scan): array
    {
        return [
            'id' => (string) $scan->client_scan_id,
            'request' => [
                'client_scan_id' => $scan->client_scan_id,
                'code' => $scan->code,
                'quantity' => $scan->quantity,
                'scan_method' => $scan->scan_method,
                'scan_context' => $scan->scan_context,
                'warehouse_staff_id' => $scan->warehouse_staff_id,
                'zalo_user_id' => $scan->zalo_user_id,
                'scanned_by_name' => $scan->scanned_by_name,
                'scanned_at' => $scan->scanned_at?->toISOString() ?? $scan->created_at?->toISOString(),
            ],
            'status' => 'SUCCESS',
            'response' => [
                'success' => true,
                'message' => $scan->approval_status === WarehouseScan::STATUS_APPROVED
                    ? 'Sản phẩm đã được duyệt.'
                    : 'Sản phẩm đang chờ duyệt.',
                'data' => [
                    'scan_record_id' => $scan->id,
                    'approval_status' => $scan->approval_status,
                    'product' => [
                        'product_id' => $scan->product_id,
                        'sku_code' => $scan->sku_code,
                        'product_name' => $scan->product_name,
                        'item_id' => $scan->item_id,
                        'item_code' => $scan->item_code,
                        'serial_no' => $scan->serial_no,
                        'warehouse_name' => $scan->warehouse_name,
                    ],
                    'required_qty' => 1,
                    'scanned_qty' => $scan->quantity,
                    'remaining_qty' => 0,
                    'matched' => true,
                ],
            ],
        ];
    }

    private function withCors(JsonResponse $response): JsonResponse
    {
        return $response
            ->header('Access-Control-Allow-Origin', '*')
            ->header('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
            ->header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    }
}
