# Tự phát hành bản web

Máy Windows theo dõi các thay đổi trong `apps/wms-mobile/src`, `index.html`, `vite.config.mjs`, `package.json` và `package-lock.json`. Sau khi ngừng lưu trong bốn giây, watcher tự chạy typecheck, build bản web, rồi phát hành bản build hợp lệ lên `https://appqr.lptech.info.vn/`.

Watcher chỉ thay đổi bản đang chạy khi toàn bộ bước build và phát hành thành công. Khi build lỗi, domain tiếp tục giữ release cũ; log nằm tại `apps/wms-mobile/.tmp/web-auto-deploy.log`.

Một launcher trong thư mục Windows Startup khởi động lại watcher khi người dùng đăng nhập. Có thể tắt tự động hoá bằng cách xóa launcher sau:

```powershell
Remove-Item "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup\WMS Mobile Web Auto Deploy.vbs"
```

Khóa phát hành chỉ nằm trong thư mục cục bộ `apps/wms-mobile/.deploy/`, vốn đã được loại khỏi Git. VPS dùng tài khoản `wmsdeploy` không có quyền root trực tiếp; tài khoản này chỉ được phép kích hoạt script phát hành web đã được giới hạn trên server.
