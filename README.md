# SAHAR 🍬 — премиальный магазин сладостей (Telegram Mini App)

Бесплатная serverless-архитектура **без серверов и подписок**:

- **Витрина** (`docs/`) — статический Mini App, хостится на **GitHub Pages** (бесплатно)
- **Бэкенд** (`cloudflare/worker.js`) — бот + API + заказы на **Cloudflare Workers** (бесплатный тариф, KV-хранилище)
- **Бот** — тот же Worker по вебхуку: приём заказов, статусы, переписка с покупателями

## Запуск
1. GitHub Pages: Settings → Pages → ветка `main`, папка `/docs`
2. Cloudflare: `cd cloudflare && npx wrangler kv namespace create SHOP` → id в `wrangler.toml`, затем `npx wrangler secret put BOT_TOKEN` и `npx wrangler deploy`
3. Вебхук бота: `https://api.telegram.org/bot<TOKEN>/setWebhook?url=<WORKER_URL>/webhook/<HOOK_SECRET>&allowed_updates=["message","callback_query"]`
4. В `wrangler.toml` укажите `WEBAPP_URL` (адрес GitHub Pages)

## Админы
Telegram ID владельцев задаются в `OWNER_IDS` (wrangler.toml) — у обоих полный доступ к админ-панели и уведомлениям о заказах.
