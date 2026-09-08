<?php

use App\Support\RetentionPolicy;
use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

/*
|--------------------------------------------------------------------------
| Retention scheduler (BACKEND_RETENTION_HOTFIX)
|--------------------------------------------------------------------------
|
| CHỈ đăng ký khi RETENTION_ENABLED=true VÀ cấu hình hợp lệ.
| Mặc định RETENTION_ENABLED=false nên scheduler KHÔNG được đăng ký.
|
*/

$retention = app(RetentionPolicy::class);

if ($retention->enabled() && $retention->validate() === []) {
    Schedule::command('retention:prune', ['--execute'])
        ->dailyAt($retention->scheduleAt())
        ->timezone($retention->timezone())
        // Chặn hai tiến trình cleanup chạy chồng nhau trên cùng máy.
        // Lock tự hết hạn sau 120 phút phòng khi tiến trình chết đột ngột.
        ->withoutOverlapping(120)
        // Cache store mặc định là `database`; Laravel DatabaseStore hiện thực
        // LockProvider và bảng `cache_locks` đã tồn tại (migration
        // 0001_01_01_000001_create_cache_table.php) => onOneServer an toàn.
        ->onOneServer()
        ->runInBackground()
        ->appendOutputTo(storage_path('logs/retention.log'));
}
