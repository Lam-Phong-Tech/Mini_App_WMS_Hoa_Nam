# Chạy dự án Zalo Mini App trên máy khác

Gói này gồm:

- Frontend Zalo Mini App React/ZMP UI
- Backend mini Laravel API trong thư mục `backend/`
- Build frontend sẵn trong `www/`

Không kèm các file secret thật như `.env`, `backend/.env`, `node_modules`, `backend/vendor`.

## 1. Yêu cầu máy mới

- Node.js 18+
- npm
- Zalo Mini App CLI: `npm i -g zmp-cli`
- PHP 8.2+
- Composer
- PostgreSQL nếu chạy backend local

## 2. Cài frontend

```bash
npm install
copy .env.example .env
```

Sửa `.env`:

```env
APP_ID=ID_ZALO_MINI_APP
ZMP_TOKEN=TOKEN_ZMP_CLI_NEU_CAN_DEPLOY
VITE_API_BASE_URL=https://mini.lptech.info.vn
VITE_WMS_API_BASE_URL=https://khohoanamdev.bigk.click
VITE_USE_SCAN_MOCK=false
```

Chạy local:

```bash
npm run start
```

Build:

```bash
npx vite build
```

Deploy Zalo Mini App:

```bash
zmp login
zmp deploy
```

## 3. Cài backend Laravel local

```bash
cd backend
composer install
copy .env.example .env
php artisan key:generate
php artisan migrate
php artisan serve --host=127.0.0.1 --port=8000
```

Nếu dùng PostgreSQL local, sửa trong `backend/.env`:

```env
DB_CONNECTION=pgsql
DB_HOST=127.0.0.1
DB_PORT=5432
DB_DATABASE=bachhoa
DB_USERNAME=postgres
DB_PASSWORD=mat_khau_postgres
```

Sau đó frontend trỏ về:

```env
VITE_API_BASE_URL=http://127.0.0.1:8000
```

## 4. Kiểm tra nhanh

Các màn auth/checklist:

- `/auth`
- `/auth/login`
- `/auth/loading`
- `/auth/validation`
- `/auth/failed`
- `/auth/session`
- `/auth/permission`
- `/auth/logout-confirm`
- `/auth/logout-process`
- `/auth/logged-out`

Nếu mở app bị trắng, kiểm tra:

- Đã chạy `npm install` chưa
- `.env` có đúng `VITE_API_BASE_URL` chưa
- Zalo dev/testing đã deploy bản mới chưa
- Console browser/Zalo Mini App có lỗi route hoặc asset không
