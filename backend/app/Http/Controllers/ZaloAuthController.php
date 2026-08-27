<?php

namespace App\Http\Controllers;

use App\Models\WarehouseStaff;
use App\Support\WarehouseScanCache;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;

class ZaloAuthController extends Controller
{
    public function login(Request $request): JsonResponse
    {
        $payload = $request->validate([
            'source' => ['nullable', 'string', 'max:64'],
            'access_token' => ['nullable', 'string', 'max:4096'],
            'user.id' => ['nullable', 'string', 'max:255'],
            'user.name' => ['nullable', 'string', 'max:255'],
            'user.avatar' => ['nullable', 'string', 'max:2048'],
        ]);

        [$profile, $verified] = $this->resolveZaloProfile(
            $payload['access_token'] ?? null,
            $payload['user'] ?? []
        );

        if (! $profile || empty($profile['id'])) {
            return $this->withCors(response()->json([
                'success' => false,
                'message' => 'Không thể đăng nhập Zalo, vui lòng thử lại.',
                'error_code' => 'ZALO_LOGIN_FAILED',
            ], 401));
        }

        $sessionToken = Str::random(80);
        $sessionExpiresAt = now()->addHours(12);

        $staff = WarehouseStaff::updateOrCreate(
            ['zalo_user_id' => $profile['id']],
            [
                'name' => $profile['name'] ?: 'Nhân viên kho',
                'avatar_url' => $profile['avatar'] ?: null,
                'role' => 'Warehouse Operator',
                'zalo_verified' => $verified,
                'api_token_hash' => hash('sha256', $sessionToken),
                'api_token_expires_at' => $sessionExpiresAt,
                'last_login_at' => now(),
            ]
        );

        WarehouseScanCache::invalidate();

        return $this->withCors(response()->json([
            'success' => true,
            'message' => 'Đăng nhập Zalo thành công.',
            'staff' => $this->staffPayload($staff),
            'session_token' => $sessionToken,
            'session_expires_at' => $sessionExpiresAt->toISOString(),
        ]));
    }

    private function resolveZaloProfile(?string $accessToken, array $fallbackUser): array
    {
        if ($accessToken) {
            try {
                $response = Http::timeout(8)
                    ->withHeaders(['access_token' => $accessToken])
                    ->get('https://graph.zalo.me/v2.0/me', [
                        'fields' => 'id,name,picture',
                    ]);

                $body = $response->json();

                if ($response->ok() && empty($body['error']) && ! empty($body['id'])) {
                    return [[
                        'id' => (string) $body['id'],
                        'name' => (string) ($body['name'] ?? ''),
                        'avatar' => (string) data_get($body, 'picture.data.url', ''),
                    ], true];
                }
            } catch (\Throwable) {
                // Fallback xuống profile lấy trực tiếp từ Zalo Mini App SDK để không làm kẹt môi trường dev/test.
            }
        }

        if (! empty($fallbackUser['id'])) {
            return [[
                'id' => (string) $fallbackUser['id'],
                'name' => (string) ($fallbackUser['name'] ?? ''),
                'avatar' => (string) ($fallbackUser['avatar'] ?? ''),
            ], false];
        }

        return [null, false];
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

    private function withCors(JsonResponse $response): JsonResponse
    {
        return $response
            ->header('Access-Control-Allow-Origin', '*')
            ->header('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS')
            ->header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    }
}
