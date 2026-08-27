<?php

namespace App\Http\Middleware;

use App\Models\WarehouseStaff;
use Closure;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class RequireWarehouseSession
{
    public function handle(Request $request, Closure $next): mixed
    {
        $token = $request->bearerToken();

        if (! is_string($token) || trim($token) === '') {
            return $this->deny('AUTH_REQUIRED', 'Phiên đăng nhập đã hết hạn, vui lòng đồng bộ lại tài khoản Zalo.', 401);
        }

        $staff = WarehouseStaff::query()
            ->where('api_token_hash', hash('sha256', $token))
            ->where(function ($query): void {
                $query
                    ->whereNull('api_token_expires_at')
                    ->orWhere('api_token_expires_at', '>', now());
            })
            ->first();

        if (! $staff) {
            return $this->deny('SESSION_EXPIRED', 'Phiên đăng nhập đã hết hạn, vui lòng đồng bộ lại tài khoản Zalo.', 401);
        }

        $request->attributes->set('warehouse_staff', $staff);

        return $next($request);
    }

    private function deny(string $errorCode, string $message, int $status): JsonResponse
    {
        return response()
            ->json([
                'success' => false,
                'message' => $message,
                'error_code' => $errorCode,
            ], $status)
            ->header('Access-Control-Allow-Origin', '*')
            ->header('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
            ->header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    }
}
