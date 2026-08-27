<?php

namespace App\Support;

use Illuminate\Support\Facades\Cache;

class WarehouseScanCache
{
    private const VERSION_KEY = 'warehouse_scans:cache_version';

    public static function ttl(): \DateTimeInterface
    {
        return now()->addMinutes(15);
    }

    public static function dashboardKey(?string $zaloUserId): string
    {
        $staffKey = $zaloUserId !== null && $zaloUserId !== ''
            ? sha1($zaloUserId)
            : 'guest';

        return sprintf('warehouse_scans:v%s:dashboard:%s', self::version(), $staffKey);
    }

    public static function approvedProductsKey(): string
    {
        return sprintf('warehouse_scans:v%s:approved_products', self::version());
    }

    public static function invalidate(): void
    {
        Cache::forever(self::VERSION_KEY, self::version() + 1);
    }

    private static function version(): int
    {
        $version = Cache::get(self::VERSION_KEY);

        if (! is_numeric($version)) {
            Cache::forever(self::VERSION_KEY, 1);

            return 1;
        }

        return (int) $version;
    }
}
