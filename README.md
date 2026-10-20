# SAHAR — премиальные сладости · Telegram Mini App + Бот + CRM

Автономный магазин для всей аудитории СНГ: мультивалютность (база цен — USD), 10 стран,
RU / EN / UZ, премиальный дизайн (Playfair Display + Manrope, тёмная тема Midnight Chocolate),
3-шаговое оформление заказа, чат с фото, полноценная админ-панель.

**Живёт бесплатно 24/7:** GitHub Pages (витрина) + Cloudflare Worker (сервер + бот) + KV (база).

## Что где

| Часть | Адрес | Файлы |
|---|---|---|
| Витрина (Mini App) | https://dostonravshanov1006800-beep.github.io/sahar-shop/ | `docs/index.html` |
| Админ-панель (CRM) | …/sahar-shop/admin.html | `docs/admin.html` |
| API + бот | https://sahar-shop.dostonravshanov1006800.workers.dev | `cloudflare/worker.js` |
| База | Cloudflare KV `SHOP` (id в `cloudflare/wrangler.toml`) | — |

## Запуск с нуля (если переносить на другой аккаунт)

1. Форк репозитория → Settings → Pages → ветка `main`, папка `/docs`.
2. Cloudflare: `cd cloudflare && npx wrangler kv namespace create SHOP` → id в `wrangler.toml`.
3. Секреты: `npx wrangler secret put BOT_TOKEN` (токен от @BotFather), `npx wrangler secret put HOOK_SECRET` (любая длинная строка).
4. В `wrangler.toml` задать `OWNER_IDS` (Telegram ID владельцев через запятую, напр. `6999767433,8396883978`) и `WEBAPP_URL` (адрес Pages).
5. `npx wrangler deploy` → адрес воркера.
6. Вебхук бота: `curl "https://api.telegram.org/bot<ТОКЕН>/setWebhook?url=<ВОРКЕР>/webhook/<HOOK_SECRET>&allowed_updates=[\"message\",\"callback_query\"]"`
7. В @BotFather: `/setmenubutton` → Web App → адрес витрины. Рекомендуется `/setname` → «SAHAR · Премиальные сладости».

## Переменные окружения

| Переменная | Где | Что это |
|---|---|---|
| `BOT_TOKEN` | secret | токен бота от @BotFather |
| `HOOK_SECRET` | secret | секрет пути вебхука `/webhook/<HOOK_SECRET>` |
| `OWNER_IDS` | vars | ID владельцев (админка + уведомления), через запятую или JSON-массив |
| `WEBAPP_URL` | vars | адрес витрины на GitHub Pages |

## Как добавить

- **Язык:** в `docs/index.html` — словарь `I18N` (ключи ru/en/uz уже есть); языки определяются по `language_code` Telegram, смена — в Профиле.
- **Страну:** Настройки воркера — массив `countries` в KV-ключе `settings` (создаётся автоматически). Проще — через админку «Настройки», либо отредактировать `DEFAULT_SETTINGS` в `worker.js` до первого запуска.
- **Способ оплаты:** массив `payments` там же: `{id, title_ru, countries:[коды], instr_ru (реквизиты), active}`. Активные методы показываются только клиентам из своих стран.
- **Товар:** админка → Товары → ＋ (название RU/EN/UZ, описание, категория, цена USD, старая цена, вес, остаток, бейджи Хит/Новинка/Premium/Ограниченно, фото с пережатием до 900px).
- **Курс валюты:** админка → Настройки → «Курсы валют» (за 1 $). Красивое округление задаётся в `rounding` настроек (₽ — до 10, ₸ — до 100, сўм — до 1000).

## Логика заказов

- Статусы: Новый → Ожидает оплату → Оплачен → Подтверждён → Собирается → В доставке → Доставлен (+ Отменён/Возврат). Каждая смена — уведомление клиенту в бот.
- Идемпотентность: повторное нажатие «Подтвердить заказ» не создаёт дубль (idem_key).
- Скоропортящиеся товары (флаг в админке) доступны только курьером по городу.
- Промокоды: админка → Ещё → Промокоды (код + %). Учитываются при оформлении.
- Безопасность: каждый запрос проверяет подпись initData (HMAC-SHA256, срок ≤ 24 ч) + проверка владельца на каждом /api/admin/*.

## Демо-данные (уже развёрнуты)

8 товаров в USD: Трюфели «Чёрный бархат» 18 · Клубника в белом шоколаде 14 (−20%) · SAHAR Gold 9 · Рахат-лукум «Роза Востока» 7 · Птичье молоко 12 · Наборы Classic 39 / Premium 79 / Royal 149. 5 категорий, 3 баннера.
