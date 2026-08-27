# ZNS/OA webhook production

Production webhook URL:

```text
https://mini.lptech.info.vn/zns/zalo-webhook
```

This endpoint is served by the Laravel backend, outside the `/api` prefix, so it matches the URL configured in Zalo Developer/OA.

## Deploy checklist

1. Deploy the Laravel backend changes.
2. Run migrations on the VPS:

```bash
php artisan migrate --force
```

3. Set the production app ID allowlist in the Laravel `.env`:

```env
ZALO_WEBHOOK_APP_IDS=1743556593977626805
ZALO_WEBHOOK_LOG_RAW=false
```

Use comma-separated values if the same backend must receive events from more than one Zalo app.

4. Clear cached config/routes if production uses Laravel caches:

```bash
php artisan optimize:clear
php artisan optimize
```

5. In Zalo Developer/OA webhook settings, replace the old ngrok URL:

```text
https://lucky-sole-factual.ngrok-free.app/zns/zalo-webhook
```

with:

```text
https://mini.lptech.info.vn/zns/zalo-webhook
```

## Scope migrated

The Laravel backend now receives, normalizes, stores, and deduplicates ZNS/OA webhook events in `zalo_webhook_events`.

The old Node service in `ZNS_BigK` still owns the broader ZNS tooling such as `/zns/send-batch`, `/zns/click`, Telegram notification batching, OA OAuth token handling, and outbox reconciliation. Migrate those routes separately if production must retire the Node service completely.
